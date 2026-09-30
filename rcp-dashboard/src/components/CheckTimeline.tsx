import { useState } from "react";
import { absoluteTime, milliseconds, outcomeLabel, outcomeTone, relativeTime, verdictState } from "../format";
import type { RecentCheck } from "../types";

function clock(value: string): string {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Recent checks as columns, oldest on the left: a verdict cell on top and one latency bar per region below,
 * so a steady run reads as a calm rhythm, one region's slowness shows as a taller row, and a failure breaks
 * the pattern at a glance. Bars use a square-root scale so one slow outlier does not flatten the rest.
 * Select a column to open its trace.
 */
export function CheckTimeline({ checks, regions, selected, onSelect, now }: {
  checks: RecentCheck[];
  regions: string[];
  selected: string | null;
  onSelect: (executionId: string) => void;
  now: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const ordered = [...checks].reverse();
  const slowest = Math.max(1, ...ordered.flatMap((check) => check.results.map((result) => result.latencyMs)));
  const focus = ordered.find((check) => check.executionId === (hover ?? selected)) ?? ordered[ordered.length - 1];

  if (ordered.length === 0) return <p className="panel-body subtle">No finalized checks yet.</p>;

  return (
    <div className="timeline-checks" data-tour="checks">
      <p className="check-readout mono" aria-live="polite">
        {focus && (
          <>
            <span className={`result ${verdictState(focus.verdict).tone}`}>{focus.verdict}</span>
            {" "}<span title={absoluteTime(focus.scheduledAt)}>{clock(focus.scheduledAt)}</span>
            {focus.results.map((result) => (
              <span key={result.region}>
                {" · "}{result.region}{" "}
                <span className={`result ${outcomeTone(result.outcome, result.httpStatus)}`}>{outcomeLabel(result.outcome, result.httpStatus)}</span>
                {" "}{milliseconds(result.latencyMs)}
              </span>
            ))}
          </>
        )}
      </p>
      <div className="check-grid" style={{ gridTemplateColumns: `76px repeat(${ordered.length}, minmax(0, 1fr))` }} onMouseLeave={() => setHover(null)}>
        <span className="check-label">verdict</span>
        {ordered.map((check) => (
          <button
            key={check.executionId}
            type="button"
            className={`check-verdict ${check.verdict.toLowerCase().replace("_", "-")}${check.executionId === selected ? " selected" : ""}`}
            style={{ gridRow: `1 / span ${regions.length + 1}` }}
            aria-label={`${verdictState(check.verdict).label}, ${relativeTime(check.scheduledAt, now)}. Open trace`}
            aria-pressed={check.executionId === selected}
            onMouseEnter={() => setHover(check.executionId)}
            onFocus={() => setHover(check.executionId)}
            onClick={() => onSelect(check.executionId)}
          >
            <i />
            {regions.map((region) => {
              const result = check.results.find((item) => item.region === region);
              return (
                <span key={region} className="check-bar">
                  {result
                    ? <b className={outcomeTone(result.outcome, result.httpStatus)} style={{ height: `${Math.max(6, Math.sqrt(result.latencyMs / slowest) * 100)}%` }} />
                    : <b className="missing" />}
                </span>
              );
            })}
          </button>
        ))}
        {regions.map((region, index) => <span key={region} className="check-label mono" style={{ gridRow: index + 2, gridColumn: 1 }}>{region}</span>)}
      </div>
      <div className="check-axis" aria-hidden="true">
        <span>{relativeTime(ordered[0].scheduledAt, now)}</span>
        <span>{relativeTime(ordered[ordered.length - 1].scheduledAt, now)}</span>
      </div>
    </div>
  );
}
