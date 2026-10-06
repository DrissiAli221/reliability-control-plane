import { useEffect, useMemo, useState } from "react";
import { Area } from "./dither-kit/area";
import { AreaChart } from "./dither-kit/area-chart";
import { Tooltip } from "./dither-kit/tooltip";
import { XAxis } from "./dither-kit/x-axis";
import { YAxis } from "./dither-kit/y-axis";
import { milliseconds } from "../format";
import type { LatencyHeatmap } from "../types";

const ENTRANCE_MS = 900;

const config = {
  p95: { label: "p95", color: "grey" },
  p50: { label: "p50", color: "blue" },
} as const;

function clock(value: number): string {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function shortMs(value: number): string {
  return value >= 1000 ? `${Number((value / 1000).toFixed(1))}s` : `${Math.round(value)}ms`;
}

/**
 * Response time over the window for one region: the backend's per-column p50 as a dithered area over a dotted
 * p95 band. Columns without an HTTP response are left out rather than drawn as zero, so a gap never looks fast.
 */
export function LatencyChart({ heatmap }: { heatmap: LatencyHeatmap }) {
  const regions = heatmap.regions.filter((region) => region.p50Ms?.some((value) => value != null));
  const [selected, setSelected] = useState<string | null>(null);
  const region = regions.find((item) => item.region === selected) ?? regions[0];

  // Play the entrance once; the page's live refresh then repaints in place.
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setAnimate(false), ENTRANCE_MS + 200);
    return () => window.clearTimeout(timer);
  }, []);

  // dither-kit replays its entrance whenever `data` changes identity, so rebuild it only when the data does.
  // A fresh array on every render made the chart restart its wave and jump to the end when `animate` flipped.
  const data = useMemo(() => {
    if (!region) return [];
    const from = new Date(heatmap.from).getTime();
    const step = heatmap.bucketSeconds * 1000;
    return region.p50Ms.flatMap((p50, column) => {
      const p95 = region.p95Ms[column];
      if (p50 == null || p95 == null) return [];
      const start = from + column * step;
      return [{ tick: clock(start), time: `${clock(start)}–${clock(start + step)}`, p50, p95 }];
    });
  }, [heatmap.from, heatmap.bucketSeconds, region]);

  // Nothing to draw (no responses, or a backend without percentiles): the heatmap below says why.
  if (!region) return null;

  return (
    <div className="panel-section">
      <header className="section-header">
        <div className="section-title">
          <h3>Response time</h3>
          <span className="latency-legend" aria-hidden="true"><span><i className="p50" />p50</span><span><i className="p95" />p95</span></span>
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
      </header>
      <div className="section-body">
        <div className="latency-chart-canvas" role="img" aria-label={`Latency over the last 24 hours, ${region.region}`}>
          <AreaChart key={region.region} data={data} config={config} bloom="low" animate={animate} animationDuration={ENTRANCE_MS}>
            <XAxis dataKey="tick" maxTicks={6} />
            <YAxis tickFormatter={shortMs} />
            <Tooltip labelKey="time" valueFormatter={(value) => milliseconds(value)} />
            {/* p95 behind as a sparse dotted band, p50 in front as the solid dither. */}
            <Area dataKey="p95" variant="dotted" />
            <Area dataKey="p50" variant="gradient" />
          </AreaChart>
        </div>
      </div>
    </div>
  );
}
