import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisualGuidePage } from "./VisualGuidePage";

beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response('<html><meta charset="utf-8"><body><main>Figure</main><script src="./embed.js"></script></body></html>')))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
    expect(frame.style.height).toBe("max(480px, 75vh)");
    expect(frame).toHaveAttribute("scrolling", "auto");
  });

  it("accepts bounded size messages only from the currently mounted frame", async () => {
    render(<MemoryRouter initialEntries={["/learn"]}><VisualGuidePage /></MemoryRouter>);
    const frame = await screen.findByTitle("Deployment") as HTMLIFrameElement;
    const send = (source: Window | null, height: unknown) => fireEvent(window, new MessageEvent("message", { source, data: { type: "rcp-guide-size", height } }));
    send(window, 900);
    expect(frame.style.height).toBe("max(480px, 75vh)");
    send(frame.contentWindow, 1800);
    expect(frame.style.height).toBe("1800px");
    expect(frame).toHaveAttribute("scrolling", "no");
    for (const invalid of [NaN, Infinity, -1, 15000, "500"]) send(frame.contentWindow, invalid);
    expect(frame.style.height).toBe("1800px");
    const staleSource = frame.contentWindow;
    fireEvent.click(screen.getByRole("button", { name: "Life of a check" }));
    const next = await screen.findByTitle("Life of one check") as HTMLIFrameElement;
    send(staleSource, 3000);
    expect(next.style.height).toBe("max(480px, 75vh)");
  });

  it("renders in the shared page skeleton: page header, one panel, no bespoke guide chrome", async () => {
    const { container } = render(<MemoryRouter initialEntries={["/learn/verdicts"]}><VisualGuidePage /></MemoryRouter>);
    await screen.findByTitle("Verdicts and incidents");
    expect(container.querySelector(".page-header h1")).toHaveTextContent("How RCP works");
    expect(container.querySelectorAll(".panel")).toHaveLength(1);
    expect(container.querySelector(".panel > .panel-header .segmented")).not.toBeNull();
    expect(container.querySelector(".panel > .guide-frame")).not.toBeNull();
    expect(container.querySelector(".guide-nav, .guide-intro, .guide-note")).toBeNull();
  });

  it("reports its size even when animation frames never run (hidden or throttled frames)", async () => {
    const embed = (await import("../../public/visual-guide/embed.js?raw")).default;
    expect(embed).toMatch(/requestAnimationFrame\(run\);\s*setTimeout\(run,/);
  });
});
