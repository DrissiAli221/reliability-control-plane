import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../apiError";
import { availability, getMonitor, reliabilityReport } from "../api";
import { rememberReturnPath } from "../returnPath";
import { useReadOnly } from "../session";
import { MonitorDetailPage } from "./MonitorDetailPage";
import { MonitorsPage } from "./MonitorsPage";

const FOUND = { id: "id", name: "Checkout", targetUrl: "https://example.com", checkIntervalSeconds: 60, timeoutMs: 5000, enabled: true };
const evidence = (days: number) => ({
  monitorId: "id", from: "", to: "", sloTargetPercent: 99.9, measuredAvailabilityPercent: 99.95, evidenceCoveragePercent: 100,
  minimumEvidenceCoveragePercent: 95, sloMet: true, upExecutions: days * 10, downExecutions: 0, disagreementExecutions: 0,
  noDataExecutions: 0, conclusiveExecutions: days * 10, totalFinalizedExecutions: days * 10, pendingExecutions: 0,
  missingExecutions: 0, expectedOpportunities: days * 10, denominatorPolicy: "UP_PLUS_DOWN",
});

vi.mock("../api", () => ({
  getMonitor: vi.fn(async () => ({ id: "id", name: "Checkout", targetUrl: "https://example.com", checkIntervalSeconds: 60, timeoutMs: 5000, enabled: true })),
  listMonitors: vi.fn(async () => []),
  monitorHistory: vi.fn(async () => ({ regions: [], recentChecks: [], days: [] })),
  availability: vi.fn(async (_id: string, days = 7) => evidence(days)),
  reliabilityReport: vi.fn(async () => { throw new Error("No report"); }),
  incidentState: vi.fn(async () => { throw new Error("No evidence"); }),
  latencyHeatmap: vi.fn(async () => { throw new Error("No evidence"); }),
  deleteMonitor: vi.fn(), setAcceptedHttpStatuses: vi.fn(),
}));
vi.mock("../session", () => ({ useReadOnly: vi.fn(), useSession: () => null, refreshSession: vi.fn() }));
vi.mock("../auth", () => ({ isLocalAuth: () => false }));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMonitor).mockResolvedValue(FOUND as never);
  vi.mocked(useReadOnly).mockReturnValue(false);
});

function Where() {
  const { pathname, search } = useLocation();
  return <output aria-label="location">{pathname + search}</output>;
}

function page(url = "/monitors/id") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/monitors/:monitorId" element={<MonitorDetailPage />} />
        <Route path="/monitors" element={<MonitorsPage />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

describe("a monitor that is not there", () => {
  it("says so plainly instead of blaming the control plane", async () => {
    vi.mocked(getMonitor).mockRejectedValue(new ApiError("Monitor not found", 404, "Monitor not found"));
    page();

    expect(await screen.findByRole("heading", { name: "This monitor no longer exists" })).toBeInTheDocument();
    expect(screen.getByText("It was deleted, or it belongs to another account.")).toBeInTheDocument();
    expect(screen.queryByText("The control plane did not answer")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Back to monitors" }));
    expect(await screen.findByRole("heading", { name: "Monitors" })).toBeInTheDocument();
  });

  it("still reports a failing control plane as one", async () => {
    vi.mocked(getMonitor).mockRejectedValue(new ApiError("Database unavailable", 503, "Service Unavailable"));
    page();

    expect(await screen.findByText("The control plane did not answer")).toBeInTheDocument();
    expect(screen.getByText("Database unavailable")).toBeInTheDocument();
    expect(screen.queryByText("This monitor no longer exists")).not.toBeInTheDocument();
  });

  it("drops a monitor restored by sign-in and goes to the list with a one-line reason", async () => {
    vi.mocked(getMonitor).mockRejectedValue(new ApiError("Monitor not found", 404, "Monitor not found"));
    rememberReturnPath("/monitors/id");
    page();

    expect(await screen.findByRole("heading", { name: "Monitors" })).toBeInTheDocument();
    expect(screen.getByLabelText("location")).toHaveTextContent(/^\/monitors$/);
    expect(screen.getByText(/That monitor is not on this account/)).toBeInTheDocument();
  });

  it("does not redirect a deliberate visit, and a found monitor clears the mark", async () => {
    vi.mocked(getMonitor).mockRejectedValue(new ApiError("Monitor not found", 404, "Monitor not found"));
    rememberReturnPath("/monitors/somewhere-else");
    page();
    expect(await screen.findByRole("heading", { name: "This monitor no longer exists" })).toBeInTheDocument();
    cleanup();

    vi.mocked(getMonitor).mockResolvedValue(FOUND as never);
    rememberReturnPath("/monitors/id");
    page();
    expect(await screen.findByRole("heading", { name: "Checkout" })).toBeInTheDocument();
    expect(sessionStorage.getItem("rcp.restored-path")).toBeNull();
  });
});

describe("history window", () => {
  it("defaults to 7 days, offers 24 h, 7 d, 30 d and 90 d, and labels the tiles", async () => {
    page();

    expect(await screen.findByText("Uptime · 7d")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "History window" });
    expect(Array.from(group.querySelectorAll("button")).map((item) => item.textContent)).toEqual(["24 h", "7 d", "30 d", "90 d"]);
    expect(screen.getByRole("button", { name: "7 d" })).toHaveAttribute("aria-pressed", "true");
    expect(availability).toHaveBeenCalledWith("id", 7);
    expect(reliabilityReport).toHaveBeenCalledWith("id", 7);
  });

  it("reads ?window= from the URL and relabels every tile and panel", async () => {
    page("/monitors/id?window=30d");

    expect(await screen.findByText("Uptime · 30d")).toBeInTheDocument();
    expect(screen.getByText("Latency · 30d")).toBeInTheDocument();
    expect(screen.getByText("Error budget · 30d")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 d" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("30 days summary")).toBeInTheDocument();
    expect(screen.getByText("No incident transitions in the last 30 days.")).toBeInTheDocument();
    expect(availability).toHaveBeenCalledWith("id", 30);
    expect(screen.getByRole("button", { name: "Export" })).toHaveAttribute("title", "Download the 30 days report as HTML");
  });

  it("writes the choice to the URL, refetches, and keeps other query parameters", async () => {
    page("/monitors/id?check=abc");
    await screen.findByText("Uptime · 7d");

    fireEvent.click(screen.getByRole("button", { name: "90 d" }));

    expect(await screen.findByText("Uptime · 90d")).toBeInTheDocument();
    expect(screen.getByLabelText("location")).toHaveTextContent("/monitors/id?check=abc&window=90d");
    await waitFor(() => expect(availability).toHaveBeenCalledWith("id", 90));
    expect(reliabilityReport).toHaveBeenCalledWith("id", 90);

    fireEvent.click(screen.getByRole("button", { name: "7 d" }));
    await screen.findByText("Uptime · 7d");
    expect(screen.getByLabelText("location")).toHaveTextContent("/monitors/id?check=abc");
  });

  it("treats an unknown window as the default", async () => {
    page("/monitors/id?window=14d");
    expect(await screen.findByText("Uptime · 7d")).toBeInTheDocument();
  });
});
