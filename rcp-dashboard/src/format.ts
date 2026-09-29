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
