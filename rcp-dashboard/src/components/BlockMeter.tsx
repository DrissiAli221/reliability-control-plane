import type { CSSProperties } from "react";
import { milliseconds } from "../format";

export type MeterTone = "good" | "warn" | "fault" | "muted";

/** Past this many blocks the gap shrinks so each block stays wide enough to read. */
const DENSE_FROM = 12;

export type BlockSlice = {
  /** How much of the block is filled, 0..1 from the left. */
  fill: number;
  /** Where the hatching starts inside the block, 0..1 (the end of the fill). */
  hatchFrom: number;
  /** How much of the block is hatched, 0..1. */
  hatch: number;
};

const unit = (share: number) => (Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : share > 0 ? 1 : 0);

/**
 * Each block takes its own slice of the value and of the stretch between value and target, as fractions of that
 * block's width. Value and target are shares (0..1) of the whole meter.
 */
export function blockSlices(blocks: number, value: number, target?: number): BlockSlice[] {
  const v = unit(value);
  const t = target == null ? v : unit(target);
  return Array.from({ length: blocks }, (_, i) => {
    const from = i / blocks;
    const to = (i + 1) / blocks;
    const width = to - from;
    const fill = Math.max(0, Math.min(v, to) - from) / width;
    const hatch = Math.max(0, Math.min(t, to) - Math.max(v, from)) / width;
    return { fill, hatchFrom: fill, hatch };
  });
}

type BlockMeterProps = {
  blocks: number;
  /** Share of the whole meter that is filled, 0..1. */
  value: number;
  /** Share the value should reach; the stretch between them is hatched. */
  target?: number;
  tone: MeterTone;
  label: string;
  className?: string;
  title?: string;
  /** Hide from assistive tech when a caption beside the meter already carries the numbers. */
  decorative?: boolean;
};

/** A row of key-like blocks that fill left to right; the shortfall to a target is hatched in the status hue. */
export function BlockMeter({ blocks, value, target, tone, label, className, title, decorative }: BlockMeterProps) {
  const a11y = decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label };
  return (
    <div
      className={`blocks ${tone}${blocks > DENSE_FROM ? " dense" : ""}${className ? ` ${className}` : ""}`}
      style={{ ["--n" as string]: blocks } as CSSProperties}
      title={title}
      {...a11y}
    >
      {blockSlices(blocks, value, target).map((slice, index) => (
        <b key={index}>
          {slice.fill > 0 && <i className="fill" style={{ width: `${slice.fill * 100}%` }} />}
          {slice.hatch > 0 && <i className="short" style={{ left: `${slice.hatchFrom * 100}%`, width: `${slice.hatch * 100}%` }} />}
        </b>
      ))}
    </div>
  );
}

const TILE_BLOCKS = 10;

/** Coverage against the minimum needed to judge: amber and hatched to the minimum while unproven, else met/missed. */
export function coverageMeter(coverage: number, minimum: number, sloMet: boolean | null): BlockMeterProps {
  const short = coverage < minimum;
  return {
    blocks: TILE_BLOCKS,
    value: coverage / 100,
    target: short ? minimum / 100 : undefined,
    tone: sloMet == null ? "warn" : sloMet ? "good" : "fault",
    label: `Coverage ${coverage.toFixed(1)}% of the ${minimum}% needed`,
  };
}

/** Confirmed DOWN checks against the allowance; past 100% the budget is spent and every block is full. */
export function budgetMeter(spent: number, allowed: number): BlockMeterProps {
  const ratio = allowed > 0 ? spent / allowed : spent > 0 ? Number.POSITIVE_INFINITY : 0;
  return {
    blocks: TILE_BLOCKS,
    value: Math.min(ratio, 1),
    tone: ratio > 1 ? "fault" : ratio > 0.75 ? "warn" : "good",
    label: Number.isFinite(ratio) ? `${Math.round(ratio * 100).toLocaleString("en-US")}% of the error budget used` : "Error budget used with none allowed",
  };
}

/** Solid up to the typical (p50) response, hatched up to the slow (p95), on a scale from zero. */
export function latencyMeter(p50: number, p95: number): BlockMeterProps {
  const scale = Math.max(p95 * 1.1, 1);
  return {
    blocks: TILE_BLOCKS,
    value: p50 / scale,
    target: p95 / scale,
    tone: "muted",
    label: `p50 ${milliseconds(p50)}, p95 ${milliseconds(p95)}`,
  };
}
