/**
 * The demo's scheduled outage drill. The server removes the drill page at every even UTC hour for ten minutes
 * (deploy/demo/systemd/rcp-demo-drill.timer and scripts/outage-drill.py); keep these values in step with them.
 * This is a deployment fact shown for context; incident decisions still come from the backend.
 */
export const DRILL_PATH = "/drill/status.html";
export const DRILL_CYCLE_MS = 2 * 60 * 60 * 1000;
export const DRILL_OUTAGE_MS = 10 * 60 * 1000;

export type DrillPhase = {
  /** True while the drill page is removed. */
  active: boolean;
  /** Start of the current cycle's outage (an even UTC hour). */
  cycleStart: number;
  /** End of the current cycle's outage. */
  outageEnd: number;
  /** Start of the next cycle's outage. */
  nextStart: number;
  /** Position within the two-hour cycle, 0 to 1. */
  progress: number;
};

export function isDrillMonitor(targetUrl: string): boolean {
  try {
    return new URL(targetUrl).pathname === DRILL_PATH;
  } catch {
    return false;
  }
}

/** The epoch began at 00:00 UTC, an even hour, so cycles align with the timer's 00/2:00 calendar. */
export function drillPhase(now: number): DrillPhase {
  const elapsed = ((now % DRILL_CYCLE_MS) + DRILL_CYCLE_MS) % DRILL_CYCLE_MS;
  const cycleStart = now - elapsed;
  return {
    active: elapsed < DRILL_OUTAGE_MS,
    cycleStart,
    outageEnd: cycleStart + DRILL_OUTAGE_MS,
    nextStart: cycleStart + DRILL_CYCLE_MS,
    progress: elapsed / DRILL_CYCLE_MS,
  };
}

/** "1:07:42" or "6:05": a countdown that reads like a clock. */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

export function utcClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}
