locals {
  zones = {
    for index, zone in var.availability_zones : zone => index
  }
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.name}-vpc"
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${var.name}-igw"
  }
}

resource "aws_subnet" "public" {
  for_each = local.zones

  vpc_id                  = aws_vpc.this.id
  availability_zone       = each.key
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, each.value)
  map_public_ip_on_launch = false

  tags = {
    Name = "${var.name}-public-${each.key}"
    Tier = "public"
  }
}

resource "aws_subnet" "application" {
  for_each = local.zones

  vpc_id            = aws_vpc.this.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, each.value + 10)

  tags = {
    Name = "${var.name}-application-${each.key}"
    Tier = "application-private"
  }
}

resource "aws_subnet" "database" {
  for_each = local.zones

  vpc_id            = aws_vpc.this.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, each.value + 20)

  tags = {
    Name = "${var.name}-database-${each.key}"
    Tier = "database-isolated"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = {
    Name = "${var.name}-public"
  }
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_eip" "nat" {
  for_each = local.zones

  domain = "vpc"

  tags = {
    Name = "${var.name}-nat-${each.key}"
  }

  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  for_each = local.zones

  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = aws_subnet.public[each.key].id

  tags = {
    Name = "${var.name}-nat-${each.key}"
  }

  depends_on = [aws_internet_gateway.this]
}

resource "aws_route_table" "application" {
  for_each = local.zones

  vpc_id = aws_vpc.this.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this[each.key].id
  }

  tags = {
    Name = "${var.name}-application-${each.key}"
  }
}

resource "aws_route_table_association" "application" {
  for_each = local.zones

  subnet_id      = aws_subnet.application[each.key].id
  route_table_id = aws_route_table.application[each.key].id
}

resource "aws_route_table" "database" {
  for_each = local.zones

  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${var.name}-database-${each.key}"
  }
}

resource "aws_route_table_association" "database" {
  for_each = local.zones

  subnet_id      = aws_subnet.database[each.key].id
  route_table_id = aws_route_table.database[each.key].id
}

resource "aws_security_group" "load_balancer" {
  name        = "${var.name}-alb"
  description = "Public HTTPS ingress to the control-plane load balancer"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${var.name}-alb"
  }
}

resource "aws_security_group" "control_plane" {
  name        = "${var.name}-control-plane"
  description = "Private ECS control-plane tasks"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${var.name}-control-plane"
  }
}

resource "aws_security_group" "database" {
  name        = "${var.name}-database"
  description = "PostgreSQL reachable only from control-plane tasks"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${var.name}-database"
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_https_ipv4" {
  security_group_id = aws_security_group.load_balancer.id
  description       = "HTTPS from the Internet"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "alb_https_ipv6" {
  security_group_id = aws_security_group.load_balancer.id
  description       = "HTTPS from the IPv6 Internet"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv6         = "::/0"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_control_plane" {
  security_group_id            = aws_security_group.load_balancer.id
  description                  = "Forward only to control-plane tasks"
  ip_protocol                  = "tcp"
  from_port                    = var.control_plane_port
  to_port                      = var.control_plane_port
  referenced_security_group_id = aws_security_group.control_plane.id
}

resource "aws_vpc_security_group_ingress_rule" "control_plane_from_alb" {
  security_group_id            = aws_security_group.control_plane.id
  description                  = "Application traffic from the ALB"
  ip_protocol                  = "tcp"
  from_port                    = var.control_plane_port
  to_port                      = var.control_plane_port
  referenced_security_group_id = aws_security_group.load_balancer.id
}

resource "aws_vpc_security_group_egress_rule" "control_plane_https" {
  security_group_id = aws_security_group.control_plane.id
  description       = "HTTPS for AWS APIs, OIDC JWKS, and telemetry"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "control_plane_dns_udp" {
  security_group_id = aws_security_group.control_plane.id
  description       = "DNS through the VPC resolver"
  ip_protocol       = "udp"
  from_port         = 53
  to_port           = 53
  cidr_ipv4         = var.vpc_cidr
}

resource "aws_vpc_security_group_egress_rule" "control_plane_dns_tcp" {
  security_group_id = aws_security_group.control_plane.id
  description       = "Large DNS responses through the VPC resolver"
  ip_protocol       = "tcp"
  from_port         = 53
  to_port           = 53
  cidr_ipv4         = var.vpc_cidr
}

resource "aws_vpc_security_group_ingress_rule" "database_from_control_plane" {
  security_group_id            = aws_security_group.database.id
  description                  = "PostgreSQL from control-plane tasks"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.control_plane.id
}

resource "aws_vpc_security_group_egress_rule" "control_plane_to_database" {
  security_group_id            = aws_security_group.control_plane.id
  description                  = "PostgreSQL to the source-of-truth database"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.database.id
}
