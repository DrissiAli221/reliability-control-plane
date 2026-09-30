import { ChevronDown } from "lucide-react";
import { machineNode, type MachineNode } from "../machine";
import { relativeTime, type Tone } from "../format";
import type { IncidentStateView } from "../types";
import { StatusDot } from "./StatusBadge";

const LABEL: Record<MachineNode, string> = { healthy: "Healthy", suspect: "Suspect", open: "Incident open", recovering: "Recovering" };
const TONE: Record<MachineNode, Tone> = { healthy: "good", suspect: "warn", open: "fault", recovering: "info" };

/** The incident policy in one line: where the monitor is, how long the streak is, and what would move it next. */
export function PolicyStrip({ state, now, expanded, onToggle }: {
  state: IncidentStateView;
  now: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const node = machineNode(state);
  // The persisted UP streak only runs during recovery, so a healthy streak is read from the recent evaluations.
  const upRun = state.recentEvaluations.findIndex((evaluation) => evaluation.verdict !== "UP");
  const healthyRun = upRun === -1 ? state.recentEvaluations.length : upRun;
  const streak: Record<MachineNode, string> = {
    healthy: `${healthyRun}${upRun === -1 && healthyRun > 0 ? "+" : ""} UP in a row`,
    suspect: `${state.consecutiveDown} of ${state.failuresToOpen} DOWN`,
    open: state.openedAt ? `open since ${relativeTime(state.openedAt, now).replace(" ago", "")}` : "open",
    recovering: `${state.consecutiveUp} of ${state.successesToResolve} UP`,
  };
  const next: Record<MachineNode, string> = {
    healthy: "a DOWN verdict makes it Suspect",
    suspect: `${state.failuresToOpen - state.consecutiveDown} more DOWN opens an incident`,
    open: "an UP verdict starts recovery",
    recovering: `${state.successesToResolve - state.consecutiveUp} more UP resolves it`,
  };
  return (
    <div className={`policy-strip ${TONE[node]}`}>
      <StatusDot tone={TONE[node]} />
      <strong>{LABEL[node]}</strong>
      <span className="mono">{streak[node]}</span>
      <span className="subtle policy-next">next: {next[node]}</span>
      <button type="button" className="policy-toggle" onClick={onToggle} aria-expanded={expanded}>
        {expanded ? "Hide" : "State machine"} <ChevronDown size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
