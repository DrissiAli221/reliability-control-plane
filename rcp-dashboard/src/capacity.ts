import { ApiError } from "./apiError";
import type { MonitorLimits, Session } from "./types";

export type Capacity = {
  /** False until the server has reported usage (or when it is an older server that does not). */
  known: boolean;
  owned: number;
  total: number;
  perOwner: number;
  /** 0 means this deployment has no global cap. */
  maxTotal: number;
  ownerFull: boolean;
  totalFull: boolean;
  full: boolean;
};

export function capacityOf(session: Session | null | undefined): Capacity {
  const limits = session?.limits;
  const usage = session?.usage;
  if (!limits || !usage) {
    return { known: false, owned: 0, total: 0, perOwner: limits?.maxPerOwner ?? 0, maxTotal: limits?.maxTotal ?? 0, ownerFull: false, totalFull: false, full: false };
  }
  const ownerFull = usage.ownedMonitors >= limits.maxPerOwner;
  const totalFull = limits.maxTotal > 0 && usage.totalMonitors >= limits.maxTotal;
  return {
    known: true, owned: usage.ownedMonitors, total: usage.totalMonitors, perOwner: limits.maxPerOwner, maxTotal: limits.maxTotal,
    ownerFull, totalFull, full: ownerFull || totalFull,
  };
}

/** "2 of 5 yours · 8 of 30 on this demo". The read-only demo account owns nothing worth counting, so it sees the shared figure only. */
export function capacityLine(capacity: Capacity, readOnly = false): string | null {
  if (!capacity.known) return null;
  const parts: string[] = [];
  if (!readOnly) parts.push(`${capacity.owned} of ${capacity.perOwner} yours`);
  if (capacity.maxTotal > 0) parts.push(`${capacity.total} of ${capacity.maxTotal} on this demo`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function deploymentFull(maxTotal: number, perOwner: number): string {
  return `This demo runs at most ${maxTotal} monitors across all accounts so its cloud costs stay bounded; each account can have ${perOwner}.`;
}

function ownerFull(perOwner: number): string {
  return `You already have ${perOwner} of ${perOwner} monitors, the most one account can have here. Delete one to add another.`;
}

/** Why creating is switched off, or null while there is room. When both caps are hit the shared one is the reason that matters. */
export function capacityReason(capacity: Capacity): string | null {
  if (capacity.totalFull) return deploymentFull(capacity.maxTotal, capacity.perOwner);
  if (capacity.ownerFull) return ownerFull(capacity.perOwner);
  return null;
}

/** The API's capacity answers are accurate but terse ("Maximum of 5 monitors per owner reached"); say what happened and what to do. */
export function createErrorMessage(reason: unknown, limits?: MonitorLimits): string {
  const fallback = reason instanceof Error ? reason.message : "Monitor could not be created";
  if (!(reason instanceof ApiError) || reason.status !== 409) return fallback;
  if (reason.title === "Deployment monitor limit reached") {
    const max = Number(/maximum of (\d+)/.exec(reason.message)?.[1] ?? limits?.maxTotal);
    return max > 0 ? deploymentFull(max, limits?.maxPerOwner ?? 5) : fallback;
  }
  if (reason.title === "Monitor quota reached") {
    const max = Number(/Maximum of (\d+)/.exec(reason.message)?.[1] ?? limits?.maxPerOwner);
    return max > 0 ? ownerFull(max) : fallback;
  }
  return fallback;
}
