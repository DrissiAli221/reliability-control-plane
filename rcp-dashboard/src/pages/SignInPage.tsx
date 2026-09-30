import { ArrowRight, LogIn, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isLocalAuth, login, safeNext, startDemoSession } from "../auth";
import { BrandMark } from "../components/AppShell";

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
    <main className="centered-shell signin">
      <section className="signin-card" aria-labelledby="signin-title">
        <div className="signin-brand"><BrandMark /><span>Reliability Control Plane</span></div>
        <h1 id="signin-title">Uptime you can prove.</h1>
        <p className="signin-lede">
          Every check runs from several regions, a verdict needs them to agree, and every decision can be traced back to
          the requests behind it.
        </p>

        <button type="button" className="button primary signin-demo" onClick={() => void tryDemo()} disabled={busy != null}>
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
      </section>
    </main>
  );
}
