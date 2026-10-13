# Dashboard visual guide

These five exported HTML figures are used by `/learn` and `/learn/machine`. They contain their own SVG, fonts and illustrative controls, with no backend or cloud calls. The service diagrams retain the approved dark material; the machine has dark and light palettes.

`embed.js` reports content height to the dashboard and receives its theme. The dashboard validates the exact frame source and height range. The dashboard fetches only the selected public HTML with credentials omitted, then mounts it with `srcDoc`; this works with the existing CloudFront `X-Frame-Options: DENY` policy. Frames permit scripts and SVG downloads, with no same-origin privilege. Switching views destroys the old frame and its animation loop.

The four diagrams share the artwork reviewed for the README. The machine is the existing Anatomy illustration: two regional evidence lanes, a readiness deadline, verdict classification and a two-down/two-up incident latch. It simplifies delivery and time for explanation; its readout is simulated, not production telemetry.

Vendor SVG provenance is in `icon-sources.json`; Doto, Geist and Geist Mono licenses are included. Personal skills, scratch generators and browser-check tooling are not shipped.
