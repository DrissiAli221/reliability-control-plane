import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisualGuidePage } from "./VisualGuidePage";

beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response('<html><meta charset="utf-8"><body><main>Figure</main><script src="./embed.js"></script></body></html>')))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe("visual guide", () => {
  it.each([
    ["/learn/deployment", "Deployment", "deployment"],
    ["/learn/lifecycle", "Life of one check", "lifecycle"],
    ["/learn/verdicts", "Verdicts and incidents", "verdicts"],
    ["/learn/coverage", "Availability and coverage", "availability"],
    ["/learn/machine", "The monitoring machine", "machine"],
    ["/learn?diagram=lifecycle", "Life of one check", "lifecycle"],
    ["/learn?diagram=unknown", "Deployment", "deployment"],
  ])("opens %s", async (path, title, artifact) => {
    render(<MemoryRouter initialEntries={[path]}><VisualGuidePage /></MemoryRouter>);
    expect(await screen.findByTitle(title)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(`/visual-guide/${artifact}.html`, expect.objectContaining({ credentials: "omit" }));
  });

  it("deep-links to a diagram and removes its frame when switching to the machine", async () => {
    render(<MemoryRouter initialEntries={["/learn?diagram=availability"]}><VisualGuidePage /></MemoryRouter>);
    const diagram = await screen.findByTitle("Availability and coverage");
    expect(fetch).toHaveBeenCalledWith("/visual-guide/availability.html", expect.objectContaining({ credentials: "omit" }));
    fireEvent.click(screen.getByRole("button", { name: "Machine" }));
    expect(diagram.isConnected).toBe(false);
    expect(await screen.findByTitle("The monitoring machine")).toHaveAttribute("sandbox", "allow-scripts allow-downloads");
    expect(screen.queryByRole("navigation", { name: "Choose a diagram" })).not.toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Visual guide" });
    expect(nav).toHaveClass("segmented");
    expect(nav.querySelectorAll("button")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Machine" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Deployment" }));
    expect(screen.queryByTitle("The monitoring machine")).not.toBeInTheDocument();
    expect(await screen.findByTitle("Deployment")).toBeInTheDocument();
  });

  it("inlines the resize helper and keeps a usable scrollable fallback without a report", async () => {
    render(<MemoryRouter initialEntries={["/learn/deployment"]}><VisualGuidePage /></MemoryRouter>);
    const frame = await screen.findByTitle("Deployment") as HTMLIFrameElement;
    expect(frame.srcdoc).toContain("rcp-guide-size");
    expect(frame.srcdoc).not.toContain('src="./embed.js"');
    expect(frame.style.height).toBe("1228px");
    expect(frame).toHaveAttribute("scrolling", "auto");
  });

  it("accepts bounded size messages only from the currently mounted frame", async () => {
    render(<MemoryRouter initialEntries={["/learn"]}><VisualGuidePage /></MemoryRouter>);
    const frame = await screen.findByTitle("Deployment") as HTMLIFrameElement;
    const send = (source: Window | null, height: unknown) => fireEvent(window, new MessageEvent("message", { source, data: { type: "rcp-guide-size", height } }));
    send(window, 900);
    expect(frame.style.height).toBe("1228px");
    send(frame.contentWindow, 1800);
    expect(frame.style.height).toBe("1800px");
    expect(frame).toHaveAttribute("scrolling", "no");
    for (const invalid of [NaN, Infinity, -1, 15000, "500"]) send(frame.contentWindow, invalid);
    expect(frame.style.height).toBe("1800px");
    const staleSource = frame.contentWindow;
    fireEvent.click(screen.getByRole("button", { name: "Life of a check" }));
    const next = await screen.findByTitle("Life of one check") as HTMLIFrameElement;
    send(staleSource, 3000);
    expect(next.style.height).toBe("1650px");
  });

  it("renders in the shared page skeleton: page header, one panel, no bespoke guide chrome", async () => {
    const { container } = render(<MemoryRouter initialEntries={["/learn/verdicts"]}><VisualGuidePage /></MemoryRouter>);
    await screen.findByTitle("Verdicts and incidents");
    expect(container.querySelector(".page-header h1")).toHaveTextContent("How RCP works");
    expect(container.querySelectorAll(".panel")).toHaveLength(1);
    expect(container.querySelector(".panel > .panel-header .segmented")).not.toBeNull();
    expect(container.querySelector(".panel > .guide-stage > .guide-frame")).not.toBeNull();
    expect(container.querySelector(".guide-nav, .guide-intro, .guide-note")).toBeNull();
  });

  it("reports its size even when animation frames never run (hidden or throttled frames)", async () => {
    const embed = (await import("../../public/visual-guide/embed.js?raw")).default;
    expect(embed).toMatch(/requestAnimationFrame\(run\);\s*setTimeout\(run,/);
  });

  it("starts the figure in the dashboard theme", async () => {
    localStorage.setItem("rcp.theme", "light");
    render(<MemoryRouter initialEntries={["/learn/deployment"]}><VisualGuidePage /></MemoryRouter>);
    const frame = await screen.findByTitle("Deployment") as HTMLIFrameElement;
    expect(frame.srcdoc).toContain('<html data-theme=');
    localStorage.removeItem("rcp.theme");
  });

  it("reserves the expected height behind a skeleton, hides the frame until its first size, then reveals it", async () => {
    const { container } = render(<MemoryRouter initialEntries={["/learn/lifecycle"]}><VisualGuidePage /></MemoryRouter>);
    const frame = await screen.findByTitle("Life of one check") as HTMLIFrameElement;
    const stage = container.querySelector(".guide-stage") as HTMLElement;
    expect(stage.style.height).toBe("1650px");
    expect(stage).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector(".guide-skeleton")).not.toBeNull();
    expect(frame).toHaveAttribute("data-ready", "false");
    fireEvent(window, new MessageEvent("message", { source: frame.contentWindow, data: { type: "rcp-guide-size", height: 1700 } }));
    expect(frame).toHaveAttribute("data-ready", "true");
    expect(stage).toHaveAttribute("aria-busy", "false");
    expect(stage.style.height).toBe("1700px");
    expect(container.querySelector(".guide-skeleton")).toBeNull();
  });

  it("remembers the last measured height for the next visit and keeps the panel header while switching", async () => {
    const { container } = render(<MemoryRouter initialEntries={["/learn/verdicts"]}><VisualGuidePage /></MemoryRouter>);
    const frame = await screen.findByTitle("Verdicts and incidents") as HTMLIFrameElement;
    const header = container.querySelector(".panel-header");
    fireEvent(window, new MessageEvent("message", { source: frame.contentWindow, data: { type: "rcp-guide-size", height: 1500 } }));
    fireEvent.click(screen.getByRole("button", { name: "Machine" }));
    expect(container.querySelector(".panel-header")).toBe(header);
    expect((container.querySelector(".guide-stage") as HTMLElement).style.height).toBe("594px");
    fireEvent.click(screen.getByRole("button", { name: "Verdicts" }));
    expect((container.querySelector(".guide-stage") as HTMLElement).style.height).toBe("1500px");
  });

  it("shows the dashboard error state with a retry that fetches again", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(() => Promise.resolve(new Response('<html><meta charset="utf-8"><body><main>Figure</main><script src="./embed.js"></script></body></html>')));
    vi.stubGlobal("fetch", fetcher);
    render(<MemoryRouter initialEntries={["/learn/deployment"]}><VisualGuidePage /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("The figure could not load");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTitle("Deployment")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
