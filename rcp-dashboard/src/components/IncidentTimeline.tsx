import { Link } from "react-router-dom";
import { absoluteTime, elapsed } from "../format";
import type { IncidentSpan } from "../types";
import { StatusDot } from "./StatusBadge";

const DAY = 86_400_000;

function dayLabel(value: number): string {
  return new Date(value).toLocaleDateString("en-GB", { weekday: "short" });
}

/**
 * Seven days on one axis. Each incident is a block from its opening to its resolution (or to now while it is
 * open), so how long outages lasted and how they cluster reads at a glance; the list below names each one.
 */
export function IncidentTimeline({ incidents, from, now }: { incidents: IncidentSpan[]; from: string; now: number }) {
  const start = new Date(from).getTime();
  const span = Math.max(1, now - start);
  const position = (value: number) => Math.min(100, Math.max(0, ((value - start) / span) * 100));
  const ticks = Array.from({ length: 7 }, (_, index) => start + (index + 1) * DAY).filter((tick) => tick < now);

  return (
    <div className="timeline">
      <div className="timeline-track" role="img" aria-label={`${incidents.length} incidents in the last 7 days`}>
        {ticks.map((tick) => (
          <span key={tick} className="timeline-tick" style={{ left: `${position(tick)}%` }}><em>{dayLabel(tick)}</em></span>
        ))}
        {incidents.map((incident) => {
          const opened = new Date(incident.openedAt).getTime();
          const closed = incident.resolvedAt ? new Date(incident.resolvedAt).getTime() : now;
          const left = position(opened);
          return (
            <Link
              key={incident.incidentId}
              to={`/monitors/${incident.monitorId}`}
              className={`timeline-span${incident.resolvedAt ? "" : " open"}`}
              style={{ left: `${left}%`, width: `${Math.max(position(closed) - left, 0)}%` }}
              title={`${incident.monitorName} · ${absoluteTime(incident.openedAt)} · ${elapsed(closed - opened)}`}
              aria-label={`${incident.monitorName} incident, ${elapsed(closed - opened)}`}
            />
          );
        })}
        <span className="timeline-now" aria-hidden="true" />
      </div>

      {incidents.length === 0 ? (
        <p className="timeline-empty subtle">No incidents in the last 7 days.</p>
      ) : (
        <ol className="timeline-list">
          {incidents.slice(0, 5).map((incident) => {
            const closed = incident.resolvedAt ? new Date(incident.resolvedAt).getTime() : now;
            return (
              <li key={incident.incidentId}>
                <StatusDot tone={incident.resolvedAt ? "good" : "fault"} />
                <Link to={`/monitors/${incident.monitorId}`}>{incident.monitorName}</Link>
                <time className="subtle" dateTime={incident.openedAt}>{absoluteTime(incident.openedAt)}</time>
                <span className={`mono${incident.resolvedAt ? " subtle" : " live-clock"}`}>
                  {incident.resolvedAt ? `lasted ${elapsed(closed - new Date(incident.openedAt).getTime())}` : `open ${elapsed(closed - new Date(incident.openedAt).getTime())}`}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
