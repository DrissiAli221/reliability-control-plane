import { describe, expect, it } from "vitest";
import vectors from "../../deploy/demo/fixtures/drill-schedule-v1.json";
import { countdown, drillPlan, drillPhase, drillTrack, isDrillMonitor, DRILL_CYCLE_MS } from "./drill";

describe("drill schedule", () => {
  it("matches the Python schedule's shared versioned vectors", () => {
    for (const vector of vectors) expect(drillPlan(vector.cycleStart)).toEqual(vector);
  });
  it("recognizes only the exact drill path", () => {
    expect(isDrillMonitor("https://rcp-ali.duckdns.org/drill/status.html")).toBe(true);
    expect(isDrillMonitor("https://example.com/drill/status.html.bak")).toBe(false);
    expect(isDrillMonitor("not a url")).toBe(false);
  });
  it("uses half-open windows, including a future start within the current cycle", () => {
    const plan = vectors.find(v => !v.skipped)!;
    expect(drillPhase(plan.start - 1).nextStart).toBe(plan.start);
    expect(drillPhase(plan.start - 1).active).toBe(false);
    expect(drillPhase(plan.start).active).toBe(true);
    expect(drillPhase(plan.end - 1).active).toBe(true);
    expect(drillPhase(plan.end).active).toBe(false);
  });
  it("skips skipped cycles and finds an actual future plan", () => {
    const skipped = vectors.find(v => v.skipped)!;
    const phase = drillPhase(skipped.start);
    expect(phase.active).toBe(false);
    expect(phase.nextPlan.skipped).toBe(false);
    expect(phase.nextStart).toBeGreaterThan(skipped.start);
  });
  it("keeps tracks finite across day boundaries and skipped cycles", () => {
    for (const vector of vectors) {
      for (const now of [vector.cycleStart, vector.start, vector.end, vector.cycleStart + DRILL_CYCLE_MS - 1]) {
        const phase = drillPhase(now);
        const track = drillTrack(phase, now);
        expect(track.fills).toHaveLength(12);
        expect(track.end - track.start).toBe(DRILL_CYCLE_MS);
        expect(track.position).toBeGreaterThanOrEqual(0);
        expect(track.position).toBeLessThanOrEqual(1);
        expect(track.windowStart).toBeGreaterThan(0);
        expect(track.windowEnd).toBeLessThan(1);
        expect(track.windowEnd).toBeGreaterThan(track.windowStart);
      }
    }
  });
  it("formats countdowns without negative times", () => {
    expect(countdown(65_000)).toBe("1:05");
    expect(countdown(4_062_000)).toBe("1:07:42");
    expect(countdown(-1)).toBe("0:00");
  });
});
