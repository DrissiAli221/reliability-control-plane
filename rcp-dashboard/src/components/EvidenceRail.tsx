import { count, percent } from "../format";
import type { AvailabilityReport } from "../types";

/**
 * Every expected check slot, split by what actually happened. Disagreement, inconclusive checks and
 * slots the scheduler never ran stay visible instead of silently inflating availability.
 */
export function EvidenceRail({ report }: { report: AvailabilityReport }) {
  const total = Math.max(report.expectedOpportunities, report.totalFinalizedExecutions + report.pendingExecutions);
  const pieces = [
    ["up", report.upExecutions, "Up"],
    ["down", report.downExecutions, "Down"],
    ["disagreement", report.disagreementExecutions, "Disagree"],
    ["no-data", report.noDataExecutions, "No data"],
    ["pending", report.pendingExecutions, "Pending"],
    ["unscheduled", report.missingExecutions, "Not scheduled"],
  ] as const;
  const availability = report.measuredAvailabilityPercent == null ? "—" : percent(report.measuredAvailabilityPercent, 3);

  return (
    <div className="evidence">
      <div
        className="evidence-rail"
        role="img"
        aria-label={`${availability} availability with ${report.evidenceCoveragePercent}% evidence coverage`}
      >
        {total === 0
          ? <span className="segment empty" style={{ width: "100%" }} />
          : pieces.map(([kind, value]) => value > 0 && (
            <span key={kind} className={`segment ${kind}`} style={{ width: `${(value / total) * 100}%` }} />
          ))}
      </div>
      <ul className="evidence-legend">
        {pieces.map(([kind, value, label]) => (
          <li key={kind}><i className={kind} aria-hidden="true" />{`${label} ${count(value)}`}</li>
        ))}
      </ul>
    </div>
  );
}
