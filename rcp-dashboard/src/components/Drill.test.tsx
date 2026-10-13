import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import vectors from "../../../deploy/demo/fixtures/drill-schedule-v1.json";
import { DRILL_MODE_LABELS, drillPhase } from "../drill";
import type { MonitorOverview } from "../types";
import { DrillPanel } from "./Drill";

const overview: MonitorOverview = {
  id: "drill", name: "Scheduled outage drill", targetUrl: "https://api.example.invalid/drill/status.html",
  enabled: true, nextCheckAt: null, incidentStatus: "HEALTHY", latestVerdict: "UP", latestCheckedAt: null,
};
afterEach(cleanup);

describe("DrillPanel", () => {
  for (const mode of ["outage", "slow", "regional", "blip"] as const) {
    it(`describes ${mode} as a plan without inventing an open incident`, () => {
      const plan = vectors.find(v => !v.skipped && v.mode === mode)!;
      render(<DrillPanel now={plan.start + 1000} overview={overview} />);
      expect(screen.getByText(`${DRILL_MODE_LABELS[mode]} · planned UTC window`)).toBeInTheDocument();
      expect(screen.getByText("Planned fault ends in")).toBeInTheDocument();
      expect(document.querySelectorAll(".drill-steps .done")).toHaveLength(0);
      if (mode === "slow") expect(screen.getByText(/Network delays can still cause a timeout/)).toBeInTheDocument();
      if (mode === "regional") expect(screen.getByText(/Requests without a recognized probe-region header remain healthy/)).toBeInTheDocument();
      if (mode === "blip") {
        expect(screen.getByText(/normally avoids an incident/)).toBeInTheDocument();
        expect(screen.queryByText("Incident opens")).not.toBeInTheDocument();
        expect(screen.getByText(/\d{2}:\d{2}:00–\d{2}:\d{2}:\d{2} UTC/)).toBeInTheDocument();
      }
    });
  }
  it("keeps backend recovery separate from the next planned mode", () => {
    const plan = vectors.find(v => !v.skipped && v.mode === "outage")!;
    render(<DrillPanel now={plan.end} overview={{ ...overview, incidentStatus: "OPEN", latestVerdict: "UP" }} />);
    expect(screen.getByText("Incident awaiting resolution")).toBeInTheDocument();
    expect(screen.getByText(/backend still reports an open incident/)).toBeInTheDocument();
    expect(screen.getByText("Recovers").closest("li")).toHaveAttribute("aria-current", "step");
  });
  it("shows the next non-skipped forecast between windows", () => {
    const skipped = vectors.find(v => v.skipped)!;
    const phase = drillPhase(skipped.start);
    render(<DrillPanel now={skipped.start} overview={overview} />);
    expect(screen.getByText(/Planned timing, not a live verdict/)).toBeInTheDocument();
    expect(screen.getByText(`Next drill in · ${DRILL_MODE_LABELS[phase.nextPlan.mode]}`)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Drill steps" })).not.toBeInTheDocument();
  });
});
