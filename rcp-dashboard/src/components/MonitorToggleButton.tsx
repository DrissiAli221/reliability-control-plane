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

  return <div className="monitor-toggle">
    <button type="button" disabled={busy} onClick={() => void toggle()}>
      {busy ? "Saving…" : enabled ? "Pause checks" : "Resume checks"}
    </button>
    {error && <span role="alert">{error}</span>}
  </div>;
}
