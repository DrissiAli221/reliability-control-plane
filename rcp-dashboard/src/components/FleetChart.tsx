import { useEffect, useState } from "react";
import { Bar } from "./dither-kit/bar";
import { BarChart } from "./dither-kit/bar-chart";
import { Tooltip } from "./dither-kit/tooltip";
import { XAxis } from "./dither-kit/x-axis";
import { YAxis } from "./dither-kit/y-axis";
import type { VerdictBucket } from "../types";

const config = {
  up: { label: "Up", color: "green" },
  disagreement: { label: "Disagreed", color: "orange" },
  noData: { label: "No data", color: "grey" },
  down: { label: "Down", color: "red" },
} as const;

const ENTRANCE_MS = 900;

function clock(value: number): string {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * The fleet's finalized checks over 24 hours, one dithered column per bucket, stacked by verdict. Heights are real
 * counts, so the chart also shows throughput; scrub it to read a bucket.
 */
export function FleetChart({ buckets, from, bucketSeconds }: { buckets: VerdictBucket[]; from: string; bucketSeconds: number }) {
  // Play the entrance wave once; later live refreshes repaint in place.
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setAnimate(false), ENTRANCE_MS + 200);
    return () => window.clearTimeout(timer);
  }, []);
  const start = new Date(from).getTime();
  const step = bucketSeconds * 1000;
  const data = buckets.map((bucket, index) => ({
    time: `${clock(start + index * step)}–${clock(start + (index + 1) * step)}`,
    tick: clock(start + index * step),
    ...bucket,
  }));

  return (
    <div className="fleet-chart" data-tour="pulse">
      <p className="pulse-readout mono">Every finalized check across the fleet, in half-hour columns. Scrub to read one.</p>
      <div className="fleet-chart-canvas" role="img" aria-label="Fleet verdicts over the last 24 hours">
        <BarChart data={data} config={config} stackType="stacked" bloom="low" animate={animate} animationDuration={ENTRANCE_MS}>
          <XAxis dataKey="tick" maxTicks={6} />
          <YAxis />
          <Tooltip labelKey="time" />
          <Bar dataKey="up" variant="gradient" />
          <Bar dataKey="disagreement" variant="hatched" />
          <Bar dataKey="noData" variant="dotted" />
          <Bar dataKey="down" variant="solid" />
        </BarChart>
      </div>
    </div>
  );
}
