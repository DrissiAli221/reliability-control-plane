import { describe, expect, it } from "vitest";
import { countdown, drillPhase, isDrillMonitor } from "./drill";

const at = (iso: string) => Date.parse(iso);

describe("drill schedule", () => {
  it("recognizes the drill page by its path only", () => {
    expect(isDrillMonitor("https://rcp-ali.duckdns.org/drill/status.html")).toBe(true);
    expect(isDrillMonitor("https://example.com/drill/status.html")).toBe(true);
    expect(isDrillMonitor("https://example.com/drill/status.html.bak")).toBe(false);
    expect(isDrillMonitor("https://www.wikipedia.org")).toBe(false);
    expect(isDrillMonitor("not a url")).toBe(false);
  });

  it("is active for the first ten minutes of every even UTC hour", () => {
    expect(drillPhase(at("2026-10-06T14:00:00Z")).active).toBe(true);
    expect(drillPhase(at("2026-10-06T14:09:59Z")).active).toBe(true);
    expect(drillPhase(at("2026-10-06T14:10:00Z")).active).toBe(false);
    expect(drillPhase(at("2026-10-06T15:00:00Z")).active).toBe(false);
    expect(drillPhase(at("2026-10-06T00:05:00Z")).active).toBe(true);
  });

  it("points at the current outage window and the next one", () => {
    const during = drillPhase(at("2026-10-06T14:04:00Z"));
    expect(during.cycleStart).toBe(at("2026-10-06T14:00:00Z"));
    expect(during.outageEnd).toBe(at("2026-10-06T14:10:00Z"));
    expect(during.nextStart).toBe(at("2026-10-06T16:00:00Z"));

    const between = drillPhase(at("2026-10-06T15:30:00Z"));
    expect(between.cycleStart).toBe(at("2026-10-06T14:00:00Z"));
    expect(between.nextStart).toBe(at("2026-10-06T16:00:00Z"));
    expect(between.progress).toBeCloseTo(0.75);
  });

  it("formats countdowns like a clock", () => {
    expect(countdown(65_000)).toBe("1:05");
    expect(countdown(3_600_000 + 7 * 60_000 + 42_000)).toBe("1:07:42");
    expect(countdown(-5)).toBe("0:00");
  });
});
