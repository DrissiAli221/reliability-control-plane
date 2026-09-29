import { useMemo, useState } from "react";
import { milliseconds, verdictState } from "../format";
import { spanLabel, traceEvents, traceRows, verdictRule, type SpanKind } from "../trace";
import type { ExecutionTrace } from "../types";
import { StatusBadge } from "./StatusBadge";

type View = "timeline" | "history";

const LEGEND: SpanKind[] = ["staging", "outbox", "queue", "probe", "delivery", "finalize", "evaluate"];

function ticks(totalMs: number): number[] {
  const raw = totalMs / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((value) => value >= raw) ?? raw;
  const values: number[] = [];
  for (let value = 0; value <= totalMs; value += step) values.push(value);
  return values;
}

function clock(value: string): string {
  const date = new Date(value);
  return `${date.toLocaleTimeString("en-GB", { hour12: false })}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

export function TraceView({ trace }: { trace: ExecutionTrace }) {
  const [view, setView] = useState<View>("timeline");
  const { rows, totalMs } = useMemo(() => traceRows(trace), [trace]);
  const events = useMemo(() => traceEvents(trace), [trace]);
  const verdict = trace.verdict ? verdictState(trace.verdict) : { label: "Pending", tone: "info" as const };
  const t0 = new Date(trace.scheduledAt).getTime();

  return (
    <div className="trace">
      <div className="trace-head">
        <div className="trace-title">
          <span className="mono subtle">check</span>
          <span className="mono">{trace.executionId.slice(0, 8)}</span>
          <StatusBadge label={verdict.label} tone={verdict.tone} />
          <span className="subtle">
            {trace.jobs.filter((job) => job.receivedAt).length}/{trace.expectedRegionCount} regions · {milliseconds(totalMs)} end to end
          </span>
        </div>
        <div className="segmented" role="group" aria-label="Trace view">
          <button type="button" aria-pressed={view === "timeline"} onClick={() => setView("timeline")}>Timeline</button>
          <button type="button" aria-pressed={view === "history"} onClick={() => setView("history")}>Event history</button>
        </div>
      </div>

      {view === "timeline" ? (
        <div className="waterfall" role="table" aria-label="Check timeline">
          <div className="waterfall-row axis" role="row">
            <span role="columnheader" />
            <div className="waterfall-track">
              {ticks(totalMs).map((value) => (
                <span key={value} className="tick" style={{ left: `${(value / totalMs) * 100}%` }}>{milliseconds(value)}</span>
              ))}
            </div>
            <span role="columnheader" />
          </div>
          {rows.map((row, rowIndex) => {
            const duration = row.spans.reduce((sum, item) => sum + (item.endMs - item.startMs), 0);
            return (
              <div className="waterfall-row" role="row" key={row.label}>
                <span role="rowheader" className={row.mono ? "mono" : undefined}>{row.label}</span>
                <div className="waterfall-track" role="cell">
                  {ticks(totalMs).map((value) => <i key={value} className="gridline" style={{ left: `${(value / totalMs) * 100}%` }} />)}
                  {row.spans.map((item) => {
                    const width = ((item.endMs - item.startMs) / totalMs) * 100;
                    return (
                      <span
                        key={item.kind}
                        className={`span ${item.kind}${item.tone ? ` ${item.tone}` : ""}`}
                        style={{ left: `${(item.startMs / totalMs) * 100}%`, width: `max(${width}%, 3px)`, animationDelay: `${rowIndex * 70}ms` }}
                        title={`${spanLabel[item.kind]} · ${milliseconds(item.endMs - item.startMs)}`}
                      >
                        {width > 14 && <em>{milliseconds(item.endMs - item.startMs)}</em>}
                      </span>
                    );
                  })}
                </div>
                <span role="cell" className="mono subtle waterfall-duration">{row.spans.length ? milliseconds(duration) : "—"}</span>
              </div>
            );
          })}
          <ul className="span-legend">
            {LEGEND.map((kind) => <li key={kind}><i className={`span ${kind}`} />{spanLabel[kind]}</li>)}
          </ul>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="table compact event-history">
            <thead>
              <tr><th scope="col">#</th><th scope="col">Δ</th><th scope="col">Time</th><th scope="col">Event</th><th scope="col">Details</th></tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="mono subtle">{event.id}</td>
                  <td className="mono subtle">+{milliseconds(Math.max(0, new Date(event.at).getTime() - t0))}</td>
                  <td className="mono subtle">{clock(event.at)}</td>
                  <td>
                    <span className={`event-type ${event.category}${event.tone ? ` ${event.tone}` : ""}`}>
                      <i aria-hidden="true" />{event.type}
                    </span>
                    {event.region && <span className="event-region mono">{event.region}</span>}
                  </td>
                  <td>
                    <div className="event-details">
                      {event.details.map(([key, value]) => <span key={key}><b>{key}</b> {value}</span>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="trace-note">
        Worker start and finish times use the worker's clock; every other timestamp is PostgreSQL time.
        {trace.verdict && <> {trace.verdict} means {verdictRule[trace.verdict]}.</>}
      </p>
    </div>
  );
}

