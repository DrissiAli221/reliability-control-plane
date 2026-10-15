# Final demo polish verification

Checked 10 October 2026 against `main` at `172040e`. The browser fixtures below
are isolated from deployed services; this document does not prove a deployment.

| Before | After |
| --- | --- |
| The 90-day compact tracker measured 447px inside a 241px desktop tile. | All 90 UTC days shrink inside the tile; days before monitoring stay empty. |
| The summary heading could show the requested period while retaining old values. | The heading and tiles keep the same period until a refresh succeeds. |
| Selecting a report period replaced browser history. | Back/Forward navigate selected periods; a copied `?window=90d` URL reloads the same view. |
| JSON/CSV stopped after 100 incident transitions. | Every retained transition in the requested period is exported; HTML prints the latest ten incidents. |
| The demo banner scrolled away; the drill track had grey dividers. | Banner and top bar stay together; the drill uses a plain well with the same hatch and notch. |

## Browser and print

`rcp-dashboard/scripts/audit-final-round.mjs` supplies fake HTTP responses to an
isolated local Vite server. Run it with Playwright installed (or
`RCP_PLAYWRIGHT_MODULE` pointing to its existing module) and a localhost
`RCP_AUDIT_URL`. It writes captures and measurements to a temporary directory.
The fixture control exists only in that browser script, not the published app.

Checked both themes at 1440, 380 and 320px: 24h/7d/30d/90d report periods crossed
with the latency chart's 24h/7d ranges. The chart selection and 45-day bar remain
independent. Empty, single-incident, busy, loading and failed refresh fixtures
were checked; a young monitor has no fabricated failures before its start.
The command palette opens above the sticky header and closes with Escape;
200% zoom has no page overflow. The sticky stack height sets anchor clearance.

PostgreSQL/API regression: 1,080 incidents / 2,160 transitions over 90 days; JSON
contains all transitions, CSV contains 1,080 rows plus its header, and HTML shows
ten incidents plus “1070 earlier incidents”. Existing export tests now cover
period-specific requests and filenames for all four periods.

Headless Chrome A4 printing of the full-volume report, with a long
monitor name and a target URL over 2,000 characters, remains one page for all
four period labels. Print CSS shortens the visible URL to one line; the offline
HTML and data exports retain its full value. Print output depends on browser
settings; use A4, 100% scale and the document's CSS page size. The captured
[90-day print fixture](images/final-round/report-90d-print.png) is synthetic data.

[Dark drill before](images/final-round/drill-dark-before.png) ·
[dark drill after](images/final-round/drill-dark-after.png) ·
[light drill before](images/final-round/drill-light-before.png) ·
[light drill after](images/final-round/drill-light-after.png).

## Endpoint timing and scope

Read-only requests against the current deployed drill monitor, from the operator
machine: 90-day history 248/285/386ms (18,944 bytes), report 101/234/105ms (13,005
bytes). These are the deployed baseline with young demo data and the old
100-transition cutoff, not timings for a full 90-day database or the new code on
its 1-OCPU VM. The local full-volume regression proves completeness, not VM
performance. No cache was added based on these measurements; check real latency
again after a reviewed deployment.

The list's Blocked flag requires every expected region to return an unaccepted
Cloudflare challenge in the latest finalized check. Its saved status policy is
used, not today's settings. Missing results remain No data; ordinary failures
keep their existing verdict.

The generated demo fleet has ten targets and a separate absolute ceiling of
fifteen. Only the configured demo subject is exempt; visitors retain five per
owner and thirty total. Soft-deleted monitors count toward neither quota. All ten targets passed local HEAD checks without `cf-mitigated`; the five new
status JSON endpoints also passed GET checks. This is point-in-time evidence, not proof that both AWS regions will always pass.
Only the existing owned drill endpoint is faulted. See the deployment runbook and
cost model for the combined demo/visitor fleet. No cloud changes were applied.
