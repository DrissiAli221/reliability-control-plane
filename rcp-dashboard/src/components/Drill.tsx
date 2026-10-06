import { FlaskConical } from "lucide-react";
import { countdown, DRILL_CYCLE_MS, DRILL_OUTAGE_MS, drillPhase, utcClock, type DrillPhase } from "../drill";
import type { MonitorOverview } from "../types";

const CELL_MS = 5 * 60 * 1000;
const CELLS = DRILL_CYCLE_MS / CELL_MS;
const OUTAGE_CELLS = DRILL_OUTAGE_MS / CELL_MS;

/** Marks the drill monitor in lists, so a red row reads as planned rather than broken. */
export function DrillTag() {
  return (
    <span className="drill-tag" title="Planned outage: this page is removed for 10 minutes every 2 hours">
      <FlaskConical size={11} aria-hidden="true" /> Drill
    </span>
  );
}

export function DrillLine({ now }: { now: number }) {
  const phase = drillPhase(now);
  return phase.active
    ? <span className="drill-line drill-active">Outage running · restored in <b>{countdown(phase.outageEnd - now)}</b></span>
    : <span className="drill-line">Next outage in <b>{countdown(phase.nextStart - now)}</b> · {utcClock(phase.nextStart)} UTC</span>;
}

type Step = { title: string; detail: string };

const STEPS: Step[] = [
  { title: "Page removed", detail: "Both regions get HTTP 404" },
  { title: "Verdict DOWN", detail: "The regions agree it failed" },
  { title: "Incident opens", detail: "After consecutive DOWN checks" },
  { title: "Recovers", detail: "Page restored, consecutive UP checks" },
];

/**
 * Which step the drill is on, read from the backend's latest verdict and incident status. The browser only
 * points at what the control plane already decided; it never decides anything itself.
 */
function currentStep(phase: DrillPhase, overview?: MonitorOverview): number | null {
  const open = overview?.incidentStatus === "OPEN";
  if (open) return phase.active ? 2 : 3;
  if (!phase.active) return null;
  return overview?.latestVerdict === "DOWN" ? 1 : 0;
}

export function DrillPanel({ now, overview }: { now: number; overview?: MonitorOverview }) {
  const phase = drillPhase(now);
  const step = currentStep(phase, overview);
  const start = phase.active ? phase.cycleStart : phase.nextStart;
  return (
    <section className={`panel drill${phase.active ? " drill-active" : ""}`} aria-label="Scheduled outage drill">
      <div className="drill-head">
        <span className="drill-eyebrow"><FlaskConical size={14} aria-hidden="true" /> Scheduled outage drill</span>
        <span className="mono subtle">Every 2 h · 10 min outage · even UTC hours</span>
      </div>
      <div className="drill-body">
        <div className="drill-count">
          <span className="drill-label">{phase.active ? "Page restored in" : "Next outage in"}</span>
          <span className="drill-clock">{countdown((phase.active ? phase.outageEnd : phase.nextStart) - now)}</span>
          <span className="subtle mono">{utcClock(start)}–{utcClock(start + DRILL_OUTAGE_MS)} UTC</span>
        </div>
        <div className="drill-story">
          <p>
            This is a planned failure. The server removes this page on a timer so you can watch the pipeline react
            to a real outage, then recover on its own, with nobody touching anything.
          </p>
          <ol className="drill-steps">
            {STEPS.map((item, index) => (
              <li key={item.title} className={step === index ? "now" : step != null && index < step ? "done" : undefined}>
                <span className="drill-step-index">{index + 1}</span>
                <span><strong>{item.title}</strong><small>{item.detail}</small></span>
              </li>
            ))}
          </ol>
          {step == null && <p className="drill-idle">Healthy between drills. Come back during the window to watch it happen.</p>}
        </div>
      </div>
      <DrillCycle phase={phase} now={now} />
    </section>
  );
}

/** The two-hour cycle as 5-minute cells: the hatched outage window, the time already passed, and now. */
function DrillCycle({ phase, now }: { phase: DrillPhase; now: number }) {
  const ticks = [0, 30, 60, 90, 120].map((minutes) => phase.cycleStart + minutes * 60_000);
  return (
    <div className="drill-cycle" role="img" aria-label={`Two-hour drill cycle, ${Math.round(phase.progress * 100)}% through`}>
      <div className="drill-cells">
        {Array.from({ length: CELLS }, (_, index) => {
          const cellStart = phase.cycleStart + index * CELL_MS;
          const classes = [
            index < OUTAGE_CELLS ? "outage" : "",
            cellStart + CELL_MS <= now ? "past" : "",
            cellStart <= now && now < cellStart + CELL_MS ? "current" : "",
          ].filter(Boolean).join(" ");
          return <i key={index} className={classes || undefined} />;
        })}
        <span className="drill-cursor" style={{ left: `${phase.progress * 100}%` }} />
      </div>
      <div className="drill-ticks mono">
        {ticks.map((tick) => <span key={tick}>{utcClock(tick)}</span>)}
      </div>
    </div>
  );
}
