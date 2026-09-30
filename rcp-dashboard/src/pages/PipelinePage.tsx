import { RefreshCw } from "lucide-react";
import { pipelineSnapshot } from "../api";
import { isLocalAuth } from "../auth";
import { ChaosPanel } from "../components/ChaosPanel";
import { DecisionTimes } from "../components/DecisionTimes";
import { EventStream } from "../components/EventStream";
import { PipelineMap } from "../components/PipelineMap";
import { useLiveData, useNow } from "../useLiveData";
import { ErrorState, LiveIndicator } from "./MonitorsPage";

export function PipelinePage() {
  const snapshot = useLiveData(pipelineSnapshot, 5_000);
  const now = useNow();
  const local = isLocalAuth();

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Pipeline</h1>
          <p>How every check travels from the scheduler to an incident decision. Counts cover your monitors only.</p>
        </div>
        <div className="page-actions">
          <LiveIndicator updatedAt={snapshot.updatedAt} now={now} error={snapshot.error} />
          <button type="button" className="icon-button bordered" onClick={() => void snapshot.refresh()} aria-label="Refresh" disabled={snapshot.loading}>
            <RefreshCw size={15} className={snapshot.loading ? "spin" : undefined} />
          </button>
        </div>
      </header>

      {snapshot.error && !snapshot.data && <ErrorState message={snapshot.error} retry={snapshot.refresh} />}
      {!snapshot.data && !snapshot.error && <div className="skeletons"><div className="skeleton tall" /></div>}

      {snapshot.data && (
        <>
          <section className="panel" data-tour="stages">
            <header className="panel-header">
              <h2>Stages</h2>
              <span className="subtle">Throughput over the last {Math.round(snapshot.data.windowSeconds / 60)} min · refreshes every 5 s</span>
            </header>
            {local && <div data-tour="drill"><ChaosPanel inline /></div>}
            <div className="panel-body"><PipelineMap snapshot={snapshot.data} local={local} /></div>
          </section>

          <div className="split wide-left">
            <section className="panel">
              <header className="panel-header">
                <h2>Time to decision</h2>
                <span className="subtle">Scheduled → verdict · select one to trace it</span>
              </header>
              {snapshot.data.recentActivity.length === 0
                ? <p className="panel-body subtle">No finalized checks yet.</p>
                : <DecisionTimes activity={snapshot.data.recentActivity} now={now} />}
            </section>
            <EventStream />
          </div>
        </>
      )}
    </>
  );
}
