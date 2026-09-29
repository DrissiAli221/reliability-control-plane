# RCP dashboard

Thin React/TypeScript operator and public-status UI for the Reliability Control Plane. It visualizes backend-owned facts and decisions; it does not reproduce incident logic in the browser.

## Local development

Start the Spring control plane with its `local` profile, then:

```bash
npm install
npm run dev
```

Vite proxies `/api`, `/local`, and `/status` to `http://localhost:8080`. Local mode obtains the generated development JWT from `POST /local/token`; that endpoint does not exist in the AWS profile.

## AWS authentication boundary

Set `VITE_AUTH_MODE=cognito`, `VITE_COGNITO_AUTHORITY`, and `VITE_COGNITO_CLIENT_ID` at build time. `oidc-client-ts` performs authorization-code flow with PKCE and keeps the token in session storage. The current Terraform model serves the SPA from CloudFront and uses an explicit CloudFront origin in the backend's CORS allowlist; it does not yet proxy API paths through CloudFront. A future same-origin proxy would be a separate reviewed change.

Production builds default to Cognito mode and fail closed when its configuration is absent. Local-token mode must be selected explicitly in a production build; it cannot authenticate against an AWS-profile backend because that backend does not expose `/local/token`.

The dashboard currently supports:

- a monitor table (`/`) with search, status filters, 30-day day bars, seven-day uptime and coverage, slowest-region latency, and a row menu to pause/resume or download the report;
- monitor creation, with the backend's SSRF rejection shown inline;
- read-only public status pages (`/public/:slug`) with 45-day history.

Incident state transitions, day statuses, availability calculations, and report generation remain backend responsibilities. The browser obtains the report with its existing bearer token and downloads the returned HTML attachment; it does not calculate report values. Pages refresh every 30 seconds; a failed refresh keeps the last data but marks it as stale.

The visual system is a dark, Vercel-inspired console (Geist Sans/Mono, neutral surfaces, colour reserved for evidence) with an OpenStatus-style monitor table and an OpenAI-status-style public page. OpenStatus is AGPL-3.0, so only its layout ideas are borrowed; no code is copied.
