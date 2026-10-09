/** Version 1: shared UTC schedule, verified against deploy/demo/fixtures/drill-schedule-v1.json.
 * Plans describe intended drills; actual verdicts and incidents always come from the backend.
 */
export const DRILL_PATH = "/drill/status.html";
export const DRILL_CYCLE_MS = 7_200_000;
export const DRILL_TRACK_CELLS = 12;
export type DrillMode = "outage" | "slow" | "regional" | "blip";
export type DrillPlan = {
  cycleStart: number; start: number; end: number; mode: DrillMode;
  skipped: boolean; delayMs: number; failedRegion: string;
};

export function drillPlan(cycleStart: number): DrillPlan {
  if (cycleStart % DRILL_CYCLE_MS !== 0) throw new Error("Expected an aligned two-hour UTC cycle");
  let state = ((cycleStart / DRILL_CYCLE_MS) ^ 0x52435031) >>> 0;
  state ||= 1;
  const draw = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>>= 0;
  };
  const skipped = draw() % 4 === 0;
  const mode = (["outage", "slow", "regional", "blip"] as const)[draw() % 4];
  const offset = (5 + draw() % 91) * 60_000;
  let duration = (4 + draw() % 17) * 60_000;
  if (mode === "blip") duration = (15 + draw() % 26) * 1000;
  const delayMs = 2000 + draw() % 2001;
  const failedRegion = ["eu-west-1", "us-east-1"][draw() % 2];
  const start = cycleStart + offset;
  return { cycleStart, start, end: start + duration, mode, skipped, delayMs, failedRegion };
}

export type DrillPhase = {
  active: boolean;
  cycleStart: number;
  outageEnd: number;
  nextStart: number;
  progress: number;
  plan: DrillPlan;
  nextPlan: DrillPlan;
};

export function isDrillMonitor(targetUrl: string): boolean {
  try { return new URL(targetUrl).pathname === DRILL_PATH; }
  catch { return false; }
}

export function drillPhase(now: number): DrillPhase {
  const cycleStart = Math.floor(now / DRILL_CYCLE_MS) * DRILL_CYCLE_MS;
  const plan = drillPlan(cycleStart);
  let nextPlan = plan;
  // Include a later start within this cycle, and advance across skipped cycles.
  for (let i = 0; nextPlan.skipped || nextPlan.start <= now; i++) {
    if (i > 4096) throw new Error("No upcoming drill found");
    nextPlan = drillPlan(nextPlan.cycleStart + DRILL_CYCLE_MS);
  }
  return {
    active: !plan.skipped && now >= plan.start && now < plan.end,
    cycleStart, outageEnd: plan.end, nextStart: nextPlan.start,
    progress: (now - cycleStart) / DRILL_CYCLE_MS, plan, nextPlan,
  };
}

export type DrillTrack = {
  start: number; end: number; fills: number[]; position: number;
  windowStart: number; windowEnd: number;
};

/** Keep the same twelve-cell visual, with the planned fault drawn at its actual position and width. */
export function drillTrack(phase: DrillPhase, now: number): DrillTrack {
  const plan = phase.active ? phase.plan : phase.nextPlan;
  const start = plan.cycleStart;
  const end = start + DRILL_CYCLE_MS;
  const cellMs = DRILL_CYCLE_MS / DRILL_TRACK_CELLS;
  const fills = Array.from({ length: DRILL_TRACK_CELLS }, (_, i) => Math.min(1, Math.max(0, (now - start - i * cellMs) / cellMs)));
  return { start, end, fills, windowStart: (plan.start - start) / DRILL_CYCLE_MS,
    windowEnd: (plan.end - start) / DRILL_CYCLE_MS, position: Math.min(1, Math.max(0, (now - start) / DRILL_CYCLE_MS)) };
}

export const drillCycleTrack = drillTrack;

export const DRILL_MODE_LABELS: Record<DrillMode, string> = {
  outage: "Full outage", slow: "Slow response", regional: "Regional failure", blip: "Short blip",
};

/** "1:07:42" or "6:05": a countdown that reads like a clock. */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

export function utcClock(epochMs: number, withSeconds = false): string {
  return new Date(epochMs).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", ...(withSeconds ? { second: "2-digit" } : {}), timeZone: "UTC",
  });
}
