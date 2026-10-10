import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../apiError";
import { availability, getMonitor, latencyHeatmap, reliabilityReport } from "../api";
import { rememberReturnPath } from "../returnPath";
import { useReadOnly } from "../session";
import { MonitorDetailPage } from "./MonitorDetailPage";
import { MonitorsPage } from "./MonitorsPage";

const FOUND = { id: "id", name: "Checkout", targetUrl: "https://example.com", checkIntervalSeconds: 60, timeoutMs: 5000, enabled: true };
const report = (days: number, timeline: unknown[] = []) => ({
  availability: evidence(days), errorBudget: { allowedBadExecutions: "1", observedBadExecutions: 0, remainingExecutions: 1 },
  latency: { sampleCount: 0, p50Ms: null, p95Ms: null, minimumSamples: 20 }, incidentTimeline: timeline, caveats: [],
});
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
  reliabilityReport: vi.fn(async (_id: string, days = 7) => report(days)),
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
  vi.mocked(availability).mockImplementation((async (_id: string, days = 7) => evidence(days)) as never);
  vi.mocked(reliabilityReport).mockImplementation((async (_id: string, days = 7) => report(days)) as never);
  vi.mocked(latencyHeatmap).mockRejectedValue(new Error("No evidence"));
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

describe("report period", () => {
  it("defaults to 7 days, offers 24 h, 7 d, 30 d and 90 d, and labels the tiles", async () => {
    page();

    expect(await screen.findByText("Uptime · 7d")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Report period" });
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
    expect(screen.getByText("No incidents recorded in this period")).toBeInTheDocument();
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

  it("also reads the ?period= spelling and says what the period drives", async () => {
    page("/monitors/id?period=90d");
    expect(await screen.findByText("Uptime · 90d")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Report period" });
    expect(group).toHaveAccessibleDescription(/summary tiles, evidence, incidents and exports.*latency chart.*45-day availability bar/);
    expect(screen.queryByText("History window")).not.toBeInTheDocument();
  });
});

describe("monitoring history shorter than the period", () => {
  const young = (days: number) => ({ ...evidence(days), from: new Date(Date.now() - days * 86_400_000).toISOString(),
    monitoringSince: new Date(Date.now() - 9.5 * 86_400_000).toISOString() });

  it("says where the data starts when a 90 d period reaches back before the first check", async () => {
    vi.mocked(availability).mockImplementation(async (_id: string, days = 7) => young(days) as never);
    page("/monitors/id?window=90d");
    await waitFor(() => expect(screen.getByTestId("period-since")).toHaveTextContent(/^Monitoring since \d+ \w+ · 9 days of data$/));
  });

  it("says nothing when the monitor covers the whole period", async () => {
    vi.mocked(availability).mockImplementation(async (_id: string, days = 7) => young(days) as never);
    page("/monitors/id?window=24h");
    await screen.findByText("Uptime · 24h");
    expect(screen.getByTestId("period-since")).toBeEmptyDOMElement();
  });
});

describe("loading, failing and empty states", () => {
  it("shows Updating… with the previous numbers kept but dimmed while a new period loads", async () => {
    page();
    await screen.findByText("Uptime · 7d");
    let release: (value: unknown) => void = () => {};
    vi.mocked(availability).mockImplementation(() => new Promise((resolve) => { release = resolve; }) as never);

    fireEvent.click(screen.getByRole("button", { name: "30 d" }));

    expect(await screen.findByText("Updating…")).toBeInTheDocument();
    // The old numbers are still there, still labelled with their own period, and dimmed.
    const tiles = screen.getByLabelText("7 days summary");
    expect(tiles).toHaveAttribute("data-stale", "true");
    expect(tiles).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Uptime · 7d")).toBeInTheDocument();

    release(evidence(30));
    expect(await screen.findByText("Uptime · 30d")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Updating…")).not.toBeInTheDocument());
    expect(screen.getByLabelText("30 days summary")).not.toHaveAttribute("data-stale");
  });

  it("says it could not refresh, keeps the last numbers dimmed, and retries on request", async () => {
    page();
    await screen.findByText("Uptime · 7d");
    vi.mocked(availability).mockRejectedValue(new Error("boom"));

    fireEvent.click(screen.getByRole("button", { name: "30 d" }));

    const alert = await screen.findByText(/Couldn.t refresh/);
    expect(alert.closest("[role=alert]")).toBeInTheDocument();
    expect(screen.getByLabelText("7 days summary")).toHaveAttribute("data-stale", "true");
    expect(screen.queryByText("Updating…")).not.toBeInTheDocument();

    vi.mocked(availability).mockImplementation(async (_id: string, days = 7) => evidence(days) as never);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Uptime · 30d")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Couldn.t refresh/)).not.toBeInTheDocument());
  });

  it("does not show an unavailable report as empty", async () => {
    vi.mocked(reliabilityReport).mockRejectedValue(new Error("down"));
    page();

    expect(await screen.findByText("Incidents unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("No incidents recorded in this period")).not.toBeInTheDocument();
    expect(await screen.findByText(/Couldn.t refresh/)).toBeInTheDocument();
  });

  it("says plainly when a period really has no incidents, and lists them when it has some", async () => {
    page();
    expect(await screen.findByText("No incidents recorded in this period")).toBeInTheDocument();
    expect(screen.queryByText(/Updating|Couldn.t refresh/)).not.toBeInTheDocument();
    cleanup();

    vi.mocked(reliabilityReport).mockImplementation(async (_id: string, days = 7) => report(days, [
      { incidentId: "i1", eventType: "OPENED", occurredAt: "2026-10-01T10:00:00Z" },
      { incidentId: "i1", eventType: "RESOLVED", occurredAt: "2026-10-01T10:10:00Z" },
    ]) as never);
    page();
    expect(await screen.findByText("10m 0s")).toBeInTheDocument();
    expect(screen.queryByText("No incidents recorded in this period")).not.toBeInTheDocument();
  });
});

describe("latency chart incident markers", () => {
  const heat = (hours: number) => {
    const to = Date.now();
    const columns = Array(48).fill(120);
    return {
      monitorId: "id", from: new Date(to - hours * 3_600_000).toISOString(), to: new Date(to).toISOString(), bucketSeconds: 1800,
      latencyBoundsMs: [50, 100, 200, 400, 800],
      regions: [{ region: "eu-west-1", samples: 10, counts: [], p50Ms: columns, p95Ms: columns, windowP50Ms: 120, windowP95Ms: 120 }],
    };
  };
  // One incident three days ago: inside the chart's 7 d range, outside a 24 h report period.
  const threeDaysAgo = (days: number) => report(days, days >= 7
    ? [
      { incidentId: "i1", eventType: "OPENED", occurredAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
      { incidentId: "i1", eventType: "RESOLVED", occurredAt: new Date(Date.now() - 3 * 86_400_000 + 600_000).toISOString() },
    ]
    : []);

  it("keeps markers older than the report period when the chart shows 7 d", async () => {
    vi.mocked(latencyHeatmap).mockImplementation((async (_id: string, hours = 24) => heat(hours)) as never);
    vi.mocked(reliabilityReport).mockImplementation((async (_id: string, days = 7) => threeDaysAgo(days)) as never);
    page("/monitors/id?window=24h");

    fireEvent.click(within(await screen.findByRole("group", { name: "Window" })).getByRole("button", { name: "7 d" }));

    // The period is 24 h (no incidents in it), but the chart is on 7 d and still has its incident.
    expect(await screen.findByText("1 incident")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "24 h", pressed: true })).toBeInTheDocument();
    expect(screen.getByText("No incidents recorded in this period")).toBeInTheDocument();
    expect(reliabilityReport).toHaveBeenCalledWith("id", 7);
  });

  it("does not change the chart's markers when the report period changes", async () => {
    vi.mocked(latencyHeatmap).mockImplementation((async (_id: string, hours = 24) => heat(hours)) as never);
    vi.mocked(reliabilityReport).mockImplementation((async (_id: string, days = 7) => threeDaysAgo(days)) as never);
    page("/monitors/id?window=30d");
    fireEvent.click(within(await screen.findByRole("group", { name: "Window" })).getByRole("button", { name: "7 d" }));
    expect(await screen.findByText("1 incident")).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("group", { name: "Report period" })).getByRole("button", { name: "24 h" }));
    await screen.findByText("Uptime · 24h");

    expect(screen.getByText("1 incident")).toBeInTheDocument();
  });
});

describe("retrying a failed refresh", () => {
  async function failedPage() {
    page();
    await screen.findByText("Uptime · 7d");
    vi.mocked(availability).mockRejectedValue(new Error("boom"));
    fireEvent.click(screen.getByRole("button", { name: "30 d" }));
    await screen.findByText(/Couldn.t refresh/);
  }

  it("keeps the warning and the dimming while the retry is in flight, and clears them only on success", async () => {
    await failedPage();
    expect(screen.getByLabelText("7 days summary")).toHaveAttribute("data-stale", "true");
    let release: (value: unknown) => void = () => {};
    vi.mocked(availability).mockImplementation(() => new Promise((resolve) => { release = resolve; }) as never);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Retrying…")).toBeInTheDocument();
    expect(screen.getByLabelText("7 days summary")).toHaveAttribute("data-stale", "true");
    release(evidence(30));
    await waitFor(() => expect(screen.queryByText("Retrying…")).not.toBeInTheDocument());
    expect(screen.queryByText(/Couldn.t refresh/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("30 days summary")).not.toHaveAttribute("data-stale");
  });

  it("returns to Couldn't refresh when the retry fails too, still dimmed", async () => {
    await failedPage();
    let fail: (reason: unknown) => void = () => {};
    vi.mocked(availability).mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }) as never);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Retrying…")).toBeInTheDocument();
    fail(new Error("still down"));

    expect(await screen.findByText(/Couldn.t refresh/)).toBeInTheDocument();
    expect(screen.queryByText("Retrying…")).not.toBeInTheDocument();
    expect(screen.getByLabelText("7 days summary")).toHaveAttribute("data-stale", "true");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
