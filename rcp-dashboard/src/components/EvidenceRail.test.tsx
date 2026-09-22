import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidenceRail } from "./EvidenceRail";

describe("EvidenceRail", () => {
  it("keeps disagreement visible instead of counting it as downtime", () => {
    render(<EvidenceRail report={{
      monitorId: "monitor-1",
      from: "2026-09-01T00:00:00Z",
      to: "2026-09-08T00:00:00Z",
      sloTargetPercent: 99.9,
      measuredAvailabilityPercent: 99,
      evidenceCoveragePercent: 80,
      sloMet: false,
      upExecutions: 99,
      downExecutions: 1,
      disagreementExecutions: 20,
      noDataExecutions: 5,
      conclusiveExecutions: 100,
      totalFinalizedExecutions: 125,
      denominatorPolicy: "UP_AND_DOWN_ONLY",
    }} />);

    expect(screen.getByText("DISAGREE 20")).toBeInTheDocument();
    expect(screen.getByLabelText(/99.000% availability with 80% evidence coverage/)).toBeInTheDocument();
  });
});
