import { describe, expect, it } from "vitest";
import { traceEvents, traceRows } from "./trace";
import type { ExecutionTrace } from "./types";

const at = (ms: number) => new Date(Date.parse("2026-09-29T12:00:00Z") + ms).toISOString();

const trace: ExecutionTrace = {
  executionId: "8a1be9f0-55fd-4aee-ab13-352ec75d7c49",
  monitorId: "monitor-1",
  scheduledAt: at(0),
  createdAt: at(800),
  resultDeadlineAt: at(35_000),
  status: "FINALIZED",
  verdict: "DOWN",
  finalizedAt: at(3_000),
  expectedRegionCount: 2,
  evaluation: { verdict: "DOWN", transition: "OPENED", evaluatedAt: at(4_000) },
  jobs: [
    {
      jobId: "job-eu", region: "eu-west-1", createdAt: at(800), publishedAt: at(1_800), failedPublishAttempts: 1,
      publishFailedAt: null, publishLastError: null, startedAt: at(1_900), completedAt: at(2_400), receivedAt: at(2_400),
      outcome: "HTTP_RESPONSE", httpStatus: 503, latencyMs: 500, responseBytes: 12, errorType: null,
    },
    {
      jobId: "job-us", region: "us-east-1", createdAt: at(800), publishedAt: at(1_700), failedPublishAttempts: 0,
      publishFailedAt: null, publishLastError: null, startedAt: at(2_000), completedAt: at(2_600), receivedAt: at(2_700),
      outcome: "CONNECT_TIMEOUT", httpStatus: null, latencyMs: 600, responseBytes: null, errorType: "java.net.http.HttpConnectTimeoutException",
    },
  ],
};

describe("traceEvents", () => {
  it("orders the event history by time and keeps a probe result before its ingestion on ties", () => {
    const events = traceEvents(trace);

    expect(events.map((event) => event.type)).toEqual([
      "ExecutionScheduled", "JobsStaged", "OutboxPublished", "OutboxPublished", "ProbeStarted", "ProbeStarted",
      "ProbeCompleted", "ResultIngested", "ProbeCompleted", "ResultIngested", "ExecutionFinalized", "IncidentEvaluated",
    ]);
    expect(events.map((event) => event.id)).toEqual(events.map((_, index) => index + 1));
    const euIngest = events.findIndex((event) => event.type === "ResultIngested" && event.region === "eu-west-1");
    expect(events[euIngest - 1]).toMatchObject({ type: "ProbeCompleted", region: "eu-west-1", tone: "fault" });
    expect(events.at(-1)).toMatchObject({ type: "IncidentEvaluated", tone: "fault", details: [["transition", "opened"]] });
  });

  it("describes the failed publish attempts and the consensus rule", () => {
    const events = traceEvents(trace);
    expect(events.find((event) => event.region === "eu-west-1" && event.type === "OutboxPublished")?.details)
      .toContainEqual(["failed attempts", "1"]);
    expect(events.find((event) => event.type === "ExecutionFinalized")?.details)
      .toContainEqual(["rule", "every region reported a target failure"]);
  });
});

describe("traceRows", () => {
  it("measures every stage from the scheduled due time", () => {
    const { rows, totalMs } = traceRows(trace);

    expect(totalMs).toBe(4_000);
    expect(rows.map((row) => row.label)).toEqual(["Scheduler", "eu-west-1", "us-east-1", "Finalizer", "Incident policy"]);
    expect(rows[1].spans).toEqual([
      { kind: "outbox", startMs: 800, endMs: 1_800, tone: undefined },
      { kind: "queue", startMs: 1_800, endMs: 1_900, tone: undefined },
      { kind: "probe", startMs: 1_900, endMs: 2_400, tone: "fault" },
      { kind: "delivery", startMs: 2_400, endMs: 2_400, tone: undefined },
    ]);
    expect(rows[3].spans[0]).toMatchObject({ kind: "finalize", startMs: 2_700, endMs: 3_000 });
  });

  it("collapses a worker clock that runs behind PostgreSQL instead of drawing negative spans", () => {
    const skewed: ExecutionTrace = { ...trace, jobs: [{ ...trace.jobs[0], startedAt: at(1_500) }] };
    const queue = traceRows(skewed).rows[1].spans.find((item) => item.kind === "queue");
    expect(queue).toMatchObject({ startMs: 1_800, endMs: 1_800 });
  });
});
