import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { machineNode } from "../machine";
import type { IncidentStateView } from "../types";
import { IncidentMachine } from "./IncidentMachine";

afterEach(cleanup);

const base: IncidentStateView = {
  status: "HEALTHY",
  consecutiveDown: 0,
  consecutiveUp: 0,
  failuresToOpen: 2,
  successesToResolve: 2,
  openedAt: null,
  lastEvaluatedAt: null,
  recentEvaluations: [],
};

describe("IncidentMachine", () => {
  it("places the monitor from the persisted streak counters", () => {
    expect(machineNode(base)).toBe("healthy");
    expect(machineNode({ ...base, consecutiveDown: 1 })).toBe("suspect");
    expect(machineNode({ ...base, status: "OPEN", consecutiveDown: 3, openedAt: "2026-09-29T12:00:00Z" })).toBe("open");
    expect(machineNode({ ...base, status: "OPEN", consecutiveUp: 1, openedAt: "2026-09-29T12:00:00Z" })).toBe("recovering");
  });

  it("shows the streak progress and the thresholds that move the state", () => {
    render(<IncidentMachine state={{ ...base, consecutiveDown: 1 }} now={Date.parse("2026-09-29T12:01:00Z")} />);

    expect(screen.getByText("1 of 2 DOWN")).toBeInTheDocument();
    expect(screen.getByText("2nd DOWN")).toBeInTheDocument();
    expect(screen.getByText("2nd UP · resolved")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Incident state machine" })).toHaveAccessibleDescription("Current state: Suspect, 1 of 2 DOWN.");
  });

  it("marks evaluations that opened or resolved an incident on the tape", () => {
    render(<IncidentMachine
      state={{
        ...base,
        status: "OPEN",
        consecutiveDown: 2,
        openedAt: "2026-09-29T12:00:30Z",
        recentEvaluations: [
          { executionId: "b", scheduledAt: "2026-09-29T12:00:30Z", verdict: "DOWN", transition: "OPENED", evaluatedAt: "2026-09-29T12:00:34Z" },
          { executionId: "a", scheduledAt: "2026-09-29T12:00:00Z", verdict: "DOWN", transition: "NONE", evaluatedAt: "2026-09-29T12:00:04Z" },
        ],
      }}
      now={Date.parse("2026-09-29T12:01:00Z")}
    />);

    const cells = screen.getByLabelText("Recent incident evaluations, oldest first").children;
    expect(cells).toHaveLength(2);
    expect(cells[0]).not.toHaveClass("transition");
    expect(cells[1]).toHaveClass("transition");
    expect(screen.getByText(/DOWN, incident opened/)).toBeInTheDocument();
  });
});
