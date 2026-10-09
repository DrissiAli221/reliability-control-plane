import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteMonitor, listMonitors } from "../api";
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
  deleteMonitor: vi.fn(async () => undefined),
}));
vi.mock("../session", () => ({ useReadOnly: vi.fn(), useSession: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openRowMenu() {
  render(<MemoryRouter><MonitorsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Actions for Example Domain" }));
}

describe("monitor row menu", () => {
  it("offers a danger Delete monitor item to owners, after a separator", async () => {
    vi.mocked(useReadOnly).mockReturnValue(false);
    await openRowMenu();

    const item = screen.getByRole("menuitem", { name: "Delete monitor" });
    expect(item).toHaveClass("danger");
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("hides it from read-only users", async () => {
    vi.mocked(useReadOnly).mockReturnValue(true);
    await openRowMenu();

    expect(screen.getByRole("menuitem", { name: "Open details" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete monitor" })).not.toBeInTheDocument();
  });

  it("opens the typed-name dialog and refreshes the list after deleting", async () => {
    vi.mocked(useReadOnly).mockReturnValue(false);
    await openRowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete monitor" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Example Domain" } });
    const callsBefore = vi.mocked(listMonitors).mock.calls.length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete monitor" }));

    await waitFor(() => expect(deleteMonitor).toHaveBeenCalledWith("monitor-1"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(vi.mocked(listMonitors).mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
