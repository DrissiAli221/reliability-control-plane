import { useSyncExternalStore } from "react";
import { isLocalAuth } from "./auth";

export type TourStep = {
  route: "/" | "monitor" | "/pipeline";
  target: string;
  title: string;
  body: string;
  /** Shown only in the local developer profile ("local") or only on a deployed build ("deployed"). Default: both. */
  only?: "local" | "deployed";
  /** When the target never appears, skip the step instead of showing it centred (its claim needs the target). */
  optional?: boolean;
  /** Monitor steps open the first monitor; "drill" opens the scheduled-outage monitor instead (or skips the step). */
  monitor?: "drill";
};

/**
 * A two-minute walk through the system's story: evidence from several regions, a verdict only when they agree,
 * an incident only after consecutive verdicts, and every step traceable. A core step whose target is missing still
 * shows, centred, so the story never breaks; an `optional` one is skipped, because what it says depends on that
 * target (the local fault switch, the scheduled outage drill). Steps are also filtered by environment, see
 * {@link stepsFor}.
 */
export const ALL_STEPS: TourStep[] = [
  { route: "/", target: "hero", title: "One readout for the fleet",
    body: "Uptime over the last 24 hours, counted from conclusive checks only: a check counts when every region agreed. If an incident opens, this panel turns into it, with a running clock." },
  { route: "/", target: "pulse", title: "Every check, in half-hour columns",
    body: "Green is UP, red DOWN, amber means the regions disagreed. Disagreement is kept out of uptime instead of being guessed either way." },
  { route: "/", target: "incidents", title: "Incidents on a timeline",
    body: "An incident opens after 2 consecutive DOWN verdicts and resolves after 2 UP. One bad check never pages anyone." },
  { route: "/", target: "regions", title: "Probes in every region",
    body: "Each check fans out to a queue per region. Each cell is one job sent in the last 5 minutes; a filled cell has reported back, and the meter turns amber when fewer than 90% have." },
  { route: "monitor", target: "metrics", title: "A monitor's seven days",
    body: "Uptime, the 99.9% SLO, latency and error budget. The SLO is reported as unproven when too few checks were conclusive, rather than passed on thin evidence." },
  { route: "monitor", target: "heatmap", title: "Latency, not just an average",
    body: "Every HTTP response by time and latency band, per region. Hover a cell to read it; clusters show where each region really sits." },
  { route: "monitor", target: "machine", title: "Decisions, in one line",
    body: "Where the incident policy stands, the current streak, and what would move it next. The full state machine opens by itself as soon as the monitor leaves Healthy." },
  { route: "monitor", target: "checks", title: "Every check, and any check's trace",
    body: "Each column is one check: the verdict on top, a latency bar per region below. Select one to open its trace: scheduled, outbox, queued per region, probed, ingested, decided. Every timestamp is from the database." },
  { route: "monitor", target: "outage-drill", title: "A planned outage, on a timer", only: "deployed", optional: true, monitor: "drill",
    body: "On the demo a server timer removes the drill monitor's page for 10 minutes at every even UTC hour. Both regions get a 404, consecutive DOWN verdicts open an incident, and when the page returns consecutive UP verdicts resolve it. The browser only shows what the control plane decided." },
  { route: "/pipeline", target: "stages", title: "The pipeline, stage by stage",
    body: "Scheduler, transactional outbox, regional queues, idempotent ingestion, consensus, incident policy. The dots travel when a check actually moves." },
  { route: "/pipeline", target: "events", title: "A live tail of the control plane",
    body: "Every publish, result and verdict as it happens, newest at the bottom." },
  { route: "/pipeline", target: "drill", title: "Break it on purpose", only: "local", optional: true,
    body: "The fault drill makes every probe fail. Pick HTTP 503, watch two DOWN verdicts open an incident, then restore and watch it resolve. It affects every local monitor, so switch it back off." },
  { route: "/", target: "palette", title: "Everything is one keystroke away",
    body: "Press ⌘K to jump to any page or monitor, G then O, M or P to switch pages, and ? for all shortcuts." },
];

/** The steps that make sense here: the local fault switch exists only locally, the scheduled drill only when deployed. */
export function stepsFor(local: boolean, steps: TourStep[] = ALL_STEPS): TourStep[] {
  return steps.filter((step) => step.only == null || (step.only === "local") === local);
}

export const TOUR: TourStep[] = stepsFor(isLocalAuth());

const KEY = "rcp.tour.step";
let step: number | null = read();
// Which way the operator is moving, so skipping an optional step keeps going the same way (Back must not bounce forward).
let direction: 1 | -1 = 1;
const listeners = new Set<() => void>();

function read(): number | null {
  try {
    const value = sessionStorage.getItem(KEY);
    return value == null ? null : Number(value);
  } catch {
    return null;
  }
}

function write(next: number | null) {
  step = next != null && next >= 0 && next < TOUR.length ? next : null;
  try {
    if (step == null) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, String(step));
  } catch {
    // Storage can be unavailable (private mode); the tour still works for this page view.
  }
  listeners.forEach((listener) => listener());
}

export const tour = {
  start: () => write(0),
  go: (next: number) => {
    direction = step != null && next < step ? -1 : 1;
    write(next);
  },
  /** Leave an optional step whose target is missing, continuing the way the operator was heading. */
  skip: (from: number) => write(from + direction < 0 ? from + 1 : from + direction),
  stop: () => write(null),
};

/** The current tour step, shared across route changes and reloads within the tab. */
export function useTourStep(): number | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => step,
  );
}
