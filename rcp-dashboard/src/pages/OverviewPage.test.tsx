import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fleetOverview, listMonitors, pipelineEvents, pipelineSnapshot } from "../api";
import type { FleetOverview, MonitorOverview, PipelineSnapshot } from "../types";
import { OverviewPage } from "./OverviewPage";

vi.mock("../api", () => ({
  fleetOverview: vi.fn(),
  listMonitors: vi.fn(),
  pipelineSnapshot: vi.fn(),
  pipelineEvents: vi.fn(),
}));

const empty = { up: 0, down: 0, disagreement: 0, noData: 0 };

function overview(incidents: FleetOverview["incidents"]): FleetOverview {
  const buckets = Array.from({ length: 48 }, () => empty);
  buckets[46] = { up: 199, down: 1, disagreement: 3, noData: 0 };
  return {
    from: "2026-09-29T12:00:00Z",
    to: "2026-09-30T12:00:00Z",
    bucketSeconds: 1800,
    buckets,
    incidentsFrom: "2026-09-23T12:00:00Z",
    incidents,
  };
}

const monitor: MonitorOverview = {
  id: "monitor-1",
  name: "SpectraTV",
  targetUrl: "https://www.spectratv.live/",
  enabled: true,
  nextCheckAt: null,
  incidentStatus: "HEALTHY",
  latestVerdict: "UP",
  latestCheckedAt: null,
};

const snapshot = { windowSeconds: 300, regions: [{ region: "eu-west-1", jobsPublished: 10, resultsReceived: 10, p50LatencyMs: 180 }] } as PipelineSnapshot;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  vi.mocked(listMonitors).mockResolvedValue([monitor]);
  vi.mocked(pipelineSnapshot).mockResolvedValue(snapshot);
  vi.mocked(pipelineEvents).mockResolvedValue([]);
  render(<MemoryRouter><OverviewPage /></MemoryRouter>);
}

describe("OverviewPage", () => {
  it("reads fleet uptime from conclusive checks only", async () => {
    vi.mocked(fleetOverview).mockResolvedValue(overview([]));
    renderPage();

    expect(await screen.findByRole("text", { name: "99.50%" })).toBeInTheDocument();
    expect(screen.getByText(/199 of 200 conclusive checks were UP; 3 inconclusive checks are left out/)).toBeInTheDocument();
    expect(screen.getByText("No incidents in the last 7 days.")).toBeInTheDocument();
  });

  it("turns the hero into the open incident with a running clock", async () => {
    vi.mocked(fleetOverview).mockResolvedValue(overview([{
      incidentId: "incident-1",
      monitorId: "monitor-1",
      monitorName: "SpectraTV",
      openedAt: new Date(Date.now() - 65_000).toISOString(),
      resolvedAt: null,
    }]));
    renderPage();

    expect(await screen.findByText("incident · SpectraTV")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent(/^01:0\d$/);
    expect(screen.getByRole("button", { name: /Open SpectraTV/ })).toBeInTheDocument();
  });
});
