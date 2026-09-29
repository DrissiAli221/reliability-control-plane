import type { IncidentStateView } from "./types";

export type MachineNode = "healthy" | "suspect" | "open" | "recovering";

/** Where the persisted streak counters place the monitor; mirrors IncidentPolicy on the backend. */
export function machineNode(state: IncidentStateView): MachineNode {
  if (state.status === "OPEN") return state.consecutiveUp > 0 ? "recovering" : "open";
  return state.consecutiveDown > 0 ? "suspect" : "healthy";
}
