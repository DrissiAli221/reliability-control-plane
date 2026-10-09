import type { CSSProperties } from "react";
import { blockSlices, DENSE_FROM, type BlockMeterProps } from "../blockMeters";

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
