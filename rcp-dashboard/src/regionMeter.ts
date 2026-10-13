/** Most cells a region's results meter draws; a bigger fan-out is scaled down to this many. */
export const MAX_REGION_CELLS = 24;

export type RegionCells = {
  /** One cell per expected result, capped at {@link MAX_REGION_CELLS}. */
  cells: number;
  /** How many of them are filled: results that came back. */
  filled: number;
  /** Amber when fewer than 90% of the expected results are back. */
  tone: "good" | "warn";
};

/**
 * The cells of a region's results meter: one per job published (what the region was expected to answer), filled for
 * every result received. Past the cap each cell stands for several results, and a meter is only full when every
 * result is back, so a single missing result never rounds up to a full bar.
 */
export function regionCells(received: number, expected: number): RegionCells {
  const back = Math.max(0, Math.min(received, expected));
  if (expected <= 0) return { cells: 1, filled: 0, tone: "warn" };
  const cells = Math.min(expected, MAX_REGION_CELLS);
  const filled = back >= expected ? cells
    : Math.min(cells - 1, Math.max(back > 0 ? 1 : 0, Math.floor((back / expected) * cells)));
  return { cells, filled, tone: back / expected < 0.9 ? "warn" : "good" };
}
