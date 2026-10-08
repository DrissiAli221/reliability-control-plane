import { ArrowRight, LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isLocalAuth, login, safeNext, startDemoSession } from "../auth";
import { BrandMark } from "../components/AppShell";
import { drillPhase, utcClock } from "../drill";
import { useNow } from "../useLiveData";


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
      <section className="signin-panel" aria-labelledby="signin-title">
        <BrandMark />
        <h1 id="signin-title">Sign in to Reliability Control Plane</h1>
        <p className="signin-lede">Multi-region uptime checks with verdicts you can trace back to every request.</p>

        <div className="signin-actions">
          <button type="button" className="button primary signin-demo" onClick={() => void tryDemo()} disabled={busy != null}>
            {busy === "demo" ? "Opening the demo…" : "Try the live demo"}
            <ArrowRight size={16} className="signin-go" aria-hidden="true" />
          </button>
          <button type="button" className="button secondary" onClick={() => void account()} disabled={busy != null}>
            <LogIn size={16} aria-hidden="true" />
            {local ? "Continue as local developer" : busy === "account" ? "Opening sign-in…" : "Sign in or create an account"}
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        <p className="signin-note">
          {local
            ? "Local profile: full access with a development identity."
            : "The demo is read-only and needs no account. Sign in for a private workspace to monitor your own sites."}
        </p>
      </section>

      <footer className="signin-footer">
        <DemoStatus />
        <a href="https://github.com/DrissiAli221/reliability-control-plane" target="_blank" rel="noreferrer">Source</a>
      </footer>
    </main>
  );
}

/** One quiet line of what the demo is doing right now. */
function DemoStatus() {
  const now = useNow(30_000);
  const phase = drillPhase(now);
  return (
    <span className="signin-status">
      <i aria-hidden="true" />
      {phase.active
        ? "Demo live in 2 regions · outage drill running"
        : `Demo live in 2 regions · next drill ${utcClock(phase.nextStart)} UTC`}
    </span>
  );
}
