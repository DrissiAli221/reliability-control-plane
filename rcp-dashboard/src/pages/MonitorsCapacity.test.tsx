import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../apiError";
import { createMonitor } from "../api";
import { useReadOnly, useSession } from "../session";
import type { Session } from "../types";
import { MonitorsPage } from "./MonitorsPage";

vi.mock("../api", () => ({
  listMonitors: vi.fn(async () => []),
  availability: vi.fn(),
  monitorHistory: vi.fn(),
  createMonitor: vi.fn(),
  setMonitorEnabled: vi.fn(),
}));
vi.mock("../session", () => ({ useReadOnly: vi.fn(), useSession: vi.fn(), refreshSession: vi.fn() }));

const session = (owned: number, total: number): Session => ({
  subject: "s", readOnly: false,
  limits: { maxPerOwner: 5, maxTotal: 30, minIntervalSeconds: 60, maxTimeoutMs: 5000 },
  usage: { ownedMonitors: owned, totalMonitors: total },
});

const FULL_DEMO = "This demo runs at most 30 monitors across all accounts so its cloud costs stay bounded; each account can have 5.";

beforeEach(() => vi.mocked(useReadOnly).mockReturnValue(false));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderPage = () => render(<MemoryRouter><MonitorsPage /></MemoryRouter>);

describe("monitor capacity", () => {
  it("shows own and shared use beside the create button while there is room", async () => {
    vi.mocked(useSession).mockReturnValue(session(2, 8));
    renderPage();

    expect(screen.getByTestId("capacity-line")).toHaveTextContent("2 of 5 yours · 8 of 30 on this demo");
    expect(screen.getByRole("button", { name: /Create monitor/ })).toBeEnabled();
    expect(screen.queryByText(FULL_DEMO)).not.toBeInTheDocument();
    await screen.findByText("No monitors yet");
  });

  it("switches creation off with the reason when the whole demo is full", async () => {
    vi.mocked(useSession).mockReturnValue(session(1, 30));
    renderPage();

    const create = screen.getByRole("button", { name: /Create monitor/ });
    expect(create).toBeDisabled();
    expect(create).toHaveAccessibleDescription(FULL_DEMO);
    expect(screen.getByText(FULL_DEMO)).toBeInTheDocument();
    await screen.findByText("No monitors yet");
    expect(screen.getAllByRole("button", { name: /Create monitor/ })).toHaveLength(1);
  });

  it("switches creation off when the account is at its own limit", () => {
    vi.mocked(useSession).mockReturnValue(session(5, 12));
    renderPage();

    expect(screen.getByRole("button", { name: /Create monitor/ })).toBeDisabled();
    expect(screen.getByText(/already have 5 of 5 monitors/)).toBeInTheDocument();
  });

  it("shows nothing about capacity from a server that does not report usage", () => {
    vi.mocked(useSession).mockReturnValue({ ...session(0, 0), usage: undefined });
    renderPage();

    expect(screen.queryByTestId("capacity-line")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create monitor/ })).toBeEnabled();
  });

  it("shows the read-only demo account only the shared figure", () => {
    vi.mocked(useReadOnly).mockReturnValue(true);
    vi.mocked(useSession).mockReturnValue({ ...session(0, 8), readOnly: true });
    renderPage();

    expect(screen.getByTestId("capacity-line")).toHaveTextContent(/^8 of 30 on this demo$/);
  });

  it("repeats the figure in the create dialog and words a refusal from the API clearly", async () => {
    vi.mocked(useSession).mockReturnValue(session(2, 29));
    vi.mocked(createMonitor).mockRejectedValue(new ApiError("This deployment already runs its maximum of 30 monitors", 409, "Deployment monitor limit reached"));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Create monitor/ }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("2 of 5 yours · 29 of 30 on this demo");
    fireEvent.change(dialog.querySelector("input[name=name]")!, { target: { value: "Shop" } });
    fireEvent.change(dialog.querySelector("input[name=targetUrl]")!, { target: { value: "https://example.com" } });
    fireEvent.submit(dialog.querySelector("form")!);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(FULL_DEMO));
    expect(screen.getByRole("alert")).not.toHaveTextContent("This deployment already runs");
  });

  it("opens the dialog from a shortcut but will not submit while full", async () => {
    vi.mocked(useSession).mockReturnValue(session(5, 30));
    render(<MemoryRouter initialEntries={["/monitors?create=1"]}><MonitorsPage /></MemoryRouter>);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(FULL_DEMO);
    expect(dialog.querySelector("button[type=submit]")).toBeDisabled();
    expect(createMonitor).not.toHaveBeenCalled();
  });
});
