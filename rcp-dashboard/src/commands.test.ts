import { describe, expect, it } from "vitest";
import { fuzzyScore } from "./commands";

describe("command search", () => {
  it("ranks direct matches first and still finds characters typed in order", () => {
    expect(fuzzyScore("", "Overview")).toBe(0);
    expect(fuzzyScore("pipe", "Pipeline")).toBe(0);
    expect(fuzzyScore("sptv", "SpectraTV")).toBeGreaterThanOrEqual(100);
    expect(fuzzyScore("xyz", "SpectraTV")).toBeNull();
    expect(fuzzyScore("tv", "SpectraTV")!).toBeLessThan(fuzzyScore("sptv", "SpectraTV")!);
  });
});
