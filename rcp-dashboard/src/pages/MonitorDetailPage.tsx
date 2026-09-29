import { AlertTriangle, ChevronLeft, ExternalLink, Info, PauseCircle, RefreshCw } from "lucide-react";
import { useCallback } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  availability, executionTrace, getMonitor, listMonitors, monitorHistory, reliabilityReport, setMonitorEnabled,
} from "../api";
import { isLocalAuth } from "../auth";
import { DownloadReportButton } from "../components/DownloadReportButton";
import { EvidenceRail } from "../components/EvidenceRail";
import { MonitorToggleButton } from "../components/MonitorToggleButton";
import { StatusBadge, StatusDot } from "../components/StatusBadge";
import { TraceView } from "../components/TraceView";
import { Tracker } from "../components/Tracker";
import {
  absoluteTime, compactUrl, count, interval, milliseconds, monitorState, outcomeLabel, outcomeTone, percent,
  relativeTime, verdictState,
} from "../format";
import type { AvailabilityReport, MonitorDetail, MonitorHistory, MonitorOverview, ReliabilityReport } from "../types";
import { useLiveData, useNow } from "../useLiveData";
import { CoverageNote, ErrorState, LiveIndicator, Metric } from "./MonitorsPage";

const HISTORY_DAYS = 45;
const INCIDENT_LIMIT = 5;

type DetailData = {
  monitor: MonitorDetail;
  overview?: MonitorOverview;
  history?: MonitorHistory;
  availability?: AvailabilityReport;
  report?: ReliabilityReport;
};

export function MonitorDetailPage() {
  const { monitorId = "" } = useParams();
  const load = useCallback(async (): Promise<DetailData> => {
    const monitor = await getMonitor(monitorId);
    const [overviews, history, report7d, report] = await Promise.allSettled([
      listMonitors(),
      monitorHistory(monitorId, HISTORY_DAYS),
      availability(monitorId),
      reliabilityReport(monitorId),
    ]);
    return {
      monitor,
      overview: overviews.status === "fulfilled" ? overviews.value.find((item) => item.id === monitorId) : undefined,
      history: history.status === "fulfilled" ? history.value : undefined,
      availability: report7d.status === "fulfilled" ? report7d.value : undefined,
      report: report.status === "fulfilled" ? report.value : undefined,
    };
  }, [monitorId]);
  const detail = useLiveData(load, 10_000);
  const now = useNow();
  const [params, setParams] = useSearchParams();

  if (!detail.data) {
    return (
      <>
        <Breadcrumb name="Loading…" />
        {detail.error ? <ErrorState message={detail.error} retry={detail.refresh} /> : <div className="skeletons"><div className="skeleton tall" /><div className="skeleton" /></div>}
      </>
    );
  }

  const { monitor, overview, history, availability: evidence, report } = detail.data;
  const selectedCheck = params.get("check") ?? history?.recentChecks[0]?.executionId ?? null;
  const selectCheck = (executionId: string) => setParams({ check: executionId }, { replace: true });
  const state = overview ? monitorState(overview) : { label: monitor.enabled ? "Awaiting evidence" : "Paused", tone: "muted" as const };
  const incidents = pairIncidents(report);
  const ongoing = incidents.find((incident) => !incident.resolvedAt);

  async function toggle() {
    await setMonitorEnabled(monitor.id, !monitor.enabled);
    await detail.refresh();
  }

  return (
    <>
      <Breadcrumb name={monitor.name} />

      <header className="page-header detail-header">
        <div>
          <div className="title-row">
            <StatusDot tone={state.tone} pulse={state.tone === "fault"} />
            <h1>{monitor.name}</h1>
            <StatusBadge label={state.label} tone={state.tone} />
          </div>
          <div className="meta-row">
            <a className="mono" href={monitor.targetUrl} target="_blank" rel="noreferrer">
              {compactUrl(monitor.targetUrl)} <ExternalLink size={12} aria-hidden="true" />
            </a>
            <span>Every {interval(monitor.checkIntervalSeconds)}</span>
            <span>Timeout {monitor.timeoutMs / 1000} s</span>
            <span>{history?.regions.length ?? 0} regions</span>
          </div>
        </div>
        <div className="page-actions">
          <LiveIndicator updatedAt={detail.updatedAt} now={now} error={detail.error} />
          <button type="button" className="icon-button bordered" onClick={() => void detail.refresh()} aria-label="Refresh" disabled={detail.loading}>
            <RefreshCw size={15} className={detail.loading ? "spin" : undefined} />
          </button>
          <MonitorToggleButton enabled={monitor.enabled} onToggle={toggle} />
          <DownloadReportButton monitorId={monitor.id} />
        </div>
      </header>

      {overview?.incidentStatus === "OPEN" && (
        <div className="banner fault" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <strong>Incident open</strong>
            <p>
              Consecutive checks were DOWN in every region.
              {ongoing?.openedAt && <> Opened {relativeTime(ongoing.openedAt, now)} ({absoluteTime(ongoing.openedAt)}).</>}
              {" "}It resolves after consecutive UP checks.
            </p>
          </div>
        </div>
      )}
      {!monitor.enabled && (
        <div className="banner muted" role="status">
          <PauseCircle size={16} aria-hidden="true" />
          <div>
            <strong>Checks paused</strong>
            <p>No new jobs are scheduled. Paused time creates no expected checks, so it does not lower coverage.</p>
          </div>
        </div>
      )}

      <section className="metric-grid" aria-label="Seven-day summary">
        <Metric
          label="Uptime · 7d"
          value={percent(evidence?.measuredAvailabilityPercent, 3)}
          hint={evidence ? `${percent(evidence.evidenceCoveragePercent, 1)} of expected checks were conclusive` : undefined}
          tone={evidence?.measuredAvailabilityPercent == null ? "muted" : evidence.measuredAvailabilityPercent >= evidence.sloTargetPercent ? "good" : "fault"}
        />
        <SloMetric report={evidence} />
        <Metric
          label="Latency · 7d"
          value={report?.latency.p50Ms != null ? milliseconds(report.latency.p50Ms) : "—"}
          suffix={report?.latency.p95Ms != null ? `p95 ${milliseconds(report.latency.p95Ms)}` : undefined}
          hint={report ? (report.latency.p50Ms != null ? `p50 of ${count(report.latency.sampleCount)} HTTP responses` : `Needs ${report.latency.minimumSamples} HTTP responses`) : undefined}
          tone="info"
        />
        <Metric
          label="Error budget · 7d"
          value={report ? count(report.errorBudget.observedBadExecutions) : "—"}
          suffix={report ? `/ ${Number(report.errorBudget.allowedBadExecutions).toFixed(1)} allowed` : undefined}
          hint={report ? `Confirmed DOWN checks vs. allowed at ${report.availability.sloTargetPercent}%` : undefined}
          tone={report && report.errorBudget.remainingExecutions < 0 ? "fault" : "good"}
        />
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Availability</h2>
          <span className="subtle">Last {HISTORY_DAYS} days · UTC</span>
        </header>
        <div className="panel-body">
          {history ? (
            <>
              <Tracker days={history.days} label={`${monitor.name}, last ${HISTORY_DAYS} days`} />
              <div className="tracker-axis"><span>{HISTORY_DAYS} days ago</span><span>Today</span></div>
              <ul className="tracker-legend">
                <li><i className="operational" />Operational</li>
                <li><i className="degraded" />Regions disagreed</li>
                <li><i className="outage" />Confirmed downtime</li>
                <li><i className="no_data" />No data</li>
              </ul>
            </>
          ) : <p className="subtle">History unavailable.</p>}
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Recent checks</h2>
          <span className="subtle">Select a check to trace it</span>
        </header>
        {history && history.recentChecks.length > 0 ? (
          <div className="table-scroll">
            <table className="table compact">
              <thead>
                <tr>
                  <th scope="col">Scheduled</th>
                  <th scope="col">Verdict</th>
                  {history.regions.map((region) => <th scope="col" key={region.region} className="mono">{region.region}</th>)}
                </tr>
              </thead>
              <tbody>
                {history.recentChecks.map((check) => {
                  const verdict = verdictState(check.verdict);
                  const selected = check.executionId === selectedCheck;
                  return (
                    <tr
                      key={check.executionId}
                      className={`row-link${selected ? " selected" : ""}`}
                      tabIndex={0}
                      aria-selected={selected}
                      onClick={() => selectCheck(check.executionId)}
                      onKeyDown={(event) => { if (event.key === "Enter") selectCheck(check.executionId); }}
                    >
                      <td><time className="subtle" dateTime={check.scheduledAt} title={absoluteTime(check.scheduledAt)}>{relativeTime(check.scheduledAt, now)}</time></td>
                      <td><StatusBadge label={verdict.label} tone={verdict.tone} /></td>
                      {history.regions.map((region) => {
                        const result = check.results.find((item) => item.region === region.region);
                        return (
                          <td key={region.region} className="mono">
                            {result ? (
                              <>
                                <span className={`result ${outcomeTone(result.outcome, result.httpStatus)}`}>{outcomeLabel(result.outcome, result.httpStatus)}</span>
                                <span className="subtle"> {milliseconds(result.latencyMs)}</span>
                              </>
                            ) : <span className="subtle">no result</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="panel-body subtle">No finalized checks yet.</p>}
        {selectedCheck && <CheckTrace monitorId={monitor.id} executionId={selectedCheck} />}
      </section>

      <div className="split">
        <section className="panel">
          <header className="panel-header">
            <h2>Regions</h2>
            <span className="subtle">Last 24 h {isLocalAuth() && <span className="env-pill">Simulated</span>}</span>
          </header>
          {history && history.regions.length > 0 ? (
            <table className="table compact">
              <thead>
                <tr><th scope="col">Region</th><th scope="col">Last result</th><th scope="col" className="num">p50</th><th scope="col" className="num">p95</th><th scope="col" className="num">Samples</th></tr>
              </thead>
              <tbody>
                {history.regions.map((region) => (
                  <tr key={region.region}>
                    <td className="mono">{region.region}</td>
                    <td>
                      <span className={`result ${outcomeTone(region.lastOutcome, region.lastHttpStatus)}`}>
                        {outcomeLabel(region.lastOutcome, region.lastHttpStatus)}
                      </span>
                      <span className="subtle mono"> {milliseconds(region.lastLatencyMs)}</span>
                    </td>
                    <td className="num mono">{milliseconds(region.p50Ms)}</td>
                    <td className="num mono">{milliseconds(region.p95Ms)}</td>
                    <td className="num mono subtle">{count(region.httpSamples)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="panel-body subtle">No regional results in the last 24 hours.</p>}
        </section>

        <section className="panel">
          <header className="panel-header">
            <h2>Evidence</h2>
            <span className="subtle">Last 7 days</span>
          </header>
          <div className="panel-body">
            {evidence ? (
              <>
                <div className="evidence-headline">
                  <span className="mono">{count(evidence.expectedOpportunities)}</span> expected checks
                  <CoverageNote report={evidence} />
                </div>
                <EvidenceRail report={evidence} />
              </>
            ) : <p className="subtle">Evidence unavailable.</p>}
          </div>
        </section>
      </div>

      <section className="panel">
        <header className="panel-header">
          <h2>Incidents</h2>
          <span className="subtle">Last 7 days</span>
        </header>
        {incidents.length > 0 ? (
          <ol className="incident-list">
            {incidents.slice(0, INCIDENT_LIMIT).map((incident) => (
              <li key={incident.id}>
                <StatusDot tone={incident.resolvedAt ? "good" : "fault"} pulse={!incident.resolvedAt} />
                <div>
                  <strong>{incident.resolvedAt ? "Resolved" : "Ongoing"}</strong>
                  <span className="subtle">
                    {incident.openedAt ? `Opened ${absoluteTime(incident.openedAt)}` : "Opened before this window"}
                    {incident.resolvedAt && ` · resolved ${absoluteTime(incident.resolvedAt)}`}
                  </span>
                </div>
                <span className="mono subtle">{duration(incident.openedAt, incident.resolvedAt, now)}</span>
              </li>
            ))}
          </ol>
        ) : <p className="panel-body subtle">No incident transitions in the last 7 days.</p>}
        {incidents.length > INCIDENT_LIMIT && (
          <p className="panel-more subtle">{incidents.length - INCIDENT_LIMIT} earlier incidents are in the downloadable report.</p>
        )}
      </section>

      {report && (
        <details className="limits">
          <summary><Info size={14} aria-hidden="true" /> What these numbers do not prove</summary>
          <ul>{report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
        </details>
      )}
    </>
  );
}

function Breadcrumb({ name }: { name: string }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <Link to="/"><ChevronLeft size={14} aria-hidden="true" /> Monitors</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{name}</span>
    </nav>
  );
}

function CheckTrace({ monitorId, executionId }: { monitorId: string; executionId: string }) {
  const load = useCallback(() => executionTrace(monitorId, executionId), [monitorId, executionId]);
  const trace = useLiveData(load, 5_000);
  return (
    <div className="trace-panel">
      {trace.data && trace.data.executionId === executionId
        ? <TraceView trace={trace.data} />
        : trace.error ? <p className="inline-error" role="alert">{trace.error}</p> : <div className="skeleton" />}
    </div>
  );
}

function SloMetric({ report }: { report?: AvailabilityReport }) {
  if (!report) return <Metric label="SLO · 99.9%" value="—" tone="muted" />;
  if (report.sloMet == null) {
    return (
      <Metric
        label={`SLO · ${report.sloTargetPercent}%`}
        value="Unproven"
        hint={`Coverage ${percent(report.evidenceCoveragePercent, 1)} is below the ${report.minimumEvidenceCoveragePercent}% needed to judge`}
        tone="warn"
      />
    );
  }
  return (
    <Metric
      label={`SLO · ${report.sloTargetPercent}%`}
      value={report.sloMet ? "Met" : "Missed"}
      hint={`Based on ${count(report.conclusiveExecutions)} conclusive checks`}
      tone={report.sloMet ? "good" : "fault"}
    />
  );
}

type IncidentSpan = { id: string; openedAt: string | null; resolvedAt: string | null };

function pairIncidents(report?: ReliabilityReport): IncidentSpan[] {
  if (!report) return [];
  const spans = new Map<string, IncidentSpan>();
  for (const event of report.incidentTimeline) {
    const span = spans.get(event.incidentId) ?? { id: event.incidentId, openedAt: null, resolvedAt: null };
    if (event.eventType === "OPENED") span.openedAt = event.occurredAt;
    else span.resolvedAt = event.occurredAt;
    spans.set(event.incidentId, span);
  }
  return [...spans.values()].reverse();
}

function duration(openedAt: string | null, resolvedAt: string | null, now: number): string {
  if (!openedAt) return "—";
  const seconds = Math.max(0, Math.round(((resolvedAt ? new Date(resolvedAt).getTime() : now) - new Date(openedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
