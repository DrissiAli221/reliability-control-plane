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
