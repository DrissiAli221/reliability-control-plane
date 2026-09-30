import { useEffect, useRef, useState, type ReactNode } from "react";
import { count, milliseconds } from "../format";
import type { PipelineSnapshot, Verdict } from "../types";

type Stage = { key: string; step: string; name: string; tech: string; value: number; unit: string; detail?: ReactNode; alert?: boolean };

/**
 * The control plane drawn as its stages, each with live counts for the caller's monitors. A pulse travels
 * the links only when a new check has actually been finalized since the last snapshot.
 */
export function PipelineMap({ snapshot, local }: { snapshot: PipelineSnapshot; local: boolean }) {
  const latest = snapshot.recentActivity[0];
  const seen = useRef<string | null>(null);
  const [pulse, setPulse] = useState<{ key: string; verdict: Verdict } | null>(null);

  useEffect(() => {
    if (!latest) return;
    if (seen.current && seen.current !== latest.executionId) {
      setPulse({ key: latest.executionId, verdict: latest.verdict });
    }
    seen.current = latest.executionId;
  }, [latest]);

  const received = snapshot.regions.reduce((sum, region) => sum + region.resultsReceived, 0);
  const windowLabel = `${Math.round(snapshot.windowSeconds / 60)} min`;
  const before: Stage[] = [
    {
      key: "scheduler", step: "01", name: "Scheduler", tech: "PostgreSQL · SKIP LOCKED",
      value: snapshot.dueMonitors, unit: "due now", detail: `${count(snapshot.enabledMonitors)} enabled monitors`,
    },
    {
      key: "outbox", step: "02", name: "Outbox", tech: "same transaction as the jobs",
      value: snapshot.pendingOutbox, unit: "pending",
      detail: <>oldest {snapshot.oldestPendingOutboxSeconds}s · {count(snapshot.failedOutbox)} failed</>,
      alert: snapshot.failedOutbox > 0 || snapshot.oldestPendingOutboxSeconds > 60,
    },
  ];
  const after: Stage[] = [
    {
      key: "ingest", step: "04", name: "Ingest", tech: "idempotent by message and job",
      value: received, unit: `results / ${windowLabel}`,
      detail: `${count(snapshot.regions.length)} regions reporting`,
    },
    {
      key: "finalizer", step: "05", name: "Finalizer", tech: "regional consensus",
      value: snapshot.pendingExecutions, unit: "awaiting results",
      detail: "all regions or deadline",
    },
    {
      key: "policy", step: "06", name: "Incident policy", tech: "streak thresholds",
      value: snapshot.openIncidents, unit: "open incidents",
      detail: `${count(snapshot.awaitingIncidentEvaluation)} to evaluate`, alert: snapshot.openIncidents > 0,
    },
  ];

  return (
    <div className="pipeline" data-pulse={pulse?.verdict.toLowerCase()}>
      {before.map((stage) => <StageCard key={stage.key} stage={stage} />).flatMap((card, index) => [
        card, <Link key={`link-${index}`} pulseKey={pulse?.key} order={index} />,
      ])}
      <div className="pipeline-regions">
        {snapshot.regions.length === 0 && <div className="stage empty"><span className="stage-name">Regions</span><span className="subtle">No jobs in the last {windowLabel}</span></div>}
        {snapshot.regions.map((region) => (
          <div className="stage region" key={region.region}>
            <div className="stage-head">
              <span className="stage-name"><span className="mono">{region.region}</span><span className="stage-step">03</span></span>
              <span className="stage-tech">{local ? "ElasticMQ → in-JVM worker" : "SQS → Lambda"}</span>
            </div>
            <div className="region-flow">
              <span><b className="mono">{count(region.jobsPublished)}</b> sent</span>
              <span><b className="mono">{count(region.resultsReceived)}</b> results</span>
              <span><b className="mono">{milliseconds(region.p50LatencyMs)}</b> p50</span>
            </div>
          </div>
        ))}
      </div>
      {after.map((stage) => <StageCard key={stage.key} stage={stage} />).flatMap((card, index) => [
        <Link key={`link-after-${index}`} pulseKey={pulse?.key} order={index + 2} />, card,
      ])}
    </div>
  );
}

function StageCard({ stage }: { stage: Stage }) {
  return (
    // An empty stage is the normal state between checks, so its zero stays quiet instead of shouting.
    <div className={`stage${stage.alert ? " alert" : ""}${stage.value === 0 ? " idle" : ""}`}>
      <div className="stage-head">
        <span className="stage-name">{stage.name}<span className="stage-step">{stage.step}</span></span>
        <span className="stage-tech">{stage.tech}</span>
      </div>
      <div className="stage-value"><span className="mono">{count(stage.value)}</span><small>{stage.unit}</small></div>
      {stage.detail && <span className="stage-detail">{stage.detail}</span>}
    </div>
  );
}

function Link({ pulseKey, order }: { pulseKey?: string; order: number }) {
  return (
    <div className="pipeline-link" aria-hidden="true">
      {pulseKey && <i key={pulseKey} style={{ animationDelay: `${order * 260}ms` }} />}
    </div>
  );
}
