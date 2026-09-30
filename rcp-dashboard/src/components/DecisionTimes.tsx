import { useNavigate } from "react-router-dom";
import { absoluteTime, durationBetween, relativeTime, verdictState } from "../format";
import type { PipelineSnapshot } from "../types";

/**
 * How long each recent check took to travel the pipeline, from its scheduled time to its verdict. The bar is
 * the story here: steady lengths mean a healthy pipeline, a long one means a region was slow or a result was late.
 */
export function DecisionTimes({ activity, now }: { activity: PipelineSnapshot["recentActivity"]; now: number }) {
  const navigate = useNavigate();
  const took = (item: (typeof activity)[number]) => Math.max(0, Date.parse(item.finalizedAt) - Date.parse(item.scheduledAt));
  const slowest = Math.max(1, ...activity.map(took));

  return (
    <ol className="decision-times">
      {activity.map((item, index) => {
        const verdict = verdictState(item.verdict);
        const open = () => navigate(`/monitors/${item.monitorId}?check=${item.executionId}`);
        return (
          <li key={item.executionId}>
            <button type="button" onClick={open} style={{ animationDelay: `${index * 25}ms` }} aria-label={`${item.monitorName}, ${verdict.label}, decided in ${durationBetween(item.scheduledAt, item.finalizedAt)}. Open trace`}>
              <i className={`decision-verdict ${verdict.tone}`} title={verdict.label} />
              <span className="decision-monitor">{item.monitorName}</span>
              <span className="decision-track"><b className={verdict.tone} style={{ width: `${(took(item) / slowest) * 100}%` }} /></span>
              <span className="mono decision-took">{durationBetween(item.scheduledAt, item.finalizedAt)}</span>
              <time className="subtle" dateTime={item.scheduledAt} title={absoluteTime(item.scheduledAt)}>{relativeTime(item.scheduledAt, now)}</time>
              <span className={`decision-transition ${item.transition === "OPENED" ? "fault" : item.transition === "RESOLVED" ? "good" : ""}`}>
                {item.transition === "OPENED" ? "opened" : item.transition === "RESOLVED" ? "resolved" : ""}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
