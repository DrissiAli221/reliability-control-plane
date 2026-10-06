import { ArrowRight, FlaskConical, LogIn, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isLocalAuth, login, safeNext, startDemoSession } from "../auth";
import { BrandMark } from "../components/AppShell";
import { LiveLed } from "../components/StatusBadge";
import { countdown, drillPhase, utcClock } from "../drill";
import { useNow } from "../useLiveData";

/** The demo deployment's probe regions. Shown before sign-in as what a visitor is about to look at. */
const REGIONS = [
  { code: "eu-west-1", place: "Ireland" },
  { code: "us-east-1", place: "N. Virginia" },
];

/**
 * The front door: most visitors should be looking at live data in one click, so the read-only demo comes first and
 * needs no sign-up. Anyone who wants to monitor their own site signs in (or signs up) through Cognito's hosted page.
 */
export function SignInPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get("next"));
  const [busy, setBusy] = useState<"demo" | "account" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const local = isLocalAuth();

  useEffect(() => {
    document.title = "RCP · Sign in";
  }, []);

  async function tryDemo() {
    setBusy("demo");
    setError(null);
    try {
      await startDemoSession();
      window.location.assign(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The demo could not be started");
      setBusy(null);
    }
  }

  async function account() {
    setBusy("account");
    setError(null);
    if (local) {
      navigate(next, { replace: true });
      return;
    }
    try {
      await login(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in could not be started");
      setBusy(null);
    }
  }

  return (
    <main className="signin">
      <div className="signin-layout">
        <section className="signin-pitch" aria-labelledby="signin-title">
          <div className="signin-brand"><BrandMark /><span>Reliability Control Plane</span></div>
          <h1 id="signin-title">Uptime you can prove</h1>
          <p className="signin-lede">
            Every check runs from several regions, a verdict needs them to agree, and every decision can be traced back
            to the requests behind it.
          </p>

          <div className="signin-actions">
            <button type="button" className="button signin-demo" onClick={() => void tryDemo()} disabled={busy != null}>
              <Play size={15} aria-hidden="true" /> {busy === "demo" ? "Opening the demo…" : "Try the live demo"}
              <ArrowRight size={15} className="signin-go" aria-hidden="true" />
            </button>
            <p className="signin-note">Read-only · real checks, running now · no sign-up</p>

            <div className="signin-or" role="separator"><span>or</span></div>

            <button type="button" className="button secondary signin-account" onClick={() => void account()} disabled={busy != null}>
              <LogIn size={15} aria-hidden="true" />
              {local ? "Continue as local developer" : busy === "account" ? "Opening sign-in…" : "Sign in or create an account"}
            </button>
            <p className="signin-note">
              {local ? "Local profile: full access with a development identity." : "Your own private workspace to monitor your own sites."}
            </p>
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
        </section>

        <LiveInstrument />
      </div>
    </main>
  );
}

/** A preview of what the demo is doing right now: real regions, the verdict rule and the next planned outage. */
function LiveInstrument() {
  const now = useNow();
  const phase = drillPhase(now);
  return (
    <aside className="signin-instrument" aria-label="What the demo is running">
      <div className="instrument-head">
        <span><LiveLed updatedAt={1} /> Running now</span>
        <span className="mono">demo workspace</span>
      </div>

      <div className="instrument-row">
        <span className="instrument-label">Probe regions</span>
        <ul className="instrument-regions">
          {REGIONS.map((region) => (
            <li key={region.code}><i aria-hidden="true" /><span className="mono">{region.code}</span><span>{region.place}</span></li>
          ))}
        </ul>
      </div>

      <div className="instrument-row">
        <span className="instrument-label">Verdict rule</span>
        <div className="instrument-rule" aria-label="A check is DOWN only when every region agrees">
          <span className="rule-dot" /><span className="rule-dot" /><span className="rule-eq">agree →</span><span className="rule-verdict">verdict</span>
        </div>
        <p className="instrument-note">One region failing is a disagreement, not downtime.</p>
      </div>

      <div className={`instrument-row instrument-drill${phase.active ? " drill-active" : ""}`}>
        <span className="instrument-label"><FlaskConical size={12} aria-hidden="true" /> {phase.active ? "Planned outage running" : "Next planned outage"}</span>
        <span className="instrument-clock">{countdown((phase.active ? phase.outageEnd : phase.nextStart) - now)}</span>
        <p className="instrument-note">
          {phase.active
            ? <>Happening now: open the demo and watch the incident open and resolve on its own.</>
            : <>At {utcClock(phase.nextStart)} UTC a test page goes down for 10 minutes. Watch an incident open and resolve on its own.</>}
        </p>
      </div>
    </aside>
  );
}
