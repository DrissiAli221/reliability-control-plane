import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { listMonitors } from "../api";
import { TOUR, tour, useTourStep } from "../tour";

const CARD_WIDTH = 340;
const GAP = 14;

type Frame = { top: number; left: number; width: number; height: number } | null;

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

  // Find the target once it renders, bring it into view, then keep the spotlight on it.
  useLayoutEffect(() => {
    setFrame(null);
    if (!current || !onRoute(pathname, current.route)) return;
    let scrolled = false;
    const measure = () => {
      const element = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
      if (!element) return;
      if (!scrolled) {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        scrolled = true;
      }
      const rect = element.getBoundingClientRect();
      setFrame((previous) => (previous && previous.top === rect.top && previous.left === rect.left && previous.width === rect.width && previous.height === rect.height
        ? previous
        : { top: rect.top, left: rect.left, width: rect.width, height: rect.height }));
    };
    measure();
    const timer = window.setInterval(measure, 120);
    return () => window.clearInterval(timer);
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

  const pad = 6;
  const spotlight: CSSProperties | undefined = frame
    ? { top: frame.top - pad, left: frame.left - pad, width: frame.width + pad * 2, height: frame.height + pad * 2 }
    : undefined;

  let card: CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (frame) {
    const left = Math.min(Math.max(frame.left, 16), window.innerWidth - CARD_WIDTH - 16);
    const below = frame.top + frame.height + pad + GAP;
    card = below + 220 < window.innerHeight
      ? { left, top: below }
      : frame.top - pad - GAP > 240
        ? { left, top: frame.top - pad - GAP, transform: "translateY(-100%)" }
        : frame.left - pad - GAP - CARD_WIDTH >= 16
          // No room above or below: sit beside the target, on its left, rather than covering it.
          ? { left: frame.left - pad - GAP - CARD_WIDTH, top: Math.min(Math.max(16, frame.top), window.innerHeight - 260) }
          : { left: Math.min(frame.left + frame.width - CARD_WIDTH, window.innerWidth - CARD_WIDTH - 16), top: Math.max(16, frame.top + 16) };
  }

  const last = index === TOUR.length - 1;
  return createPortal(
    <div className="tour" role="dialog" aria-modal="false" aria-labelledby="tour-title">
      {spotlight ? <div className="tour-spotlight" style={spotlight} /> : <div className="tour-dim" />}
      <section className="tour-card" style={{ ...card, width: CARD_WIDTH }} key={index}>
        <header>
          <span className="tour-count" aria-label={`Step ${index + 1} of ${TOUR.length}`}>
            {String(index + 1).padStart(2, "0")}<small>/{TOUR.length}</small>
          </span>
          <button type="button" className="icon-button" onClick={tour.stop} aria-label="End tour"><X size={15} /></button>
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
      </section>
    </div>,
    document.body,
  );
}
