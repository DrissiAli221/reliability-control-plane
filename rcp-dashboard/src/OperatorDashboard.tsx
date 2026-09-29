import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { availability, createMonitor, listMonitors, setMonitorEnabled } from "./api";
import { isLocalAuth } from "./auth";
import { EvidenceRail } from "./components/EvidenceRail";
import { DownloadReportButton } from "./components/DownloadReportButton";
import { MonitorToggleButton } from "./components/MonitorToggleButton";
import type { AvailabilityReport, CreateMonitorInput, MonitorOverview } from "./types";

type LoadState = "loading" | "ready" | "error";
const telemetryUrl = import.meta.env.VITE_GRAFANA_URL ?? (import.meta.env.DEV ? "http://localhost:3000/d/rcp-overview/rcp-overview" : null);

export function OperatorDashboard({ onLogout }: { onLogout: () => void }) {
  const [monitors, setMonitors] = useState<MonitorOverview[]>([]);
  const [reports, setReports] = useState<Record<string, AvailabilityReport>>({});
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const loaded = await listMonitors();
      setMonitors(loaded);
      setState("ready");
      const settled = await Promise.allSettled(loaded.map((monitor) => availability(monitor.id)));
      const nextReports: Record<string, AvailabilityReport> = {};
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") nextReports[loaded[index].id] = result.value;
      });
      setReports(nextReports);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Dashboard data could not be loaded";
      if (message === "Sign in to continue") window.location.assign("/signin");
      setError(message);
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => ({
    total: monitors.length,
    open: monitors.filter((monitor) => monitor.incidentStatus === "OPEN").length,
    disagreement: monitors.filter((monitor) => monitor.latestVerdict === "DISAGREEMENT").length,
    noEvidence: monitors.filter((monitor) => !monitor.latestVerdict).length,
  }), [monitors]);

  async function handleCreated(input: CreateMonitorInput) {
    await createMonitor(input);
    setShowCreate(false);
    await load();
  }

  async function handleToggle(monitor: MonitorOverview) {
    await setMonitorEnabled(monitor.id, !monitor.enabled);
    await load();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div><strong>RCP</strong><small>Operator console</small></div>
        </div>
        <nav aria-label="Primary navigation">
          <a className="active" href="#fleet"><span>01</span> Monitor fleet</a>
          <a href="#evidence"><span>02</span> Evidence</a>
          {telemetryUrl && <a href={telemetryUrl} target="_blank" rel="noreferrer"><span>↗</span> System telemetry</a>}
        </nav>
        <div className="sidebar-note">
          <span className="pulse-dot" />
          <p><strong>Control plane</strong>Central decisions · regional evidence</p>
        </div>
        {isLocalAuth()
          ? <span className="local-identity">Local development identity</span>
          : <button className="text-button" onClick={onLogout}>End operator session</button>}
      </aside>

      <main className="dashboard" id="fleet">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Reliability posture · last 7 days</p>
            <h1>Monitor fleet</h1>
            <p className="header-copy">Separate outages from uncertain evidence before taking action.</p>
          </div>
          <div className="header-actions">
            <button className="secondary-button" onClick={() => void load()}>Refresh evidence</button>
            <button className="primary-button" onClick={() => setShowCreate(true)}>Add monitor</button>
          </div>
        </header>

        <section className="posture-strip" aria-label="Fleet posture">
          <PostureCell label="Monitors" value={summary.total} tone="neutral" />
          <PostureCell label="Open incidents" value={summary.open} tone={summary.open ? "fault" : "good"} />
          <PostureCell label="Regional disagreement" value={summary.disagreement} tone={summary.disagreement ? "warn" : "good"} />
          <PostureCell label="Awaiting evidence" value={summary.noEvidence} tone={summary.noEvidence ? "muted" : "good"} />
        </section>

        {state === "loading" && monitors.length === 0 && <LoadingRows />}
        {state === "error" && <ErrorPanel message={error ?? "Dashboard data could not be loaded"} retry={load} />}
        {state === "ready" && monitors.length === 0 && <EmptyFleet onCreate={() => setShowCreate(true)} />}
        {monitors.length > 0 && (
          <section className="fleet-table" id="evidence" aria-label="Monitor evidence">
            <div className="fleet-heading fleet-row">
              <span>Target</span><span>Current state</span><span>7-day evidence</span><span>Next check</span>
            </div>
            {monitors.map((monitor) => <MonitorRow key={monitor.id} monitor={monitor} report={reports[monitor.id]} onToggle={() => handleToggle(monitor)} />)}
          </section>
        )}
        <footer className="method-note">
          <span>Measurement rule</span>
          <p>Availability uses conclusive UP and DOWN executions. Disagreement, pending checks, and unscheduled due slots reduce evidence coverage; paused periods create no expected checks. An SLO decision needs at least 95% coverage.</p>
        </footer>
      </main>

      {showCreate && <CreateMonitorDialog onClose={() => setShowCreate(false)} onCreate={handleCreated} />}
    </div>
  );
}

function PostureCell({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`posture-cell ${tone}`}><span>{label}</span><strong>{String(value).padStart(2, "0")}</strong></div>;
}

function MonitorRow({ monitor, report, onToggle }: { monitor: MonitorOverview; report?: AvailabilityReport; onToggle: () => Promise<void> }) {
  const state = monitor.incidentStatus === "OPEN" ? "Incident open" : verdictLabel(monitor.latestVerdict);
  const tone = monitor.incidentStatus === "OPEN" || monitor.latestVerdict === "DOWN" ? "fault"
    : monitor.latestVerdict === "DISAGREEMENT" ? "warn"
      : monitor.latestVerdict === "UP" ? "good" : "muted";
  return (
    <article className="fleet-row monitor-row">
      <div className="target-cell">
        <span className={`target-beacon ${tone}`} aria-hidden="true" />
        <div><strong>{monitor.name}</strong><a href={monitor.targetUrl} target="_blank" rel="noreferrer">{compactUrl(monitor.targetUrl)}</a><DownloadReportButton monitorId={monitor.id} /><MonitorToggleButton enabled={monitor.enabled} onToggle={onToggle} /></div>
      </div>
      <div className="state-cell"><span className={`state-chip ${tone}`}>{state}</span><small>{relativeTime(monitor.latestCheckedAt)}</small></div>
      <div>{report ? <EvidenceRail report={report} /> : <span className="waiting-copy">Collecting finalized checks…</span>}</div>
      <div className="next-check"><strong>{monitor.enabled ? relativeTime(monitor.nextCheckAt, true) : "Paused"}</strong><small>{monitor.enabled ? "scheduler due time" : "monitor disabled"}</small></div>
    </article>
  );
}

function CreateMonitorDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (input: CreateMonitorInput) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await onCreate({
        name: String(data.get("name")),
        targetUrl: String(data.get("targetUrl")),
        checkIntervalSeconds: Number(data.get("checkIntervalSeconds")),
        timeoutMs: Number(data.get("timeoutMs")),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Monitor could not be created");
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <button className="dialog-close" onClick={onClose} aria-label="Close">×</button>
        <p className="eyebrow">New HTTP(S) target</p><h2 id="create-title">Add a monitor</h2>
        <p className="dialog-intro">The control plane validates the destination before any regional worker receives a job.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label>Name<input name="name" required maxLength={120} placeholder="Checkout API" /></label>
          <label>Target URL<input name="targetUrl" required type="url" placeholder="https://api.example.com/health" /></label>
          <div className="field-pair">
            <label>Check every<select name="checkIntervalSeconds" defaultValue="60"><option value="30">30 seconds</option><option value="60">1 minute</option><option value="300">5 minutes</option></select></label>
            <label>Timeout<select name="timeoutMs" defaultValue="5000"><option value="2000">2 seconds</option><option value="5000">5 seconds</option><option value="10000">10 seconds</option></select></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Adding…" : "Add monitor"}</button></div>
        </form>
      </section>
    </div>
  );
}

function EmptyFleet({ onCreate }: { onCreate: () => void }) {
  return <section className="empty-fleet"><div className="empty-grid" aria-hidden="true" /><p className="eyebrow">No targets yet</p><h2>Your evidence stream starts with one URL.</h2><p>Add a public HTTP(S) health endpoint. The scheduler will create regional probe jobs after the target passes safety policy.</p><button className="primary-button" onClick={onCreate}>Add first monitor</button></section>;
}

function ErrorPanel({ message, retry }: { message: string; retry: () => Promise<void> }) {
  return <section className="error-panel" role="alert"><p className="eyebrow">Data unavailable</p><h2>The control plane did not answer.</h2><p>{message}</p><button className="secondary-button" onClick={() => void retry()}>Try again</button></section>;
}

function LoadingRows() {
  return <section className="fleet-table loading-table" aria-label="Loading monitors">{[0, 1, 2].map((value) => <div className="skeleton" key={value} />)}</section>;
}

function verdictLabel(verdict: MonitorOverview["latestVerdict"]): string {
  return ({ UP: "Operational", DOWN: "Probe failed", DISAGREEMENT: "Regions disagree", NO_DATA: "No data", null: "Awaiting evidence" } as const)[String(verdict) as "UP" | "DOWN" | "DISAGREEMENT" | "NO_DATA" | "null"];
}

function relativeTime(value: string | null, future = false): string {
  if (!value) return "No completed check";
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const absolute = Math.abs(seconds);
  if (absolute < 60) return formatter.format(seconds, "second");
  if (absolute < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (absolute < 86_400) return formatter.format(Math.round(seconds / 3600), "hour");
  return future ? formatter.format(Math.round(seconds / 86_400), "day") : new Date(value).toLocaleDateString();
}

function compactUrl(value: string): string {
  try { const url = new URL(value); return `${url.host}${url.pathname === "/" ? "" : url.pathname}`; } catch { return value; }
}
