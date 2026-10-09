import { AcceptedStatusCodesField } from "./AcceptedStatusCodesField";
import { parseStatusCodes } from "../statusCodes";
import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "../session";
import type { CreateMonitorInput } from "../types";
import { useFocusTrap } from "../useFocusTrap";

const INTERVALS: Array<[number, string]> = [[30, "30 seconds"], [60, "1 minute"], [300, "5 minutes"], [900, "15 minutes"]];
const TIMEOUTS: Array<[number, string]> = [[2_000, "2 seconds"], [5_000, "5 seconds"], [10_000, "10 seconds"]];

export function CreateMonitorDialog({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (input: CreateMonitorInput) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useFocusTrap<HTMLElement>();
  // Offer only what this deployment accepts; the server enforces the same limits either way.
  const limits = useSession()?.limits;
  const intervals = INTERVALS.filter(([seconds]) => !limits || seconds >= limits.minIntervalSeconds);
  const timeouts = TIMEOUTS.filter(([ms]) => !limits || ms <= limits.maxTimeoutMs);
  const defaultInterval = intervals.find(([seconds]) => seconds >= 60)?.[0] ?? intervals[0]?.[0] ?? 60;
  const defaultTimeout = [...timeouts].reverse().find(([ms]) => ms <= 5_000)?.[0] ?? timeouts[0]?.[0] ?? 5_000;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await onCreate({
        name: String(data.get("name")).trim(),
        targetUrl: String(data.get("targetUrl")).trim(),
        checkIntervalSeconds: Number(data.get("checkIntervalSeconds")),
        timeoutMs: Number(data.get("timeoutMs")),
        acceptedHttpStatuses: parseStatusCodes(String(data.get("acceptedHttpStatuses") ?? "")),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Monitor could not be created");
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog monitor-settings" role="dialog" aria-modal="true" aria-labelledby="create-title" ref={dialog}>
        <header className="dialog-header">
          <div>
            <h2 id="create-title">Create monitor</h2>
            <p>The URL is checked against the SSRF policy before any regional job is scheduled.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>Name</span>
            <input name="name" required maxLength={120} placeholder="Checkout API" autoFocus />
          </label>
          <label className="field">
            <span>URL</span>
            <input name="targetUrl" required type="url" placeholder="https://api.example.com/health" spellCheck={false} />
            <small>Public HTTP(S) on the default port. Private addresses and query strings are rejected.</small>
          </label>
          <div className="field-pair">
            <label className="field">
              <span>Check every</span>
              <select name="checkIntervalSeconds" defaultValue={String(defaultInterval)} key={`interval-${defaultInterval}`}>
                {intervals.map(([seconds, label]) => <option key={seconds} value={seconds}>{label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Timeout</span>
              <select name="timeoutMs" defaultValue={String(defaultTimeout)} key={`timeout-${defaultTimeout}`}>
                {timeouts.map(([ms, label]) => <option key={ms} value={ms}>{label}</option>)}
              </select>
            </label>
          </div>
          <AcceptedStatusCodesField disabled={saving} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="dialog-actions">
            <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="button primary" disabled={saving}>{saving ? "Creating…" : "Create monitor"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
