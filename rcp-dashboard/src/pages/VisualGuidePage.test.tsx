import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisualGuidePage } from "./VisualGuidePage";

beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response('<html><meta charset="utf-8"><body><main>Figure</main></body></html>')))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("visual guide", () => {
  it("deep-links to a diagram and removes its frame when switching to the machine", async () => {
    render(<MemoryRouter initialEntries={["/learn?diagram=availability"]}><VisualGuidePage /></MemoryRouter>);
    const diagram = await screen.findByTitle("Availability and coverage");
    expect(fetch).toHaveBeenCalledWith("/visual-guide/availability.html", expect.objectContaining({ credentials: "omit" }));
    fireEvent.click(screen.getByRole("link", { name: "Interactive machine" }));
    expect(diagram.isConnected).toBe(false);
    expect(await screen.findByTitle("The monitoring machine")).toHaveAttribute("sandbox", "allow-scripts allow-downloads");
    expect(screen.queryByRole("navigation", { name: "Choose a diagram" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Diagrams" }));
    expect(screen.queryByTitle("The monitoring machine")).not.toBeInTheDocument();
    expect(await screen.findByTitle("Deployment")).toBeInTheDocument();
  });

  it("accepts bounded size messages only from the currently mounted frame", async () => {
    render(<MemoryRouter initialEntries={["/learn"]}><VisualGuidePage /></MemoryRouter>);
    const frame = await screen.findByTitle("Deployment") as HTMLIFrameElement;
    const send = (source: Window | null, height: unknown) => fireEvent(window, new MessageEvent("message", { source, data: { type: "rcp-guide-size", height } }));
    send(window, 900);
    expect(frame.style.height).toBe("1000px");
    send(frame.contentWindow, 1800);
    expect(frame.style.height).toBe("1800px");
    for (const invalid of [NaN, Infinity, -1, 15000, "500"]) send(frame.contentWindow, invalid);
    expect(frame.style.height).toBe("1800px");
    const staleSource = frame.contentWindow;
    fireEvent.click(screen.getByRole("button", { name: "Life of one check" }));
    const next = await screen.findByTitle("Life of one check") as HTMLIFrameElement;
    send(staleSource, 3000);
    expect(next.style.height).toBe("1000px");
  });
});
