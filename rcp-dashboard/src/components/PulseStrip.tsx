import { useState } from "react";
import { count } from "../format";
import type { VerdictBucket } from "../types";

function clock(value: number): string {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function total(bucket: VerdictBucket): number {
  return bucket.up + bucket.down + bucket.disagreement + bucket.noData;
}

/**
 * The fleet's verdicts over time, one column per bucket. Each column is split by verdict share, like the
 * daily tracker, so a single DOWN among hundreds of UP checks still shows as a sliver rather than vanishing.
 */
export function PulseStrip({ buckets, from, bucketSeconds }: { buckets: VerdictBucket[]; from: string; bucketSeconds: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const start = new Date(from).getTime();
  const step = bucketSeconds * 1000;
  const active = hover == null ? null : buckets[hover];

  return (
    <div className="pulse" data-tour="pulse">
      <p className="pulse-readout mono" aria-live="polite">
        {active && hover != null
          ? <>{clock(start + hover * step)}–{clock(start + (hover + 1) * step)} · <b>{count(active.up)}</b> up · <b>{count(active.down)}</b> down · <b>{count(active.disagreement)}</b> disagree · <b>{count(active.noData)}</b> no data</>
          : "Every finalized check across the fleet, in half-hour columns."}
      </p>
      <div className="pulse-bars" role="img" aria-label="Fleet verdicts over the last 24 hours" onMouseLeave={() => setHover(null)}>
        {buckets.map((bucket, index) => {
          const size = total(bucket);
          const share = (value: number) => (value === 0 ? 0 : Math.max(value / size, 0.16));
          return (
            <span
              key={index}
              className={`pulse-bar${size === 0 ? " idle" : ""}${hover === index ? " active" : ""}`}
              style={{ animationDelay: `${index * 10}ms` }}
              onMouseEnter={() => setHover(index)}
            >
              {size > 0 && (
                <>
                  {bucket.down > 0 && <i className="down" style={{ flexGrow: share(bucket.down) }} />}
                  {bucket.disagreement > 0 && <i className="disagreement" style={{ flexGrow: share(bucket.disagreement) }} />}
                  {bucket.noData > 0 && <i className="no-data" style={{ flexGrow: bucket.noData / size }} />}
                  {bucket.up > 0 && <i className="up" style={{ flexGrow: bucket.up / size }} />}
                </>
              )}
            </span>
          );
        })}
      </div>
      <div className="pulse-axis" aria-hidden="true">
        <span>24 h ago</span>
        <span>12 h</span>
        <span>now</span>
      </div>
    </div>
  );
}
