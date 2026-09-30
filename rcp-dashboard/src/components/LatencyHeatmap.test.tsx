import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LatencyHeatmap } from "./LatencyHeatmap";

afterEach(cleanup);

const counts = Array.from({ length: 48 }, () => Array.from({ length: 8 }, () => 0));
counts[47][2] = 14;

describe("LatencyHeatmap", () => {
  it("draws one cell per time column and latency band and reads a cell on hover", () => {
    render(<LatencyHeatmap heatmap={{
      monitorId: "monitor-1", from: "2026-09-29T00:00:00Z", to: "2026-09-30T00:00:00Z", bucketSeconds: 1800,
      latencyBoundsMs: [50, 100, 200, 400, 800, 1600, 3200],
      regions: [{ region: "eu-west-1", samples: 14, counts }],
    }} />);

    const grid = screen.getByRole("img", { name: "eu-west-1 latency heatmap, 14 responses" });
    expect(grid.children).toHaveLength(48 * 8);
    const hot = grid.querySelectorAll("i.hot");
    expect(hot).toHaveLength(1);

    fireEvent.mouseEnter(hot[0]);
    const readout = screen.getByText(/responses$/, { selector: ".heatmap-readout" });
    // The time range depends on the viewer's timezone, so check the region and the band instead.
    expect(readout.textContent).toMatch(/^eu-west-1 · /);
    expect(readout).toHaveTextContent("100 ms – 200 ms · 14 responses");
  });
});
