import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { milliseconds, outcomeLabel, outcomeTone, relativeTime, verdictState } from "../format";
import type { MonitorHistory } from "../types";
import { StatusBadge } from "./StatusBadge";

const WIDTH = 300;
const HEIGHT = 190;

/** Where a preview for `rect` fits: under the row when there is room, otherwise above it. */
function previewPosition(rect: DOMRect): CSSProperties {
  const left = Math.min(Math.max(rect.left + 48, 16), window.innerWidth - WIDTH - 16);
  return rect.bottom + HEIGHT + 12 < window.innerHeight
    ? { left, top: rect.bottom + 6 }
    : { left, top: rect.top - 6, transform: "translateY(-100%)" };
}

/**
 * A glance at a monitor without opening it: the latest check, region by region, and the verdicts before it.
 * Everything comes from the history the table already loaded, so hovering costs no requests.
 */
export function RowPreview({ history, now, anchor }: { history: MonitorHistory; now: number; anchor: DOMRect }) {
  const [latest, ...earlier] = history.recentChecks;
  if (!latest) return null;
  const verdict = verdictState(latest.verdict);
  const slowest = Math.max(1, ...latest.results.map((result) => result.latencyMs));
  const tape = [latest, ...earlier].reverse();

  return createPortal(
    <div className="row-preview" role="tooltip" style={{ ...previewPosition(anchor), width: WIDTH }}>
      <header>
        <span className="subtle">Last check · {relativeTime(latest.scheduledAt, now)}</span>
        <StatusBadge label={verdict.label} tone={verdict.tone} />
      </header>
      <ul className="preview-regions">
        {latest.results.map((result) => {
          const tone = outcomeTone(result.outcome, result.httpStatus);
          return (
            <li key={result.region}>
              <span className="mono">{result.region}</span>
              <span className="preview-track"><i className={tone} style={{ width: `${(result.latencyMs / slowest) * 100}%` }} /></span>
              <span className={`result ${tone}`}>{outcomeLabel(result.outcome, result.httpStatus)}</span>
              <span className="mono subtle">{milliseconds(result.latencyMs)}</span>
            </li>
          );
        })}
      </ul>
      <div className="preview-tape" aria-label={`Last ${tape.length} verdicts, oldest first`}>
        {tape.map((check) => <i key={check.executionId} className={check.verdict.toLowerCase().replace("_", "-")} title={check.verdict} />)}
      </div>
      <p className="preview-hint">Last {tape.length} verdicts · click the row for details</p>
    </div>,
    document.body,
  );
}
