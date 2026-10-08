import { useEffect, useId, useMemo, useState } from "react";
import { Area } from "./dither-kit/area";
import { AreaChart } from "./dither-kit/area-chart";
import { useChartPart, type ChartContextValue } from "./dither-kit/chart-context";
import { Grid } from "./dither-kit/grid";
import { Tooltip } from "./dither-kit/tooltip";
import { XAxis } from "./dither-kit/x-axis";
import { YAxis } from "./dither-kit/y-axis";
import { milliseconds } from "../format";
import { latencyRows, type Row } from "./latencyRows";
import type { LatencyHeatmap } from "../types";

const ENTRANCE_MS = 900;
const MIN_BAND_PX = 12;
const LABEL_MIN_PX = 48;

function shortMs(value: number): string {
  return value >= 1000 ? `${Number((value / 1000).toFixed(1))}s` : `${Math.round(value)}ms`;
}

const config = {
  p95: { label: "p95", color: "grey" },
  p50: { label: "p50", color: "purple" },
} as const;

type Series = keyof typeof config;

export type LatencyWindow = 24 | 168;
export type IncidentWindow = { openedAt: string | null; resolvedAt: string | null };

/**
 * Response time for one region over the window: the backend's per-column p50 as a dithered area over a dotted p95
 * band: p50 in the accent, p95 in grey behind it, and red only for incident windows shaded behind the data. Chips carry
 * the window's p50 and p95 and switch each series on or off. Columns without an HTTP response keep their place on the
 * time axis and are covered by a hatched "No data" band, so a gap never looks fast and never compresses the scale.
 */
export function LatencyChart({ heatmap, range, onRangeChange, incidents = [], now }: {
  heatmap: LatencyHeatmap;
  range: LatencyWindow;
  onRangeChange: (range: LatencyWindow) => void;
  incidents?: IncidentWindow[];
  now: number;
}) {
  const regions = heatmap.regions.filter((region) => region.p50Ms?.some((value) => value != null));
  const [selected, setSelected] = useState<string | null>(null);
  const region = regions.find((item) => item.region === selected) ?? regions[0];
  const [shown, setShown] = useState<Record<Series, boolean>>({ p50: true, p95: true });

  // Play the entrance once; the page's live refresh then repaints in place.
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setAnimate(false), ENTRANCE_MS + 200);
    return () => window.clearTimeout(timer);
  }, []);

  const long = range > 24;
  // dither-kit replays its entrance whenever `data` changes identity, so rebuild it only when the data does.
  // A fresh array on every render made the chart restart its wave and jump to the end when `animate` flipped.
  const data = useMemo<Row[]>(() => (region ? latencyRows(heatmap, region, long) : []), [heatmap, region, long]);

  // Nothing to draw (no responses, or a backend without percentiles): the heatmap below says why.
  if (!region) return null;

  const windowStart = new Date(heatmap.from).getTime();
  const windowEnd = new Date(heatmap.to).getTime();
  const spans = incidents
    .map((incident) => ({
      start: incident.openedAt ? new Date(incident.openedAt).getTime() : windowStart,
      end: incident.resolvedAt ? new Date(incident.resolvedAt).getTime() : now,
    }))
    .filter((span) => span.end > windowStart && span.start < windowEnd);

  const toggle = (series: Series) => setShown((current) => {
    const next = { ...current, [series]: !current[series] };
    return next.p50 || next.p95 ? next : current; // keep at least one series on
  });

  return (
    <div className="panel-section">
      <header className="section-header">
        <div className="section-title">
          <h3>Response time</h3>
          <div className="chips" role="group" aria-label="Series">
            <Chip series="p50" value={region.windowP50Ms} on={shown.p50} onToggle={() => toggle("p50")} />
            <Chip series="p95" value={region.windowP95Ms} on={shown.p95} onToggle={() => toggle("p95")} />
            {spans.length > 0 && (
              <span className="chip static"><i className="incident" />{spans.length === 1 ? "1 incident" : `${spans.length} incidents`}</span>
            )}
          </div>
        </div>
        <div className="section-controls">
          <div className="segmented" role="group" aria-label="Window">
            {([[24, "24 h"], [168, "7 d"]] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={range === value} onClick={() => onRangeChange(value)}>{label}</button>
            ))}
          </div>
          {regions.length > 1 && (
            <div className="segmented" role="group" aria-label="Region">
              {regions.map((item) => (
                <button key={item.region} type="button" aria-pressed={item.region === region.region} onClick={() => setSelected(item.region)}>
                  {item.region}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      <div className="section-body">
        <div className="latency-chart-canvas" role="img" aria-label={`Latency over the last ${long ? "7 days" : "24 hours"}, ${region.region}`}>
          <AreaChart key={`${region.region}-${range}`} data={data} config={config} bloom="off" animate={animate} animationDuration={ENTRANCE_MS}>
            <Grid />
            <IncidentBands spans={spans} bucketMs={heatmap.bucketSeconds * 1000} />
            {/* Front layer (the chart's default SVG, above the canvas) so it hides the held values; axes draw over it. */}
            <GapBands spans={spans} bucketMs={heatmap.bucketSeconds * 1000} />
            <XAxis dataKey="tick" maxTicks={6} />
            <YAxis tickFormatter={shortMs} />
            <GapAwareTooltip />
            {/* p95 behind as a sparse dotted band, p50 in front as the solid dither. */}
            {shown.p95 && <Area dataKey="p95" variant="dotted" />}
            {shown.p50 && <Area dataKey="p50" variant="gradient" />}
          </AreaChart>
        </div>
      </div>
    </div>
  );
}

function Chip({ series, value, on, onToggle }: { series: Series; value: number | null | undefined; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="chip" aria-pressed={on} onClick={onToggle} title={on ? `Hide ${series}` : `Show ${series}`}>
      <i className={series} />
      {series}
      <b>{value == null ? "—" : milliseconds(value)}</b>
    </button>
  );
}

type Span = { start: number; end: number };

/** Where a point in time sits on screen: rows cover every column, so interpolate directly between bucket centres. */
function xAtTime(ctx: ChartContextValue, rows: Row[], bucketMs: number, time: number): number {
  const last = rows.length - 1;
  const index = Math.min(last, Math.max(0, (time - rows[0].start - bucketMs / 2) / bucketMs));
  const lo = Math.floor(index);
  const hi = Math.min(last, lo + 1);
  return ctx.xCenter(lo) + (index - lo) * (ctx.xCenter(hi) - ctx.xCenter(lo));
}

/** A ten-minute outage is under 1% of a day; keep it wide enough to read as a block, not a stray line. */
function spanBounds(ctx: ChartContextValue, rows: Row[], bucketMs: number, span: Span): [number, number] {
  const width = ctx.plot.width;
  const a = xAtTime(ctx, rows, bucketMs, span.start);
  const b = xAtTime(ctx, rows, bucketMs, span.end);
  const half = Math.max((b - a) / 2, MIN_BAND_PX / 2);
  const x1 = Math.max(0, Math.min(width - 2 * half, (a + b) / 2 - half));
  return [x1, Math.min(width, x1 + 2 * half)];
}

function IncidentPattern({ id }: { id: string }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" className="incident-band-fill" />
      <line x1="0" y1="0" x2="0" y2="6" className="incident-band-hatch" />
    </pattern>
  );
}

/** Incident windows, shaded behind the data and placed by time. */
function IncidentBands({ spans, bucketMs }: { spans: Span[]; bucketMs: number }) {
  const ctx = useChartPart("IncidentBands");
  const pattern = `incident-hatch-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (!ctx.ready || spans.length === 0 || ctx.dataLength === 0) return null;

  const rows = ctx.data as unknown as Row[];
  return (
    <g>
      <defs><IncidentPattern id={pattern} /></defs>
      {spans.map((span) => {
        const [x1, x2] = spanBounds(ctx, rows, bucketMs, span);
        return (
          <g key={`${span.start}-${span.end}`}>
            <rect x={x1} y={0} width={x2 - x1} height={ctx.plot.height} fill={`url(#${pattern})`} />
            <line x1={x1} x2={x1} y1={0} y2={ctx.plot.height} className="incident-band-edge" />
          </g>
        );
      })}
    </g>
  );
}

// Render beneath the dither canvas, like the grid.
IncidentBands.chartLayer = "back" as const;

/** Runs of consecutive gap rows as inclusive [first, last] indices. */
function gapRuns(rows: Row[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  rows.forEach((row, index) => {
    if (!row.gap) return;
    const run = runs[runs.length - 1];
    if (run && run[1] === index - 1) run[1] = index;
    else runs.push([index, index]);
  });
  return runs;
}

/**
 * Columns with no HTTP response. Each run is covered, above the canvas, by an opaque surface with a light hatch
 * from the midpoint before it to the midpoint after (or the chart edge), so the held flat line underneath never
 * shows. An incident inside the run is redrawn on top of the cover, clipped to it, so an outage that produced no
 * responses is still visible. Runs wide enough carry a "No data" label.
 */
function GapBands({ spans, bucketMs }: { spans: Span[]; bucketMs: number }) {
  const ctx = useChartPart("GapBands");
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!ctx.ready || ctx.dataLength === 0) return null;

  const rows = ctx.data as unknown as Row[];
  const runs = gapRuns(rows);
  if (runs.length === 0) return null;
  const last = rows.length - 1;
  const hatch = `gap-hatch-${uid}`;
  const incident = `gap-incident-${uid}`;

  return (
    <g pointerEvents="none">
      <defs>
        <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" className="gap-band-fill" />
          <line x1="0" y1="0" x2="0" y2="6" className="gap-band-hatch" />
        </pattern>
        <IncidentPattern id={incident} />
      </defs>
      {runs.map(([first, end]) => {
        const x1 = first === 0 ? 0 : (ctx.xCenter(first - 1) + ctx.xCenter(first)) / 2;
        const x2 = end === last ? ctx.plot.width : (ctx.xCenter(end) + ctx.xCenter(end + 1)) / 2;
        const width = x2 - x1;
        const clip = `gap-clip-${uid}-${first}`;
        return (
          <g key={first}>
            <clipPath id={clip}><rect x={x1} y={0} width={width} height={ctx.plot.height} /></clipPath>
            <rect x={x1} y={0} width={width} height={ctx.plot.height} className="gap-band-fill" />
            <rect x={x1} y={0} width={width} height={ctx.plot.height} fill={`url(#${hatch})`} />
            <g clipPath={`url(#${clip})`}>
              {spans.map((span) => {
                const [a, b] = spanBounds(ctx, rows, bucketMs, span);
                return <rect key={`${span.start}-${span.end}`} x={a} y={0} width={b - a} height={ctx.plot.height} fill={`url(#${incident})`} />;
              })}
            </g>
            {width >= LABEL_MIN_PX && (
              <g transform={`translate(${x1 + width / 2},${ctx.plot.height / 2})`}>
                <rect x={-30} y={-9} width={60} height={18} className="gap-band-fill gap-band-tag" />
                <text textAnchor="middle" dominantBaseline="central" className="gap-band-label">No data</text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** The stock tooltip, except that a column with no data says so instead of showing its held values. */
function GapAwareTooltip() {
  const ctx = useChartPart("GapAwareTooltip");
  // Keep the last hovered row so the card does not change its text while it fades out.
  const [lastIndex, setLastIndex] = useState(0);
  if (ctx.hoverIndex != null && ctx.hoverIndex !== lastIndex) setLastIndex(ctx.hoverIndex);
  const index = ctx.hoverIndex ?? lastIndex;
  const gap = (ctx.data as unknown as Row[])[index]?.gap === true;
  return <Tooltip labelKey="time" valueFormatter={(value) => (gap ? "No data" : milliseconds(value))} />;
}

// Same layer as the stock tooltip: DOM, above both SVG layers.
GapAwareTooltip.chartLayer = "dom" as const;
