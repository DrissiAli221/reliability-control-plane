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

The dashboard currently supports monitor listing/creation, seven-day availability evidence, an owner-authorized seven-day HTML report download per monitor, and read-only public status pages. Incident state transitions, availability calculations, and report generation remain backend responsibilities. The browser obtains the report with its existing bearer token and downloads the returned HTML attachment; it does not calculate report values.
