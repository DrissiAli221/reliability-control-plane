# dither-kit (vendored)

Dithered chart engine by ripgrim ([tripwire.sh/dither-kit](https://www.tripwire.sh/dither-kit),
[Boring-Software-Inc/dither-kit](https://github.com/Boring-Software-Inc/dither-kit)), inspired by Evil Charts.
Copied from its shadcn registry (`core` and `area-chart`, v0.1.0). The upstream repository has no license file.

Local changes, each marked `RCP change` in the source:

- `palette.ts`: green, orange and red use the console's status colours.
- `tooltip.tsx`: optional `footer(index)` renders extra rows under the series values.
- `cartesian-canvas.tsx`: `animate` is read live, so the entrance plays once and live refreshes repaint in place.

Tailwind is scoped to this folder by `src/dither-kit.css` (utilities only, no preflight).
