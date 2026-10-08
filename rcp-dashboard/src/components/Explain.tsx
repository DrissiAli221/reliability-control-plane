import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ExplainLine = { label: string; value: ReactNode; strong?: boolean };

/** "How is this calculated?": the formula behind a metric, with this monitor's actual numbers. */
export function Explain({ title, lines, note }: { title: string; lines: ExplainLine[]; note?: string }) {
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const id = useId();

  function toggle() {
    if (position || !trigger.current) {
      setPosition(null);
      return;
    }
    const rect = trigger.current.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left - 12), window.innerWidth - 328);
    setPosition(rect.bottom + 240 > window.innerHeight ? { left, bottom: window.innerHeight - rect.top + 6 } : { left, top: rect.bottom + 6 });
  }

  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!popover.current?.contains(target) && !trigger.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { close(); trigger.current?.focus(); } };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [position]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="explain-trigger"
        aria-label={`How is ${title.toLowerCase()} calculated?`}
        aria-expanded={position != null}
        aria-controls={position ? id : undefined}
        onClick={toggle}
      >
        <Info size={14} aria-hidden="true" />
      </button>
      {position && createPortal(
        <div className="explain" role="dialog" aria-label={title} id={id} ref={popover} style={position}>
          <strong>{title}</strong>
          <dl>
            {lines.map((line) => (
              <div key={line.label} className={line.strong ? "strong" : undefined}>
                <dt>{line.label}</dt>
                <dd>{line.value}</dd>
              </div>
            ))}
          </dl>
          {note && <p>{note}</p>}
        </div>,
        document.body,
      )}
    </>
  );
}

/** A list of short facts that may wrap between items but never inside one. */
export function ExplainItems({ items, empty = "Nothing" }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <>{empty}</>;
  return (
    <>
      {items.map((item, index) => (
        <span key={item} className="explain-item">{item}{index < items.length - 1 ? " · " : ""}</span>
      ))}
    </>
  );
}
