import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IncidentStateView, RecentCheck } from "../types";
import { CheckTimeline } from "./CheckTimeline";
import { PolicyStrip } from "./PolicyStrip";

afterEach(cleanup);

const now = Date.parse("2026-09-30T12:00:00Z");
const check = (id: string, verdict: RecentCheck["verdict"], seconds: number): RecentCheck => ({
  executionId: id,
  scheduledAt: new Date(now - seconds * 1000).toISOString(),
  verdict,
  results: [
    { region: "eu-west-1", outcome: "HTTP_RESPONSE", httpStatus: verdict === "DOWN" ? 503 : 200, latencyMs: 400 },
    { region: "us-east-1", outcome: "HTTP_RESPONSE", httpStatus: verdict === "DOWN" ? 503 : 200, latencyMs: 100 },
  ],
});

describe("CheckTimeline", () => {
  it("draws checks oldest first and opens the selected one", () => {
    const onSelect = vi.fn();
    render(<CheckTimeline checks={[check("new", "DOWN", 30), check("old", "UP", 60)]} regions={["eu-west-1", "us-east-1"]} selected="new" onSelect={onSelect} now={now} />);

    const columns = screen.getAllByRole("button");
    expect(columns[0]).toHaveAccessibleName(/Operational, 1m ago/);
    expect(columns[1]).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(columns[0]);
    expect(onSelect).toHaveBeenCalledWith("old");
  });
});

describe("PolicyStrip", () => {
  const state = (overrides: Partial<IncidentStateView>): IncidentStateView => ({
    status: "HEALTHY", consecutiveDown: 0, consecutiveUp: 0, failuresToOpen: 2, successesToResolve: 2,
    openedAt: null, lastEvaluatedAt: null, recentEvaluations: [], ...overrides,
  });
  const evaluation = (verdict: "UP" | "DOWN") => ({ executionId: verdict + Math.random(), scheduledAt: "", verdict, transition: "NONE" as const, evaluatedAt: "" });

  it("reads a healthy streak from recent evaluations and says what moves it next", () => {
    render(<PolicyStrip state={state({ recentEvaluations: [evaluation("UP"), evaluation("UP"), evaluation("DOWN")] })} now={now} expanded={false} onToggle={() => undefined} />);
    expect(screen.getByText("2 UP in a row")).toBeInTheDocument();
    expect(screen.getByText(/a DOWN verdict makes it Suspect/)).toBeInTheDocument();
  });

  it("counts down to an incident while suspect", () => {
    render(<PolicyStrip state={state({ consecutiveDown: 1 })} now={now} expanded={false} onToggle={() => undefined} />);
    expect(screen.getByText("Suspect")).toBeInTheDocument();
    expect(screen.getByText(/1 more DOWN opens an incident/)).toBeInTheDocument();
  });
});
