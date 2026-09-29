import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ExecutionTrace } from "../types";
import { TraceView } from "./TraceView";

afterEach(cleanup);

const at = (ms: number) => new Date(Date.parse("2026-09-29T12:00:00Z") + ms).toISOString();

const trace: ExecutionTrace = {
  executionId: "a8f219e1-0000-4000-8000-000000000000",
  monitorId: "monitor-1",
  scheduledAt: at(0),
  createdAt: at(600),
  resultDeadlineAt: at(35_000),
  status: "FINALIZED",
  verdict: "UP",
  finalizedAt: at(3_000),
  expectedRegionCount: 1,
  evaluation: { verdict: "UP", transition: "NONE", evaluatedAt: at(3_500) },
  jobs: [{
    jobId: "job-eu", region: "eu-west-1", createdAt: at(600), publishedAt: at(1_100), failedPublishAttempts: 0,
    publishFailedAt: null, publishLastError: null, startedAt: at(1_150), completedAt: at(2_160), receivedAt: at(2_170),
    outcome: "HTTP_RESPONSE", httpStatus: 200, latencyMs: 1_010, responseBytes: 713, errorType: null,
  }],
};

describe("TraceView", () => {
  it("draws each region as one continuous bar rounded only at its ends", () => {
    const { container } = render(<TraceView trace={trace} />);

    const region = screen.getByRole("rowheader", { name: "eu-west-1" }).parentElement!;
    const spans = region.querySelectorAll(".span");
    expect([...spans].map((span) => span.className)).toEqual([
      "span outbox first", "span queue", "span probe good", "span delivery last",
    ]);
    // jsdom has no layout, so nothing measures wide enough to carry a label.
    expect(container.querySelector(".waterfall em")).toBeNull();
  });

  it("shows every phase's duration when hovering a row", () => {
    render(<TraceView trace={trace} />);

    fireEvent.mouseMove(screen.getByRole("rowheader", { name: "eu-west-1" }).nextElementSibling!);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Waiting in outbox500 ms");
    expect(tooltip).toHaveTextContent("Probing target1.01 s");
    expect(tooltip).toHaveTextContent("+600 ms to +2.17 s after the due time");
  });
});
