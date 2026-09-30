import { AlertTriangle, CheckCircle2, CircleHelp, CircleX } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicStatus } from "./api";
import { BrandMark } from "./components/AppShell";
import { Tracker } from "./components/Tracker";
import { absoluteTime, percent, type Tone } from "./format";
import type { PublicStatusPage } from "./types";

const REFRESH_INTERVAL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

const overall: Record<string, { title: string; detail: string; tone: Tone }> = {
  OPERATIONAL: { title: "All systems operational", detail: "Every component passed its latest check in all regions.", tone: "good" },
  DEGRADED: { title: "Degraded performance", detail: "A component failed its latest check in every region.", tone: "warn" },
  OUTAGE: { title: "Major outage", detail: "At least one component has an open incident.", tone: "fault" },
  UNKNOWN: { title: "Status unknown", detail: "Some components are paused, stale, or have inconclusive evidence.", tone: "muted" },
};

const component: Record<string, { label: string; tone: Tone }> = {
  OPERATIONAL: { label: "Operational", tone: "good" },
  DEGRADED: { label: "Degraded", tone: "warn" },
  OUTAGE: { label: "Outage", tone: "fault" },
  PAUSED: { label: "Paused", tone: "muted" },
  STALE: { label: "Stale", tone: "muted" },
  UNKNOWN: { label: "Unknown", tone: "muted" },
};

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "good") return <CheckCircle2 size={18} aria-hidden="true" />;
  if (tone === "warn") return <AlertTriangle size={18} aria-hidden="true" />;
  if (tone === "fault") return <CircleX size={18} aria-hidden="true" />;
  return <CircleHelp size={18} aria-hidden="true" />;
}

export function PublicStatus() {
  const { slug = "" } = useParams();
  const [page, setPage] = useState<PublicStatusPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let currentRequest: AbortController | null = null;
    setPage(null);
    setError(null);

    const refresh = () => {
      currentRequest?.abort();
      const request = new AbortController();
      currentRequest = request;
      const timeout = window.setTimeout(() => {
        request.abort();
        if (active && currentRequest === request) setError("Status page refresh timed out");
      }, REQUEST_TIMEOUT_MS);

      publicStatus(slug, request.signal)
        .then((result) => {
          if (!active || currentRequest !== request || request.signal.aborted) return;
          setPage(result);
          setError(null);
        })
        .catch((reason: unknown) => {
          if (!active || currentRequest !== request) return;
          setError(request.signal.aborted
            ? "Status page refresh timed out"
            : reason instanceof Error ? reason.message : "Status page unavailable");
        })
        .finally(() => window.clearTimeout(timeout));
    };

    refresh();
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
      currentRequest?.abort();
    };
  }, [slug]);

  // With nothing confirmed yet there is nothing honest to show but the error.
  if (error && !page) {
    return (
      <StatusFrame>
        <div className="status-banner muted" role="alert">
          <CircleHelp size={18} aria-hidden="true" />
          <div><strong>Status unavailable</strong><p>{error}</p></div>
        </div>
      </StatusFrame>
    );
  }
  if (!page) {
    return <StatusFrame><div className="status-banner loading"><div><p>Loading current status…</p></div></div></StatusFrame>;
  }

  // A failed refresh keeps the last confirmed data for context, but never presents it as current: the headline
  // says the refresh failed, components read "Last known", and the whole card is dimmed.
  const stale = error != null;
  const summary = overall[page.overallStatus] ?? overall.UNKNOWN;
  return (
    <StatusFrame name={page.name} generatedAt={page.generatedAt}>
      {stale ? (
        <div className="status-banner muted" role="alert">
          <CircleHelp size={18} aria-hidden="true" />
          <div>
            <strong>Couldn't refresh status</strong>
            <p>{error}. Showing the last confirmed status from {absoluteTime(page.generatedAt)}; it may be out of date.</p>
          </div>
        </div>
      ) : (
        <div className={`status-banner ${summary.tone}`}>
          <ToneIcon tone={summary.tone} />
          <div><strong>{summary.title}</strong><p>{summary.detail}</p></div>
        </div>
      )}

      <section className={`status-card${stale ? " stale" : ""}`} aria-label="Components">
        <header><h2>System status</h2><span>Last 45 days</span></header>
        {page.components.map((item) => {
          const current = component[item.status] ?? component.UNKNOWN;
          const state = stale ? { label: `Last known · ${current.label}`, tone: "muted" as const } : current;
          return (
            <article className="status-component" key={item.name}>
              <div className="status-component-head">
                <span className={`component-icon ${state.tone}`}><ToneIcon tone={state.tone} /></span>
                <strong>{item.name}</strong>
                <span className="status-component-meta">
                  {item.measuredUptimePercent != null && <span className="uptime">{percent(item.measuredUptimePercent, 2)} uptime</span>}
                  <span className={`component-state ${state.tone}`}>{state.label}</span>
                </span>
              </div>
              {item.history && item.history.length > 0 && (
                <>
                  <Tracker days={item.history} label={`${item.name}, last ${item.history.length} days`} />
                  <div className="tracker-axis"><span>{item.history.length} days ago</span><span>Today</span></div>
                </>
              )}
            </article>
          );
        })}
      </section>

      <p className="status-note">
        Status is derived from finalized checks that every probe region agreed on; paused or stale components are not
        currently measured. Uptime counts conclusive checks only.
      </p>
    </StatusFrame>
  );
}

function StatusFrame({ name, generatedAt, children }: { name?: string; generatedAt?: string; children: React.ReactNode }) {
  return (
    <div className="status-page">
      <main>
        <header className="status-header">
          <div className="status-brand"><BrandMark /><span>{name ?? "Service status"}</span></div>
          {generatedAt && <time dateTime={generatedAt}>Updated {absoluteTime(generatedAt)}</time>}
        </header>
        {children}
        <footer className="status-footer">Monitored by Reliability Control Plane · refreshes every 30 seconds</footer>
      </main>
    </div>
  );
}
