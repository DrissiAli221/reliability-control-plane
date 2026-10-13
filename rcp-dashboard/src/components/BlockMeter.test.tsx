import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { blockSlices, budgetMeter, coverageMeter, latencyMeter } from "../blockMeters";
import { BlockMeter } from "./BlockMeter";

afterEach(cleanup);

describe("blockSlices", () => {
  it("fills whole blocks, then a partial one, left to right", () => {
    const slices = blockSlices(10, 0.25);
    expect(slices.map((slice) => slice.fill)).toEqual([1, 1, 0.5, 0, 0, 0, 0, 0, 0, 0].map((n) => expect.closeTo(n, 9)));
    expect(slices.every((slice) => slice.hatch === 0)).toBe(true);
  });

  it("hatches the stretch between the value and the target, starting where the fill ends", () => {
    const slices = blockSlices(10, 0.166, 0.95);
    expect(slices[1].fill).toBeCloseTo(0.66);
    expect(slices[1].hatchFrom).toBeCloseTo(0.66);
    expect(slices[1].hatch).toBeCloseTo(0.34);
    expect(slices[2].fill).toBe(0);
    expect(slices[2].hatch).toBe(1);
    expect(slices[9].hatch).toBeCloseTo(0.5);
    expect(slices[0]).toEqual({ fill: 1, hatchFrom: 1, hatch: 0 });
  });

  it("hatches nothing when the target is not above the value, and clamps out-of-range shares", () => {
    expect(blockSlices(4, 0.5, 0.2).every((slice) => slice.hatch === 0)).toBe(true);
    expect(blockSlices(4, 3).map((slice) => slice.fill)).toEqual([1, 1, 1, 1]);
    expect(blockSlices(4, Number.POSITIVE_INFINITY).map((slice) => slice.fill)).toEqual([1, 1, 1, 1]);
    expect(blockSlices(4, -1).map((slice) => slice.fill)).toEqual([0, 0, 0, 0]);
  });
});

describe("BlockMeter", () => {
  it("renders one block per slice with fill and hatch widths as percentages", () => {
    render(<BlockMeter blocks={4} value={0.375} target={0.75} tone="muted" label="p50 1 s, p95 2 s" />);
    const meter = screen.getByRole("img", { name: "p50 1 s, p95 2 s" });
    expect(meter).toHaveClass("blocks", "muted");
    const blocks = [...meter.querySelectorAll(":scope > b")];
    expect(blocks).toHaveLength(4);
    expect((blocks[1].querySelector("i.fill") as HTMLElement).style.width).toBe("50%");
    const hatch = blocks[1].querySelector("i.short") as HTMLElement;
    expect(hatch.style.left).toBe("50%");
    expect(hatch.style.width).toBe("50%");
    expect(blocks[3].children).toHaveLength(0);
  });

  it("can stay out of the accessibility tree when a caption carries the numbers", () => {
    const { container } = render(<BlockMeter blocks={3} value={1} tone="good" label="" decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("tile meters", () => {
  it("coverage is amber and hatched to the minimum while the SLO is unproven", () => {
    const meter = coverageMeter(16.6, 95, null);
    expect(meter).toMatchObject({ tone: "warn", value: 0.166, target: 0.95, label: "Coverage 16.6% of the 95% needed" });
  });

  it("coverage is green or red once judged, with nothing hatched", () => {
    expect(coverageMeter(99, 95, true)).toMatchObject({ tone: "good", target: undefined });
    expect(coverageMeter(99, 95, false)).toMatchObject({ tone: "fault", target: undefined });
  });

  it("error budget is green, amber past 75% and red when overspent with every block full", () => {
    expect(budgetMeter(1, 10)).toMatchObject({ tone: "good", value: 0.1 });
    expect(budgetMeter(8, 10).tone).toBe("warn");
    expect(budgetMeter(10, 10).tone).toBe("warn");
    expect(budgetMeter(60, 0.6)).toMatchObject({ tone: "fault", value: 1 });
    expect(budgetMeter(1, 0)).toMatchObject({ tone: "fault", value: 1, label: "Error budget used with none allowed" });
    expect(budgetMeter(0, 0)).toMatchObject({ tone: "good", value: 0 });
  });

  it("latency is grey: solid to p50, hatched to p95, on a scale of 1.1 x p95", () => {
    const meter = latencyMeter(126, 1580);
    expect(meter.tone).toBe("muted");
    expect(meter.value).toBeCloseTo(126 / 1738);
    expect(meter.target).toBeCloseTo(1580 / 1738);
    expect(latencyMeter(0, 0)).toMatchObject({ value: 0, target: 0 });
  });
});
