# RCP visual guide

The four figures follow the README narrative:

1. [Deployment](deployment.svg) — demo service boundaries and connections.
2. [Life of one check](lifecycle.svg) — transactional intent, parallel regional work, ingestion and deadline.
3. [Verdicts and incidents](verdicts.svg) — classification rules and the initial incident policy.
4. [Availability and coverage](availability.svg) — measured outcomes, evidence coverage and an Unproven SLO.

The README embeds PNGs rendered at twice the SVG resolution for reliable display, with links to the native SVGs. HTML companions contain the same diagrams plus keyboard selection, SVG export and explanatory controls. Fonts, logos and code are embedded; each HTML file works offline. GitHub displays HTML source rather than running it: download the HTML file, or serve this directory from the repository root:

```bash
python3 -m http.server 8790 --bind 127.0.0.1 --directory docs/diagrams
```

Open [the visual guide](http://127.0.0.1:8790/index.html), then select a diagram. The gallery's links are relative, so it also works when downloaded with the files beside it.

## Sources and scope

Deployment follows `infra/aws-demo`, `infra/oracle-demo` and `deploy/demo`. It describes demo configuration; the local profile uses ElasticMQ and JVM probe adapters. VM allocation and synthetic enablement annotations in the interactive details are configuration/state evidence, rather than a fresh production-health audit.

Behavior follows `DueMonitorScheduler`, `OutboxPublisher`, `ProbeResultIngestionService`, `ExecutionFinalizer`, `ExecutionVerdictPolicy`, `RegionalProbeFact`, `IncidentPolicy`, `AvailabilityCalculator`, `AvailabilityService` and `MonitorSchedule`. The initial incident thresholds are two DOWN / two UP; minimum evidence coverage defaults to 95%. The availability examples choose a 99.9% SLO target. Interactive examples are illustrative and do not query live services.

Service-logo URLs and provenance are recorded in [icon-sources.json](icon-sources.json). AWS and Oracle logos come from the official architecture packages; other service logos come from their documented project sources. Vendor marks retain their respective terms. RCP incident states use the dashboard's own 3×3 status dots. Doto is the dashboard display face; its [font license](DOTO-LICENSE.txt) is included. Personal skills, scratch generators and browser-check tooling are excluded from this directory.

The lifecycle, verdicts and availability companions use the dashboard’s Geist and Geist Mono for text, with Doto region headings and step numbers. The [Geist](GEIST-LICENSE.txt) and [Geist Mono](GEIST-MONO-LICENSE.txt) licenses are included.
