import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Area } from "./dither-kit/area";
import { AreaChart } from "./dither-kit/area-chart";
import { useChartPart, type ChartContextValue } from "./dither-kit/chart-context";
import { Grid } from "./dither-kit/grid";
import { Tooltip } from "./dither-kit/tooltip";
import { XAxis } from "./dither-kit/x-axis";
import { YAxis } from "./dither-kit/y-axis";
import { milliseconds } from "../format";
import { laneBounds, latencyRows, slotLabel, type Row } from "./latencyRows";
import type { LatencyHeatmap } from "../types";

const ENTRANCE_MS = 900;
const LABEL_MIN_PX = 48;
/** The incident lane: a thin track just above the plot, in the margin the chart reserves for it. */
const LANE_PX = 6;
const LANE_GAP = 6;
const LANE_MIN_SPAN_PX = 2;
const TOP_MARGIN = 10;

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
 * band: p50 in the accent, p95 in grey behind it. Incidents do not shade the data; they sit in a thin lane directly
 * above the plot, on the plot's own x scale, one red span per incident placed by its real time (never snapped to a
 * bucket, never narrower than 2 px; open incidents run to now in solid red, resolved ones are slightly softer). The
 * tooltip adds an "Incident" line with the time range when the hovered column overlaps one. Chips carry the window's
 * p50 and p95 and switch each series on or off. Columns without an HTTP response keep their place on the time axis
 * and are covered by a hatched "No data" band, so a gap never looks fast and never compresses the scale.
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

  const windowStart = new Date(heatmap.from).getTime();
  const windowEnd = new Date(heatmap.to).getTime();
  // What is drawn follows the heatmap in hand, not the requested `range`: after a click on 7 d the old 24 h window
  // stays (dimmed) until the new one arrives, so the labels, scale and rows never describe two different windows and
  // the chart is rebuilt once, when the data lands, not on the click and again on the response.
  const long = windowEnd - windowStart > 36 * 3_600_000;
  const pending = long !== range > 24;
  // dither-kit replays its entrance whenever `data` changes identity, so rebuild it only when the data does.
  // A fresh array on every render made the chart restart its wave and jump to the end when `animate` flipped.
  const data = useMemo<Row[]>(() => (region ? latencyRows(heatmap, region, long) : []), [heatmap, region, long]);
  const spans = useMemo<Span[]>(() => incidents
    .map((incident) => ({
      start: incident.openedAt ? new Date(incident.openedAt).getTime() : windowStart,
      end: incident.resolvedAt ? new Date(incident.resolvedAt).getTime() : now,
      open: !incident.resolvedAt,
    }))
    .filter((span) => span.end > windowStart && span.start < windowEnd), [incidents, now, windowStart, windowEnd]);

  // Nothing to draw (no responses, or a backend without percentiles): the heatmap below says why.
  if (!region) return null;

  const bucketMs = heatmap.bucketSeconds * 1000;
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
        <div className={pending ? "latency-chart-canvas pending" : "latency-chart-canvas"} aria-busy={pending} role="img" aria-label={`Latency over the last ${long ? "7 days" : "24 hours"}, ${region.region}`}>
          <AreaChart
            key={`${region.region}-${long ? 168 : 24}`} data={data} config={config} bloom="off" animate={animate} animationDuration={ENTRANCE_MS}
            margins={incidents.length > 0 ? { top: TOP_MARGIN + LANE_PX + LANE_GAP } : undefined}
          >
            <Grid />
            {/* Front layer (the chart's default SVG, above the canvas) so it hides the held values; axes draw over it. */}
            <GapBands />
            <IncidentLane spans={spans} bucketMs={bucketMs} />
            <XAxis dataKey="tick" maxTicks={6} />
            <YAxis tickFormatter={shortMs} />
            <GapAwareTooltip spans={spans} bucketMs={bucketMs} long={long} />
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

type Span = { start: number; end: number; open: boolean };

/** Where a point in time sits on screen: rows cover every column, so interpolate directly between bucket centres. */
function xAtTime(ctx: ChartContextValue, rows: Row[], bucketMs: number, time: number): number {
  const last = rows.length - 1;
  const index = Math.min(last, Math.max(0, (time - rows[0].start - bucketMs / 2) / bucketMs));
  const lo = Math.floor(index);
  const hi = Math.min(last, lo + 1);
  return ctx.xCenter(lo) + (index - lo) * (ctx.xCenter(hi) - ctx.xCenter(lo));
}

/**
 * Incidents on their own lane above the plot, aligned to the plot's x scale. Each span is placed by its real start
 * and end, so a ten-minute drill is a few pixels in the 7-day view instead of a whole 80-minute bucket.
 */
function IncidentLane({ spans, bucketMs }: { spans: Span[]; bucketMs: number }) {
  const ctx = useChartPart("IncidentLane");
  const hatch = `lane-hatch-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (!ctx.ready || spans.length === 0 || ctx.dataLength === 0) return null;

  const rows = ctx.data as unknown as Row[];
  const width = ctx.plot.width;
  return (
    <g pointerEvents="none" transform={`translate(0,${-(LANE_PX + LANE_GAP)})`}>
      <defs>
        <pattern id={hatch} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" className="incident-lane-track" />
          <line x1="0" y1="0" x2="0" y2="4" className="incident-lane-hatch" />
        </pattern>
      </defs>
      {/* A hatched track, like the chart's no-data bands, so the lane reads as "time" rather than as an empty bar. */}
      <rect className="incident-lane" x={0} y={0} width={width} height={LANE_PX} fill={`url(#${hatch})`} />
      {spans.map((span, index) => {
        const [x, w] = laneBounds(xAtTime(ctx, rows, bucketMs, span.start), xAtTime(ctx, rows, bucketMs, span.end), width, LANE_MIN_SPAN_PX);
        return <rect key={`${span.start}-${index}`} className={span.open ? "incident-lane-span open" : "incident-lane-span"} x={x} y={0} width={w} height={LANE_PX} />;
      })}
    </g>
  );
}

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
 * shows. Runs wide enough carry a "No data" label. Incidents live in the lane above the plot, not in here.
 */
function GapBands() {
  const ctx = useChartPart("GapBands");
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!ctx.ready || ctx.dataLength === 0) return null;

  const rows = ctx.data as unknown as Row[];
  const runs = gapRuns(rows);
  if (runs.length === 0) return null;
  const last = rows.length - 1;
  const hatch = `gap-hatch-${uid}`;

  return (
    <g pointerEvents="none">
      <defs>
        <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" className="gap-band-fill" />
          <line x1="0" y1="0" x2="0" y2="6" className="gap-band-hatch" />
        </pattern>
      </defs>
      {runs.map(([first, end]) => {
        const x1 = first === 0 ? 0 : (ctx.xCenter(first - 1) + ctx.xCenter(first)) / 2;
        const x2 = end === last ? ctx.plot.width : (ctx.xCenter(end) + ctx.xCenter(end + 1)) / 2;
        const width = x2 - x1;
        return (
          <g key={first}>
            <rect x={x1} y={0} width={width} height={ctx.plot.height} className="gap-band-fill" />
            <rect x={x1} y={0} width={width} height={ctx.plot.height} fill={`url(#${hatch})`} />
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

/**
 * The stock tooltip, except that a column with no data says so instead of showing its held values, and a column
 * that overlaps an incident adds an "Incident" line with the incident's time range.
 */
function GapAwareTooltip({ spans, bucketMs, long }: { spans: Span[]; bucketMs: number; long: boolean }) {
  const ctx = useChartPart("GapAwareTooltip");
  // Keep the last hovered row so the card does not change its text while it fades out.
  const [lastIndex, setLastIndex] = useState(0);
  if (ctx.hoverIndex != null && ctx.hoverIndex !== lastIndex) setLastIndex(ctx.hoverIndex);
  const index = ctx.hoverIndex ?? lastIndex;
  const rows = ctx.data as unknown as Row[];
  const gap = rows[index]?.gap === true;
  const footer = (at: number): ReactNode => {
    const row = rows[at];
    if (!row) return null;
    const hits = spans.filter((span) => span.start < row.start + bucketMs && span.end > row.start);
    if (hits.length === 0) return null;
    return (
      <div className="chart-tip-incident">
        <i />
        <span>Incident</span>
        <span className="chart-tip-incident-times">
          {hits.slice(0, 2).map((span) => <b key={span.start}>{incidentRange(span, long)}</b>)}
          {hits.length > 2 && <em>+{hits.length - 2} more</em>}
        </span>
      </div>
    );
  };
  return <Tooltip labelKey="time" valueFormatter={(value) => (gap ? "No data" : milliseconds(value))} footer={footer} />;
}

/** "14:02–14:12", with the weekday on the start in the 7-day view, and "–now" while the incident is open. */
function incidentRange(span: Span, long: boolean): string {
  return `${slotLabel(span.start, long)}–${span.open ? "now" : slotLabel(span.end, false)}`;
}

// Same layer as the stock tooltip: DOM, above both SVG layers.
GapAwareTooltip.chartLayer = "dom" as const;
