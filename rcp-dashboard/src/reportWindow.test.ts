import { describe, expect, it } from "vitest";
import { parseWindow, windowInfo } from "./reportWindow";

describe("report window", () => {
  it("reads the four offered windows from the URL value", () => {
    expect(["24h", "7d", "30d", "90d"].map(parseWindow)).toEqual([1, 7, 30, 90]);
  });

  it("falls back to 7 days for a missing or unknown value instead of failing", () => {
    expect([null, "", "14d", "30", "1y", "90D"].map(parseWindow)).toEqual([7, 7, 7, 7, 7, 7]);
  });

  it("names a window for labels and filenames", () => {
    expect(windowInfo(30)).toMatchObject({ short: "30d", label: "30 d", words: "30 days" });
    expect(windowInfo(1).short).toBe("24h");
  });
});
