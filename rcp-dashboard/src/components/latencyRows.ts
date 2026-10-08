import type { LatencyHeatmap } from "../types";

export type Row = { tick: string; time: string; start: number; p50: number; p95: number; gap: boolean };
export type Region = LatencyHeatmap["regions"][number];

/**
 * One row per column of the window, so the x axis keeps the real time scale. A column without an HTTP response is
 * flagged `gap` and carries the last known p50/p95 (the first known value for leading gaps) only so the chart has
 * something to interpolate through; the gap band drawn over it hides those values and the tooltip never shows them.
 */
export function latencyRows(heatmap: LatencyHeatmap, region: Region, long: boolean): Row[] {
  const from = new Date(heatmap.from).getTime();
  const step = heatmap.bucketSeconds * 1000;
  const known = (column: number) => region.p50Ms[column] != null && region.p95Ms[column] != null;
  const first = region.p50Ms.findIndex((_, column) => known(column));
  let held = { p50: first >= 0 ? region.p50Ms[first]! : 0, p95: first >= 0 ? region.p95Ms[first]! : 0 };
  return region.p50Ms.map((p50, column) => {
    const gap = !known(column);
    if (!gap) held = { p50: p50!, p95: region.p95Ms[column]! };
    const start = from + column * step;
    return { tick: slotLabel(start, long), time: `${slotLabel(start, long)}–${slotLabel(start + step, false)}`, start, p50: held.p50, p95: held.p95, gap };
  });
}

function slotLabel(value: number, long: boolean): string {
  return new Date(value).toLocaleString("en-GB", long
    ? { weekday: "short", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" });
}
