import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  confirmSignUp,
  finishPasswordReset,
  isLocalAuth,
  passwordSignIn,
  resendSignUpCode,
  safeNext,
  signUp,
  socialLogin,
  socialProviders,
  startDemoSession,
  startPasswordReset,
  submitMfaCode,
  submitNewPassword,
  takeAuthError,
  type SignInStep,
  type SocialProvider,
} from "../auth";
import { BrandMark } from "../components/AppShell";
import { StatusDot } from "../components/StatusBadge";
import { drillPhase, utcClock } from "../drill";
import { passwordChecks, passwordMeetsPolicy } from "../passwordPolicy";
import { rememberReturnPath } from "../returnPath";
import { useNow } from "../useLiveData";

type View = "signin" | "signup" | "confirm" | "forgot" | "reset" | "mfa" | "newPassword";
type Busy = "demo" | "social" | "submit" | "resend";

const COPY: Record<View, { title: string; lede: string }> = {
  signin: { title: "Sign in to Reliability Control Plane", lede: "Multi-region uptime checks with verdicts you can trace back to every request." },
  signup: { title: "Create your account", lede: "A private workspace to monitor your own sites." },
  confirm: { title: "Check your email", lede: "" },
  forgot: { title: "Reset your password", lede: "Enter your email and we will send you a code." },
  reset: { title: "Choose a new password", lede: "Enter the code from your email and a new password." },
  mfa: { title: "Two-step verification", lede: "Enter the 6-digit code from your authenticator app." },
  newPassword: { title: "Set a new password", lede: "Your account needs a new password before you continue." },
};

const SUBMIT_LABEL: Record<View, [string, string]> = {
  signin: ["Sign in", "Signing in…"],
  signup: ["Create account", "Creating account…"],
  confirm: ["Confirm and sign in", "Confirming…"],
  forgot: ["Send code", "Sending code…"],
  reset: ["Set new password", "Saving…"],
  mfa: ["Verify", "Verifying…"],
  newPassword: ["Set password and sign in", "Saving…"],
};

function failure(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

/**
 * The front door: most visitors should be looking at live data in one click, so the read-only demo comes first and
 * needs no sign-up. Anyone who wants to monitor their own site signs in on this page (email and password, or Google
 * and GitHub when the deployment has them) or creates an account here; each step swaps in place in the same panel.
 */
export function SignInPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get("next"));
  const local = isLocalAuth();
  const providers = socialProviders();
  const [view, setView] = useState<View>(params.get("mode") === "signup" ? "signup" : "signin");
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const panel = useRef<HTMLElement>(null);
  const shown = useRef(view);

  useEffect(() => {
    document.title = "RCP · Sign in";
    // A failed redirect sign-in left its reason behind; keep an earlier message if the effect runs twice.
    setError((current) => takeAuthError() ?? current);
  }, []);

  // Each step opens with its first field focused; the page itself opens as it always has.
  useEffect(() => {
    if (shown.current === view) return;
    shown.current = view;
    panel.current?.querySelector<HTMLElement>("form input")?.focus();
  }, [view]);

  function go(to: View, message: string | null = null) {
    setView(to);
    setError(null);
    setNotice(message);
    setCode("");
    setBusy(null);
  }

  async function run(label: Busy, action: () => Promise<void>, fallback: string) {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(failure(reason, fallback));
      setBusy(null);
    }
  }

  function arrive(step: SignInStep) {
    if (step === "signedIn") {
      rememberReturnPath(next);
      window.location.assign(next);
    }
    else go(step);
  }

  async function tryDemo() {
    await run("demo", async () => {
      await startDemoSession();
      rememberReturnPath(next);
      window.location.assign(next);
    }, "The demo could not be started");
  }

  async function social(provider: SocialProvider) {
    await run("social", () => socialLogin(provider, next), "Sign-in could not be started");
  }

  async function signIn() {
    if (local) return navigate(next, { replace: true });
    setBusy("submit");
    setError(null);
    try {
      arrive(await passwordSignIn(email, password));
    } catch (reason) {
      if ((reason as { code?: string }).code === "UserNotConfirmedException") {
        void resendSignUpCode(email).catch(() => undefined);
        go("confirm", "This email has not been confirmed yet. We sent you a new code.");
        return;
      }
      setError(failure(reason, "Sign-in failed. Try again."));
      setBusy(null);
    }
  }

  const submitters: Record<View, () => Promise<void>> = {
    signin: () => signIn(),
    signup: async () => {
      if (!local) await signUp(email, password);
      go("confirm");
    },
    confirm: async () => {
      if (local) return navigate(next, { replace: true });
      await confirmSignUp(email, code);
      await signIn();
    },
    forgot: async () => {
      if (!local) await startPasswordReset(email);
      go("reset", `If an account exists for ${email}, we sent a code.`);
    },
    reset: async () => {
      if (!local) await finishPasswordReset(email, code, password);
      setPassword("");
      go("signin", "Password updated. Sign in with the new one.");
    },
    mfa: async () => {
      arrive(await submitMfaCode(code));
    },
    newPassword: async () => {
      arrive(await submitNewPassword(password));
    },
  };

  const choosesPassword = view === "signup" || view === "reset" || view === "newPassword";

  // Said before anything is sent, so an empty or weak form never costs a round trip. Local mode skips it for design work.
  function problem(): string | null {
    if (local) return null;
    const needsEmail = view === "signin" || view === "signup" || view === "forgot";
    if (needsEmail && !email.trim()) return "Enter your email address.";
    if (view === "signin" && !password) return "Enter your password.";
    if (choosesPassword && !passwordMeetsPolicy(password)) return "The password does not meet every requirement listed.";
    if ((view === "confirm" || view === "reset" || view === "mfa") && code.length !== 6) return "Enter the 6-digit code.";
    return null;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const invalid = problem();
    if (invalid) {
      setError(invalid);
      return;
    }
    if (view === "signin") {
      void signIn();
      return;
    }
    void run("submit", submitters[view], "Something went wrong. Try again.");
  }

  async function resend() {
    await run("resend", async () => {
      if (!local) {
        if (view === "confirm") await resendSignUpCode(email);
        else await startPasswordReset(email);
      }
      setNotice(view === "confirm" ? `We sent a new code to ${email}.` : `If an account exists for ${email}, we sent a new code.`);
      setBusy(null);
    }, "The code could not be sent. Try again.");
  }

  const copy = COPY[view];
  const [idle, working] = SUBMIT_LABEL[view];

  return (
    <main className="signin">
      <section ref={panel} className="signin-panel" aria-labelledby="signin-title">
        <BrandMark />
        <h1 id="signin-title">{copy.title}</h1>
        <p className="signin-lede">{view === "confirm" ? `We sent a 6-digit code to ${email || "your email"}.` : copy.lede}</p>

        <div className="signin-messages" aria-live="polite" aria-atomic="true">
          {notice && <p className="signin-notice">{notice}</p>}
          {error && <p className="form-error">{error}</p>}
        </div>

        {view === "signin" && (
          <div className="signin-actions">
            <button type="button" className="button primary signin-demo" onClick={() => void tryDemo()} disabled={busy != null}>
              {busy === "demo" ? "Opening the demo…" : "Try the live demo"}
              <ArrowRight size={16} className="signin-go" aria-hidden="true" />
            </button>
          </div>
        )}

        {view === "signin" && (
          <>
            <p className="signin-divider"><span>or sign in</span></p>
            {providers.length > 0 && (
              <div className="signin-social">
                {providers.map((provider) => (
                  <button key={provider} type="button" className="button secondary" onClick={() => void social(provider)} disabled={busy != null}>
                    {provider === "Google" ? <GoogleMark /> : <GitHubMark />}
                    {provider}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <form className="signin-form" onSubmit={submit} noValidate>
          {(view === "signin" || view === "signup" || view === "forgot") && (
            <Field label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={setEmail} />
          )}
          {(view === "signin" || choosesPassword) && (
            <Field
              label={view === "reset" || view === "newPassword" ? "New password" : "Password"}
              type="password"
              autoComplete={view === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={setPassword}
            />
          )}
          {choosesPassword && <PasswordPolicy password={password} />}
          {(view === "confirm" || view === "reset" || view === "mfa") && (
            <Field label="6-digit code" className="signin-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]*" value={code} onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))} />
          )}
          <button type="submit" className={view === "signin" ? "button secondary" : "button primary"} disabled={busy != null}>
            {busy === "submit" ? working : idle}
          </button>
        </form>

        <div className="signin-links">
          {view === "signin" && (
            <>
              <button type="button" className="signin-link" onClick={() => go("signup")}>Create account</button>
              <button type="button" className="signin-link" onClick={() => go("forgot")}>Forgot password?</button>
            </>
          )}
          {(view === "confirm" || view === "reset") && (
            <button type="button" className="signin-link" onClick={() => void resend()} disabled={busy != null}>
              {busy === "resend" ? "Sending…" : view === "confirm" ? "Resend code" : "Send a new code"}
            </button>
          )}
          {view !== "signin" && (
            <button type="button" className="signin-link" onClick={() => go("signin")}>
              <ArrowLeft size={12} aria-hidden="true" />
              Back
            </button>
          )}
        </div>

        {view === "signin" && (
          <p className="signin-note">
            {local
              ? "Local profile: full access with a development identity."
              : "The demo is read-only and needs no account. Sign in for a private workspace to monitor your own sites."}
          </p>
        )}
      </section>

      <footer className="signin-footer">
        <DemoStatus />
        <a href="https://github.com/DrissiAli221/reliability-control-plane" target="_blank" rel="noreferrer">Source</a>
      </footer>
    </main>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
  autoComplete?: string;
  inputMode?: "email" | "numeric";
  maxLength?: number;
  pattern?: string;
};

function Field({ label, value, onChange, className, ...input }: FieldProps) {
  return (
    <label className={className ? `field ${className}` : "field"}>
      <span>{label}</span>
      <input {...input} value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} autoCapitalize="none" />
    </label>
  );
}

/** The pool's rules as a live checklist, so a rejected password is never the first anyone hears of them. */
function PasswordPolicy({ password }: { password: string }) {
  return (
    <ul className="signin-policy" aria-label="Password requirements">
      {passwordChecks(password).map((rule) => (
        <li key={rule.label} className={rule.met ? "met" : undefined}>
          <i aria-hidden="true" />
          {rule.label}
          <span className="sr-only">{rule.met ? " (met)" : " (not met yet)"}</span>
        </li>
      ))}
    </ul>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** One quiet line of what the demo is doing right now. */
function DemoStatus() {
  const now = useNow(30_000);
  const phase = drillPhase(now);
  return (
    <span className="signin-status">
      <StatusDot tone="good" />
      {phase.active
        ? "Demo live in 2 regions · drill scheduled now"
        : `Demo live in 2 regions · next drill ${utcClock(phase.nextStart)} UTC`}
    </span>
  );
}
