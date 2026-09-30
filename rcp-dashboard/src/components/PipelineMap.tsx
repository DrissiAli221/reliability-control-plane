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
        card,
        index < before.length - 1
          ? <Link key={`link-${index}`} pulseKey={pulse?.key} order={index} />
          : <Fork key="fork-out" branches={Math.max(1, snapshot.regions.length)} direction="split" pulseKey={pulse?.key} order={index} />,
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
        index === 0
          ? <Fork key="fork-in" branches={Math.max(1, snapshot.regions.length)} direction="join" pulseKey={pulse?.key} order={index + 2} />
          : <Link key={`link-after-${index}`} pulseKey={pulse?.key} order={index + 2} />,
        card,
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

type Segment = { d: string; flow: boolean };

// Measures the connector so paths can be drawn in real pixels; dashes would stretch under a scaled viewBox.
function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((previous) => (previous.width === Math.round(width) && previous.height === Math.round(height)
        ? previous
        : { width: Math.round(width), height: Math.round(height) }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

/**
 * Draws a connector as dashed pixel paths snapped to whole pixels. Each straight piece is its own path that
 * starts on a dash, so pieces meet cleanly at corners instead of overlapping. Horizontal pieces drift in the
 * direction of travel; whenever a new check is finalized, a copy in its verdict colour flashes once.
 */
function Connector({ build, className = "", pulseKey, order }: {
  build: (width: number, height: number) => Segment[];
  className?: string;
  pulseKey?: string;
  order: number;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const segments = width && height ? build(width, height) : [];
  const draw = (segment: Segment, index: number) => <path key={index} d={segment.d} className={segment.flow ? "flow" : undefined} />;
  return (
    <div className={`pipeline-link ${className}`} ref={ref} aria-hidden="true">
      {segments.length > 0 && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} shapeRendering="crispEdges">
          <g className="flow-lines">{segments.map(draw)}</g>
          {pulseKey && <g key={pulseKey} className="flow-flash" style={{ animationDelay: `${order * 220}ms` }}>{segments.map(draw)}</g>}
        </svg>
      )}
    </div>
  );
}

// Dashes are 3px on a 7px rhythm; centring a 3px stroke on n + 1.5 keeps every dash on whole pixels.
const at = (value: number) => Math.round(value - 1.5) + 1.5;

function Link({ pulseKey, order }: { pulseKey?: string; order: number }) {
  return <Connector build={(width, height) => [{ d: `M0 ${at(height / 2)} H${width}`, flow: true }]} pulseKey={pulseKey} order={order} />;
}

// Vertical centre of region box `index` among `count` equal boxes separated by the 8px column gap.
const REGION_GAP = 8;
function branchY(index: number, count: number, height: number): number {
  const box = (height - (count - 1) * REGION_GAP) / count;
  return at(index * (box + REGION_GAP) + box / 2);
}

/**
 * The outbox fans each check out to one queue per region, and ingestion gathers the results back in:
 * a trunk, a spine across the region boxes, and one branch landing on the middle of each box.
 * The trunk stops where the spine begins, so no dash is drawn twice.
 */
function Fork({ branches, direction, pulseKey, order }: { branches: number; direction: "split" | "join"; pulseKey?: string; order: number }) {
  const build = (width: number, height: number): Segment[] => {
    const middle = at(height / 2);
    const spine = at(width / 2);
    const ys = Array.from({ length: branches }, (_, index) => branchY(index, branches, height));
    const near = spine - 1.5;
    const far = spine + 1.5;
    const trunk = direction === "split" ? `M0 ${middle} H${near}` : `M${far} ${middle} H${width}`;
    const arms = ys.map((y) => (direction === "split" ? `M${far} ${y} H${width}` : `M0 ${y} H${near}`));
    const segments: Segment[] = [{ d: trunk, flow: true }, ...arms.map((d) => ({ d, flow: true }))];
    if (branches > 1) segments.push({ d: `M${spine} ${ys[0] - 1.5} V${ys[ys.length - 1] + 1.5}`, flow: false });
    return segments;
  };
  return <Connector build={build} className={`fork ${direction}`} pulseKey={pulseKey} order={order} />;
}
