import { describe, expect, it } from "vitest";
import { MAX_REGION_CELLS, regionCells } from "./regionMeter";

describe("regionCells", () => {
  it("draws one cell per expected result, green when they are all back", () => {
    expect(regionCells(18, 18)).toEqual({ cells: 18, filled: 18, tone: "good" });
  });

  it("leaves missing results empty and turns amber under 90% back", () => {
    expect(regionCells(17, 20)).toEqual({ cells: 20, filled: 17, tone: "warn" });
    expect(regionCells(18, 20)).toEqual({ cells: 20, filled: 18, tone: "good" }); // exactly 90%
    expect(regionCells(0, 12)).toEqual({ cells: 12, filled: 0, tone: "warn" });
  });

  it("caps the cells and scales the filled count, never showing a full bar while a result is missing", () => {
    expect(regionCells(60, 60)).toEqual({ cells: MAX_REGION_CELLS, filled: MAX_REGION_CELLS, tone: "good" });
    expect(regionCells(59, 60)).toEqual({ cells: MAX_REGION_CELLS, filled: MAX_REGION_CELLS - 1, tone: "good" });
    expect(regionCells(30, 60)).toEqual({ cells: MAX_REGION_CELLS, filled: 12, tone: "warn" });
  });

  it("shows at least one filled cell once anything is back", () => {
    expect(regionCells(1, 100)).toMatchObject({ cells: MAX_REGION_CELLS, filled: 1 });
  });

  it("copes with no expected results and with more results than jobs", () => {
    expect(regionCells(0, 0)).toEqual({ cells: 1, filled: 0, tone: "warn" });
    expect(regionCells(12, 10)).toEqual({ cells: 10, filled: 10, tone: "good" });
  });
});
