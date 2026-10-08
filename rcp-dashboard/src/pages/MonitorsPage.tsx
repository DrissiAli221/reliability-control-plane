import { ArrowUpRight, Download, Pause, Play, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { availability, createMonitor, listMonitors, monitorHistory, setMonitorEnabled } from "../api";
import { ActionMenu } from "../components/ActionMenu";
import { RollingText } from "../components/RollingText";
import { RowPreview } from "../components/RowPreview";
import { CreateMonitorDialog } from "../components/CreateMonitorDialog";
import { DrillLine, DrillTag } from "../components/Drill";
import { isDrillMonitor } from "../drill";
import { LiveLed, StatusBadge, StatusDot } from "../components/StatusBadge";
import { downloadReport } from "../reportDownload";
import { Tracker } from "../components/Tracker";
import { compactUrl, milliseconds, monitorState, percent, relativeTime, type Tone } from "../format";
import type { AvailabilityReport, CreateMonitorInput, MonitorHistory, MonitorOverview } from "../types";
import { useReadOnly } from "../session";
import { useLiveData, useNow } from "../useLiveData";

const TRACKER_DAYS = 30;

type FleetRow = {
  monitor: MonitorOverview;
  availability?: AvailabilityReport;
  history?: MonitorHistory;
};

type Filter = "all" | "incident" | "attention" | "paused";

async function loadFleet(): Promise<FleetRow[]> {
  const monitors = await listMonitors();
  return Promise.all(monitors.map(async (monitor) => {
    const [report, history] = await Promise.allSettled([
      availability(monitor.id),
      monitorHistory(monitor.id, TRACKER_DAYS),
    ]);
    return {
      monitor,
      availability: report.status === "fulfilled" ? report.value : undefined,
      history: history.status === "fulfilled" ? history.value : undefined,
    };
  }));
}

export function MonitorsPage() {
  const fleet = useLiveData(loadFleet);
  const now = useNow();
  const navigate = useNavigate();
  const readOnly = useReadOnly();
  const [params, setParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(() => params.get("create") === "1");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const previousStates = useRef<Map<string, string> | null>(null);
  const changed = new Set(
    previousStates.current
      ? (fleet.data ?? [])
        .filter(({ monitor }) => {
          const before = previousStates.current!.get(monitor.id);
          return before != null && before !== monitorState(monitor).label;
        })
        .map(({ monitor }) => monitor.id)
      : [],
  );

  // "Create monitor" from the command palette or the C shortcut arrives as ?create=1; consume it once.
  useEffect(() => {
    if (params.get("create") !== "1") return;
    if (!readOnly) setShowCreate(true);
    setParams({}, { replace: true });
  }, [params, setParams, readOnly]);

  useEffect(() => {
    if (fleet.data) previousStates.current = new Map(fleet.data.map(({ monitor }) => [monitor.id, monitorState(monitor).label]));
  }, [fleet.data]);

  const rows = useMemo(() => fleet.data ?? [], [fleet.data]);
  const summary = useMemo(() => {
    const enabled = rows.filter(({ monitor }) => monitor.enabled);
    return {
      total: rows.length,
      operational: enabled.filter(({ monitor }) => monitor.incidentStatus !== "OPEN" && monitor.latestVerdict === "UP").length,
      incidents: rows.filter(({ monitor }) => monitor.incidentStatus === "OPEN").length,
      attention: enabled.filter(({ monitor }) => monitor.incidentStatus !== "OPEN"
        && (monitor.latestVerdict === "DISAGREEMENT" || monitor.latestVerdict === "NO_DATA" || monitor.latestVerdict === "DOWN")).length,
      paused: rows.length - enabled.length,
    };
  }, [rows]);

  const visible = rows.filter(({ monitor }) => {
    const matches = `${monitor.name} ${monitor.targetUrl}`.toLowerCase().includes(query.trim().toLowerCase());
    if (!matches) return false;
    switch (filter) {
      case "incident": return monitor.incidentStatus === "OPEN";
      case "attention": return monitor.enabled && monitor.incidentStatus !== "OPEN" && monitor.latestVerdict !== "UP";
      case "paused": return !monitor.enabled;
      default: return true;
    }
  });

  async function handleCreate(input: CreateMonitorInput) {
    const created = await createMonitor(input);
    setShowCreate(false);
    navigate(`/monitors/${created.id}`);
  }

  async function runAction(action: () => Promise<void>, failure: string) {
    setNotice(null);
    try {
      await action();
      await fleet.refresh();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : failure);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Monitors</h1>
          <p><strong>HTTP(S) targets, checked from every region.</strong> A verdict needs the regions to agree.</p>
        </div>
        <div className="page-actions">
          <LiveIndicator updatedAt={fleet.updatedAt} now={now} error={fleet.error} />
          <button type="button" className="icon-button bordered" onClick={() => void fleet.refresh()} aria-label="Refresh" disabled={fleet.loading}>
            <RefreshCw size={15} className={fleet.loading ? "spin" : undefined} />
          </button>
          {!readOnly && (
            <button type="button" className="button primary" onClick={() => setShowCreate(true)}>
              <Plus size={15} aria-hidden="true" /> Create monitor
            </button>
          )}
        </div>
      </header>

      <section className="metric-grid fleet-summary" aria-label="Fleet summary">
        <Metric label="Operational" value={`${summary.operational}`} suffix={`/ ${summary.total - summary.paused}`} tone="good"
          visual={<FleetCells rows={rows} lit={(monitor) => monitor.enabled && monitor.incidentStatus !== "OPEN" && monitor.latestVerdict === "UP"} tone="good" />} />
        <Metric label="Open incidents" value={`${summary.incidents}`} tone={summary.incidents ? "fault" : "muted"}
          visual={<FleetCells rows={rows} lit={(monitor) => monitor.incidentStatus === "OPEN"} tone="fault" />} />
        <Metric label="Needs attention" value={`${summary.attention}`} hint="Down, disagreement or no data" tone={summary.attention ? "warn" : "muted"}
          visual={<FleetCells rows={rows} lit={(monitor) => monitor.enabled && monitor.incidentStatus !== "OPEN" && monitor.latestVerdict !== "UP" && monitor.latestVerdict !== null} tone="warn" />} />
        <Metric label="Paused" value={`${summary.paused}`} tone="muted"
          visual={<FleetCells rows={rows} lit={(monitor) => !monitor.enabled} tone="muted" />} />
      </section>

      {notice && <p className="notice fault" role="alert">{notice}</p>}

      <section className="panel">
        <div className="toolbar">
          <label className="search">
            <Search size={14} aria-hidden="true" />
            <input type="search" placeholder="Filter by name or URL" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Filter monitors" />
          </label>
          <div className="segmented" role="group" aria-label="Status filter">
            {([["all", "All"], ["incident", "Incidents"], ["attention", "Attention"], ["paused", "Paused"]] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
        </div>

        {fleet.error && !fleet.data && <ErrorState message={fleet.error} retry={fleet.refresh} />}
        {!fleet.data && !fleet.error && <SkeletonRows />}
        {fleet.data && rows.length === 0 && <EmptyState onCreate={readOnly ? undefined : () => setShowCreate(true)} />}
        {fleet.data && rows.length > 0 && (
          <div className="table-scroll">
            <table className="table fleet">
              <thead>
                <tr>
                  <th scope="col">Monitor</th>
                  <th scope="col" className="col-status">Status</th>
                  <th scope="col" className="col-tracker">Last {TRACKER_DAYS} days</th>
                  <th scope="col" className="num">Uptime 7d</th>
                  <th scope="col" className="num col-latency">p50 · p95</th>
                  <th scope="col" className="num col-last">Last check</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => (
                  <FleetTableRow
                    key={row.monitor.id}
                    row={row}
                    now={now}
                    index={index}
                    changed={changed.has(row.monitor.id)}
                    onOpen={() => navigate(`/monitors/${row.monitor.id}`)}
                    readOnly={readOnly}
                    onToggle={() => void runAction(() => setMonitorEnabled(row.monitor.id, !row.monitor.enabled), "Monitor could not be updated")}
                    onDownload={() => void runAction(() => downloadReport(row.monitor.id, row.monitor.name), "The report could not be downloaded")}
                  />
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan={7} className="table-empty">No monitors match this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="footnote">
        Uptime counts conclusive checks only (every region agreed). Coverage shows how many expected checks produced a
        conclusive verdict; below 95% the SLO is reported as unproven rather than met.
      </p>

      {showCreate && <CreateMonitorDialog onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
    </>
  );
}

function FleetTableRow({ row, now, index, changed, readOnly, onOpen, onToggle, onDownload }: {
  row: FleetRow;
  readOnly: boolean;
  now: number;
  index: number;
  changed: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onDownload: () => void;
}) {
  const { monitor, availability: report, history } = row;
  const state = monitorState(monitor);
  const latency = aggregateLatency(history);
  const drill = isDrillMonitor(monitor.targetUrl);
  const [preview, setPreview] = useState<DOMRect | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  // A short hover delay keeps the preview from flickering while the pointer crosses the table.
  function hoverStart(event: React.MouseEvent<HTMLTableRowElement>) {
    const row = event.currentTarget;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setPreview(row.getBoundingClientRect()), 380);
  }
  function hoverEnd() {
    window.clearTimeout(hoverTimer.current);
    setPreview(null);
  }

  useEffect(() => {
    if (!preview) return;
    window.addEventListener("scroll", hoverEnd, true);
    return () => window.removeEventListener("scroll", hoverEnd, true);
  }, [preview]);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  return (
    <tr
      onMouseEnter={hoverStart}
      onMouseLeave={hoverEnd}
      className={`row-link${changed ? ` status-changed ${state.tone}` : ""}`}
      tabIndex={0}
      style={{ animationDelay: `${index * 35}ms` }}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === "Enter") onOpen(); }}
      aria-label={`Open ${monitor.name}`}
    >
      <td>
        <div className="monitor-cell">
          <StatusDot tone={state.tone} pulse={state.tone === "fault"} />
          <div>
            <strong>{monitor.name}{drill && <DrillTag />}</strong>
            <span className="mono subtle">{compactUrl(monitor.targetUrl)}</span>
            {drill && monitor.enabled && <DrillLine now={now} />}
          </div>
        </div>
      </td>
      <td className="col-status"><StatusBadge label={state.label} tone={state.tone} /></td>
      <td className="col-tracker">
        {history ? <Tracker days={history.days} size="compact" label={`${monitor.name}, last ${TRACKER_DAYS} days`} /> : <span className="subtle">—</span>}
      </td>
      <td className="num">
        <div className="stacked">
          <span className="mono">{percent(report?.measuredAvailabilityPercent)}</span>
          {report && <CoverageNote report={report} />}
        </div>
      </td>
      <td className="num col-latency mono" title="Slowest region, HTTP responses in the last 24 h">{latency}</td>
      <td className="num col-last">
        <span className="subtle" title={monitor.latestCheckedAt ?? undefined}>{monitor.enabled ? relativeTime(monitor.latestCheckedAt, now) : "Paused"}</span>
      </td>
      <td className="actions">
        {preview && history && <RowPreview history={history} now={now} anchor={preview} />}
        <ActionMenu
          label={`Actions for ${monitor.name}`}
          actions={[
            { label: "Open details", icon: <ArrowUpRight size={14} />, onSelect: onOpen },
            ...(readOnly ? [] : [{ label: monitor.enabled ? "Pause checks" : "Resume checks", icon: monitor.enabled ? <Pause size={14} /> : <Play size={14} />, onSelect: onToggle }]),
            { label: "Download 7-day report", icon: <Download size={14} />, onSelect: onDownload },
          ]}
        />
      </td>
    </tr>
  );
}

/** One square per monitor, lit when that monitor belongs to the card's category. */
function FleetCells({ rows, lit, tone }: { rows: FleetRow[]; lit: (monitor: MonitorOverview) => boolean; tone: Tone }) {
  return (
    <div className="fleet-cells" aria-hidden="true">
      {rows.map(({ monitor }) => <i key={monitor.id} className={lit(monitor) ? tone : undefined} title={monitor.name} />)}
    </div>
  );
}

export function CoverageNote({ report }: { report: AvailabilityReport }) {
  const sufficient = report.evidenceCoveragePercent >= report.minimumEvidenceCoveragePercent;
  return (
    <span className={`coverage ${sufficient ? "" : "low"}`} title="Share of expected checks with a conclusive verdict">
      {percent(report.evidenceCoveragePercent, 1)} coverage
    </span>
  );
}

function aggregateLatency(history?: MonitorHistory): string {
  const regions = history?.regions.filter((region) => region.p50Ms != null) ?? [];
  if (regions.length === 0) return "—";
  const p50 = Math.max(...regions.map((region) => region.p50Ms ?? 0));
  const p95 = Math.max(...regions.map((region) => region.p95Ms ?? 0));
  return `${milliseconds(p50)} · ${milliseconds(p95)}`;
}

export function Metric({ label, value, suffix, hint, tone, explain, visual }: {
  label: string;
  value: string;
  suffix?: string;
  hint?: string;
  tone: Tone;
  explain?: ReactNode;
  visual?: ReactNode;
}) {
  // Healthy and idle cards stay neutral; attention and informational readouts carry a faint hue.
  const attention = tone === "fault" || tone === "warn" || tone === "info";
  return (
    <div className={`metric${attention ? ` attention ${tone}` : ""}`}>
      <span className="metric-label"><StatusDot tone={tone} />{label}{explain}</span>
      <span className="metric-value"><RollingText value={value} />{suffix && <small>{suffix}</small>}</span>
      {visual && <div className="metric-visual">{visual}</div>}
      {hint && <span className="metric-hint">{hint}</span>}
    </div>
  );
}

export function LiveIndicator({ updatedAt, now, error }: { updatedAt: number | null; now: number; error: string | null }) {
  if (error && updatedAt) {
    return <span className="live stale" title={error}><LiveLed updatedAt={null} tone="warn" /><span>Refresh failed · data from <span className="live-age">{relativeTime(new Date(updatedAt).toISOString(), now)}</span></span></span>;
  }
  if (!updatedAt) return null;
  return <span className="live"><LiveLed updatedAt={updatedAt} /><span>Live · updated <span className="live-age">{relativeTime(new Date(updatedAt).toISOString(), now)}</span></span></span>;
}

function SkeletonRows() {
  return <div className="skeletons" aria-label="Loading monitors">{[0, 1, 2].map((key) => <div className="skeleton" key={key} />)}</div>;
}

function EmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="empty">
      <p className="dot-glyph small" aria-hidden="true">0</p>
      <h2>No monitors yet</h2>
      <p>Add a public HTTP(S) endpoint. Each check runs in every region, and the control plane only calls it down when the regions agree.</p>
      {onCreate && <button type="button" className="button primary" onClick={onCreate}><Plus size={15} aria-hidden="true" /> Create monitor</button>}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry: () => Promise<void> }) {
  return (
    <div className="empty" role="alert">
      <h2>The control plane did not answer</h2>
      <p>{message}</p>
      <button type="button" className="button secondary" onClick={() => void retry()}>Try again</button>
    </div>
  );
}
