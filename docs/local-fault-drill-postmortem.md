# Local fault-injection drill — 2026-09-29

**Classification:** simulated target failure in the Docker Compose `local` profile. This was not a real outage, an AWS deployment, or a production incident.

## What happened

The existing `Local end-to-end proof` monitor (`eb55e394-a0e1-4da0-a700-cf55e4bea25b`, target `https://example.com/`) was enabled. An authenticated operator set the local-only probe fault mode to `HTTP_503`, which made both simulated regional adapters return HTTP 503 facts. The real target was not asked to fail. RCP finalized consecutive DOWN executions, opened an incident, and the published `local-proof` status page reported `OUTAGE`. The operator restored `PASS_THROUGH`; after consecutive UP executions, RCP resolved the incident and the public page reported `OPERATIONAL`.

| Event | Evidence |
| --- | --- |
| Fault injected | Authenticated `PUT /api/local/probe-fault` returned `HTTP_503`. |
| Incident opened | PostgreSQL `incident_events` contains `OPENED` at scheduled time `2026-09-29T12:32:42.995561Z`, tied to execution `b1d2a6b7-196b-46f4-9d55-24bc026d9c0a`. The operator API showed `OPEN`; `GET /status/local-proof` showed `OUTAGE`. |
| Fault removed | Authenticated fault-mode update returned `PASS_THROUGH`. |
| Incident resolved | PostgreSQL contains `RESOLVED` at scheduled time `2026-09-29T12:36:12.995561Z`, tied to execution `4f360b4f-c1b6-4070-8a8e-f8ad1730c533`. The operator API showed `HEALTHY`; the public page showed `OPERATIONAL`. |

The event timestamps above are **scheduled execution timestamps**, not a precise measurement of detection or recovery latency. The manual polling observed each transition after it happened; this drill did not measure the exact wall-clock time from injected fault to public display.

## Cause, impact, and recovery

The direct cause was deliberate `HTTP_503` injection in the local worker adapter. Only local synthetic evidence and its persisted incident/status projection were affected. No production users, AWS resources, or real geographic workers were involved. Recovery was the explicit `PASS_THROUGH` update followed by normal scheduled checks; no database rows or queue messages were manually rewritten.

This exercised the important authority boundary: workers reported HTTP facts, while the central incident policy decided when those facts justified opening or resolving an incident. A single failed region would not itself have proven a target outage. PostgreSQL held the incident events; the public page read the resulting projection rather than treating queue delivery as authoritative state.

## What the evidence proves—and does not

The drill proves this checkout's local happy-path failure and recovery loop: scheduled probe facts reached the result consumer, incident state changed after the policy's consecutive evidence, and public status followed it. The concurrent local k6 run separately showed background scheduling/results continued under operator-read load. This drill does **not** prove real SQS/Lambda delivery, geographic independence, AWS egress controls, alert notification, production detection latency, failover, or RPO/RTO.

The main operational gap is that an operator still needs to inspect metrics/logs and poll status; no notification/escalation workflow or tested DLQ redrive procedure exists. For a future hosted trial, add a real regional smoke test, explicit alerting, and a timestamped observation trace before making latency or reliability claims.
