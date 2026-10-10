import { ShieldAlert } from "lucide-react";
import type { Tone } from "../format";

const CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** A static 3×3 dot-matrix block in the status tone, the same shape as LiveLed; `pulse` makes it breathe. */
export function StatusDot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
  return (
    <span className={`status-dot ${tone}${pulse ? " breathing" : ""}`} aria-hidden="true">
      {CELLS.map((cell) => <i key={cell} />)}
    </span>
  );
}

/** `blocked` swaps the dot for a shield and hatches the badge: the probes were challenged by bot protection, not absent. */
export function StatusBadge({ label, tone, blocked = false }: { label: string; tone: Tone; blocked?: boolean }) {
  return (
    <span className={`badge ${tone}${blocked ? " blocked" : ""}`}>
      {blocked ? <ShieldAlert size={13} aria-hidden="true" /> : <StatusDot tone={tone} />}
      {label}
    </span>
  );
}

// Distance of each cell from the centre of a 3×3 matrix: the breath starts in the middle and spreads out.
const RINGS = [2, 1, 2, 1, 0, 1, 2, 1, 2];

/**
 * A 3×3 dot-matrix indicator that breathes outward from its centre while data is live, and flares once
 * each time fresh data arrives (keyed by the refresh time), so a refresh is visible without moving anything.
 */
export function LiveLed({ updatedAt, tone = "good" }: { updatedAt: number | null; tone?: Tone }) {
  return (
    <span key={updatedAt ?? 0} className={`led ${tone}${updatedAt ? " blink" : ""}`} aria-hidden="true">
      {RINGS.map((ring, index) => <i key={index} style={{ animationDelay: `${ring * 180}ms` }} />)}
    </span>
  );
}
