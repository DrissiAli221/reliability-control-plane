import { milliseconds } from "../format";

/** Coverage against the minimum needed to judge the SLO; the marker is the 95% line. */
export function CoverageMeter({ coverage, minimum }: { coverage: number; minimum: number }) {
  const sufficient = coverage >= minimum;
  return (
    <div className="meter" role="img" aria-label={`Coverage ${coverage.toFixed(1)}% of the ${minimum}% needed`}>
      <span className={`meter-fill ${sufficient ? "good" : "warn"}`} style={{ width: `${Math.min(coverage, 100)}%` }} />
      <span className="meter-mark" style={{ left: `${minimum}%` }} />
    </div>
  );
}

/** Confirmed DOWN checks against the allowance; past 100% the budget is spent and the bar stays full. */
export function BudgetMeter({ spent, allowed }: { spent: number; allowed: number }) {
  const ratio = allowed > 0 ? spent / allowed : spent > 0 ? Number.POSITIVE_INFINITY : 0;
  const tone = ratio > 1 ? "fault" : ratio > 0.75 ? "warn" : "good";
  const label = Number.isFinite(ratio) ? `${Math.round(ratio * 100).toLocaleString("en-US")}% of the error budget used` : "Error budget used with none allowed";
  return (
    <div className="meter" role="img" aria-label={label}>
      <span className={`meter-fill ${tone}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
    </div>
  );
}

/** The spread between typical (p50) and slow (p95) responses on a scale from zero. */
export function LatencyRange({ p50, p95 }: { p50: number; p95: number }) {
  const scale = Math.max(p95 * 1.1, 1);
  return (
    <div className="meter latency-range" role="img" aria-label={`p50 ${milliseconds(p50)}, p95 ${milliseconds(p95)}`}>
      <span className="range-span" style={{ left: `${(p50 / scale) * 100}%`, width: `${((p95 - p50) / scale) * 100}%` }} />
      <span className="range-dot" style={{ left: `${(p50 / scale) * 100}%` }} />
      <span className="range-tick" style={{ left: `${(p95 / scale) * 100}%` }} />
    </div>
  );
}
