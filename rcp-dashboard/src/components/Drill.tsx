import { Check, FlaskConical } from "lucide-react";
import { countdown, DRILL_MODE_LABELS, drillCycleTrack, drillPhase, drillTrack, utcClock, type DrillPhase, type DrillTrack as Track } from "../drill";
import type { MonitorOverview } from "../types";

/** Marks the drill monitor in lists, so a red row reads as planned rather than broken. */
export function DrillTag() {
  return (
    <span className="drill-tag" title="Planned demo faults: varied timing, duration and mode; some cycles are skipped">
      <FlaskConical size={11} aria-hidden="true" /> Drill
    </span>
  );
}

export function DrillLine({ now }: { now: number }) {
  const phase = drillPhase(now);
  return phase.active
    ? <span className="drill-line drill-active">{DRILL_MODE_LABELS[phase.plan.mode]} scheduled · ends in <b>{countdown(phase.outageEnd - now)}</b></span>
    : <span className="drill-line">Next drill in <b>{countdown(phase.nextStart - now)}</b> · {utcClock(phase.nextStart)} UTC</span>;
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
  if (phase.plan.mode === "slow" || phase.plan.mode === "regional") return 0;
  return overview?.latestVerdict === "DOWN" ? 1 : 0;
}

export function DrillPanel({ now, overview }: { now: number; overview?: MonitorOverview }) {
  const phase = drillPhase(now);
  const step = currentStep(phase, overview);
  const recovering = !phase.active && overview?.incidentStatus === "OPEN";
  const window = phase.active ? phase.plan : phase.nextPlan;
  const start = window.start;
  const steps = recovering ? STEPS : window.mode === "outage" ? STEPS : window.mode === "blip" ? [
    { title: "Brief failure", detail: "Both regions can get HTTP 404" },
    { title: "Observe checks", detail: "Usually fewer than two DOWN checks" },
    { title: "Observe policy", detail: "An incident is still possible" },
    { title: "Recovers", detail: "Endpoint returns to normal" },
  ] : [
    { title: DRILL_MODE_LABELS[window.mode], detail: window.mode === "slow" ? "Successful response delayed 2–3.5 s" : "Only the named probe region fails" },
    { title: "Observe checks", detail: "Actual results determine the verdict" },
    { title: "Observe policy", detail: window.mode === "regional" ? "Mixed regional results are excluded from uptime" : "A timeout still counts as failure" },
    { title: "Recovers", detail: "The endpoint returns to normal" },
  ];
  // These stages describe the plan; only backend results establish a verdict or incident.
  const tone = step === 3 ? "good" : "fault";

  // Between planned windows a compact card is enough.
  if (step == null) return <DrillCountdown phase={phase} now={now} />;

  return (
    <section className={`panel drill${phase.active ? " drill-active" : ""}`} aria-label="Scheduled outage drill" data-tour="outage-drill">
      <div className="drill-head">
        <span className="drill-eyebrow"><FlaskConical size={14} aria-hidden="true" /> Scheduled outage drill</span>
        <span className="mono subtle">{recovering ? "Incident awaiting resolution" : `${DRILL_MODE_LABELS[window.mode]} · planned UTC window`}</span>
      </div>
      <div className="drill-body">
        <div className="drill-count">
          <span className="drill-label">{phase.active ? "Planned fault ends in" : "Next drill in"}</span>
          <span className="drill-clock">{countdown((phase.active ? phase.outageEnd : phase.nextStart) - now)}</span>
          <span className="subtle mono">{utcClock(start, window.mode === "blip")}–{utcClock(window.end, window.mode === "blip")} UTC</span>
        </div>
        <div className="drill-story">
          <p>{recovering ? "The backend still reports an open incident. Consecutive UP checks are required to resolve it; the next planned window is shown separately."
            : window.mode === "slow" ? "A planned latency spike: responses take 2–3.5 seconds, under the configured 5-second timeout. Network delays can still cause a timeout."
            : window.mode === "regional" ? `A planned regional fault for ${window.failedRegion}. Requests without a recognized probe-region header remain healthy.`
            : window.mode === "blip" ? "A 15–40 second failure, shorter than the check interval. It normally avoids an incident; delayed checks can still overlap."
            : "A planned full outage: both regions see the endpoint fail. Consecutive DOWN checks can open an incident."}</p>
        </div>
      </div>
      <div className="drill-track">
        <ol className="drill-steps" aria-label="Drill steps">
          {steps.map((item, index) => (
            <li key={item.title} className={step === index ? "now" : step != null && index < step ? "done" : undefined}
              data-tone={step === index ? tone : undefined} aria-current={step === index ? "step" : undefined}>
              <span className="drill-step-index">
                {step != null && index < step ? <Check size={12} aria-label="done" role="img" /> : index + 1}
              </span>
              <span><strong>{item.title}</strong><small>{item.detail}</small></span>
            </li>
          ))}
        </ol>
      </div>
      <DrillTrack track={drillCycleTrack(phase, now)} label={`Two-hour drill cycle, ${Math.round(phase.progress * 100)}% through`} />
    </section>
  );
}

/**
 * A quiet continuous well; ticks sit underneath and the overlay marks the exact planned window.
 */
function DrillTrack({ track, label }: { track: Track; label: string }) {
  const ticks = [0, 30, 60, 90, 120].map((minutes) => track.start + minutes * 60_000);
  return (
    <div className="drill-meter" role="img" aria-label={label}>
      <span className="drill-meter-tag lbl" aria-hidden="true">Planned drill</span>
      <div className="drill-meter-cells">
        <span className="drill-meter-window" style={{ left: `${track.windowStart * 100}%`, width: `${(track.windowEnd - track.windowStart) * 100}%` }} />
        <span className="drill-meter-now" style={{ left: `${track.position * 100}%` }} />
      </div>
      <div className="drill-meter-ticks" aria-hidden="true">
        {ticks.map((tick, index) => (
          <span key={tick} className={index % 2 === 1 ? "minor" : undefined} style={{ left: `${index * 25}%` }}>{utcClock(tick)} UTC</span>
        ))}
      </div>
    </div>
  );
}

/**
 * Between drills, show the next non-skipped plan. The timer can be stopped; this is a forecast, not live evidence.
 */
function DrillCountdown({ phase, now }: { phase: DrillPhase; now: number }) {
  const track = drillTrack(phase, now);
  return (
    <section className="panel drill-countdown" aria-label="Planned outage drill" data-tour="outage-drill">
      <div className="drill-countdown-head">
        <div className="drill-countdown-title">
          <FlaskConical size={16} aria-hidden="true" />
          <div>
            <h2>Planned outage drill</h2>
            <p>Varied faults in two-hour cycles; about one in four is skipped. Planned timing, not a live verdict.</p>
          </div>
        </div>
        <div className="drill-countdown-next">
          <span className="lbl">Next drill in · {DRILL_MODE_LABELS[phase.nextPlan.mode]}</span>
          <strong>{countdown(phase.nextStart - now)}</strong>
          <span className="lbl">{utcClock(phase.nextStart, phase.nextPlan.mode === "blip")}–{utcClock(phase.nextPlan.end, phase.nextPlan.mode === "blip")} UTC</span>
        </div>
      </div>
      <DrillTrack track={track} label={`${Math.round(track.position * 100)}% through the next planned drill cycle`} />
    </section>
  );
}
