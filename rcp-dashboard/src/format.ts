import type { DayStatus, MonitorOverview, Verdict } from "./types";

export type Tone = "good" | "warn" | "fault" | "muted" | "info";

export function relativeTime(value: string | null, now = Date.now()): string {
  if (!value) return "—";
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const absolute = Math.abs(seconds);
  if (absolute < 5) return "just now";
  const amount = absolute < 60 ? `${absolute}s`
    : absolute < 3600 ? `${Math.round(absolute / 60)}m`
      : absolute < 86_400 ? `${Math.round(absolute / 3600)}h`
        : `${Math.round(absolute / 86_400)}d`;
  return seconds < 0 ? `${amount} ago` : `in ${amount}`;
}

export function absoluteTime(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  });
}

export function shortDay(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function compactUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

export function percent(value: number | null | undefined, digits = 2): string {
  return value == null ? "—" : `${Number(value).toFixed(digits)}%`;
}

export function milliseconds(value: number | null | undefined): string {
  if (value == null) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
}

export function interval(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;
}

export function count(value: number): string {
  return value.toLocaleString("en-US");
}

/** The operator-facing state of a monitor: an open incident outranks the latest single verdict. */
export function monitorState(monitor: MonitorOverview): { label: string; tone: Tone } {
  if (!monitor.enabled) return { label: "Paused", tone: "muted" };
  if (monitor.incidentStatus === "OPEN") return { label: "Incident", tone: "fault" };
  return verdictState(monitor.latestVerdict);
}

export function verdictState(verdict: Verdict | null): { label: string; tone: Tone } {
  switch (verdict) {
    case "UP": return { label: "Operational", tone: "good" };
    case "DOWN": return { label: "Down", tone: "fault" };
    case "DISAGREEMENT": return { label: "Regions disagree", tone: "warn" };
    case "NO_DATA": return { label: "No data", tone: "muted" };
    default: return { label: "Awaiting evidence", tone: "muted" };
  }
}

export const dayStatusLabel: Record<DayStatus, string> = {
  OPERATIONAL: "Operational",
  DEGRADED: "Regions disagreed",
  OUTAGE: "Confirmed downtime",
  NO_DATA: "No data",
};

export function outcomeLabel(outcome: string, httpStatus: number | null): string {
  if (outcome === "HTTP_RESPONSE") return String(httpStatus);
  return outcome.toLowerCase().replaceAll("_", " ");
}

// Mirrors RegionalProbeFact: only network failures and HTTP responses are evidence about the target.
const TARGET_FAILURES = new Set(["CONNECT_TIMEOUT", "REQUEST_TIMEOUT", "TLS_FAILURE", "CONNECTION_FAILURE"]);

/** A Cloudflare challenge means the probe was stopped, so it is no evidence about the target unless its status was accepted. */
export function outcomeTone(outcome: string, httpStatus: number | null, acceptedHttpStatuses?: number[] | null, botProtection?: string | null): Tone {
  if (outcome === "HTTP_RESPONSE") {
    const accepted = httpStatus != null && (acceptedHttpStatuses ? acceptedHttpStatuses.includes(httpStatus) : httpStatus >= 200 && httpStatus < 400);
    if (!accepted && botProtection === "CLOUDFLARE_CHALLENGE") return "muted";
    return accepted ? "good" : "fault";
  }
  return TARGET_FAILURES.has(outcome) ? "fault" : "muted";
}

export function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] ?? "th"}`;
}

export function durationBetween(from: string, to: string): string {
  return milliseconds(Math.max(0, new Date(to).getTime() - new Date(from).getTime()));
}

/** A running clock for an ongoing incident: "04:12" under an hour, "3:04:12" under a day, then "2d 03h". */
export function elapsed(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}h`;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
