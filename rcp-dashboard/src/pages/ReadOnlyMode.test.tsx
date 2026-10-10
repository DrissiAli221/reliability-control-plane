import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReadOnly } from "../session";
import type { MonitorOverview } from "../types";
import { MonitorsPage } from "./MonitorsPage";

const monitor: MonitorOverview = {
  id: "monitor-1", name: "Example Domain", targetUrl: "https://example.com/", enabled: true, nextCheckAt: null,
  incidentStatus: "HEALTHY", latestVerdict: "UP", latestCheckedAt: null,
};

vi.mock("../api", () => ({
  listMonitors: vi.fn(async () => [monitor]),
  availability: vi.fn(async () => { throw new Error("not needed"); }),
  monitorHistory: vi.fn(async () => { throw new Error("not needed"); }),
  createMonitor: vi.fn(),
  setMonitorEnabled: vi.fn(),
}));
vi.mock("../session", () => ({ useReadOnly: vi.fn(), useSession: () => null, refreshSession: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("read-only mode", () => {
  it("hides creating monitors from the demo account", async () => {
    vi.mocked(useReadOnly).mockReturnValue(true);
    render(<MemoryRouter><MonitorsPage /></MemoryRouter>);

    expect(await screen.findByText("Example Domain")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create monitor/ })).not.toBeInTheDocument();
  });

  it("keeps it for everyone else", async () => {
    vi.mocked(useReadOnly).mockReturnValue(false);
    render(<MemoryRouter><MonitorsPage /></MemoryRouter>);

    expect(await screen.findByText("Example Domain")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create monitor/ })).toBeInTheDocument();
  });
});
