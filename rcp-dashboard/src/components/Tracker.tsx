import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { count, dayStatusLabel, shortDay } from "../format";
import type { DailyEvidence } from "../types";

// A visible slice for any failure, however rare, without letting one bad check paint the whole day.
const MIN_FAILURE_SHARE = 0.18;
const TOOLTIP_HALF_WIDTH = 112;
const TOOLTIP_CLEARANCE = 132;
/** Bar heights in px (the compact tracker is 12px inside a metric tile), and the shortest lit segment. */
const BAR_PX = { compact: 12, large: 32 } as const;
const LIT_MIN_PX = 4;

/** " lit" when the segment is tall enough for a top highlight to read as an edge rather than a white line. */
function litSegment(share: number, all: Array<[string, number]>, size: keyof typeof BAR_PX): string {
  const sum = all.reduce((total, [, value]) => total + value, 0);
  return sum > 0 && (share / sum) * BAR_PX[size] >= LIT_MIN_PX ? " lit" : "";
}

function segments(day: DailyEvidence): Array<[string, number]> {
  const total = day.up + day.down + day.disagreement + day.noData;
  if (total === 0) return [];
  const share = (value: number) => (value === 0 ? 0 : Math.max(value / total, MIN_FAILURE_SHARE));
  const down = share(day.down);
  const disagreement = share(day.disagreement);
  const noData = day.noData / total;
  const up = Math.max(0, 1 - down - disagreement - noData);
  return ([["down", down], ["disagreement", disagreement], ["no-data", noData], ["up", up]] as Array<[string, number]>)
    .filter(([, value]) => value > 0);
}

type TrackerProps = {
  days: DailyEvidence[];
  size?: "compact" | "large";
  label: string;
};

type Hover = { index: number; style: CSSProperties; portal: HTMLElement };

/**
 * One bar per UTC day, split by the share of each verdict; the day status names it. The tooltip spells out the
 * counts so a day with one confirmed DOWN among thousands of UP checks is not misread. It renders in a portal
 * with fixed coordinates so table scroll containers cannot clip it.
 */
export function Tracker({ days, size = "large", label }: TrackerProps) {
  const [hover, setHover] = useState<Hover | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const active = hover == null ? null : days[hover.index];

  useEffect(() => {
    if (!hover) return;
    const clear = () => setHover(null);
    window.addEventListener("scroll", clear, true);
    return () => window.removeEventListener("scroll", clear, true);
  }, [hover]);

  function show(index: number, bar: HTMLElement) {
    const rect = bar.getBoundingClientRect();
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, TOOLTIP_HALF_WIDTH + 8),
      window.innerWidth - TOOLTIP_HALF_WIDTH - 8,
    );
    setHover({
      index,
      style: rect.top > TOOLTIP_CLEARANCE
        ? { left, top: rect.top - 8, transform: "translate(-50%, -100%)" }
        : { left, top: rect.bottom + 8, transform: "translate(-50%, 0)" },
      // Stay inside the themed container so the light public page keeps its light tooltip.
      portal: root.current?.closest<HTMLElement>(".status-page") ?? document.body,
    });
  }

  return (
    <div className={`tracker ${size}`} ref={root} onMouseLeave={() => setHover(null)}>
      <div className="tracker-bars" role="list" aria-label={label}>
        {days.map((day, index) => (
          <span
            key={day.day}
            role="listitem"
            aria-label={`${shortDay(day.day)}: ${dayStatusLabel[day.status]}`}
            className={`tracker-bar ${day.status.toLowerCase()}${hover?.index === index ? " active" : ""}`}
            style={{ animationDelay: `${index * 8}ms` }}
            onMouseEnter={(event) => show(index, event.currentTarget)}
          >
            {segments(day).map(([kind, share], _, all) => (
              <i key={kind} className={`${kind}${litSegment(share, all, size)}`} style={{ flexGrow: share }} />
            ))}
          </span>
        ))}
      </div>
      {active && hover && createPortal(
        <div className="tracker-tooltip" role="tooltip" style={hover.style}>
          <div className="tracker-tooltip-head">
            <span className={`tracker-swatch ${active.status.toLowerCase()}`} />
            <strong>{dayStatusLabel[active.status]}</strong>
            <time>{shortDay(active.day)}</time>
          </div>
          <dl>
            <div><dt>Up</dt><dd>{count(active.up)}</dd></div>
            <div><dt>Down</dt><dd>{count(active.down)}</dd></div>
            <div><dt>Disagree</dt><dd>{count(active.disagreement)}</dd></div>
            <div><dt>No data</dt><dd>{count(active.noData)}</dd></div>
          </dl>
        </div>,
        hover.portal,
      )}
    </div>
  );
}
