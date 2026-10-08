import { describe, expect, it } from "vitest";
import { countdown, drillCycleTrack, drillPhase, drillTrack, isDrillMonitor } from "./drill";

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

  it("lays the between-drills track out as 12 cells ending in the next outage window", () => {
    const now = at("2026-10-06T15:05:00Z");
    const phase = drillPhase(now);
    const track = drillTrack(phase, now);
    expect(track.fills).toHaveLength(12);
    expect(track.start).toBe(at("2026-10-06T14:10:00Z"));
    expect(track.end).toBe(at("2026-10-06T16:10:00Z"));
    // 55 minutes in: five full cells, half of the sixth, the rest empty (the last cell is the outage window).
    expect(track.fills.slice(0, 5)).toEqual([1, 1, 1, 1, 1]);
    expect(track.fills[5]).toBeCloseTo(0.5);
    expect(track.fills.slice(6)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(track.fills.reduce((a, b) => a + b, 0)).toBeCloseTo(5.5);
    expect(track.position).toBeCloseTo(55 / 120);
  });

  it("starts empty right after an outage and nearly full just before the next", () => {
    const early = drillTrack(drillPhase(at("2026-10-06T14:10:00Z")), at("2026-10-06T14:10:00Z"));
    expect(early.fills.every((fill) => fill === 0)).toBe(true);
    expect(early.position).toBe(0);
    const late = at("2026-10-06T15:59:59Z");
    const track = drillTrack(drillPhase(late), late);
    expect(track.fills.slice(0, 10).every((fill) => fill === 1)).toBe(true);
    expect(track.fills[10]).toBeGreaterThan(0.99);
    expect(track.fills[11]).toBe(0);
    expect(track.position).toBeCloseTo(109.98 / 120, 2);
  });

  it("lays a running drill out on the same 12 cells with the outage first", () => {
    const now = at("2026-10-06T14:04:30Z");
    const track = drillCycleTrack(drillPhase(now), now);
    expect(track.fills).toHaveLength(12);
    expect(track.outageIndex).toBe(0);
    expect(track.start).toBe(at("2026-10-06T14:00:00Z"));
    expect(track.end).toBe(at("2026-10-06T16:00:00Z"));
    expect(track.fills[0]).toBeCloseTo(0.45);
    expect(track.fills.slice(1).every((fill) => fill === 0)).toBe(true);
    expect(track.position).toBeCloseTo(4.5 / 120);
    expect(drillTrack(drillPhase(now), now).outageIndex).toBe(11);
  });
});
