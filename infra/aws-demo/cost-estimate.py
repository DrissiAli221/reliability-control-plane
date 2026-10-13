#!/usr/bin/env python3
"""Illustrative Lambda and SQS estimate. It is a model with stated assumptions, not a worst-case ceiling."""
import argparse
import json
import math

# Full deployment: 30 visitor slots plus the separate hard ceiling of 15 demo-owner monitors.
MAX_MONITORS = 45
DEFAULT_DURATION_MS = 500

INCLUDED = ["Lambda requests", "Lambda GB-seconds", "SQS requests (job and result queues, idle polling)"]
NOT_MODELLED = [
    "CloudWatch Logs ingestion and storage",
    "cross-region data transfer (results from eu-west-1 to us-east-1)",
    "S3 and CloudFront (dashboard hosting, requests, transfer)",
    "Cognito (monthly active users, email and SMS)",
    "budget and alarm service charges, the VM, backups, and the domain",
]


def estimate(monitors, seconds, interval=60, days=30, retry_percent=0, memory_mb=256):
    if not 0 <= monitors <= MAX_MONITORS or seconds < 0 or interval < 60 or days < 1 or retry_percent < 0:
        raise ValueError(f"Use 0-{MAX_MONITORS} monitors, nonnegative duration/retries, interval >=60, and days >=1")
    if not 128 <= memory_mb <= 10240:
        raise ValueError("Lambda memory must be between 128 and 10240 MiB")
    monthly_seconds = days * 86400
    checks = monitors * monthly_seconds / interval * 2
    attempts = checks * (1 + retry_percent / 100)
    # One job per Lambda invocation; include cold starts and result publishing in duration.
    gb_seconds = attempts * seconds * memory_mb / 1024
    request_cost = max(0, attempts - 1_000_000) / 1_000_000 * 0.20
    duration_cost = max(0, gb_seconds - 400_000) * 0.0000133334
    # Six calls/check is conservative without batching: send/receive/delete for jobs/results.
    # Up to five idle Lambda pollers in each region, plus one control-plane result poller.
    # Adding this idle estimate to active request traffic intentionally overestimates overlap.
    idle_polls = (2 * 5 + 1) * math.ceil(monthly_seconds / 20)
    sqs_requests = attempts * 6 + idle_polls
    sqs_cost = max(0, sqs_requests - 1_000_000) / 1_000_000 * 0.40
    return {
        "monitors": monitors, "memory_mb": memory_mb, "average_billed_duration_seconds": seconds,
        "checks": round(checks), "lambda_attempts": round(attempts),
        "lambda_gb_seconds": round(gb_seconds), "sqs_requests_estimate": round(sqs_requests),
        "lambda_requests_usd": round(request_cost, 2),
        "lambda_duration_usd": round(duration_cost, 2), "sqs_usd": round(sqs_cost, 2),
        "subtotal_usd": round(request_cost + duration_cost + sqs_cost, 2),
        "assumptions": {
            "average_billed_duration_ms": round(seconds * 1000), "retry_percent": retry_percent,
            "check_interval_seconds": interval, "days": days, "regions": 2,
            "note": "Duration is an input, not a measurement: use the billed duration from real invocations.",
        },
        "included": INCLUDED,
        "not_modelled": NOT_MODELLED,
        "note": "Subtotal covers only the included items. It is not a ceiling: sustained outages, slower probes, "
                "retries and the items not modelled can all add cost.",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--monitors", type=int, default=8, help=f"0-{MAX_MONITORS}; total active monitors, including the separately capped demo fleet")
    parser.add_argument("--duration-ms", type=float, default=DEFAULT_DURATION_MS,
                        help="Assumed average billed Lambda duration per check in milliseconds (default %(default)s, an assumption)")
    parser.add_argument("--seconds", type=float, default=None, help="Deprecated spelling of --duration-ms, in seconds")
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--retry-percent", type=float, default=0)
    parser.add_argument("--memory-mb", type=int, default=256, help="Configured probe memory; override for comparison")
    args = parser.parse_args()
    seconds = args.seconds if args.seconds is not None else args.duration_ms / 1000
    print(json.dumps(estimate(args.monitors, seconds, args.interval, args.days, args.retry_percent, args.memory_mb), indent=2))
