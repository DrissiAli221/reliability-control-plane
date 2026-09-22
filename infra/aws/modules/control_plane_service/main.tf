locals {
  container_name = "control-plane"
  container_port = 8080
}

resource "aws_ecr_repository" "this" {
  name                 = "${var.name}-control-plane"
  image_tag_mutability = "IMMUTABLE"

  encryption_configuration {
    encryption_type = "AES256"
  }

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Retain the newest 20 immutable reference images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 20
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.name}-control-plane"
  retention_in_days = 14
}

data "aws_iam_policy_document" "ecs_tasks_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name}-control-plane-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume_role.json
}

data "aws_iam_policy_document" "execution" {
  statement {
    sid       = "GetEcrAuthorization"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "PullControlPlaneImage"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer"
    ]
    resources = [aws_ecr_repository.this.arn]
  }

  statement {
    sid    = "WriteControlPlaneLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["${aws_cloudwatch_log_group.this.arn}:*"]
  }

  statement {
    sid       = "InjectDatabaseCredentials"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.database_master_secret_arn]
  }
}

resource "aws_iam_role_policy" "execution" {
  name   = "${var.name}-control-plane-execution"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution.json
}

resource "aws_iam_role" "task" {
  name               = "${var.name}-control-plane-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume_role.json
}

data "aws_iam_policy_document" "task" {
  statement {
    sid       = "PublishRegionalProbeJobs"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = var.probe_job_queue_arns
  }

  statement {
    sid    = "ConsumeCentralProbeResults"
    effect = "Allow"
    actions = [
      "sqs:ChangeMessageVisibility",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ReceiveMessage"
    ]
    resources = [var.probe_result_queue_arn]
  }

  statement {
    sid    = "PublishXRaySegments"
    effect = "Allow"
    actions = [
      "xray:PutTelemetryRecords",
      "xray:PutTraceSegments"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "task" {
  name   = "${var.name}-control-plane-runtime"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task.json
}

resource "aws_ecs_cluster" "this" {
  name = "${var.name}-control-plane"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_lb" "this" {
  name                       = "${var.name}-control-plane"
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [var.load_balancer_security_group_id]
  subnets                    = var.public_subnet_ids
  drop_invalid_header_fields = true
  enable_deletion_protection = false
}

resource "aws_lb_target_group" "this" {
  name                 = "${var.name}-control-plane"
  port                 = local.container_port
  protocol             = "HTTP"
  protocol_version     = "HTTP1"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30

  health_check {
    enabled             = true
    path                = "/actuator/health/readiness"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }
}

resource "aws_ecs_task_definition" "this" {
  family                   = "${var.name}-control-plane"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  volume {
    name = "tmp"
  }

  container_definitions = jsonencode([{
    name      = local.container_name
    image     = "${aws_ecr_repository.this.repository_url}:${var.image_tag}"
    essential = true

    portMappings = [{
      name          = "http"
      containerPort = local.container_port
      hostPort      = local.container_port
      protocol      = "tcp"
      appProtocol   = "http"
    }]

    readonlyRootFilesystem = true
    mountPoints = [{
      sourceVolume  = "tmp"
      containerPath = "/tmp"
      readOnly      = false
    }]

    environment = [
      { name = "SPRING_PROFILES_ACTIVE", value = "aws" },
      { name = "SPRING_DATASOURCE_URL", value = "jdbc:postgresql://${var.database_address}:${var.database_port}/${var.database_name}" },
      { name = "SPRING_APPLICATION_JSON", value = jsonencode({
        rcp = {
          identity = {
            issuer-uri = var.identity_issuer_uri
            client-id  = var.identity_client_id
          }
          runtime = {
            enabled                           = true
            probe-job-queue-urls              = var.probe_job_queue_urls
            probe-result-queue-region         = var.central_region
            probe-result-queue-url            = var.probe_result_queue_url
            result-wait-time-seconds          = 20
            result-visibility-timeout-seconds = 60
          }
        }
        management = {
          endpoint  = { health = { probes = { enabled = true } } }
          endpoints = { web = { exposure = { include = "health,info,metrics,prometheus" } } }
        }
        logging = {
          structured = {
            format = { console = "ecs" }
            ecs    = { service = { environment = "aws" } }
          }
        }
      }) }
    ]

    secrets = [
      { name = "SPRING_DATASOURCE_USERNAME", valueFrom = "${var.database_master_secret_arn}:username::" },
      { name = "SPRING_DATASOURCE_PASSWORD", valueFrom = "${var.database_master_secret_arn}:password::" }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.this.name
        awslogs-region        = var.central_region
        awslogs-stream-prefix = local.container_name
      }
    }
  }])

  depends_on = [
    aws_iam_role_policy.execution,
    aws_iam_role_policy.task
  ]
}

resource "aws_ecs_service" "this" {
  name             = "${var.name}-control-plane"
  cluster          = aws_ecs_cluster.this.id
  task_definition  = aws_ecs_task_definition.this.arn
  desired_count    = var.desired_count
  launch_type      = "FARGATE"
  platform_version = "LATEST"

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 90
  enable_ecs_managed_tags            = true
  propagate_tags                     = "SERVICE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = var.application_subnet_ids
    security_groups  = [var.control_plane_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this.arn
    container_name   = local.container_name
    container_port   = local.container_port
  }

  depends_on = [aws_lb_listener.https]
}
