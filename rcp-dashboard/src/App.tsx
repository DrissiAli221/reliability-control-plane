import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { completeLogin, isLocalAuth, login, logout } from "./auth";
import { OperatorDashboard } from "./OperatorDashboard";
import { PublicStatus } from "./PublicStatus";

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    completeLogin()
      .then(() => navigate("/", { replace: true }))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Sign-in failed"));
  }, [navigate]);

  return <CenteredMessage title="Completing sign-in" detail={error ?? "Validating the authorization response…"} />;
}

function SignIn() {
  if (isLocalAuth()) return <Navigate to="/" replace />;
  return (
    <CenteredMessage title="Operator access" detail="Use the configured Cognito operator account to continue.">
      <button className="primary-button" onClick={() => void login()}>Sign in</button>
    </CenteredMessage>
  );
}

function CenteredMessage({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="centered-shell">
      <section className="message-card">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
        <p className="eyebrow">Reliability control plane</p>
        <h1>{title}</h1>
        <p>{detail}</p>
        {children}
      </section>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<OperatorDashboard onLogout={() => void logout()} />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/public/:slug" element={<PublicStatus />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
