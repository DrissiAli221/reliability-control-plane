import { FlaskConical } from "lucide-react";
import { countdown, DRILL_CYCLE_MS, DRILL_OUTAGE_MS, drillPhase, drillTrack, utcClock, type DrillPhase } from "../drill";
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

  // Between drills (110 of every 120 minutes) a compact card is enough; the full story appears when it happens.
  if (step == null) return <DrillCountdown phase={phase} now={now} />;

  return (
    <section className={`panel drill${phase.active ? " drill-active" : ""}`} aria-label="Scheduled outage drill">
      <div className="drill-head">
        <span className="drill-eyebrow"><FlaskConical size={14} aria-hidden="true" /> Scheduled outage drill</span>
        <span className="mono subtle">Every 2 h · 10 min outage · even UTC hours</span>
      </div>
      <div className="drill-body">
        <div className="drill-count">
          <span className="drill-label">{phase.active ? "page restored in" : "next outage in"}</span>
          <span className="drill-clock">{countdown((phase.active ? phase.outageEnd : phase.nextStart) - now)}</span>
          <span className="subtle mono">{utcClock(start)}–{utcClock(start + DRILL_OUTAGE_MS)} UTC</span>
        </div>
        <div className="drill-story">
          <p>A planned failure: the server removes this page on a timer so you can watch the pipeline react and recover.</p>
        </div>
      </div>
      <div className="drill-track">
        <ol className="drill-steps" aria-label="Drill steps">
          {STEPS.map((item, index) => (
            <li key={item.title} className={step === index ? "now" : step != null && index < step ? "done" : undefined}
              aria-current={step === index ? "step" : undefined}>
              <span className="drill-step-index">{index + 1}</span>
              <span><strong>{item.title}</strong><small>{item.detail}</small></span>
            </li>
          ))}
        </ol>
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

/**
 * The card between drills. Its track runs from the end of the last outage to the end of the next one, in twelve
 * ten-minute cells, so it fills toward the hatched final cell the countdown refers to.
 */
function DrillCountdown({ phase, now }: { phase: DrillPhase; now: number }) {
  const track = drillTrack(phase, now);
  const last = track.fills.length - 1;
  const ticks = [0, 30, 60, 90, 120].map((minutes) => track.start + minutes * 60_000);
  return (
    <section className="panel drill-countdown" aria-label="Planned outage drill">
      <div className="drill-countdown-head">
        <div className="drill-countdown-title">
          <FlaskConical size={15} aria-hidden="true" />
          <div>
            <h2>Planned outage drill</h2>
            <p>Goes down on purpose for 10 minutes every 2 hours, then recovers on its own.</p>
          </div>
        </div>
        <div className="drill-countdown-next">
          <span className="lbl">next outage in</span>
          <strong>{countdown(phase.nextStart - now)}</strong>
          <span className="lbl">{utcClock(phase.nextStart)}–{utcClock(phase.nextStart + DRILL_OUTAGE_MS)} UTC</span>
        </div>
      </div>
      <div className="drill-meter" role="img" aria-label={`${Math.round(track.position * 100)}% of the way to the next outage`}>
        <span className="drill-meter-tag lbl" aria-hidden="true">outage</span>
        <div className="drill-meter-cells">
          {track.fills.map((fill, index) => (
            <i key={index} className={index === last ? "outage" : undefined}>
              {index !== last && fill > 0 && <b style={{ width: `${fill * 100}%` }} />}
            </i>
          ))}
          <span className="drill-meter-now" style={{ left: `${track.position * 100}%` }} />
        </div>
        <div className="drill-meter-ticks" aria-hidden="true">
          {ticks.map((tick, index) => (
            <span key={tick} className={index % 2 === 1 ? "minor" : undefined} style={{ left: `${index * 25}%` }}>{utcClock(tick)} utc</span>
          ))}
        </div>
      </div>
    </section>
  );
}
