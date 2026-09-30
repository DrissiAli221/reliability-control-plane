#!/usr/bin/env python3
"""Illustrative Lambda/SQS estimate; excludes storage, traffic, logs, Cognito and VM."""
import argparse
import json
import math


def estimate(monitors, seconds, interval=60, days=30, retry_percent=0):
    if not 0 <= monitors <= 25 or seconds < 0 or interval < 60 or days < 1 or retry_percent < 0:
        raise ValueError("Use 0-25 monitors, nonnegative duration/retries, interval >=60, and days >=1")
    monthly_seconds = days * 86400
    checks = monitors * monthly_seconds / interval * 2
    attempts = checks * (1 + retry_percent / 100)
    # One job per Lambda invocation; include cold starts and result publishing in duration.
    gb_seconds = attempts * seconds * 0.5
    request_cost = max(0, attempts - 1_000_000) / 1_000_000 * 0.20
    duration_cost = max(0, gb_seconds - 400_000) * 0.0000133334
    # Six calls/check is conservative without batching: send/receive/delete for jobs/results.
    # Up to five idle Lambda pollers in each region, plus one control-plane result poller.
    # Adding this idle estimate to active request traffic intentionally overestimates overlap.
    idle_polls = (2 * 5 + 1) * math.ceil(monthly_seconds / 20)
    sqs_requests = attempts * 6 + idle_polls
    sqs_cost = max(0, sqs_requests - 1_000_000) / 1_000_000 * 0.40
    return {
        "monitors": monitors, "average_billed_duration_seconds": seconds,
        "checks": round(checks), "lambda_attempts": round(attempts),
        "lambda_gb_seconds": round(gb_seconds), "sqs_requests_estimate": round(sqs_requests),
        "lambda_requests_usd": round(request_cost, 2),
        "lambda_duration_usd": round(duration_cost, 2), "sqs_usd": round(sqs_cost, 2),
        "subtotal_usd": round(request_cost + duration_cost + sqs_cost, 2),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--monitors", type=int, default=8)
    parser.add_argument("--seconds", type=float, default=0.5)
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--retry-percent", type=float, default=0)
    args = parser.parse_args()
    print(json.dumps(estimate(args.monitors, args.seconds, args.interval, args.days, args.retry_percent), indent=2))
