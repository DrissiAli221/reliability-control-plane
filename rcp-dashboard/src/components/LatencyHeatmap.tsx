import { useState } from "react";
import { count, milliseconds } from "../format";
import type { LatencyHeatmap as Heatmap } from "../types";

type Hover = { region: string; column: number; band: number; samples: number };

function bandLabel(bounds: number[], band: number): string {
  if (band === 0) return `< ${milliseconds(bounds[0])}`;
  if (band === bounds.length) return `≥ ${milliseconds(bounds[bounds.length - 1])}`;
  return `${milliseconds(bounds[band - 1])} – ${milliseconds(bounds[band])}`;
}

// Compact axis labels: each row is named by its lower bound so every row fits a narrow column.
function shortBound(ms: number): string {
  return ms >= 1000 ? `${Number((ms / 1000).toFixed(1))}s` : `${ms}ms`;
}

function axisLabel(bounds: number[], band: number): string {
  if (band === 0) return `<${shortBound(bounds[0])}`;
  return band === bounds.length ? `${shortBound(bounds[band - 1])}+` : shortBound(bounds[band - 1]);
}

function clock(value: number, long = false): string {
  return new Date(value).toLocaleString("en-GB", long
    ? { weekday: "short", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" });
}

/**
 * Time runs left to right, latency bands bottom (fast) to top (slow), brightness is how many HTTP responses
 * landed in the cell. A log scale keeps a rare slow response visible next to thousands of fast ones.
 */
export function LatencyHeatmap({ heatmap }: { heatmap: Heatmap }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const bands = heatmap.latencyBoundsMs.length + 1;
  const max = Math.max(1, ...heatmap.regions.flatMap((region) => region.counts.flat()));
  const from = new Date(heatmap.from).getTime();
  const columnMs = heatmap.bucketSeconds * 1000;
  // A window longer than a day needs the weekday to place a column.
  const long = new Date(heatmap.to).getTime() - from > 26 * 3600 * 1000;
  const intensity = (value: number) => (value === 0 ? 0 : 0.18 + 0.82 * (Math.log1p(value) / Math.log1p(max)));

  if (heatmap.regions.length === 0) return <p className="subtle">No HTTP responses in this window.</p>;

  return (
    <div className="heatmap">
      <p className="heatmap-readout mono" aria-live="polite">
        {hover
          ? <>{hover.region} · {clock(from + hover.column * columnMs, long)}–{clock(from + (hover.column + 1) * columnMs)} · {bandLabel(heatmap.latencyBoundsMs, hover.band)} · <b>{count(hover.samples)}</b> responses</>
          : "Hover a cell to read it."}
      </p>
      {heatmap.regions.map((region) => (
        <div className="heatmap-region" key={region.region}>
          <div className="heatmap-head">
            <span className="mono">{region.region}</span>
            <span className="subtle">{count(region.samples)} responses</span>
          </div>
          <div className="heatmap-body">
            <div className="heatmap-axis" aria-hidden="true">
              {Array.from({ length: bands }, (_, band) => bands - 1 - band).map((band) => (
                <span key={band}>{axisLabel(heatmap.latencyBoundsMs, band)}</span>
              ))}
            </div>
            <div
              className="heatmap-grid"
              role="img"
              aria-label={`${region.region} latency heatmap, ${count(region.samples)} responses`}
              style={{ gridTemplateColumns: `repeat(${region.counts.length}, 1fr)`, gridTemplateRows: `repeat(${bands}, 1fr)` }}
              onMouseLeave={() => setHover(null)}
            >
              {Array.from({ length: bands }, (_, row) => bands - 1 - row).flatMap((band) =>
                region.counts.map((column, columnIndex) => (
                  <i
                    key={`${band}-${columnIndex}`}
                    style={{ opacity: intensity(column[band]) || undefined }}
                    className={column[band] ? "hot" : undefined}
                    onMouseEnter={() => setHover({ region: region.region, column: columnIndex, band, samples: column[band] })}
                  />
                )),
              )}
            </div>
          </div>
        </div>
      ))}
      <div className="heatmap-time" aria-hidden="true">
        <span>{clock(from, long)}</span>
        <span>now</span>
      </div>
    </div>
  );
}
