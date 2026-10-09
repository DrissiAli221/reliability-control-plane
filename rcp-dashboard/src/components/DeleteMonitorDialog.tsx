import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { deleteMonitor } from "../api";
import { useFocusTrap } from "../useFocusTrap";

export function DeleteMonitorDialog({ monitorId, name, onClose, onDeleted }: {
  monitorId: string; name: string; onClose: () => void; onDeleted: () => void;
}) {
  const dialog = useFocusTrap<HTMLElement>();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    function key(event: KeyboardEvent) { if (event.key === "Escape" && !busy) onClose(); }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose, busy]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || confirmation !== name) return;
    setBusy(true); setError(null);
    try { await deleteMonitor(monitorId); onDeleted(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Monitor could not be deleted"); setBusy(false); }
  }
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
    <section className="dialog monitor-settings" role="dialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description" ref={dialog}>
      <header className="dialog-header"><div><h2 id="delete-title">Delete monitor</h2>
        <p id="delete-description">Remove {name} from your monitors and public status pages, stop checks and free its quota slot. This cannot be undone. Stored history is retained internally, but will no longer be accessible.</p></div>
        <button className="icon-button" type="button" aria-label="Close" disabled={busy} onClick={onClose}><X size={16} /></button>
      </header>
      <form onSubmit={(event) => void submit(event)}>
        <label className="field"><span>Type {name} to confirm</span><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} autoComplete="off" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="dialog-actions"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="button primary" type="submit" disabled={busy || confirmation !== name}>{busy ? "Deleting…" : "Delete monitor"}</button></footer>
      </form>
    </section>
  </div>;
}
