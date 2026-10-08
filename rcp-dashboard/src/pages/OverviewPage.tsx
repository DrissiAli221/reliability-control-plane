import { ArrowUpRight, Play, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fleetOverview, listMonitors, pipelineSnapshot } from "../api";
import { EventStream } from "../components/EventStream";
import { IncidentTimeline } from "../components/IncidentTimeline";
import { PulseStrip } from "../components/PulseStrip";
import { RollingText } from "../components/RollingText";
import { LiveLed, StatusDot } from "../components/StatusBadge";
import { compactUrl, count, elapsed, milliseconds, monitorState, relativeTime } from "../format";
import type { FleetOverview, MonitorOverview, PipelineSnapshot } from "../types";
import { tour } from "../tour";
import { drillPhase, isDrillMonitor, utcClock } from "../drill";
import { useLiveData, useNow } from "../useLiveData";
import { ErrorState, LiveIndicator } from "./MonitorsPage";

/** The console home: one readout for the whole fleet that turns into the incident when something breaks. */
export function OverviewPage() {
  const overview = useLiveData(fleetOverview, 15_000);
  const monitors = useLiveData(listMonitors, 15_000);
  const pipeline = useLiveData(pipelineSnapshot, 5_000);
  const now = useNow();

  const refresh = () => Promise.all([overview.refresh(), monitors.refresh(), pipeline.refresh()]).then(() => undefined);
  const error = overview.error ?? monitors.error;
  const loaded = overview.data && monitors.data;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Overview</h1>
          <p>
            {monitors.data && <><strong>{fleetSentence(monitors.data)}</strong>{" "}{contextSentence(monitors.data, pipeline.data, now)}{" "}</>}
            Only checks where the regions agreed count toward uptime.
          </p>
        </div>
        <div className="page-actions">
          <LiveIndicator updatedAt={overview.updatedAt} now={now} error={overview.error} />
          <button type="button" className="icon-button bordered" onClick={() => void refresh()} aria-label="Refresh" disabled={overview.loading}>
            <RefreshCw size={15} className={overview.loading ? "spin" : undefined} />
          </button>
          <button type="button" className="button primary" onClick={tour.start}>
            <Play size={13} aria-hidden="true" /> Take the tour
          </button>
        </div>
      </header>

      {error && !loaded && <ErrorState message={error} retry={refresh} />}
      {!loaded && !error && <div className="skeletons"><div className="skeleton tall" /><div className="skeleton tall" /></div>}

      {overview.data && monitors.data && (
        <>
          <Hero overview={overview.data} monitors={monitors.data} regions={pipeline.data?.regions.length ?? 0} now={now} updatedAt={overview.updatedAt} />

          <div className="split wide-left">
            <section className="panel" data-tour="incidents">
              <header className="panel-header">
                <h2>Incidents</h2>
                <span className="subtle">Last 7 days · opened after 2 DOWN, resolved after 2 UP</span>
              </header>
              <div className="panel-body">
                <IncidentTimeline incidents={overview.data.incidents} from={overview.data.incidentsFrom} now={now} />
              </div>
            </section>
            <Regions snapshot={pipeline.data} />
          </div>

          <div className="split">
            <Fleet monitors={monitors.data} now={now} />
            <EventStream limit={10} />
          </div>
        </>
      )}
    </>
  );
}

/** The fleet's state as one plain sentence, counted from the backend's own verdicts and incident status. */
function fleetSentence(monitors: MonitorOverview[]): string {
  const enabled = monitors.filter((monitor) => monitor.enabled);
  if (enabled.length === 0) return monitors.length ? "Every monitor is paused." : "No monitors yet.";
  const incidents = enabled.filter((monitor) => monitor.incidentStatus === "OPEN").length;
  if (incidents > 0) return incidents === 1 ? "1 incident is open." : `${incidents} incidents are open.`;
  const up = enabled.filter((monitor) => monitor.latestVerdict === "UP").length;
  if (up === enabled.length) return enabled.length === 1 ? "The monitor is up." : `All ${enabled.length} monitors are up.`;
  return `${up} of ${enabled.length} monitors are up.`;
}

function contextSentence(monitors: MonitorOverview[], snapshot: PipelineSnapshot | null, now: number): string {
  const parts: string[] = [];
  if (snapshot && snapshot.regions.length > 0) {
    const reporting = snapshot.regions.filter((region) => region.resultsReceived > 0).length;
    const total = snapshot.regions.length;
    parts.push(reporting === total ? (total === 2 ? "Both regions are reporting" : `All ${total} regions are reporting`) : `${reporting} of ${total} regions are reporting`);
  }
  if (monitors.some((monitor) => monitor.enabled && isDrillMonitor(monitor.targetUrl))) {
    const phase = drillPhase(now);
    parts.push(phase.active ? "a planned outage drill is running" : `the next planned drill is at ${utcClock(phase.nextStart)} UTC`);
  }
  if (parts.length === 0) return "";
  const sentence = parts.join("; ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

function Hero({ overview, monitors, regions, now, updatedAt }: {
  overview: FleetOverview;
  monitors: MonitorOverview[];
  regions: number;
  now: number;
  updatedAt: number | null;
}) {
  const navigate = useNavigate();
  const totals = useMemo(() => overview.buckets.reduce(
    (sum, bucket) => ({
      up: sum.up + bucket.up,
      down: sum.down + bucket.down,
      inconclusive: sum.inconclusive + bucket.disagreement + bucket.noData,
    }),
    { up: 0, down: 0, inconclusive: 0 },
  ), [overview.buckets]);
  const conclusive = totals.up + totals.down;
  const uptime = conclusive ? `${((totals.up / conclusive) * 100).toFixed(2)}%` : "—";
  const open = overview.incidents.filter((incident) => !incident.resolvedAt);
  const lead = open[0];
  const enabled = monitors.filter((monitor) => monitor.enabled).length;

  const stats = (
    <dl className="hero-stats">
      <div><dt>monitors</dt><dd><RollingText value={`${enabled}`} /><small>/ {monitors.length}</small></dd></div>
      <div><dt>regions</dt><dd>{regions || "—"}</dd></div>
      <div><dt>checks · 24 h</dt><dd><RollingText value={count(conclusive + totals.inconclusive)} /></dd></div>
      <div><dt>{lead ? "uptime · 24 h" : "open incidents"}</dt><dd>{lead ? uptime : <RollingText value={`${open.length}`} />}</dd></div>
    </dl>
  );

  return (
    <section className={`hero panel${lead ? " incident" : ""}`} aria-label="Fleet status" data-tour="hero">
      <div className="hero-main">
        {lead ? (
          <div className="hero-readout">
            <span className="hero-label"><LiveLed updatedAt={null} tone="fault" /> incident · {lead.monitorName}{open.length > 1 && ` +${open.length - 1} more`}</span>
            <span className="hero-value" role="timer">{elapsed(now - new Date(lead.openedAt).getTime())}</span>
            <span className="hero-caption">
              Every region agreed the target is down. Opened {relativeTime(lead.openedAt, now)}; it resolves after two UP checks in a row.
            </span>
            <button type="button" className="button secondary" onClick={() => navigate(`/monitors/${lead.monitorId}`)}>
              Open {lead.monitorName} <ArrowUpRight size={14} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="hero-readout">
            <span className="hero-label"><LiveLed updatedAt={updatedAt} /> fleet uptime · 24 h</span>
            <span className="hero-value"><RollingText value={uptime} /></span>
            <span className="hero-caption">
              {conclusive
                ? <>{count(totals.up)} of {count(conclusive)} conclusive checks were UP{totals.inconclusive > 0 && <>; {count(totals.inconclusive)} inconclusive checks are left out</>}.</>
                : "No conclusive checks in the last 24 hours yet."}
            </span>
          </div>
        )}
        {stats}
      </div>
      <PulseStrip buckets={overview.buckets} from={overview.from} bucketSeconds={overview.bucketSeconds} />
    </section>
  );
}

function Regions({ snapshot }: { snapshot: PipelineSnapshot | null }) {
  return (
    <section className="panel" data-tour="regions">
      <header className="panel-header">
        <h2>Regions</h2>
        <span className="subtle">Last {snapshot ? Math.round(snapshot.windowSeconds / 60) : 5} min</span>
      </header>
      {!snapshot || snapshot.regions.length === 0 ? (
        <p className="panel-body subtle">No probe traffic in the window yet.</p>
      ) : (
        <ul className="regions">
          {snapshot.regions.map((region) => {
            const share = region.jobsPublished ? Math.min(1, region.resultsReceived / region.jobsPublished) : 0;
            return (
              <li key={region.region}>
                <div className="region-head">
                  <span className="mono">{region.region}</span>
                  {/* Keyed by the result count, so the LED flares only when this region reports something new. */}
                  <LiveLed updatedAt={region.resultsReceived || null} />
                </div>
                <span className="region-value">{milliseconds(region.p50LatencyMs)}</span>
                <span className="region-caption">p50 · {count(region.resultsReceived)} of {count(region.jobsPublished)} results back</span>
                <div className="meter" aria-hidden="true"><div className={`meter-fill${share < 0.9 ? " warn" : ""}`} style={{ width: `${share * 100}%` }} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Fleet({ monitors, now }: { monitors: MonitorOverview[]; now: number }) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Monitors</h2>
        <Link className="subtle panel-link" to="/monitors">View all <ArrowUpRight size={12} aria-hidden="true" /></Link>
      </header>
      {monitors.length === 0 ? (
        <p className="panel-body subtle">No monitors yet. <Link to="/monitors">Create one</Link> to start collecting evidence.</p>
      ) : (
        <ul className="fleet-list">
          {monitors.map((monitor) => {
            const state = monitorState(monitor);
            return (
              <li key={monitor.id}>
                <Link to={`/monitors/${monitor.id}`}>
                  <StatusDot tone={state.tone} />
                  <span className="fleet-name">
                    <strong>{monitor.name}</strong>
                    <span className="mono subtle">{compactUrl(monitor.targetUrl)}</span>
                  </span>
                  <span className={`fleet-state ${state.tone}`}>{state.label}</span>
                  <span className="subtle fleet-age">{monitor.enabled ? relativeTime(monitor.latestCheckedAt, now) : "Paused"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
