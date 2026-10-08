import { AlertTriangle, ChevronLeft, ExternalLink, Info, PauseCircle, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  availability, executionTrace, getMonitor, incidentState, latencyHeatmap, listMonitors, monitorHistory, reliabilityReport, setMonitorEnabled,
} from "../api";
import { isLocalAuth } from "../auth";
import { ChaosPanel } from "../components/ChaosPanel";
import { CheckTimeline } from "../components/CheckTimeline";
import { DownloadReportButton } from "../components/DownloadReportButton";
import { DrillPanel, DrillTag } from "../components/Drill";
import { EvidenceRail } from "../components/EvidenceRail";
import { Explain } from "../components/Explain";
import { MonitorDetailSkeleton, TraceSkeleton } from "../components/Skeleton";
import { IncidentMachine } from "../components/IncidentMachine";
import { ChartBoundary } from "../components/ChartBoundary";
import { CheckFanout } from "../components/CheckFanout";
import { LatencyChart, type LatencyWindow } from "../components/LatencyChart";
import { LatencyHeatmap } from "../components/LatencyHeatmap";
import { BudgetMeter, CoverageMeter, LatencyRange } from "../components/MetricVisuals";
import { MonitorToggleButton } from "../components/MonitorToggleButton";
import { PolicyStrip } from "../components/PolicyStrip";
import { StatusBadge, StatusDot } from "../components/StatusBadge";
import { TraceView } from "../components/TraceView";
import { Tracker } from "../components/Tracker";
import {
  absoluteTime, compactUrl, count, interval, milliseconds, monitorState, outcomeLabel, outcomeTone, percent,
  relativeTime,
} from "../format";
import type { AvailabilityReport, IncidentStateView, LatencyHeatmap as Heatmap, MonitorDetail, MonitorHistory, MonitorOverview, RecentCheck, ReliabilityReport } from "../types";
import { isDrillMonitor } from "../drill";
import { machineNode } from "../machine";
import { useReadOnly } from "../session";
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
  incident?: IncidentStateView;
  heatmap?: Heatmap;
};

export function MonitorDetailPage() {
  const { monitorId = "" } = useParams();
  const [latencyRange, setLatencyRange] = useState<LatencyWindow>(24);
  const load = useCallback(async (): Promise<DetailData> => {
    const monitor = await getMonitor(monitorId);
    const [overviews, history, report7d, report, incident, heatmap] = await Promise.allSettled([
      listMonitors(),
      monitorHistory(monitorId, HISTORY_DAYS),
      availability(monitorId),
      reliabilityReport(monitorId),
      incidentState(monitorId),
      latencyHeatmap(monitorId, latencyRange),
    ]);
    return {
      monitor,
      overview: overviews.status === "fulfilled" ? overviews.value.find((item) => item.id === monitorId) : undefined,
      history: history.status === "fulfilled" ? history.value : undefined,
      availability: report7d.status === "fulfilled" ? report7d.value : undefined,
      report: report.status === "fulfilled" ? report.value : undefined,
      incident: incident.status === "fulfilled" ? incident.value : undefined,
      heatmap: heatmap.status === "fulfilled" ? heatmap.value : undefined,
    };
  }, [monitorId, latencyRange]);
  const detail = useLiveData(load, 10_000);
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const readOnly = useReadOnly();
  // The full state machine opens by itself whenever the monitor leaves Healthy; a manual toggle overrides that.
  const [machineToggle, setMachineToggle] = useState<boolean | null>(null);

  if (!detail.data) {
    return (
      <>
        <Breadcrumb name="Loading…" />
        {detail.error ? <ErrorState message={detail.error} retry={detail.refresh} /> : <MonitorDetailSkeleton />}
      </>
    );
  }

  const { monitor, overview, history, availability: evidence, report, incident, heatmap } = detail.data;
  const selectedCheck = params.get("check") ?? history?.recentChecks[0]?.executionId ?? null;
  const selectCheck = (executionId: string) => setParams({ check: executionId }, { replace: true });
  const state = overview ? monitorState(overview) : { label: monitor.enabled ? "Awaiting evidence" : "Paused", tone: "muted" as const };
  const incidents = pairIncidents(report);
  const ongoing = incidents.find((incident) => !incident.resolvedAt);
  const machineOpen = machineToggle ?? (incident ? machineNode(incident) !== "healthy" : false);
  const setMachineOpen = (open: boolean) => setMachineToggle(open);
  const drill = isDrillMonitor(monitor.targetUrl);
  const latest = history?.recentChecks[0];

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
            {drill && <DrillTag />}
          </div>
          <div className="meta-row">
            <a className="mono" href={monitor.targetUrl} target="_blank" rel="noreferrer">
              {compactUrl(monitor.targetUrl)} <ExternalLink size={14} aria-hidden="true" />
            </a>
            <span>Every {interval(monitor.checkIntervalSeconds)}</span>
            <span>Timeout {monitor.timeoutMs / 1000} s</span>
            <span>{history?.regions.length ?? 0} regions</span>
          </div>
        </div>
        <div className="page-actions">
          <LiveIndicator updatedAt={detail.updatedAt} now={now} error={detail.error} />
          <button type="button" className="icon-button bordered" onClick={() => void detail.refresh()} aria-label="Refresh" disabled={detail.loading}>
            <RefreshCw size={16} className={detail.loading ? "spin" : undefined} />
          </button>
          {!readOnly && <MonitorToggleButton enabled={monitor.enabled} onToggle={toggle} />}
          <DownloadReportButton monitorId={monitor.id} monitorName={monitor.name} />
        </div>
      </header>

      {overview?.incidentStatus === "OPEN" && (
        <div className="banner fault" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <strong>{incidentHeadline(latest, incident)}</strong>
            <p>
              {ongoing?.openedAt ? <>Opened {relativeTime(ongoing.openedAt, now)} ({absoluteTime(ongoing.openedAt)})</> : "Opened"}
              {incident ? ` after ${incident.failuresToOpen} DOWN checks in a row; it resolves after ${incident.successesToResolve} UP checks in a row.` : "."}
              {drill && <> This is the scheduled drill: the outage is planned and recovers on its own.</>}
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

      {drill && monitor.enabled && <DrillPanel now={now} overview={overview} />}

      {latest && (
        <CheckFanout
          check={latest}
          timeoutMs={monitor.timeoutMs}
          intervalLabel={interval(monitor.checkIntervalSeconds)}
          now={now}
          onTrace={() => {
            selectCheck(latest.executionId);
            document.querySelector('[data-tour="machine"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      )}

      <section className="metric-grid" aria-label="Seven-day summary" data-tour="metrics">
        <Metric
          label="uptime · 7d"
          explain={evidence && <UptimeExplain report={evidence} />}
          visual={history && <Tracker days={history.days.slice(-7)} size="compact" label="Uptime by day, last 7 days" />}
          value={percent(evidence?.measuredAvailabilityPercent, 3)}
          hint={evidence ? `${percent(evidence.evidenceCoveragePercent, 1)} of expected checks were conclusive` : undefined}
          tone={evidence?.measuredAvailabilityPercent == null ? "muted" : evidence.measuredAvailabilityPercent >= evidence.sloTargetPercent ? "good" : "fault"}
        />
        <SloMetric report={evidence} />
        <Metric
          label="latency · 7d"
          visual={report?.latency.p50Ms != null && report.latency.p95Ms != null && <LatencyRange p50={report.latency.p50Ms} p95={report.latency.p95Ms} />}
          explain={report && (
            <Explain
              title="Latency"
              lines={[
                { label: "Samples", value: `${count(report.latency.sampleCount)} HTTP responses, both regions` },
                { label: "Excluded", value: "timeouts, refused connections, other failures" },
                { label: "Minimum", value: `${report.latency.minimumSamples} samples before showing percentiles` },
                { label: "p50 · p95", value: `${milliseconds(report.latency.p50Ms)} · ${milliseconds(report.latency.p95Ms)}`, strong: true },
              ]}
              note="Nearest-rank percentiles (PostgreSQL percentile_disc), so every value is a latency that was actually measured."
            />
          )}
          value={report?.latency.p50Ms != null ? milliseconds(report.latency.p50Ms) : "—"}
          suffix={report?.latency.p95Ms != null ? `p95 ${milliseconds(report.latency.p95Ms)}` : undefined}
          hint={report ? (report.latency.p50Ms != null ? `p50 of ${count(report.latency.sampleCount)} HTTP responses` : `Needs ${report.latency.minimumSamples} HTTP responses`) : undefined}
          tone="muted"
        />
        <Metric
          label="error budget · 7d"
          visual={report && <BudgetMeter spent={report.errorBudget.observedBadExecutions} allowed={Number(report.errorBudget.allowedBadExecutions)} />}
          explain={report && (
            <Explain
              title="Error budget"
              lines={[
                { label: "Allowed", value: `${count(report.availability.conclusiveExecutions)} conclusive × ${(100 - report.availability.sloTargetPercent).toFixed(1)}% = ${Number(report.errorBudget.allowedBadExecutions).toFixed(2)}` },
                { label: "Spent", value: `${count(report.errorBudget.observedBadExecutions)} confirmed DOWN checks` },
                { label: "Remaining", value: Number(report.errorBudget.remainingExecutions).toFixed(2), strong: true },
              ]}
              note="Only DOWN counts against the budget. Disagreement and no-data checks are inconclusive, not failures."
            />
          )}
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
              <div className="tracker-axis"><span>{HISTORY_DAYS} days ago</span><span>today</span></div>
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

      <section className="panel" data-tour="heatmap">
        <header className="panel-header">
          <h2>Latency</h2>
          <span className="subtle">HTTP responses · last {latencyRange === 24 ? "24 h" : "7 days"}</span>
        </header>
        {heatmap ? (
          <>
            <ChartBoundary>
              <LatencyChart heatmap={heatmap} range={latencyRange} onRangeChange={setLatencyRange} incidents={incidents} now={now} />
            </ChartBoundary>
            <div className="panel-section">
              <header className="section-header">
                <h3>Distribution</h3>
                <span className="subtle">Responses per latency band · log scale</span>
              </header>
              <div className="section-body"><LatencyHeatmap heatmap={heatmap} /></div>
            </div>
          </>
        ) : <div className="panel-body"><p className="subtle">Latency unavailable.</p></div>}
      </section>

      <section className="panel decisions" data-tour="machine">
        <header className="panel-header">
          <h2>Decisions</h2>
          <span className="subtle">
            {incident ? `Opens after ${incident.failuresToOpen} consecutive DOWN, resolves after ${incident.successesToResolve} UP` : "State unavailable"}
          </span>
        </header>
        {isLocalAuth() && !readOnly && <ChaosPanel failuresToOpen={incident?.failuresToOpen} inline />}
        {incident && <PolicyStrip state={incident} now={now} expanded={machineOpen} onToggle={() => setMachineOpen(!machineOpen)} />}
        {incident && machineOpen && (
          <div className="panel-body machine-body">
            <IncidentMachine state={incident} now={now} showTape={false} />
          </div>
        )}
        {history && (
          <CheckTimeline
            checks={history.recentChecks}
            regions={history.regions.map((region) => region.region)}
            selected={selectedCheck}
            onSelect={selectCheck}
            now={now}
          />
        )}
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
                <tr><th scope="col">region</th><th scope="col">last result</th><th scope="col" className="num">p50</th><th scope="col" className="num">p95</th><th scope="col" className="num">samples</th></tr>
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
          <div className="table-scroll">
            <table className="table compact incident-table">
              <thead>
                <tr><th scope="col">opened</th><th scope="col">resolved</th><th scope="col" className="num">duration</th></tr>
              </thead>
              <tbody>
                {incidents.slice(0, INCIDENT_LIMIT).map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.openedAt
                        ? <time dateTime={item.openedAt}>{dayLabel(item.openedAt)}, <span className="mono">{clockTime(item.openedAt)}</span></time>
                        : <span className="subtle">Before this window</span>}
                    </td>
                    <td>
                      {item.resolvedAt
                        ? <time dateTime={item.resolvedAt}>{dayLabel(item.resolvedAt)}, <span className="mono">{clockTime(item.resolvedAt)}</span></time>
                        : <span className="incident-ongoing"><StatusDot tone="fault" pulse /> Ongoing</span>}
                    </td>
                    <td className="num mono">{duration(item.openedAt, item.resolvedAt, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
      <Link to="/monitors"><ChevronLeft size={14} aria-hidden="true" /> Monitors</Link>
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
        : trace.error ? <p className="inline-error" role="alert">{trace.error}</p> : <TraceSkeleton />}
    </div>
  );
}

function UptimeExplain({ report }: { report: AvailabilityReport }) {
  return (
    <Explain
      title="Uptime"
      lines={[
        { label: "Formula", value: "UP ÷ (UP + DOWN)" },
        { label: "This week", value: `${count(report.upExecutions)} ÷ (${count(report.upExecutions)} + ${count(report.downExecutions)})` },
        { label: "Excluded", value: `${count(report.disagreementExecutions)} disagree · ${count(report.noDataExecutions)} no data · ${count(report.pendingExecutions)} pending` },
        { label: "Uptime", value: percent(report.measuredAvailabilityPercent, 3), strong: true },
      ]}
      note="A check counts only when every region agreed. Inconclusive checks lower coverage instead of uptime."
    />
  );
}

function SloExplain({ report }: { report: AvailabilityReport }) {
  const denominator = Math.max(report.expectedOpportunities, report.totalFinalizedExecutions + report.pendingExecutions);
  return (
    <Explain
      title="SLO decision"
      lines={[
        { label: "Coverage", value: `${count(report.conclusiveExecutions)} conclusive ÷ ${count(denominator)} expected = ${percent(report.evidenceCoveragePercent, 1)}` },
        { label: "Needed", value: `≥ ${report.minimumEvidenceCoveragePercent}% coverage to judge` },
        { label: "Uptime vs target", value: `${percent(report.measuredAvailabilityPercent, 3)} vs ${report.sloTargetPercent}%` },
        {
          label: "Decision",
          value: report.sloMet == null ? "Unproven: not enough evidence" : report.sloMet ? "Met" : "Missed",
          strong: true,
        },
      ]}
      note="Expected checks come from enabled scheduling periods; paused time creates none, and slots the scheduler never ran still count as missing."
    />
  );
}

function SloMetric({ report }: { report?: AvailabilityReport }) {
  if (!report) return <Metric label="SLO" value="—" tone="muted" />;
  if (report.sloMet == null) {
    return (
      <Metric
        label={`SLO · ${report.sloTargetPercent}%`}
        explain={<SloExplain report={report} />}
        visual={<CoverageMeter coverage={report.evidenceCoveragePercent} minimum={report.minimumEvidenceCoveragePercent} />}
        value="Unproven"
        hint={`Coverage ${percent(report.evidenceCoveragePercent, 1)} is below the ${report.minimumEvidenceCoveragePercent}% needed to judge`}
        tone="warn"
      />
    );
  }
  return (
    <Metric
      label={`SLO · ${report.sloTargetPercent}%`}
      explain={<SloExplain report={report} />}
      visual={<CoverageMeter coverage={report.evidenceCoveragePercent} minimum={report.minimumEvidenceCoveragePercent} />}
      value={report.sloMet ? "Met" : "Missed"}
      hint={`Based on ${count(report.conclusiveExecutions)} conclusive checks`}
      tone={report.sloMet ? "good" : "fault"}
    />
  );
}

/** What the regions saw, as one sentence. It describes the backend's evidence; the incident decision stays there. */
function incidentHeadline(latest: RecentCheck | undefined, state: IncidentStateView | undefined): string {
  if (!latest) return "Incident open";
  if (latest.verdict !== "DOWN") {
    const progress = state ? ` (${state.consecutiveUp} of ${state.successesToResolve} UP checks)` : "";
    return latest.verdict === "UP" ? `Incident open · recovering${progress}` : "Incident open · the latest check was inconclusive";
  }
  const seen = latest.results.map((result) =>
    result.outcome === "HTTP_RESPONSE" ? `HTTP ${result.httpStatus}` : outcomeLabel(result.outcome, result.httpStatus));
  if (seen.length > 0 && seen.every((label) => label === seen[0])) {
    return `Incident open · ${seen.length === 2 ? "both regions" : `all ${seen.length} regions`} saw ${seen[0]}`;
  }
  return `Incident open · every region failed: ${latest.results.map((result, i) => `${result.region} ${seen[i]}`).join(", ")}`;
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

function dayLabel(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function clockTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function duration(openedAt: string | null, resolvedAt: string | null, now: number): string {
  if (!openedAt) return "—";
  const seconds = Math.max(0, Math.round(((resolvedAt ? new Date(resolvedAt).getTime() : now) - new Date(openedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
