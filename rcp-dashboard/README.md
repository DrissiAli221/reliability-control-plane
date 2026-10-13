# RCP dashboard

Thin React/TypeScript operator and public-status UI for the Reliability Control Plane. Operational views visualize backend-owned facts and decisions. The visual guide uses separate illustrative examples to explain those rules.

## Local development

Start the Spring control plane with its `local` profile, then:

```bash
npm install
npm run dev
```

Vite proxies `/api`, `/local`, and `/status` to `http://localhost:8080`. Local mode obtains the generated development JWT from `POST /local/token`; that endpoint does not exist in the AWS profile.

## AWS authentication boundary

Set `VITE_AUTH_MODE=cognito`, `VITE_COGNITO_AUTHORITY`, and `VITE_COGNITO_CLIENT_ID` at build time. The sign-in page signs in with email and password over SRP (`amazon-cognito-identity-js`) and stores the tokens through `oidc-client-ts`, which also performs the authorization-code flow with PKCE for Google and GitHub (`VITE_SOCIAL_PROVIDERS=Google,GitHub`, only for providers configured in the pool) and keeps the token in session storage. The current Terraform model serves the SPA from CloudFront and uses an explicit CloudFront origin in the backend's CORS allowlist; it does not yet proxy API paths through CloudFront. A future same-origin proxy would be a separate reviewed change.

Production builds default to Cognito mode and fail closed when its configuration is absent. Local-token mode must be selected explicitly in a production build; it cannot authenticate against an AWS-profile backend because that backend does not expose `/local/token`.

The dashboard currently supports:

- a monitor table (`/`) with search, status filters, 30-day day bars, seven-day uptime and coverage, slowest-region latency, and a row menu to pause/resume or download the report;
- a monitor detail page (`/monitors/:id`) with seven-day uptime/SLO/latency/error-budget cards, 45-day day bars, per-region 24-hour latency, the latest checks per region, incidents, and the report's stated limitations;
- monitor creation, with the backend's SSRF rejection shown inline;
- read-only public status pages (`/public/:slug`) with 45-day history;
- a check trace on the detail page: select any recent check to see its timeline (staging, outbox, queue, probe, result delivery, finalization, incident evaluation) or its event history, built from real timestamps;
- the incident state machine (Healthy, Suspect, Incident open, Recovering) lit from the persisted streak counters, with the latest evaluations;
- a Pipeline page (`/pipeline`) with owner-scoped counts for each stage, per-region throughput, and the latest checks across monitors; a pulse runs along the map only when a new check has been finalized;
- "How is this calculated?" popovers on the detail metrics, showing each formula with the monitor's own numbers;
- in local mode, a fault drill (HTTP 503, timeout, refused connection, oversized body) that drives `/api/local/probe-fault` and states which faults can open an incident.

Incident state transitions, day statuses, availability calculations, and report generation remain backend responsibilities. The browser obtains the report with its existing bearer token and downloads the returned HTML attachment; it does not calculate report values. The monitor list refreshes every 30 seconds, a monitor page every 10, and the Pipeline page every 5; a failed refresh keeps the last data but marks it as stale.

The visual system is a dark, Vercel-inspired console (Geist Sans/Mono, neutral surfaces, colour reserved for evidence) with an OpenStatus-style monitor table and an OpenAI-status-style public page. OpenStatus is AGPL-3.0, so only its layout ideas are borrowed; no code is copied.

## Visual guide

The sidebar’s **How RCP works** entry opens `/learn`, with the four reviewed service and behavior diagrams. `/learn/machine` opens the interactive isometric machine: step through a check, change the example scenario, or play outage and recovery. Both are available in the command palette.

These figures work without the backend. Only the selected artifact loads, and switching views removes the previous frame and its animation. The shell may show unavailable telemetry while the backend is stopped. See [the artifact notes](public/visual-guide/README.md) for hosting, isolation and font/icon attribution.
