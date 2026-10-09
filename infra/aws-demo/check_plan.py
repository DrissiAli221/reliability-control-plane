#!/usr/bin/env python3
"""Verify an offline Terraform plan's deployment and privilege boundaries."""
import json
from pathlib import Path
import sys


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check_social(managed, oidc):
    """Optional Google/GitHub sign-in: absent by default, tightly scoped when enabled."""
    def of(kind):
        return [r["change"]["after"] for r in managed.values() if r["type"] == kind]
    providers = {p["provider_name"]: p for p in of("aws_cognito_identity_provider")}
    client = of("aws_cognito_user_pool_client")[0]
    require(client["supported_identity_providers"] == ["COGNITO"] + sorted(providers), "App client must list COGNITO plus enabled providers")
    require(set(providers) <= {"Google", "GitHub"}, "Unexpected identity provider")
    if "Google" in providers:
        require(providers["Google"]["provider_type"] == "Google", "Wrong Google provider type")
    if "GitHub" not in providers:
        require(not oidc and not of("aws_ssm_parameter") and not of("aws_lambda_function_url"), "GitHub adapter must be off when GitHub is disabled")
        return
    require(providers["GitHub"]["provider_type"] == "OIDC", "Wrong GitHub provider type")
    require(len(oidc) == 1 and len(of("aws_lambda_function_url")) == 1, "Expected exactly one GitHub adapter and URL")
    function = oidc[0]
    require(function["region"] == "us-east-1" and function["architectures"] == ["arm64"], "Wrong adapter placement")
    require(function["memory_size"] == 256 and function["timeout"] == 10, "Unexpected adapter sizing")
    require(not function["vpc_config"], "Adapter must not depend on VPC/NAT")
    require(of("aws_lambda_function_url")[0]["authorization_type"] == "NONE", "Adapter URL is the public OIDC issuer")
    require(of("aws_ssm_parameter")[0]["type"] == "SecureString", "Signing key must be a SecureString")
    require(of("tls_private_key")[0]["rsa_bits"] == 2048, "Signing key must be RSA 2048")
    logs = [g for g in of("aws_cloudwatch_log_group") if g["name"].endswith("-github-oidc")]
    require(len(logs) == 1 and logs[0]["retention_in_days"] == 14, "Adapter logs need 14-day retention")


def check_social_iam(root):
    """The adapter may read exactly its signing key and write its own logs."""
    policy = next((r for r in root["resources"] if r["address"] == "data.aws_iam_policy_document.github_oidc"), None)
    if policy is None:
        return
    statements = policy["expressions"]["statement"]
    require(len(statements) == 2, "Unexpected adapter grants")
    require(set(statements[0]["actions"]["constant_value"]) == {"ssm:GetParameter"}, "Adapter may only call ssm:GetParameter")
    require(statements[0]["resources"].get("references", []) == ["aws_ssm_parameter.github_oidc_key[0].arn", "aws_ssm_parameter.github_oidc_key[0]", "aws_ssm_parameter.github_oidc_key"], "Adapter SSM scope widened")
    require(set(statements[1]["actions"]["constant_value"]) == {"logs:CreateLogStream", "logs:PutLogEvents"}, "Unexpected adapter log actions")


def check(plan):
    changes = plan["resource_changes"]
    managed = {r["address"]: r for r in changes if r["mode"] == "managed"}
    allowed = {
        "aws_budgets_budget", "aws_cognito_user_pool", "aws_cognito_user_pool_client",
        "aws_cognito_user_pool_domain", "aws_cognito_user_group", "aws_iam_user",
        "aws_iam_user_policy", "aws_iam_role", "aws_iam_role_policy", "aws_sqs_queue",
        "aws_sqs_queue_redrive_allow_policy", "aws_s3_bucket", "aws_s3_bucket_public_access_block",
        "aws_s3_bucket_ownership_controls", "aws_s3_bucket_server_side_encryption_configuration",
        "aws_s3_bucket_versioning", "aws_s3_bucket_lifecycle_configuration", "aws_s3_object",
        "aws_cloudwatch_log_group", "aws_lambda_function", "aws_lambda_event_source_mapping",
        "aws_cloudfront_origin_access_control", "aws_cloudfront_function", "aws_cloudfront_cache_policy",
        "aws_cloudfront_response_headers_policy", "aws_cloudfront_distribution", "aws_s3_bucket_policy",
    }
    social = {
        "aws_cognito_identity_provider", "aws_ssm_parameter", "aws_lambda_function_url",
        "aws_lambda_permission", "tls_private_key",
    }
    allowed |= social
    for resource in changes:
        if resource["mode"] == "data":
            require(resource["type"] in {"aws_iam_policy_document", "archive_file"}, "Unexpected API-backed data source")
    for resource in managed.values():
        require(resource["type"] in allowed, f"Excluded resource type: {resource['type']}")
        require(resource["change"]["actions"] == ["create"], "Offline check must use empty state")
    def resources(kind):
        return [r["change"]["after"] for r in managed.values() if r["type"] == kind]
    oidc = [r for r in resources("aws_lambda_function") if r["runtime"] == "nodejs22.x"]
    lambdas = [r for r in resources("aws_lambda_function") if r["runtime"] != "nodejs22.x"]
    require(len(lambdas) == 2, "Expected exactly two probe workers")
    require({r["region"] for r in lambdas} == {"eu-west-1", "us-east-1"}, "Wrong worker regions")
    for function in lambdas:
        require(function["runtime"] == "java21" and function["architectures"] == ["arm64"], "Wrong Lambda runtime")
        require(function["memory_size"] == 256 and function["timeout"] == 30, "Unexpected compute sizing")
        require(function["reserved_concurrent_executions"] == -1, "Offline default must work without concurrency reservation")
        require(not function["vpc_config"], "Demo probes must not depend on VPC/NAT")
        require(function["tracing_config"] == [{"mode": "PassThrough"}], "Active tracing costs are not configured")
    mappings = resources("aws_lambda_event_source_mapping")
    require(len(mappings) == 2, "Expected two regional event sources")
    for mapping in mappings:
        require(mapping["batch_size"] == 1, "Sequential batches can consume result deadline")
        require(mapping["maximum_batching_window_in_seconds"] == 0, "Do not delay probes to batch")
        require(mapping["function_response_types"] == ["ReportBatchItemFailures"], "Missing partial failures")
        require(mapping["scaling_config"] == [{"maximum_concurrency": 10}], "Unbounded event-source concurrency")
        require(not mapping["provisioned_poller_config"], "Paid provisioned polling must stay off")
    queues = resources("aws_sqs_queue")
    require(len(queues) == 6, "Expected three queues and three DLQs")
    jobs = [q for q in queues if "-jobs-" in q["name"] and not q["name"].endswith("-dlq")]
    require({q["region"] for q in jobs} == {"eu-west-1", "us-east-1"}, "Wrong job queue regions")
    for queue in queues:
        require(queue["sqs_managed_sse_enabled"], "Queue encryption is required")
        if not queue["name"].endswith("-dlq"):
            require(queue["receive_wait_time_seconds"] == 20, "Use long polling")
            require(queue["visibility_timeout_seconds"] == (180 if "-jobs-" in queue["name"] else 60), "Incorrect visibility timeout")
    check_social(managed, oidc)
    client = resources("aws_cognito_user_pool_client")[0]
    require(client["generate_secret"] is False and client["allowed_oauth_flows"] == ["code"], "SPA must use public code flow")
    require(set(client["explicit_auth_flows"]) == {"ALLOW_ADMIN_USER_PASSWORD_AUTH", "ALLOW_USER_SRP_AUTH"}, "Unexpected password/refresh flows")
    require(client["refresh_token_rotation"][0]["feature"] == "ENABLED", "Refresh rotation required")
    require(client["access_token_validity"] == 15, "Use short-lived demo tokens")
    pool = resources("aws_cognito_user_pool")[0]
    require(pool["region"] == "us-east-1" and pool["user_pool_tier"] == "ESSENTIALS", "Wrong identity placement/tier")
    require(pool["admin_create_user_config"][0]["allow_admin_create_user_only"] is False, "Self sign-up disabled")
    require(pool["auto_verified_attributes"] == ["email"], "Email verification is required")
    require(resources("aws_cognito_user_group")[0]["name"] == "demo", "Wrong demo group")
    budget = resources("aws_budgets_budget")[0]
    require(float(budget["limit_amount"]) == 1 and budget["time_unit"] == "MONTHLY", "Expected USD1 monthly alert")
    require(not budget.get("cost_filter"), "Budget must cover the whole account")
    require(budget["cost_types"][0]["include_credit"] is False, "Credits must not hide consumption")
    blocks = resources("aws_s3_bucket_public_access_block")
    require(len(blocks) == 3, "Expected dashboard and two regional artifact buckets")
    for block in blocks:
        require(all(block[k] for k in ["block_public_acls", "block_public_policy", "ignore_public_acls", "restrict_public_buckets"]), "S3 must stay private")
    root = plan["configuration"]["root_module"]
    server = next(r for r in root["resources"] if r["address"] == "data.aws_iam_policy_document.server")
    statements = server["expressions"]["statement"]
    expected = [
        ({"sqs:SendMessage"}, {"module.us_jobs.queue_arn", "module.us_jobs", "module.europe_jobs.queue_arn", "module.europe_jobs"}),
        ({"sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes"}, {"module.results.queue_arn", "module.results"}),
        ({"cognito-idp:AdminInitiateAuth"}, {"aws_cognito_user_pool.demo.arn", "aws_cognito_user_pool.demo"}),
    ]
    require(len(statements) == len(expected), "Unexpected server grants")
    for statement, (actions, references) in zip(statements, expected):
        require(set(statement["actions"]["constant_value"]) == actions, "Unexpected IAM actions")
        require(set(statement["resources"].get("references", [])) == references, "Server IAM scope widened")
    check_social_iam(root)
    for module_name in ["us_probe", "europe_probe"]:
        module = root["module_calls"][module_name]["module"]
        policy = next(r for r in module["resources"] if r["address"] == "data.aws_iam_policy_document.probe")
        statements = policy["expressions"]["statement"]
        require(len(statements) == 3, "Unexpected worker grants")
        expected_refs = ["var.job_queue_arn", "var.result_queue_arn", "aws_cloudwatch_log_group.probe.arn"]
        expected_actions = [expected[1][0], {"sqs:SendMessage"}, {"logs:CreateLogStream", "logs:PutLogEvents"}]
        for statement, ref, actions in zip(statements, expected_refs, expected_actions):
            require(set(statement["actions"]["constant_value"]) == actions, "Unexpected worker IAM actions")
            require(ref in statement["resources"].get("references", []) and "constant_value" not in statement["resources"], "Worker IAM scope widened")
    return len(managed)


if __name__ == "__main__":
    count = check(json.loads(Path(sys.argv[1]).read_text()))
    print(f"Offline plan PASS: {count} resources; demo scope, regions, IAM and resource limits verified.")
