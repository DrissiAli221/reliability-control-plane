import { useSyncExternalStore } from "react";

export type TourStep = {
  route: "/" | "monitor" | "/pipeline";
  target: string;
  title: string;
  body: string;
};

/**
 * A two-minute walk through the system's story: evidence from several regions, a verdict only when they agree,
 * an incident only after consecutive verdicts, and every step traceable. Steps whose target is missing (the
 * fault drill outside the local profile) still show, centred, so the story never breaks.
 */
export const TOUR: TourStep[] = [
  { route: "/", target: "hero", title: "One readout for the fleet",
    body: "Uptime over the last 24 hours, counted from conclusive checks only: a check counts when every region agreed. If an incident opens, this panel turns into it, with a running clock." },
  { route: "/", target: "pulse", title: "Every check, in half-hour columns",
    body: "Green is UP, red DOWN, amber means the regions disagreed. Disagreement is kept out of uptime instead of being guessed either way." },
  { route: "/", target: "incidents", title: "Incidents on a timeline",
    body: "An incident opens after 2 consecutive DOWN verdicts and resolves after 2 UP. One bad check never pages anyone." },
  { route: "/", target: "regions", title: "Probes in every region",
    body: "Each check fans out to a queue per region. The meter shows how many jobs sent in the last 5 minutes have reported back." },
  { route: "monitor", target: "metrics", title: "A monitor's seven days",
    body: "Uptime, the 99.9% SLO, latency and error budget. The SLO is reported as unproven when too few checks were conclusive, rather than passed on thin evidence." },
  { route: "monitor", target: "heatmap", title: "Latency, not just an average",
    body: "Every HTTP response by time and latency band, per region. Hover a cell to read it; clusters show where each region really sits." },
  { route: "monitor", target: "machine", title: "The incident policy as a state machine",
    body: "The current state and streak are live. The tape shows the last verdicts that fed it, so you can see exactly why it is where it is." },
  { route: "monitor", target: "checks", title: "Trace any single check",
    body: "Select a check to open its trace: scheduled, written to the outbox, queued per region, probed, ingested, then decided. Every timestamp is from the database." },
  { route: "/pipeline", target: "stages", title: "The pipeline, stage by stage",
    body: "Scheduler, transactional outbox, regional queues, idempotent ingestion, consensus, incident policy. The dots travel when a check actually moves." },
  { route: "/pipeline", target: "events", title: "A live tail of the control plane",
    body: "Every publish, result and verdict as it happens, newest at the bottom." },
  { route: "/pipeline", target: "drill", title: "Break it on purpose",
    body: "Locally, the fault drill makes every probe fail. Pick HTTP 503, watch two DOWN verdicts open an incident, then restore and watch it resolve. It affects every local monitor, so switch it back off." },
  { route: "/", target: "palette", title: "Everything is one keystroke away",
    body: "Press ⌘K to jump to any page or monitor, G then O, M or P to switch pages, and ? for all shortcuts." },
];

const KEY = "rcp.tour.step";
let step: number | null = read();
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
  go: (next: number) => write(next),
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
