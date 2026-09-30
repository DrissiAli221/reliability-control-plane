import { ArrowUpRight, X } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import type { IncidentChange } from "../tabSignal";
import { LiveLed } from "./StatusBadge";

const LINGER_MS = { opened: 30_000, resolved: 12_000 };

function Toast({ change, dismiss }: { change: IncidentChange; dismiss: (key: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(change.key), LINGER_MS[change.kind]);
    return () => window.clearTimeout(timer);
  }, [change.key, change.kind, dismiss]);
  const onDismiss = () => dismiss(change.key);

  const opened = change.kind === "opened";
  return (
    <li className={`toast ${opened ? "fault" : "good"}`} role={opened ? "alert" : "status"}>
      <LiveLed updatedAt={null} tone={opened ? "fault" : "good"} />
      <div className="toast-body">
        <span className="toast-word">{opened ? "INCIDENT" : "RESOLVED"}</span>
        <strong>{change.monitorName}</strong>
        <span className="toast-detail">
          {opened ? "Every region agreed the target is down." : "Consecutive UP checks closed the incident."}
          {" "}{new Date(change.at).toLocaleTimeString("en-GB")}
        </span>
      </div>
      <div className="toast-actions">
        <Link className="icon-button" to={`/monitors/${change.monitorId}`} aria-label={`Open ${change.monitorName}`} onClick={onDismiss}>
          <ArrowUpRight size={15} />
        </Link>
        <button type="button" className="icon-button" aria-label="Dismiss" onClick={onDismiss}><X size={15} /></button>
      </div>
    </li>
  );
}

/** Incident transitions surface wherever the operator is, and step aside on their own. */
export function IncidentToasts({ changes, dismiss }: { changes: IncidentChange[]; dismiss: (key: string) => void }) {
  if (changes.length === 0) return null;
  return (
    <ol className="toasts" aria-label="Incident updates">
      {changes.map((change) => <Toast key={change.key} change={change} dismiss={dismiss} />)}
    </ol>
  );
}
