import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { CreateMonitorInput } from "../types";
import { useFocusTrap } from "../useFocusTrap";

export function CreateMonitorDialog({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (input: CreateMonitorInput) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useFocusTrap<HTMLElement>();

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
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Monitor could not be created");
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="create-title" ref={dialog}>
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
              <select name="checkIntervalSeconds" defaultValue="60">
                <option value="30">30 seconds</option>
                <option value="60">1 minute</option>
                <option value="300">5 minutes</option>
              </select>
            </label>
            <label className="field">
              <span>Timeout</span>
              <select name="timeoutMs" defaultValue="5000">
                <option value="2000">2 seconds</option>
                <option value="5000">5 seconds</option>
                <option value="10000">10 seconds</option>
              </select>
            </label>
          </div>
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
