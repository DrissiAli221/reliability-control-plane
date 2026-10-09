import type { ReportCaveat } from "./types";

/** Used only when the API response carries no structured `caveats` (an older backend). Mirrors the backend list. */
export const FALLBACK_CAVEATS: ReportCaveat[] = [
  { topic: "Coverage", text: "Counts due checks that never ran and skips paused periods. Maintenance windows and late corrections are not modelled yet." },
  { topic: "Scope", text: "One availability number for the whole monitor; there are no per-region SLIs or maintenance windows yet." },
  { topic: "Incidents", text: "Shows transitions inside this window only; an incident opened earlier may still be active." },
  { topic: "Latency", text: "Uses HTTP responses only and needs at least 20 of them; timeouts and refused connections are not in the percentiles." },
  { topic: "Regions", text: "Region labels come from the probe configuration; locally they do not prove the check ran in that geography." }
];
