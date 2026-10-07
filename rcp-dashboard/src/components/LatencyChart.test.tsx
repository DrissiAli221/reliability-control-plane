import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LatencyChart } from "./LatencyChart";
import type { LatencyHeatmap } from "../types";

afterEach(cleanup);

const columns = (values: Array<number | null>) => [...values, ...Array(48 - values.length).fill(null)];

const heatmap: LatencyHeatmap = {
  monitorId: "monitor-1", from: "2026-09-29T00:00:00Z", to: "2026-09-30T00:00:00Z", bucketSeconds: 1800,
  latencyBoundsMs: [50, 100, 200, 400, 800, 1600, 3200],
  regions: [
    { region: "eu-west-1", samples: 4, counts: [], p50Ms: columns([120, null, 140]), p95Ms: columns([300, null, 310]), windowP50Ms: 130, windowP95Ms: 305 },
    { region: "us-east-1", samples: 4, counts: [], p50Ms: columns([90, 95]), p95Ms: columns([200, 210]), windowP50Ms: 92, windowP95Ms: 205 },
  ],
};

const now = Date.parse("2026-09-30T00:00:00Z");

describe("LatencyChart", () => {
  it("shows one region at a time with that region's window percentiles", () => {
    render(<LatencyChart heatmap={heatmap} range={24} onRangeChange={() => {}} now={now} />);
    expect(screen.getByRole("img", { name: "Latency over the last 24 hours, eu-west-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /p50.*130 ms/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "us-east-1" }));
    expect(screen.getByRole("img", { name: "Latency over the last 24 hours, us-east-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /p95.*205 ms/ })).toBeInTheDocument();
  });

  it("switches series off but always keeps one on", () => {
    render(<LatencyChart heatmap={heatmap} range={24} onRangeChange={() => {}} now={now} />);
    const p50 = screen.getByRole("button", { name: /p50/ });
    const p95 = screen.getByRole("button", { name: /p95/ });
    fireEvent.click(p95);
    expect(p95).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(p50);
    expect(p50).toHaveAttribute("aria-pressed", "true");
  });

  it("asks the page for another window and counts incidents inside this one", () => {
    const onRangeChange = vi.fn();
    render(<LatencyChart heatmap={heatmap} range={24} onRangeChange={onRangeChange} now={now} incidents={[
      { openedAt: "2026-09-29T10:00:00Z", resolvedAt: "2026-09-29T10:12:00Z" },
      { openedAt: "2026-09-20T10:00:00Z", resolvedAt: "2026-09-20T10:12:00Z" },
    ]} />);
    expect(screen.getByText("1 incident")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "7 d" }));
    expect(onRangeChange).toHaveBeenCalledWith(168);
  });

  it("draws nothing when the backend sent no percentiles", () => {
    const { container } = render(<LatencyChart heatmap={{
      ...heatmap,
      regions: heatmap.regions.map(({ region, samples, counts }) => ({ region, samples, counts })) as LatencyHeatmap["regions"],
    }} range={24} onRangeChange={() => {}} now={now} />);
    expect(container).toBeEmptyDOMElement();
  });
});
