import { AlertTriangle, ChevronLeft, ExternalLink, ListChecks, PauseCircle, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FALLBACK_CAVEATS } from "../caveats";
import {
  availability, executionTrace, getMonitor, incidentState, latencyHeatmap, listMonitors, monitorHistory, reliabilityReport, setMonitorEnabled,
} from "../api";
import { isNotFound } from "../apiError";
import { isLocalAuth } from "../auth";
import { parseWindow, windowInfo, WINDOWS, type WindowDays } from "../reportWindow";
import { takeReturnPath } from "../returnPath";
import { ActionMenu } from "../components/ActionMenu";
import { AcceptedStatusCodesDialog } from "../components/AcceptedStatusCodesDialog";
import { formatStatusCodes } from "../statusCodes";
import { DeleteMonitorDialog } from "../components/DeleteMonitorDialog";
import { ChaosPanel } from "../components/ChaosPanel";
import { CheckTimeline } from "../components/CheckTimeline";
import { ExportReportButton } from "../components/ExportReportButton";
import { DrillPanel, DrillTag } from "../components/Drill";
import { EvidenceRail } from "../components/EvidenceRail";
import { Explain, ExplainItems } from "../components/Explain";
import { MonitorDetailSkeleton, TraceSkeleton } from "../components/Skeleton";
import { IncidentMachine } from "../components/IncidentMachine";
import { ChartBoundary } from "../components/ChartBoundary";
import { CheckFanout } from "../components/CheckFanout";
import { LatencyChart, type LatencyWindow } from "../components/LatencyChart";
import { LatencyHeatmap } from "../components/LatencyHeatmap";
import { budgetMeter, coverageMeter, latencyMeter } from "../blockMeters";
import { BlockMeter } from "../components/BlockMeter";
import { MonitorToggleButton } from "../components/MonitorToggleButton";
import { PolicyStrip } from "../components/PolicyStrip";
import { StatusBadge, StatusDot } from "../components/StatusBadge";
import { TraceView } from "../components/TraceView";
import { Tracker } from "../components/Tracker";
import {
  absoluteTime, compactUrl, count, interval, isBlockedCheck, milliseconds, monitorState, outcomeLabel, outcomeTone, percent,
  relativeTime,
} from "../format";
import type { AvailabilityReport, IncidentStateView, MonitorDetail, MonitorHistory, MonitorOverview, RecentCheck, ReliabilityReport } from "../types";
import { isDrillMonitor } from "../drill";
import { machineNode } from "../machine";
import { useReadOnly } from "../session";
import { useLiveData, useNow } from "../useLiveData";
import { CoverageNote, ErrorState, LiveIndicator, Metric } from "./MonitorsPage";

/** The availability panel shows this many days; the history is fetched for the longest window so the tiles can use it too. */
const HISTORY_DAYS = 45;
const HISTORY_FETCH_DAYS = 90;
const INCIDENT_LIMIT = 5;

type FoundDetail = {
  missing?: false;
  monitor: MonitorDetail;
  overview?: MonitorOverview;
  history?: MonitorHistory;
  incident?: IncidentStateView;
};
/** The control plane answered 404: the monitor was deleted, or belongs to another account. That is not an outage. */
type DetailData = FoundDetail | { missing: true };

/** What the metric tiles and the report cover; `days` says which window these numbers are for. */
type WindowData = {
  monitorId: string;
  days: WindowDays;
  availability?: AvailabilityReport;
  report?: ReliabilityReport;
};

export function MonitorDetailPage() {
  const { monitorId = "" } = useParams();
  const navigate = useNavigate();
  const [editingStatuses, setEditingStatuses] = useState(false);
  const [acceptingChallenge, setAcceptingChallenge] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [latencyRange, setLatencyRange] = useState<LatencyWindow>(24);
  const [params, setParams] = useSearchParams();
  // The report period lives in the URL (?window=30d, ?period=30d is read too) so a reload or a shared link keeps it; the default needs no parameter.
  const windowDays = parseWindow(params.get("window") ?? params.get("period"));
  const setWindow = (next: WindowDays) => setParams((current) => {
    const updated = new URLSearchParams(current);
    updated.delete("period"); // the older spelling; ?window= is the one we write
    if (next === 7) updated.delete("window");
    else updated.set("window", windowInfo(next).param);
    return updated;
  });
  const load = useCallback(async (): Promise<DetailData> => {
    let monitor: MonitorDetail;
    try {
      monitor = await getMonitor(monitorId);
    } catch (reason) {
      if (isNotFound(reason)) return { missing: true };
      throw reason;
    }
    const [overviews, history, incident] = await Promise.allSettled([
      listMonitors(),
      monitorHistory(monitorId, HISTORY_FETCH_DAYS),
      incidentState(monitorId),
    ]);
    return {
      monitor,
      overview: overviews.status === "fulfilled" ? overviews.value.find((item) => item.id === monitorId) : undefined,
      history: history.status === "fulfilled" ? history.value : undefined,
      incident: incident.status === "fulfilled" ? incident.value : undefined,
    };
  }, [monitorId]);
  const detail = useLiveData(load, 10_000);
  // Its own loader as well: changing the report period refetches only what the period drives (the tiles, the evidence
  // and the incidents), and the previous period's numbers stay, labelled with their own period, until the new ones
  // arrive. A failure is thrown rather than swallowed so the page can say it could not refresh.
  const loadWindow = useCallback(async (): Promise<WindowData> => {
    const [evidence, full] = await Promise.all([availability(monitorId, windowDays), reliabilityReport(monitorId, windowDays)]);
    return { monitorId, days: windowDays, availability: evidence, report: full };
  }, [monitorId, windowDays]);
  const windowed = useLiveData(loadWindow, 10_000);
  const windowData = windowed.data?.monitorId === monitorId ? windowed.data : null;
  const shown = windowInfo(windowData?.days ?? windowDays);
  // Only a change of period counts as "updating"; the ten-second refresh of the same period stays quiet.
  const updating = windowed.loading && (windowData == null ? windowed.data == null : windowData.days !== windowDays);
  // A failure stays on screen (and the numbers stay dimmed) until a response actually succeeds; a retry in flight
  // only changes the wording, so "Try again" never makes stale numbers look current.
  const failed = windowed.error != null;
  const retrying = failed && windowed.loading;
  const stale = updating || failed;
  const periodState = <PeriodState updating={updating} failed={failed} retrying={retrying} retry={windowed.refresh} />;
  // Its own loader: switching 24 h / 7 d refetches only the latency window, not the whole page, and the chart keeps
  // showing the previous window (dimmed) until the new one arrives instead of mixing the two.
  const loadHeatmap = useCallback(() => latencyHeatmap(monitorId, latencyRange), [monitorId, latencyRange]);
  const heat = useLiveData(loadHeatmap, 10_000);
  const heatmap = heat.data ?? undefined;
  // The latency chart's incident lane covers the chart's own range, so it has its own report and does not follow
  // the report period (a shorter period would otherwise drop the markers the chart still has room for).
  const loadChartIncidents = useCallback(() => reliabilityReport(monitorId, latencyRange === 24 ? 1 : 7), [monitorId, latencyRange]);
  const chartReport = useLiveData(loadChartIncidents, 10_000);
  const now = useNow();
  // Rebuilt only when the report changes (every 10 s), not on each one-second tick, so the chart's incident spans stay stable.
  const report = windowData?.report;
  const incidents = useMemo(() => pairIncidents(report), [report]);
  const chartData = chartReport.data;
  const chartIncidents = useMemo(() => pairIncidents(chartData ?? undefined), [chartData]);
  const location = useLocation();
  const missing = detail.data?.missing === true;
  const found = detail.data && !detail.data.missing;
  // A sign-in that restored this very page may have brought the visitor to a monitor that is not theirs (another
  // account, or the shared demo). That is not worth an error page: drop it and show the list, with one line of why.
  useEffect(() => {
    const here = `${location.pathname}${location.search}`;
    if (found) takeReturnPath(here);
    else if (missing && takeReturnPath(here)) {
      navigate("/monitors", { replace: true, state: { notice: "That monitor was deleted or belongs to another account. Showing your monitors instead." } });
    }
  }, [missing, found, location.pathname, location.search, navigate]);
  const readOnly = useReadOnly();
  // The full state machine opens by itself whenever the monitor leaves Healthy; a manual toggle overrides that.
  const [machineToggle, setMachineToggle] = useState<boolean | null>(null);

  if (detail.data?.missing) {
    return (
      <>
        <Breadcrumb name="Not found" />
        <MonitorGone />
      </>
    );
  }

  if (!detail.data) {
    return (
      <>
        <Breadcrumb name="Loading…" />
        {detail.error ? <ErrorState message={detail.error} retry={detail.refresh} /> : <MonitorDetailSkeleton />}
      </>
    );
  }

  const { monitor, overview, history, incident } = detail.data;
  const evidence = windowData?.availability;
  const selectedCheck = params.get("check") ?? history?.recentChecks[0]?.executionId ?? null;
  const selectCheck = (executionId: string) => setParams((current) => {
    const updated = new URLSearchParams(current);
    updated.set("check", executionId);
    return updated;
  }, { replace: true });
  const latest = history?.recentChecks[0];
  // The overview does not say why a check had no data; the latest check's results do. All regions challenged means blocked.
  const blocked = Boolean(overview && monitor.enabled && overview.incidentStatus !== "OPEN" && overview.latestVerdict === "NO_DATA" && latest && isBlockedCheck(latest));
  const state = blocked ? { label: "Blocked", tone: "muted" as const }
    : overview ? monitorState(overview) : { label: monitor.enabled ? "Awaiting evidence" : "Paused", tone: "muted" as const };
  const ongoing = incidents.find((incident) => !incident.resolvedAt);
  const machineOpen = machineToggle ?? (incident ? machineNode(incident) !== "healthy" : false);
  const setMachineOpen = (open: boolean) => setMachineToggle(open);
  const drill = isDrillMonitor(monitor.targetUrl);

  async function toggle() {
    await setMonitorEnabled(monitor.id, !monitor.enabled);
    await detail.refresh();
  }

  return (
    <>
      <Breadcrumb name={monitor.name} />
      {(editingStatuses || acceptingChallenge) && !readOnly && (
        <AcceptedStatusCodesDialog
          monitorId={monitor.id}
          codes={acceptingChallenge ? withChallengeStatus(monitor.acceptedHttpStatuses) : monitor.acceptedHttpStatuses}
          onClose={() => { setEditingStatuses(false); setAcceptingChallenge(false); }}
          onSaved={detail.refresh}
        />
      )}
      {deleting && !readOnly && <DeleteMonitorDialog monitorId={monitor.id} name={monitor.name} onClose={() => setDeleting(false)} onDeleted={() => navigate("/monitors", { replace: true })} />}

      <header className="page-header detail-header">
        <div>
          <div className="title-row">
            <StatusDot tone={state.tone} pulse={state.tone === "fault"} />
            <h1>{monitor.name}</h1>
            <StatusBadge label={state.label} tone={state.tone} blocked={blocked} />
            {drill && <DrillTag />}
          </div>
          <div className="meta-row monitor-meta">
            <a className="mono" href={monitor.targetUrl} target="_blank" rel="noreferrer">
              {compactUrl(monitor.targetUrl)} <ExternalLink size={14} aria-hidden="true" />
            </a>
            {monitor.createdAt && <span title={absoluteTime(monitor.createdAt)}>Created {new Date(monitor.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</span>}
            <span>Every {interval(monitor.checkIntervalSeconds)}</span>
            <span>Timeout {monitor.timeoutMs / 1000} s</span>
            {monitor.acceptedHttpStatuses && <span>Accepts {formatStatusCodes(monitor.acceptedHttpStatuses)}</span>}
            <span>{history?.regions.length ?? 0} regions</span>
          </div>
        </div>
        <div className="page-actions">
          <LiveIndicator updatedAt={detail.updatedAt} now={now} error={detail.error} />
          <button type="button" className="icon-button bordered" onClick={() => void detail.refresh()} aria-label="Refresh" disabled={detail.loading}>
            <RefreshCw size={16} className={detail.loading ? "spin" : undefined} />
          </button>
          {!readOnly && <MonitorToggleButton enabled={monitor.enabled} onToggle={toggle} />}
          {!readOnly && (
            <ActionMenu
              label="More monitor actions"
              bordered
              actions={[
                { label: "Accepted statuses…", icon: <ListChecks size={14} />, onSelect: () => setEditingStatuses(true) },
                { label: "Delete monitor", icon: <Trash2 size={14} />, tone: "danger", separatorBefore: true, onSelect: () => setDeleting(true) },
              ]}
            />
          )}
          <ExportReportButton monitorId={monitor.id} monitorName={monitor.name} days={windowDays} />
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
          onAcceptChallenge={readOnly ? undefined : () => setAcceptingChallenge(true)}
          onTrace={() => {
            selectCheck(latest.executionId);
            document.querySelector('[data-tour="machine"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      )}

      <div className="panel period-panel">
      <header className="panel-header period-header">
        <div className="period-title">
          <h2>Summary · last {shown.words}</h2>
          <span className="period-note" data-testid="period-since">{sinceNote(evidence, now)}</span>
          {stale ? periodState : null}
        </div>
        <PeriodSelect value={windowDays} onChange={setWindow} />
      </header>
      <section className="metric-grid" aria-label={`${shown.words} summary`} aria-busy={updating || undefined} data-stale={stale || undefined} data-tour="metrics">
        <Metric
          label={`Uptime · ${shown.short}`}
          explain={evidence && <UptimeExplain report={evidence} words={shown.words} />}
          visual={history && shown.days > 1 && <Tracker days={history.days.slice(-shown.days)} size="compact" label={`Uptime by day, last ${shown.words}`} />}
          value={percent(evidence?.measuredAvailabilityPercent, 3)}
          hint={evidence ? `${percent(evidence.evidenceCoveragePercent, 1)} of expected checks were conclusive` : undefined}
          tone={evidence?.measuredAvailabilityPercent == null ? "muted" : evidence.measuredAvailabilityPercent >= evidence.sloTargetPercent ? "good" : "fault"}
        />
        <SloMetric report={evidence} />
        <Metric
          label={`Latency · ${shown.short}`}
          visual={report?.latency.p50Ms != null && report.latency.p95Ms != null && <BlockMeter {...latencyMeter(report.latency.p50Ms, report.latency.p95Ms)} />}
          explain={report && (
            <Explain
              title="Latency"
              lines={[
                { label: "Samples", value: `${count(report.latency.sampleCount)} HTTP responses, both regions` },
                { label: "Excluded", value: <ExplainItems items={["timeouts", "refused connections", "other failures"]} /> },
                { label: "Minimum", value: `${report.latency.minimumSamples} samples before showing percentiles` },
                { label: "Result", value: `${milliseconds(report.latency.p50Ms)} · ${milliseconds(report.latency.p95Ms)}`, strong: true },
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
          label={`Error budget · ${shown.short}`}
          visual={report && <BlockMeter {...budgetMeter(report.errorBudget.observedBadExecutions, Number(report.errorBudget.allowedBadExecutions))} />}
          explain={report && (
            <Explain
              title="Error budget"
              lines={[
                { label: "Allowed", value: `${count(report.availability.conclusiveExecutions)} conclusive × ${(100 - report.availability.sloTargetPercent).toFixed(1)}% = ${Number(report.errorBudget.allowedBadExecutions).toFixed(2)}` },
                { label: "Spent", value: `${count(report.errorBudget.observedBadExecutions)} confirmed DOWN checks` },
                { label: "Result", value: Number(report.errorBudget.remainingExecutions).toFixed(2), strong: true },
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
      </div>

      <section className="panel">
        <header className="panel-header">
          <h2>Availability</h2>
          <span className="subtle">Last {HISTORY_DAYS} days · UTC</span>
        </header>
        <div className="panel-body">
          {history ? (
            <>
              <Tracker days={history.days.slice(-HISTORY_DAYS)} label={`${monitor.name}, last ${HISTORY_DAYS} days`} />
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
              <LatencyChart heatmap={heatmap} range={latencyRange} onRangeChange={setLatencyRange} incidents={chartIncidents} now={now} />
            </ChartBoundary>
            <div className="panel-section">
              <header className="section-header">
                <h3>Distribution</h3>
                <span className="subtle">Responses per latency band · log scale</span>
              </header>
              <div className="section-body"><LatencyHeatmap heatmap={heatmap} /></div>
            </div>
          </>
        ) : <div className="panel-body"><p className="subtle">{heat.error ? "Latency unavailable." : "Loading latency…"}</p></div>}
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
        {incident && (
          // Stays mounted so it can fold away instead of vanishing; inert keeps the folded copy out of tab order.
          <div className="collapse" data-open={machineOpen} inert={!machineOpen}>
            <div>
              <div className="panel-body machine-body">
                <IncidentMachine state={incident} now={now} showTape={false} />
              </div>
            </div>
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
                <tr><th scope="col">Region</th><th scope="col">Last result</th><th scope="col" className="num">p50</th><th scope="col" className="num">p95</th><th scope="col" className="num">Samples</th></tr>
              </thead>
              <tbody>
                {history.regions.map((region) => (
                  <tr key={region.region}>
                    <td className="mono">{region.region}</td>
                    <td>
                      <span className={`result ${outcomeTone(region.lastOutcome, region.lastHttpStatus, region.lastAcceptedHttpStatuses)}`}>
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
            <span className="subtle">Last {shown.words}</span>
          </header>
          <div className="panel-body" data-stale={stale || undefined}>
            {evidence ? (
              <>
                <div className="evidence-headline">
                  <span className="mono">{count(evidence.expectedOpportunities)}</span> expected checks
                  <CoverageNote report={evidence} />
                </div>
                <EvidenceRail report={evidence} />
              </>
            ) : <p className="subtle">{windowed.error ? "Evidence unavailable." : "Loading evidence…"}</p>}
          </div>
        </section>
      </div>

      <section className="panel">
        <header className="panel-header">
          <h2>Incidents</h2>
          <span className="subtle">Last {shown.words}</span>
        </header>
        {incidents.length > 0 ? (
          <div className="table-scroll" data-stale={stale || undefined}>
            <table className="table compact incident-table">
              <thead>
                <tr><th scope="col">Opened</th><th scope="col">Resolved</th><th scope="col" className="num">Duration</th></tr>
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
        ) : report
          ? <p className="panel-body subtle" data-stale={stale || undefined}>No incidents recorded in this period</p>
          : <p className="panel-body subtle">{windowed.error ? "Incidents unavailable." : "Loading incidents…"}</p>}
        {incidents.length > INCIDENT_LIMIT && (
          <p className="panel-more subtle">{incidents.length - INCIDENT_LIMIT} earlier incidents are in the downloadable report.</p>
        )}
      </section>

      {report && (
        <details className="limits">
          <summary>What these numbers do not prove</summary>
          <dl className="caveats">
            {(report.caveats?.length ? report.caveats : FALLBACK_CAVEATS).map((caveat) => (
              <div key={caveat.topic}><dt>{caveat.topic}</dt><dd>{caveat.text}</dd></div>
            ))}
          </dl>
        </details>
      )}
    </>
  );
}

/** Shown when the monitor does not exist for this account. A 404 is an answer, not the control plane failing. */
function MonitorGone() {
  return (
    <div className="empty" role="status">
      <h2>This monitor no longer exists</h2>
      <p>It was deleted, or it belongs to another account.</p>
      <Link className="button secondary" to="/monitors">Back to monitors</Link>
    </div>
  );
}

/** The monitor's current accepted set (default 200-399) plus 403, so the dialog opens ready to count a Cloudflare challenge as UP. */
function withChallengeStatus(accepted: number[] | null | undefined): number[] {
  const base = accepted ?? Array.from({ length: 200 }, (_, index) => 200 + index);
  return [...new Set([...base, 403])].sort((a, b) => a - b);
}

const PERIOD_SCOPE = "Sets the summary tiles, evidence, incidents and exports. The latency chart and the 45-day availability bar keep their own ranges.";

/** The report period, in the same segmented style as the latency chart's toggle. It drives the tiles, evidence, incidents and exports only. */
function PeriodSelect({ value, onChange }: { value: WindowDays; onChange: (days: WindowDays) => void }) {
  return (
    <div className="period-select" title={PERIOD_SCOPE}>
      <div className="segmented" role="group" aria-label="Report period" aria-describedby="report-period-scope">
        {WINDOWS.map((item) => (
          <button key={item.days} type="button" aria-pressed={value === item.days} title={`Report on the last ${item.words}`} onClick={() => onChange(item.days)}>{item.label}</button>
        ))}
      </div>
      <span className="sr-only" id="report-period-scope">{PERIOD_SCOPE}</span>
    </div>
  );
}

/** What the period-driven panels are doing, said plainly: still loading the new period, or unable to refresh. */
function PeriodState({ updating, failed, retrying, retry }: { updating: boolean; failed: boolean; retrying: boolean; retry: () => Promise<void> }) {
  if (retrying) return <span className="period-state" role="status">Retrying…</span>;
  if (failed) {
    return (
      <span className="period-state" role="alert">
        Couldn&rsquo;t refresh · <button type="button" className="link-button" onClick={() => void retry()}>Try again</button>
      </span>
    );
  }
  return updating ? <span className="period-state" role="status">Updating…</span> : null;
}

/** "Monitoring since 1 Oct · 9 days of data", only when the period reaches back before the monitor's first schedule. */
function sinceNote(report: AvailabilityReport | undefined, now: number): string {
  if (!report?.monitoringSince || new Date(report.monitoringSince) <= new Date(report.from)) return "";
  const since = new Date(report.monitoringSince);
  const days = Math.floor((now - since.getTime()) / 86_400_000);
  const day = since.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `Monitoring since ${day} · ${days < 1 ? "under a day" : days === 1 ? "1 day" : `${days} days`} of data`;
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

function UptimeExplain({ report, words }: { report: AvailabilityReport; words: string }) {
  // Zero-count parts are left out so the line stays short.
  const excluded = [
    [report.disagreementExecutions, "disagree"],
    [report.noDataExecutions, "no data"],
    [report.pendingExecutions, "pending"],
  ].filter(([n]) => Number(n) > 0).map(([n, what]) => `${count(Number(n))} ${what}`);
  return (
    <Explain
      title="Uptime"
      lines={[
        { label: "Formula", value: "UP ÷ (UP + DOWN)" },
        { label: `Last ${words}`, value: `${count(report.upExecutions)} ÷ (${count(report.upExecutions)} + ${count(report.downExecutions)})` },
        { label: "Excluded", value: <ExplainItems items={excluded} /> },
        { label: "Result", value: percent(report.measuredAvailabilityPercent, 3), strong: true },
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
          label: "Result",
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
        visual={<BlockMeter {...coverageMeter(report.evidenceCoveragePercent, report.minimumEvidenceCoveragePercent, null)} />}
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
      visual={<BlockMeter {...coverageMeter(report.evidenceCoveragePercent, report.minimumEvidenceCoveragePercent, report.sloMet)} />}
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
