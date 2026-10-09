import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LatencyChart } from "./LatencyChart";
import { laneBounds, latencyRows } from "./latencyRows";
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

  it("keeps drawing the window in hand, marked busy, until the requested one arrives", () => {
    const { rerender } = render(<LatencyChart heatmap={heatmap} range={168} onRangeChange={() => {}} now={now} />);
    // 7 d was clicked but the heatmap is still the 24 h one: the chart must not relabel it as 7 days.
    const chart = screen.getByRole("img", { name: "Latency over the last 24 hours, eu-west-1" });
    expect(chart).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "7 d" })).toHaveAttribute("aria-pressed", "true");

    const week = { ...heatmap, from: "2026-09-23T00:00:00Z", bucketSeconds: 12600 };
    rerender(<LatencyChart heatmap={week} range={168} onRangeChange={() => {}} now={now} />);
    expect(screen.getByRole("img", { name: "Latency over the last 7 days, eu-west-1" })).toHaveAttribute("aria-busy", "false");
  });

  it("draws nothing when the backend sent no percentiles", () => {
    const { container } = render(<LatencyChart heatmap={{
      ...heatmap,
      regions: heatmap.regions.map(({ region, samples, counts }) => ({ region, samples, counts })) as LatencyHeatmap["regions"],
    }} range={24} onRangeChange={() => {}} now={now} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps a row for every column and holds the last known value across a gap", () => {
    const rows = latencyRows(heatmap, heatmap.regions[0], false);
    expect(rows).toHaveLength(48);
    expect(rows.slice(0, 4).map((row) => row.gap)).toEqual([false, true, false, true]);
    expect(rows[1]).toMatchObject({ p50: 120, p95: 300, gap: true });
    expect(rows[2]).toMatchObject({ p50: 140, p95: 310, gap: false });
    expect(rows[47]).toMatchObject({ p50: 140, p95: 310, gap: true });
    // The time scale is unchanged: columns stay half an hour apart from the window start.
    expect(rows[47].start - rows[0].start).toBe(47 * 1800 * 1000);
  });

  it("gives leading gaps the first known value", () => {
    const leading = { ...heatmap.regions[0], p50Ms: columns([null, null, 80]), p95Ms: columns([null, null, 160]) };
    const rows = latencyRows(heatmap, leading, false);
    expect(rows[0]).toMatchObject({ p50: 80, p95: 160, gap: true });
    expect(rows[2].gap).toBe(false);
  });
});

describe("incident lane", () => {
  // jsdom has no layout: give the chart a 900 x 220 box, so the plot is 900 - 36 - 12 = 852 px wide.
  const sizes = {
    width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
    height: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
  };
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 900 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 220 });
  });
  afterAll(() => {
    if (sizes.width) Object.defineProperty(HTMLElement.prototype, "clientWidth", sizes.width);
    else delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    if (sizes.height) Object.defineProperty(HTMLElement.prototype, "clientHeight", sizes.height);
    else delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
  });

  const spans = (container: HTMLElement) => [...container.querySelectorAll(".incident-lane-span")].map((rect) => ({
    x: Number(rect.getAttribute("x")), width: Number(rect.getAttribute("width")), open: rect.classList.contains("open"),
  }));

  it("places each incident by its real time on the plot's x scale, not by bucket", () => {
    // 48 columns of 30 min: column i is centred on from + (i + 0.5) * 30 min, so 12:00 sits halfway between columns 23 and 24.
    const { container } = render(<LatencyChart heatmap={heatmap} range={24} onRangeChange={() => {}} now={now} incidents={[
      { openedAt: "2026-09-29T12:00:00Z", resolvedAt: "2026-09-29T12:10:00Z" },
    ]} />);
    const [only] = spans(container);
    expect(only.x).toBeCloseTo((23.5 * 852) / 47, 1);
    expect(only.width).toBeCloseTo(((600 / 1800) * 852) / 47, 1); // ten minutes, a third of a bucket
    expect(only.open).toBe(false);
    expect(container.querySelector(".incident-lane")).toHaveAttribute("width", "852");
  });

  it("keeps a one-minute incident at least 2 px wide and runs an open one to now in solid red", () => {
    const { container } = render(<LatencyChart heatmap={heatmap} range={24} onRangeChange={() => {}} now={now} incidents={[
      { openedAt: "2026-09-29T12:00:00Z", resolvedAt: "2026-09-29T12:01:00Z" },
      { openedAt: "2026-09-29T20:00:00Z", resolvedAt: null },
    ]} />);
    const [short, open] = spans(container);
    expect(short.width).toBe(2);
    expect(open.open).toBe(true);
    expect(open.x + open.width).toBeCloseTo(852, 5); // now is the window's end
    expect(open.width).toBeCloseTo((852 * (47 - 39.5)) / 47, 1); // 20:00 is column 39.5; the lane ends at the last column centre
  });

  it("draws no lane without incidents in the window, and never shades behind the data", () => {
    const { container } = render(<LatencyChart heatmap={heatmap} range={24} onRangeChange={() => {}} now={now} incidents={[
      { openedAt: "2026-09-20T10:00:00Z", resolvedAt: "2026-09-20T10:12:00Z" },
    ]} />);
    expect(container.querySelector(".incident-lane-track")).toBeNull();
    expect(container.querySelector(".incident-band-fill")).toBeNull();
  });

  it("adds an Incident line with its time range to the tooltip of an overlapping column", () => {
    const { container } = render(<LatencyChart heatmap={heatmap} range={24} onRangeChange={() => {}} now={now} incidents={[
      { openedAt: "2026-09-29T00:00:00Z", resolvedAt: "2026-09-29T00:10:00Z" },
    ]} />);
    const chart = container.querySelector(".latency-chart-canvas > div") as HTMLElement;
    const move = (clientX: number) => act(() => {
      const event = new Event("pointermove", { bubbles: true });
      Object.defineProperty(event, "clientX", { value: clientX });
      chart.dispatchEvent(event);
    });
    move(36); // the first column, which the incident overlaps
    expect(screen.getByText("Incident")).toBeInTheDocument();
    // Values never wrap: the rows share one nowrap grid inside a card that sizes to its content.
    const rows = container.querySelector(".chart-tip-incident")!.parentElement!;
    expect(rows).toHaveClass("grid", "whitespace-nowrap");
    expect(rows.parentElement).toHaveClass("w-max", "whitespace-nowrap");
    expect(within(rows).getByText("p50").nextElementSibling).toHaveClass("justify-self-end");
    expect(container.querySelector(".chart-tip-incident-times")?.textContent).toMatch(/^\d\d:\d\d–\d\d:\d\d$/);
    move(36 + 852 / 2); // mid-day: nothing overlaps
    expect(screen.queryByText("Incident")).toBeNull();
  });
});

describe("laneBounds", () => {
  it("clamps to the lane and keeps short spans visible", () => {
    expect(laneBounds(10, 40, 100, 2)).toEqual([10, 30]);
    expect(laneBounds(10, 10.4, 100, 2)).toEqual([10, 2]);
    expect(laneBounds(99.5, 99.9, 100, 2)).toEqual([98, 2]);
    expect(laneBounds(-20, 5, 100, 2)).toEqual([0, 5]);
    expect(laneBounds(90, 400, 100, 2)).toEqual([90, 10]);
  });
});
