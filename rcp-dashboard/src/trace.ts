import { outcomeLabel, outcomeTone, type Tone } from "./format";
import type { ExecutionTrace, Verdict } from "./types";

export type TraceCategory = "schedule" | "transport" | "probe" | "ingest" | "decision";

export type TraceEvent = {
  id: number;
  at: string;
  type: string;
  category: TraceCategory;
  region?: string;
  tone?: Tone;
  details: Array<[string, string]>;
};

export type SpanKind = "staging" | "outbox" | "queue" | "probe" | "delivery" | "finalize" | "evaluate";

export type TraceSpan = { kind: SpanKind; startMs: number; endMs: number; tone?: Tone };

export type TraceRow = { label: string; mono?: boolean; spans: TraceSpan[] };

export const verdictRule: Record<Verdict, string> = {
  UP: "every region returned a 2xx or 3xx response",
  DOWN: "every region reported a target failure",
  DISAGREEMENT: "regions disagreed, or a region had no target evidence",
  NO_DATA: "no region produced evidence about the target",
};

const ms = (value: string) => new Date(value).getTime();

/**
 * Flattens one trace into an ordered event history, like a workflow engine's event log. Ties keep
 * pipeline order, so a result and its ingestion never appear reversed.
 */
export function traceEvents(trace: ExecutionTrace): TraceEvent[] {
  const events: Array<Omit<TraceEvent, "id">> = [];
  const add = (event: Omit<TraceEvent, "id"> | null) => { if (event) events.push(event); };

  add({
    at: trace.scheduledAt, type: "ExecutionScheduled", category: "schedule",
    details: [["regions", String(trace.expectedRegionCount)], ["deadline", `+${ms(trace.resultDeadlineAt) - ms(trace.scheduledAt)} ms`]],
  });
  add({
    at: trace.createdAt, type: "JobsStaged", category: "schedule",
    details: [["committed", `1 execution, ${trace.jobs.length} jobs, ${trace.jobs.length} outbox rows`], ["transaction", "single"]],
  });

  for (const job of trace.jobs) {
    if (job.publishedAt) {
      add({
        at: job.publishedAt, type: "OutboxPublished", category: "transport", region: job.region,
        details: [["queue", `probe-jobs-${job.region}`], ["failed attempts", String(job.failedPublishAttempts)]],
      });
    }
    if (job.publishFailedAt) {
      add({
        at: job.publishFailedAt, type: "OutboxFailed", category: "transport", region: job.region, tone: "fault",
        details: [["failed attempts", String(job.failedPublishAttempts)], ["error", job.publishLastError ?? "unknown"]],
      });
    }
    if (job.startedAt) {
      add({ at: job.startedAt, type: "ProbeStarted", category: "probe", region: job.region, details: [["clock", "worker"]] });
    }
    if (job.completedAt && job.outcome) {
      const details: Array<[string, string]> = [["outcome", outcomeLabel(job.outcome, job.httpStatus)]];
      if (job.latencyMs != null) details.push(["latency", `${job.latencyMs} ms`]);
      if (job.responseBytes != null) details.push(["bytes", String(job.responseBytes)]);
      if (job.errorType) details.push(["error", job.errorType]);
      add({
        at: job.completedAt, type: "ProbeCompleted", category: "probe", region: job.region,
        tone: outcomeTone(job.outcome, job.httpStatus), details,
      });
    }
    if (job.receivedAt) {
      add({ at: job.receivedAt, type: "ResultIngested", category: "ingest", region: job.region, details: [["stored", "once; duplicates ignored"]] });
    }
  }

  if (trace.finalizedAt && trace.verdict) {
    const regions = trace.jobs.filter((job) => job.receivedAt).length;
    add({
      at: trace.finalizedAt, type: "ExecutionFinalized", category: "decision",
      tone: trace.verdict === "UP" ? "good" : trace.verdict === "DOWN" ? "fault" : trace.verdict === "DISAGREEMENT" ? "warn" : "muted",
      details: [["verdict", trace.verdict], ["evidence", `${regions}/${trace.expectedRegionCount} regions`], ["rule", verdictRule[trace.verdict]]],
    });
  }
  if (trace.evaluation) {
    const transition = trace.evaluation.transition;
    add({
      at: trace.evaluation.evaluatedAt, type: "IncidentEvaluated", category: "decision",
      tone: transition === "OPENED" ? "fault" : transition === "RESOLVED" ? "good" : undefined,
      details: [["transition", transition === "NONE" ? "none" : transition.toLowerCase().replace("_", " ")]],
    });
  }

  return events
    .map((event, order) => ({ event, order }))
    .sort((a, b) => ms(a.event.at) - ms(b.event.at) || a.order - b.order)
    .map(({ event }, index) => ({ ...event, id: index + 1 }));
}

/** Waterfall rows measured from the scheduled due time; negative clock gaps collapse to zero. */
export function traceRows(trace: ExecutionTrace): { rows: TraceRow[]; totalMs: number } {
  const t0 = ms(trace.scheduledAt);
  const offset = (value: string) => Math.max(0, ms(value) - t0);
  const span = (kind: SpanKind, from: string | null, to: string | null, tone?: Tone): TraceSpan | null =>
    from && to ? { kind, startMs: offset(from), endMs: Math.max(offset(from), offset(to)), tone } : null;
  const present = (spans: Array<TraceSpan | null>) => spans.filter((value): value is TraceSpan => value != null);

  const rows: TraceRow[] = [{ label: "Scheduler", spans: present([span("staging", trace.scheduledAt, trace.createdAt)]) }];
  for (const job of trace.jobs) {
    rows.push({
      label: job.region,
      mono: true,
      spans: present([
        span("outbox", job.createdAt, job.publishedAt),
        span("queue", job.publishedAt, job.startedAt),
        span("probe", job.startedAt, job.completedAt, job.outcome ? outcomeTone(job.outcome, job.httpStatus) : undefined),
        span("delivery", job.completedAt, job.receivedAt),
      ]),
    });
  }
  const received = trace.jobs.map((job) => job.receivedAt).filter((value): value is string => value != null).sort();
  const lastReceived = received.at(-1) ?? null;
  rows.push({ label: "Finalizer", spans: present([span("finalize", lastReceived, trace.finalizedAt)]) });
  rows.push({ label: "Incident policy", spans: present([span("evaluate", trace.finalizedAt, trace.evaluation?.evaluatedAt ?? null)]) });

  const totalMs = Math.max(1, ...rows.flatMap((row) => row.spans.map((item) => item.endMs)));
  return { rows, totalMs };
}

export const spanLabel: Record<SpanKind, string> = {
  staging: "Staging jobs",
  outbox: "Waiting in outbox",
  queue: "Waiting in queue",
  probe: "Probing target",
  delivery: "Returning result",
  finalize: "Finalizing",
  evaluate: "Incident evaluation",
};
