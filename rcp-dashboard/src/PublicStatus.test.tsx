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

    expect(await screen.findByText("PAUSED")).toBeInTheDocument();
    expect(screen.getByText("UNKNOWN")).toHaveClass("muted");
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

    expect(await screen.findByText("STALE")).toBeInTheDocument();
    expect(screen.getByText("Portfolio API").previousElementSibling).toHaveClass("muted");
  });

  it("refreshes an open page and hides old green status when refresh fails", async () => {
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
    expect(screen.getAllByText("OPERATIONAL")).toHaveLength(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByText("Status unavailable")).toBeInTheDocument();
    expect(screen.queryAllByText("OPERATIONAL")).toHaveLength(0);

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByText("UNKNOWN")).toBeInTheDocument();
    expect(screen.getByText("STALE")).toBeInTheDocument();
    expect(publicStatus).toHaveBeenCalledTimes(3);
  });

  it("hides old green status when a refresh hangs past its timeout", async () => {
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
    expect(screen.getAllByText("OPERATIONAL")).toHaveLength(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(40_000); });
    expect(screen.getByText("Status page refresh timed out")).toBeInTheDocument();
    expect(screen.queryAllByText("OPERATIONAL")).toHaveLength(0);
  });
});
