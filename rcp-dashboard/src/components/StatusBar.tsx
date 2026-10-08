import type { PipelineSnapshot } from "../types";
import { milliseconds, relativeTime } from "../format";
import { useNow, type LiveData } from "../useLiveData";
import { LiveLed } from "./StatusBadge";

/**
 * An instrument strip along the bottom of the console: whether data is live, what each region delivered in the
 * pipeline's window, and the queues behind the decisions. It lives in the shell, so it survives navigation.
 */
export function StatusBar({ snapshot }: { snapshot: LiveData<PipelineSnapshot> }) {
  const now = useNow();
  const data = snapshot.data;
  if (!data) return null;
  const minutes = Math.round(data.windowSeconds / 60);

  return (
    <footer className="statusbar" aria-label="System status">
      <span className={`statusbar-live${snapshot.error ? " stale" : ""}`}>
        <LiveLed updatedAt={snapshot.error ? null : snapshot.updatedAt} tone={snapshot.error ? "warn" : "good"} />
        {snapshot.error ? "Stale" : "Live"}
      </span>
      <span className="statusbar-regions">
        {data.regions.map((region) => (
          <span key={region.region} className={region.resultsReceived > 0 ? undefined : "quiet"}>
            <b>{region.region}</b> {region.resultsReceived}<span className="statusbar-detail"> results · p50 {milliseconds(region.p50LatencyMs)}</span>
          </span>
        ))}
        <span className="statusbar-window">last {minutes} min</span>
      </span>
      <span className="statusbar-queues">
        <span className={data.failedOutbox > 0 ? "fault" : undefined}>outbox <b>{data.pendingOutbox}</b>{data.failedOutbox > 0 && <> · failed <b>{data.failedOutbox}</b></>}</span>
        <span>deciding <b>{data.awaitingIncidentEvaluation}</b></span>
        <span className={data.openIncidents > 0 ? "fault" : undefined}>incidents <b>{data.openIncidents}</b></span>
        <span className="statusbar-updated">{relativeTime(new Date(snapshot.updatedAt ?? now).toISOString(), now)}</span>
      </span>
    </footer>
  );
}
