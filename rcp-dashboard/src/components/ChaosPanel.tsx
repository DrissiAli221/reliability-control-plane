import { FlaskConical, RotateCcw } from "lucide-react";
import { useState } from "react";
import { faultMode, setFaultMode } from "../api";
import { ordinal } from "../format";
import type { FaultMode } from "../types";
import { useLiveData } from "../useLiveData";

const MODES: Array<{ mode: FaultMode; label: string; effect: string; opensIncident: boolean }> = [
  { mode: "PASS_THROUGH", label: "Off", effect: "Real HTTP requests to each target.", opensIncident: false },
  { mode: "HTTP_503", label: "HTTP 503", effect: "Both regions receive a 503: target evidence, so checks go DOWN.", opensIncident: true },
  { mode: "REQUEST_TIMEOUT", label: "Timeout", effect: "Requests time out: a target failure, so checks go DOWN.", opensIncident: true },
  { mode: "CONNECTION_FAILURE", label: "Refused", effect: "Connections fail: a target failure, so checks go DOWN.", opensIncident: true },
  { mode: "RESPONSE_TOO_LARGE", label: "Too large", effect: "Bodies exceed the cap: inconclusive, so checks are NO_DATA and never open an incident.", opensIncident: false },
];

/**
 * Local-profile fault switch. It changes what the in-JVM probe adapters report for every monitor;
 * URL validation and the whole decision pipeline still run unchanged.
 */
export function ChaosPanel({ failuresToOpen = 2, inline = false }: { failuresToOpen?: number; inline?: boolean }) {
  const current = useLiveData(faultMode, 10_000);
  const [pending, setPending] = useState<FaultMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = MODES.find((item) => item.mode === (pending ?? current.data)) ?? MODES[0];

  async function change(mode: FaultMode) {
    setPending(mode);
    setError(null);
    try {
      await setFaultMode(mode);
      await current.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Fault mode could not be changed");
    } finally {
      setPending(null);
    }
  }

  const modes = (
    <div className="segmented chaos-modes" role="radiogroup" aria-label="Probe fault mode">
      {MODES.map((item) => (
        <button
          key={item.mode}
          type="button"
          role="radio"
          aria-checked={active.mode === item.mode}
          disabled={pending != null}
          onClick={() => void change(item.mode)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
  const effect = (
    <p className="chaos-effect">
      {active.effect}
      {active.opensIncident && <> An incident opens on the {ordinal(failuresToOpen)} consecutive DOWN.</>}
    </p>
  );
  const failure = error ?? (current.error && !current.data ? current.error : null);
  const armed = active.mode !== "PASS_THROUGH";

  if (inline) {
    return (
      <div className={`chaos-inline${armed ? " armed" : ""}`} aria-label="Fault injection">
        <span className="chaos-inline-label"><FlaskConical size={14} aria-hidden="true" /> Fault drill <span className="env-pill">Local</span></span>
        {modes}
        {effect}
        {failure && <p className="inline-error" role="alert">{failure}</p>}
      </div>
    );
  }

  return (
    <section className={`panel chaos${armed ? " armed" : ""}`} aria-label="Fault injection" data-tour="drill">
      <header className="panel-header">
        <h2><FlaskConical size={14} aria-hidden="true" /> Fault drill</h2>
        <span className="env-pill">Local only</span>
      </header>
      <div className="panel-body">
        {modes}
        {effect}
        {armed && (
          <button type="button" className="button secondary" onClick={() => void change("PASS_THROUGH")} disabled={pending != null}>
            <RotateCcw size={14} aria-hidden="true" /> Restore real probing
          </button>
        )}
        <p className="subtle chaos-scope">Affects every monitor on this local control plane. Target URL validation still runs.</p>
        {failure && <p className="inline-error" role="alert">{failure}</p>}
      </div>
    </section>
  );
}
