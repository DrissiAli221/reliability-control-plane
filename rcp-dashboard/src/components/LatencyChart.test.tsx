import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LatencyChart } from "./LatencyChart";
import type { LatencyHeatmap } from "../types";

const columns = (values: Array<number | null>) => [...values, ...Array(48 - values.length).fill(null)];

const heatmap: LatencyHeatmap = {
  monitorId: "monitor-1", from: "2026-09-29T00:00:00Z", to: "2026-09-30T00:00:00Z", bucketSeconds: 1800,
  latencyBoundsMs: [50, 100, 200, 400, 800, 1600, 3200],
  regions: [
    { region: "eu-west-1", samples: 4, counts: [], p50Ms: columns([120, null, 140]), p95Ms: columns([300, null, 310]) },
    { region: "us-east-1", samples: 4, counts: [], p50Ms: columns([90, 95]), p95Ms: columns([200, 210]) },
  ],
};

describe("LatencyChart", () => {
  it("shows one region at a time and switches between them", () => {
    render(<LatencyChart heatmap={heatmap} />);
    expect(screen.getByRole("img", { name: "Latency over the last 24 hours, eu-west-1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "us-east-1" }));
    expect(screen.getByRole("img", { name: "Latency over the last 24 hours, us-east-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "us-east-1" })).toHaveAttribute("aria-pressed", "true");
  });

  it("draws nothing when the backend sent no percentiles", () => {
    const { container } = render(<LatencyChart heatmap={{
      ...heatmap,
      regions: heatmap.regions.map(({ region, samples, counts }) => ({ region, samples, counts })) as LatencyHeatmap["regions"],
    }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
