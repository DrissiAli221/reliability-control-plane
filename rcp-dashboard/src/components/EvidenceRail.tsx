import type { AvailabilityReport } from "../types";

export function EvidenceRail({ report }: { report: AvailabilityReport }) {
  const total = Math.max(report.expectedOpportunities, report.totalFinalizedExecutions + report.pendingExecutions);
  const pieces = [
    ["up", report.upExecutions, "UP"],
    ["down", report.downExecutions, "DOWN"],
    ["disagreement", report.disagreementExecutions, "DISAGREE"],
    ["missing", report.noDataExecutions, "NO DATA"],
    ["pending", report.pendingExecutions, "PENDING"],
    ["unscheduled", report.missingExecutions, "NOT SCHEDULED"],
  ] as const;
  const availability = report.measuredAvailabilityPercent == null ? "—" : `${Number(report.measuredAvailabilityPercent).toFixed(3)}%`;

  return (
    <div className="evidence">
      <div className="evidence-summary"><strong>{availability}</strong><span>{Number(report.evidenceCoveragePercent).toFixed(1)}% evidence coverage</span></div>
      <div className="evidence-rail" aria-label={`${availability} availability with ${report.evidenceCoveragePercent}% evidence coverage`}>
        {total === 0 ? <span className="segment empty" style={{ width: "100%" }} /> : pieces.map(([kind, count]) => count > 0 && <span key={kind} className={`segment ${kind}`} style={{ width: `${(count / total) * 100}%` }} />)}
      </div>
      <div className="evidence-legend">{pieces.map(([kind, count, label]) => <span key={kind}><i className={kind} />{label} {count}</span>)}</div>
    </div>
  );
}
