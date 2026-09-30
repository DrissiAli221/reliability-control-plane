import { useEffect, useRef } from "react";
import { pipelineEvents } from "../api";
import { milliseconds, outcomeLabel, outcomeTone, type Tone } from "../format";
import type { PipelineEvent } from "../types";
import { useLiveData } from "../useLiveData";
import { StatusDot } from "./StatusBadge";

const key = (event: PipelineEvent) => `${event.at}|${event.type}|${event.executionId}|${event.region ?? ""}`;

function clock(value: string): string {
  const date = new Date(value);
  return `${date.toLocaleTimeString("en-GB", { hour12: false })}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

function describe(event: PipelineEvent): { text: string; tone?: Tone } {
  switch (event.type) {
    case "OutboxPublished": return { text: "job sent to queue" };
    case "ResultIngested": {
      const outcome = event.outcome ?? "UNKNOWN";
      const latency = event.latencyMs != null && outcome === "HTTP_RESPONSE" ? ` ${milliseconds(event.latencyMs)}` : "";
      return { text: `${outcomeLabel(outcome, event.httpStatus)}${latency}`, tone: outcomeTone(outcome, event.httpStatus) };
    }
    case "ExecutionFinalized": {
      const tone: Tone = event.detail === "UP" ? "good" : event.detail === "DOWN" ? "fault" : event.detail === "DISAGREEMENT" ? "warn" : "muted";
      return { text: `verdict ${event.detail}`, tone };
    }
    case "IncidentOpened": return { text: "incident opened", tone: "fault" };
    case "IncidentResolved": return { text: "incident resolved", tone: "good" };
    default: return { text: event.detail ?? "" };
  }
}

/** A `tail -f` of the control plane: every line is a real, timestamped step, and only new lines light up. */
export function EventStream() {
  const events = useLiveData(pipelineEvents, 2_000);
  const seen = useRef<Set<string> | null>(null);
  const log = useRef<HTMLOListElement>(null);
  const lines = [...(events.data ?? [])].reverse();
  const fresh = new Set(seen.current ? lines.map(key).filter((value) => !seen.current!.has(value)) : []);

  useEffect(() => {
    if (!events.data) return;
    const firstLoad = seen.current == null;
    seen.current = new Set(events.data.map(key));
    const element = log.current;
    // Open at the newest line, then follow the tail only while the reader stays at the bottom.
    if (element && (firstLoad || element.scrollHeight - element.scrollTop - element.clientHeight < 48)) {
      element.scrollTop = element.scrollHeight;
    }
  }, [events.data]);

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Live events</h2>
        <span className="subtle live-tail"><StatusDot tone="good" pulse /> tail · your checks, last 15 min</span>
      </header>
      {lines.length === 0 ? (
        <p className="panel-body subtle">{events.error ?? "Waiting for the next check…"}</p>
      ) : (
        <ol className="event-log" ref={log} aria-live="off">
          {lines.map((event) => {
            const { text, tone } = describe(event);
            return (
              <li key={key(event)} className={fresh.has(key(event)) ? "fresh" : undefined}>
                <time>{clock(event.at)}</time>
                <span className={`log-type ${event.type}`}>{event.type}</span>
                <span className="log-region">{event.region ?? ""}</span>
                <span className={`log-text ${tone ?? ""}`}>{text}</span>
                <span className="log-monitor">{event.monitorName}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
