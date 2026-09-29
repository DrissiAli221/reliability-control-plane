import { useId } from "react";
import { absoluteTime, ordinal, relativeTime, type Tone } from "../format";
import { machineNode, type MachineNode as Node } from "../machine";
import type { IncidentStateView } from "../types";


const NODE_TONE: Record<Node, Tone> = { healthy: "good", suspect: "warn", open: "fault", recovering: "info" };
const NODE_X: Record<Node, number> = { healthy: 16, suspect: 212, open: 408, recovering: 604 };
const WIDTH = 116;
const Y = 70;
const HEIGHT = 50;
const right = (node: Node) => NODE_X[node] + WIDTH;
const mid = (from: Node, to: Node) => (right(from) + NODE_X[to]) / 2;

export function IncidentMachine({ state, now }: { state: IncidentStateView; now: number }) {
  // useId output can contain characters that break SVG url(#…) references.
  const id = `machine-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const current = machineNode(state);
  const subtitle: Record<Node, string> = {
    healthy: "no incident",
    suspect: `${state.consecutiveDown} of ${state.failuresToOpen} DOWN`,
    open: state.openedAt ? `since ${relativeTime(state.openedAt, now).replace(" ago", "")}` : "incident",
    recovering: `${state.consecutiveUp} of ${state.successesToResolve} UP`,
  };
  const title: Record<Node, string> = { healthy: "Healthy", suspect: "Suspect", open: "Incident open", recovering: "Recovering" };
  const evaluations = [...state.recentEvaluations].reverse();
  const last = state.recentEvaluations[0];

  return (
    <div className="machine">
      <svg viewBox="0 0 736 200" role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`}>
        <title id={`${id}-title`}>Incident state machine</title>
        <desc id={`${id}-desc`}>Current state: {title[current]}, {subtitle[current]}.</desc>
        <defs>
          <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="machine-arrowhead" />
          </marker>
        </defs>

        <Edge arrow={`${id}-arrow`} d={`M${right("healthy")} ${Y + 25} H${NODE_X.suspect - 4}`} label="DOWN" lx={mid("healthy", "suspect")} ly={Y + 17} />
        <Edge arrow={`${id}-arrow`} d={`M${right("suspect")} ${Y + 25} H${NODE_X.open - 4}`} label={`${ordinal(state.failuresToOpen)} DOWN`} lx={mid("suspect", "open")} ly={Y + 17} />
        <Edge arrow={`${id}-arrow`} d={`M${right("open")} ${Y + 25} H${NODE_X.recovering - 4}`} label="UP" lx={mid("open", "recovering")} ly={Y + 17} />
        <Edge
          arrow={`${id}-arrow`}
          d={`M${NODE_X.suspect + 30} ${Y} C${NODE_X.suspect + 10} ${Y - 46}, ${right("healthy") - 10} ${Y - 46}, ${right("healthy") - 30} ${Y - 4}`}
          label="UP" lx={mid("healthy", "suspect")} ly={Y - 38}
        />
        <Edge
          arrow={`${id}-arrow`}
          d={`M${NODE_X.recovering + 30} ${Y} C${NODE_X.recovering + 10} ${Y - 46}, ${right("open") - 10} ${Y - 46}, ${right("open") - 30} ${Y - 4}`}
          label="DOWN" lx={mid("open", "recovering")} ly={Y - 38}
        />
        <Edge
          arrow={`${id}-arrow`}
          d={`M${NODE_X.recovering + WIDTH / 2} ${Y + HEIGHT} C${NODE_X.recovering + WIDTH / 2} ${Y + 122}, ${NODE_X.healthy + WIDTH / 2} ${Y + 122}, ${NODE_X.healthy + WIDTH / 2} ${Y + HEIGHT + 4}`}
          label={`${ordinal(state.successesToResolve)} UP · resolved`}
          lx={(NODE_X.healthy + right("recovering")) / 2}
          ly={Y + 110}
        />

        {(Object.keys(NODE_X) as Node[]).map((node) => (
          <g key={node} className={`machine-node ${node === current ? `current ${NODE_TONE[node]}` : ""}`}>
            {node === current && <rect className="machine-halo" x={NODE_X[node] - 4} y={Y - 4} width={WIDTH + 8} height={HEIGHT + 8} rx="12" />}
            <rect x={NODE_X[node]} y={Y} width={WIDTH} height={HEIGHT} rx="9" />
            <text x={NODE_X[node] + WIDTH / 2} y={Y + 21} className="machine-title">{title[node]}</text>
            <text x={NODE_X[node] + WIDTH / 2} y={Y + 38} className="machine-sub">{node === current ? subtitle[node] : ""}</text>
          </g>
        ))}
      </svg>

      <div className="machine-foot">
        <div className="tape" aria-label="Recent incident evaluations, oldest first">
          {evaluations.map((evaluation) => (
            <span
              key={evaluation.executionId}
              className={`tape-cell ${evaluation.verdict.toLowerCase()}${evaluation.transition === "OPENED" || evaluation.transition === "RESOLVED" ? " transition" : ""}`}
              title={`${evaluation.verdict} · ${evaluation.transition.toLowerCase()} · ${absoluteTime(evaluation.scheduledAt)}`}
            >
              {evaluation.verdict === "DISAGREEMENT" ? "≠" : evaluation.verdict === "NO_DATA" ? "?" : evaluation.verdict === "UP" ? "↑" : "↓"}
            </span>
          ))}
        </div>
        <p className="subtle">
          {last
            ? <>Last evaluation {relativeTime(last.evaluatedAt, now)}: {last.verdict}{last.transition === "NONE" ? ", no transition" : `, incident ${last.transition.toLowerCase()}`}.</>
            : "No evaluations yet."}
          {" "}Disagreement or no data resets the streak without changing status.
        </p>
      </div>
    </div>
  );
}

function Edge({ arrow, d, label, lx, ly }: { arrow: string; d: string; label: string; lx: number; ly: number }) {
  return (
    <g className="machine-edge">
      <path d={d} markerEnd={`url(#${arrow})`} />
      <text x={lx} y={ly} className="machine-label">{label}</text>
    </g>
  );
}
