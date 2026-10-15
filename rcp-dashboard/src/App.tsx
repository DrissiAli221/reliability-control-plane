import { useEffect, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { completeLogin, logout } from "./auth";
import { AppShell, BrandMark } from "./components/AppShell";
import { MonitorDetailPage } from "./pages/MonitorDetailPage";
import { MonitorsPage } from "./pages/MonitorsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SignInPage } from "./pages/SignInPage";
import { OverviewPage } from "./pages/OverviewPage";
import { VisualGuidePage } from "./pages/VisualGuidePage";
import { PipelinePage } from "./pages/PipelinePage";
import { PublicStatus } from "./PublicStatus";

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    completeLogin()
      .then((next) => navigate(next, { replace: true }))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Sign-in failed"));
  }, [navigate]);

  return <CenteredMessage title="Completing sign-in" detail={error ?? "Validating the authorization response…"} />;
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
        <BrandMark />
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
      <Route path="/" element={<AppShell onLogout={() => void logout()}><OverviewPage /></AppShell>} />
      <Route path="/monitors" element={<AppShell onLogout={() => void logout()}><MonitorsPage /></AppShell>} />
      <Route path="/pipeline" element={<AppShell onLogout={() => void logout()}><PipelinePage /></AppShell>} />
      <Route path="/learn" element={<AppShell onLogout={() => void logout()}><VisualGuidePage /></AppShell>} />
      <Route path="/learn/:figure" element={<AppShell onLogout={() => void logout()}><VisualGuidePage /></AppShell>} />
      <Route path="/monitors/:monitorId" element={<AppShell onLogout={() => void logout()}><MonitorDetailPage /></AppShell>} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/public/:slug" element={<PublicStatus />} />
      <Route path="*" element={<AppShell onLogout={() => void logout()}><NotFoundPage /></AppShell>} />
    </Routes>
  );
}
