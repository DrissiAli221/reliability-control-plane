import type { Tone } from "../format";

export function StatusDot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
  return <span className={`status-dot ${tone}${pulse ? " pulse" : ""}`} aria-hidden="true" />;
}

export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className={`badge ${tone}`}>
      <StatusDot tone={tone} />
      {label}
    </span>
  );
}

/**
 * A square indicator that blinks once each time fresh data arrives, keyed by the refresh time,
 * so it only moves when something actually happened.
 */
export function LiveLed({ updatedAt, tone = "good" }: { updatedAt: number | null; tone?: Tone }) {
  return <span key={updatedAt ?? 0} className={`led ${tone}${updatedAt ? " blink" : ""}`} aria-hidden="true" />;
}

