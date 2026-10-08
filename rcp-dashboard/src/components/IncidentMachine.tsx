import { useId } from "react";
import { absoluteTime, ordinal, relativeTime, type Tone } from "../format";
import { machineNode, type MachineNode as Node } from "../machine";
import type { IncidentStateView } from "../types";


const NODES: Node[] = ["healthy", "suspect", "open", "recovering"];
const NODE_TONE: Record<Node, Tone> = { healthy: "good", suspect: "warn", open: "fault", recovering: "good" };
const TITLE: Record<Node, string> = { healthy: "Healthy", suspect: "Suspect", open: "Incident open", recovering: "Recovering" };
const MEANING: Record<Node, string> = { healthy: "no incident", suspect: "one DOWN seen", open: "page is down", recovering: "one UP seen" };

/** The incident policy as four touching cells (the states) and a legend of every move between them. */
export function IncidentMachine({ state, now, showTape = true }: { state: IncidentStateView; now: number; showTape?: boolean }) {
  const id = useId();
  const current = machineNode(state);
  // The active cell reads the live streak against the thresholds; the others say what the state means.
  const detail: Record<Node, string> = {
    ...MEANING,
    suspect: current === "suspect" ? `${state.consecutiveDown} of ${state.failuresToOpen} DOWN` : MEANING.suspect,
    open: current === "open" && state.openedAt ? `since ${relativeTime(state.openedAt, now).replace(" ago", "")}` : MEANING.open,
    recovering: current === "recovering" ? `${state.consecutiveUp} of ${state.successesToResolve} UP` : MEANING.recovering,
  };
  const moves: { from: Node; to: Node; on: string }[] = [
    { from: "healthy", to: "suspect", on: "DOWN" },
    { from: "suspect", to: "healthy", on: "UP" },
    { from: "suspect", to: "open", on: `${ordinal(state.failuresToOpen)} DOWN` },
    { from: "open", to: "recovering", on: "UP" },
    { from: "recovering", to: "open", on: "DOWN" },
    { from: "recovering", to: "healthy", on: `${ordinal(state.successesToResolve)} UP · resolved` },
  ];
  const evaluations = [...state.recentEvaluations].reverse();
  const last = state.recentEvaluations[0];

  return (
    <div className="machine">
      <div role="group" aria-label="Incident state machine" aria-describedby={`${id}-desc`}>
        <span id={`${id}-desc`} className="sr-only">Current state: {TITLE[current]}, {detail[current]}.</span>
        <ol className="machine-cells">
          {NODES.map((node, index) => (
            <li key={node} className={node === current ? "current" : undefined} data-tone={NODE_TONE[node]} aria-current={node === current ? "true" : undefined}>
              <span className="lbl">state {index + 1}</span>
              <strong>{TITLE[node]}</strong>
              <small>{detail[node]}</small>
            </li>
          ))}
        </ol>
        <ul className="machine-moves" aria-label="State transitions">
          {moves.map((move) => (
            <li key={`${move.from}-${move.to}`} className={move.from === current ? "out" : undefined}>
              <span>{TITLE[move.from].toLowerCase()} <i aria-hidden="true">→</i> {TITLE[move.to].toLowerCase()}</span>
              <span className="on">on {move.on}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="machine-foot">
        {showTape && <div className="tape" aria-label="Recent incident evaluations, oldest first">
          {evaluations.map((evaluation) => (
            <span
              key={evaluation.executionId}
              className={`tape-cell ${evaluation.verdict.toLowerCase()}${evaluation.transition === "OPENED" || evaluation.transition === "RESOLVED" ? " transition" : ""}`}
              title={`${evaluation.verdict} · ${evaluation.transition.toLowerCase()} · ${absoluteTime(evaluation.scheduledAt)}`}
            >
              {evaluation.verdict === "DISAGREEMENT" ? "≠" : evaluation.verdict === "NO_DATA" ? "?" : evaluation.verdict === "UP" ? "↑" : "↓"}
            </span>
          ))}
        </div>}
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
