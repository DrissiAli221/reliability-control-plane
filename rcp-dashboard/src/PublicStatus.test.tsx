import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicStatus } from "./api";
import { PublicStatus } from "./PublicStatus";

vi.mock("./api", () => ({ publicStatus: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("PublicStatus", () => {
  it("presents paused monitoring as unknown, not healthy or failed", async () => {
    vi.mocked(publicStatus).mockResolvedValue({
      name: "Ali Systems",
      slug: "ali-systems",
      overallStatus: "UNKNOWN",
      generatedAt: "2026-09-26T10:00:00Z",
      components: [{
        name: "Portfolio API",
        status: "PAUSED",
        latestVerdict: "UP",
        latestCheckedAt: "2026-09-26T09:00:00Z",
      }],
    });

    render(
      <MemoryRouter initialEntries={["/status/ali-systems"]}>
        <Routes><Route path="/status/:slug" element={<PublicStatus />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Paused")).toBeInTheDocument();
    expect(screen.getByText("Status unknown").closest(".status-banner")).toHaveClass("muted");
    expect(screen.getByText("Portfolio API").previousElementSibling).toHaveClass("muted");
    expect(screen.getByText(/paused or stale components are not currently measured/)).toBeInTheDocument();
    expect(publicStatus).toHaveBeenCalledWith("ali-systems", expect.any(AbortSignal));
  });

  it("does not present stale evidence as a failure", async () => {
    vi.mocked(publicStatus).mockResolvedValue({
      name: "Ali Systems", slug: "ali-systems", overallStatus: "UNKNOWN",
      generatedAt: "2026-09-26T10:00:00Z",
      components: [{ name: "Portfolio API", status: "STALE", latestVerdict: "UP", latestCheckedAt: "2026-09-26T09:00:00Z" }],
    });

    render(
      <MemoryRouter initialEntries={["/status/ali-systems"]}>
        <Routes><Route path="/status/:slug" element={<PublicStatus />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Stale")).toBeInTheDocument();
    expect(screen.getByText("Portfolio API").previousElementSibling).toHaveClass("muted");
  });

  it("keeps last-known status after a failed refresh without presenting it as current", async () => {
    const operational = {
      name: "Ali Systems", slug: "ali-systems", overallStatus: "OPERATIONAL",
      generatedAt: "2026-09-26T10:00:00Z",
      components: [{ name: "Portfolio API", status: "OPERATIONAL", latestVerdict: "UP", latestCheckedAt: "2026-09-26T09:59:00Z" }],
    };
    vi.mocked(publicStatus)
      .mockResolvedValueOnce(operational)
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce({
        ...operational, overallStatus: "UNKNOWN",
        components: [{ ...operational.components[0], status: "STALE" }],
      });
    vi.useFakeTimers();

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/status/ali-systems"]}>
          <Routes><Route path="/status/:slug" element={<PublicStatus />} /></Routes>
        </MemoryRouter>,
      );
    });
    expect(screen.getByText("All systems operational")).toBeInTheDocument();
    expect(screen.getByText("Operational")).toBeInTheDocument();
    expect(document.title).toBe("Ali Systems status");

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByText("Couldn't refresh status")).toBeInTheDocument();
    expect(screen.getByText(/Network down\. Showing the last confirmed status/)).toBeInTheDocument();
    expect(screen.queryByText("All systems operational")).not.toBeInTheDocument();
    expect(screen.queryByText("Operational")).not.toBeInTheDocument();
    expect(screen.getByText("Last known · Operational")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Components" })).toHaveClass("stale");

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByText("Status unknown")).toBeInTheDocument();
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(publicStatus).toHaveBeenCalledTimes(3);
  });

  it("marks status as not current when a refresh hangs past its timeout", async () => {
    vi.mocked(publicStatus)
      .mockResolvedValueOnce({
        name: "Ali Systems", slug: "ali-systems", overallStatus: "OPERATIONAL",
        generatedAt: "2026-09-26T10:00:00Z",
        components: [{ name: "Portfolio API", status: "OPERATIONAL", latestVerdict: "UP", latestCheckedAt: "2026-09-26T09:59:00Z" }],
      })
      .mockImplementationOnce(() => new Promise(() => {}));
    vi.useFakeTimers();

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/status/ali-systems"]}>
          <Routes><Route path="/status/:slug" element={<PublicStatus />} /></Routes>
        </MemoryRouter>,
      );
    });
    expect(screen.getByText("All systems operational")).toBeInTheDocument();
    expect(screen.getByText("Operational")).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(40_000); });
    expect(screen.getByText(/Status page refresh timed out/)).toBeInTheDocument();
    expect(screen.queryByText("All systems operational")).not.toBeInTheDocument();
    expect(screen.queryByText("Operational")).not.toBeInTheDocument();
    expect(screen.getByText("Last known · Operational")).toBeInTheDocument();
  });

  it("shows only the error when the first load fails", async () => {
    vi.mocked(publicStatus).mockRejectedValueOnce(new Error("Status page not found"));

    render(
      <MemoryRouter initialEntries={["/status/missing"]}>
        <Routes><Route path="/status/:slug" element={<PublicStatus />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Status unavailable")).toBeInTheDocument();
    expect(screen.getByText("Status page not found")).toBeInTheDocument();
  });
});
