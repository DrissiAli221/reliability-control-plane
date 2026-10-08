import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { listMonitors } from "../api";
import { TOUR, tour, useTourStep } from "../tour";

const CARD_WIDTH = 340;
const GAP = 14;

type Frame = { top: number; left: number; width: number; height: number } | null;
type Side = "below" | "above" | "left" | "inside" | "centre";

const PAD = 6;
const CARD_HEIGHT = 240;

function chooseSide(frame: NonNullable<Frame>): Side {
  if (frame.top + frame.height + PAD + GAP + CARD_HEIGHT < window.innerHeight) return "below";
  if (frame.top - PAD - GAP > CARD_HEIGHT) return "above";
  if (frame.left - PAD - GAP - CARD_WIDTH >= 16) return "left";
  return "inside";
}

function cardPosition(side: Side, frame: Frame): CSSProperties {
  if (side === "centre" || !frame) return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  const left = Math.min(Math.max(frame.left, 16), window.innerWidth - CARD_WIDTH - 16);
  switch (side) {
    case "below": return { left, top: frame.top + frame.height + PAD + GAP };
    case "above": return { left, top: frame.top - PAD - GAP, transform: "translateY(-100%)" };
    // No room above or below: sit beside the target rather than covering it.
    case "left": return { left: frame.left - PAD - GAP - CARD_WIDTH, top: Math.min(Math.max(16, frame.top), window.innerHeight - CARD_HEIGHT - 16) };
    default: return { left: Math.min(frame.left + frame.width - CARD_WIDTH, window.innerWidth - CARD_WIDTH - 16), top: Math.max(16, frame.top + 16) };
  }
}

function onRoute(pathname: string, route: string): boolean {
  return route === "monitor" ? pathname.startsWith("/monitors/") : pathname === route;
}

/**
 * Spotlights one part of the console at a time and explains it. The tour moves between pages on its own
 * (picking the first monitor for the monitor steps), and follows its target while the page scrolls.
 */
export function Tour() {
  const index = useTourStep();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [frame, setFrame] = useState<Frame>(null);
  const [side, setSide] = useState<Side | null>(null);
  const current = index == null ? null : TOUR[index];

  // Take the operator to the step's page first.
  useEffect(() => {
    if (!current || onRoute(pathname, current.route)) return;
    if (current.route !== "monitor") {
      navigate(current.route);
      return;
    }
    let active = true;
    listMonitors()
      .then((monitors) => {
        if (!active) return;
        if (monitors[0]) navigate(`/monitors/${monitors[0].id}`);
        else tour.go(index! + 1);
      })
      .catch(() => { if (active) tour.go(index! + 1); });
    return () => { active = false; };
  }, [current, pathname, navigate, index]);

  // Find the target once it renders, bring it into view, then keep the spotlight on it every frame.
  // The card waits until the target has stopped moving, then picks its side once for the whole step,
  // so a smooth scroll can no longer flip it between above and below.
  useLayoutEffect(() => {
    setFrame(null);
    setSide(null);
    if (!current || !onRoute(pathname, current.route)) return;
    const started = performance.now();
    let scrolled = false;
    let still = 0;
    let decided = false;
    let last: Frame = null;
    let raf = 0;
    const tick = () => {
      const element = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
      if (element) {
        if (!scrolled) {
          element.scrollIntoView({ block: "center", behavior: "smooth" });
          scrolled = true;
        }
        const rect = element.getBoundingClientRect();
        const next = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
        const same = last && last.top === next.top && last.left === next.left && last.width === next.width && last.height === next.height;
        still = same ? still + 1 : 0;
        if (!same) {
          last = next;
          setFrame(next);
        }
        if (!decided && still >= 8) {
          decided = true;
          setSide(chooseSide(next));
        }
      } else if (!decided && performance.now() - started > 1500) {
        // The target never appeared (for example the fault drill outside the local profile): centre the card.
        decided = true;
        setSide("centre");
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [current, pathname]);

  useEffect(() => {
    if (index == null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") tour.stop();
      else if (event.key === "ArrowRight") tour.go(index! + 1);
      else if (event.key === "ArrowLeft" && index! > 0) tour.go(index! - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index]);

  if (index == null || !current) return null;

  const spotlight: CSSProperties | undefined = frame
    ? { top: frame.top - PAD, left: frame.left - PAD, width: frame.width + PAD * 2, height: frame.height + PAD * 2 }
    : undefined;

  const last = index === TOUR.length - 1;
  return createPortal(
    <div className="tour" role="dialog" aria-modal="false" aria-labelledby="tour-title">
      {spotlight ? <div className="tour-spotlight" style={spotlight} /> : <div className="tour-dim" />}
      {side && <section className="tour-card" style={{ ...cardPosition(side, frame), width: CARD_WIDTH }} key={index}>
        <header>
          <span className="tour-count" aria-label={`Step ${index + 1} of ${TOUR.length}`}>
            {String(index + 1).padStart(2, "0")}<small>/{TOUR.length}</small>
          </span>
          <button type="button" className="icon-button" onClick={tour.stop} aria-label="End tour"><X size={16} /></button>
        </header>
        <h2 id="tour-title">{current.title}</h2>
        <p>{current.body}</p>
        <div className="tour-progress" aria-hidden="true">
          {TOUR.map((step, position) => <i key={step.target} className={position <= index ? "done" : undefined} />)}
        </div>
        <footer>
          <button type="button" className="button secondary" onClick={() => tour.go(index - 1)} disabled={index === 0}>
            <ArrowLeft size={14} aria-hidden="true" /> Back
          </button>
          <button type="button" className="button primary" onClick={() => (last ? tour.stop() : tour.go(index + 1))} autoFocus>
            {last ? "Finish" : <>Next <ArrowRight size={14} aria-hidden="true" /></>}
          </button>
        </footer>
      </section>}
    </div>,
    document.body,
  );
}
