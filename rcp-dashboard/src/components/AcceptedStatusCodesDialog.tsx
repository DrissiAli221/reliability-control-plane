import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { setAcceptedHttpStatuses } from "../api";
import { formatStatusCodes, parseStatusCodes } from "../statusCodes";
import { useFocusTrap } from "../useFocusTrap";
import { AcceptedStatusCodesField } from "./AcceptedStatusCodesField";

export function AcceptedStatusCodesDialog({ monitorId, codes, onClose, onSaved }: {
  monitorId: string; codes?: number[] | null; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const dialog = useFocusTrap<HTMLElement>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    function key(event: KeyboardEvent) { if (event.key === "Escape" && !busy) onClose(); }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose, busy]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const value = String(new FormData(event.currentTarget).get("acceptedHttpStatuses") ?? "");
    setBusy(true); setError(null);
    try { await setAcceptedHttpStatuses(monitorId, parseStatusCodes(value)); await onSaved(); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Statuses could not be saved"); setBusy(false); }
  }
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
    <section className="dialog monitor-settings" role="dialog" aria-modal="true" aria-labelledby="statuses-title" ref={dialog}>
      <header className="dialog-header"><div><h2 id="statuses-title">Accepted HTTP statuses</h2><p>Applies to new checks. Past checks keep their original rule and verdict.</p></div>
        <button className="icon-button" type="button" aria-label="Close" disabled={busy} onClick={onClose}><X size={16} /></button></header>
      <form onSubmit={(event) => void submit(event)}>
        <AcceptedStatusCodesField defaultValue={codes ? formatStatusCodes(codes) : ""} disabled={busy} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="dialog-actions"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save statuses"}</button></footer>
      </form>
    </section>
  </div>;
}
