import { Pause, Play } from "lucide-react";
import { useState } from "react";

export function MonitorToggleButton({ enabled, onToggle }: {
  enabled: boolean;
  onToggle: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await onToggle();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Monitor could not be updated");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-action">
      <button type="button" className="button secondary" disabled={busy} onClick={() => void toggle()}>
        {enabled ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
        {busy ? "Saving…" : enabled ? "Pause checks" : "Resume checks"}
      </button>
      {error && <span className="inline-error" role="alert">{error}</span>}
    </div>
  );
}
