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
      minimumEvidenceCoveragePercent: 95,
      sloMet: null,
      upExecutions: 99,
      downExecutions: 1,
      disagreementExecutions: 20,
      noDataExecutions: 5,
      conclusiveExecutions: 100,
      totalFinalizedExecutions: 125,
      pendingExecutions: 0,
      missingExecutions: 0,
      expectedOpportunities: 125,
      denominatorPolicy: "UP_AND_DOWN_ONLY",
    }} />);

    expect(screen.getByText("Disagree 20")).toBeInTheDocument();
    expect(screen.getByLabelText(/99.000% availability with 80% evidence coverage/)).toBeInTheDocument();
  });

  it("shows missing scheduler slots separately from completed no-data probes", () => {
    render(<EvidenceRail report={{
      monitorId: "monitor-2",
      from: "2026-09-01T00:00:00Z",
      to: "2026-09-01T00:10:00Z",
      sloTargetPercent: 99.9,
      measuredAvailabilityPercent: 100,
      evidenceCoveragePercent: 10,
      minimumEvidenceCoveragePercent: 95,
      sloMet: null,
      upExecutions: 1,
      downExecutions: 0,
      disagreementExecutions: 0,
      noDataExecutions: 0,
      conclusiveExecutions: 1,
      totalFinalizedExecutions: 1,
      pendingExecutions: 0,
      missingExecutions: 9,
      expectedOpportunities: 10,
      denominatorPolicy: "UP_AND_DOWN_ONLY",
    }} />);

    expect(screen.getByText("No data 0")).toBeInTheDocument();
    expect(screen.getByText("Not scheduled 9")).toBeInTheDocument();
    expect(screen.getByLabelText(/100.000% availability with 10% evidence coverage/)).toBeInTheDocument();
  });
});
