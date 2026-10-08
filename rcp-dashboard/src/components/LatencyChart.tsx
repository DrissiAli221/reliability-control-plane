import { useEffect, useId, useMemo, useState } from "react";
import { Area } from "./dither-kit/area";
import { AreaChart } from "./dither-kit/area-chart";
import { useChartPart } from "./dither-kit/chart-context";
import { Grid } from "./dither-kit/grid";
import { Tooltip } from "./dither-kit/tooltip";
import { XAxis } from "./dither-kit/x-axis";
import { YAxis } from "./dither-kit/y-axis";
import { milliseconds } from "../format";
import type { LatencyHeatmap } from "../types";

const ENTRANCE_MS = 900;

const config = {
  p95: { label: "p95", color: "grey" },
  p50: { label: "p50", color: "purple" },
} as const;

type Series = keyof typeof config;

export type LatencyWindow = 24 | 168;
export type IncidentWindow = { openedAt: string | null; resolvedAt: string | null };

type Row = { tick: string; time: string; start: number; p50: number; p95: number };

function slotLabel(value: number, long: boolean): string {
  return new Date(value).toLocaleString("en-GB", long
    ? { weekday: "short", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" });
}

function shortMs(value: number): string {
  return value >= 1000 ? `${Number((value / 1000).toFixed(1))}s` : `${Math.round(value)}ms`;
}

/**
 * Response time for one region over the window: the backend's per-column p50 as a dithered area over a dotted p95
 * band: p50 in the accent, p95 in grey behind it, and red only for incident windows shaded behind the data. Chips carry
 * the window's p50 and p95 and switch each series on or off. Columns without an HTTP response are left out rather
 * than drawn as zero, so a gap never looks fast.
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
  const data = useMemo<Row[]>(() => {
    if (!region) return [];
    const from = new Date(heatmap.from).getTime();
    const step = heatmap.bucketSeconds * 1000;
    return region.p50Ms.flatMap((p50, column) => {
      const p95 = region.p95Ms[column];
      if (p50 == null || p95 == null) return [];
      const start = from + column * step;
      return [{ tick: slotLabel(start, long), time: `${slotLabel(start, long)}–${slotLabel(start + step, false)}`, start, p50, p95 }];
    });
  }, [heatmap.from, heatmap.bucketSeconds, region, long]);

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
            <XAxis dataKey="tick" maxTicks={6} />
            <YAxis tickFormatter={shortMs} />
            <Tooltip labelKey="time" valueFormatter={(value) => milliseconds(value)} />
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

/**
 * Incident windows, shaded behind the data. Placed by time, not by data point: an outage with no HTTP responses
 * has no latency points, so the band is interpolated between the measured columns instead of disappearing.
 */
function IncidentBands({ spans, bucketMs }: { spans: Array<{ start: number; end: number }>; bucketMs: number }) {
  const ctx = useChartPart("IncidentBands");
  const pattern = `incident-hatch-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (!ctx.ready || spans.length === 0 || ctx.dataLength === 0) return null;

  const rows = ctx.data as unknown as Row[];
  const width = ctx.plot.width;
  const columnPx = rows.length > 1 ? (ctx.xCenter(rows.length - 1) - ctx.xCenter(0)) / (rows.length - 1) : width;
  const clamp = (x: number) => Math.min(width, Math.max(0, x));

  const xAt = (time: number) => {
    for (let i = 0; i < rows.length; i++) {
      const start = rows[i].start;
      const left = ctx.xCenter(i) - columnPx / 2;
      if (time < start) return clamp(left); // before this column: a gap or the start of the window
      if (time < start + bucketMs) return clamp(left + ((time - start) / bucketMs) * columnPx);
    }
    return width;
  };

  return (
    <g>
      <defs>
        <pattern id={pattern} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" className="incident-band-fill" />
          <line x1="0" y1="0" x2="0" y2="6" className="incident-band-hatch" />
        </pattern>
      </defs>
      {spans.map((span) => {
        const x1 = xAt(span.start);
        const x2 = Math.max(xAt(span.end), x1 + 3);
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
