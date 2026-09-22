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

Set `VITE_AUTH_MODE=cognito`, `VITE_COGNITO_AUTHORITY`, and `VITE_COGNITO_CLIENT_ID` at build time. `oidc-client-ts` performs authorization-code flow with PKCE and keeps the token in session storage. The future CloudFront distribution should serve the SPA and forward API paths to the ALB under one origin, avoiding a permissive cross-origin policy.

Production builds default to Cognito mode and fail closed when its configuration is absent. Local-token mode must be selected explicitly in a production build; it cannot authenticate against an AWS-profile backend because that backend does not expose `/local/token`.

The dashboard currently supports monitor listing/creation, seven-day availability evidence, and read-only public status pages. Incident state transitions and availability calculations remain backend responsibilities.
