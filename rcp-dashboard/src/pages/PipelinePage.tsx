import { RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { pipelineSnapshot } from "../api";
import { isLocalAuth } from "../auth";
import { ChaosPanel } from "../components/ChaosPanel";
import { EventStream } from "../components/EventStream";
import { PipelineMap } from "../components/PipelineMap";
import { StatusBadge } from "../components/StatusBadge";
import { absoluteTime, durationBetween, relativeTime, verdictState } from "../format";
import { useLiveData, useNow } from "../useLiveData";
import { ErrorState, LiveIndicator } from "./MonitorsPage";

export function PipelinePage() {
  const snapshot = useLiveData(pipelineSnapshot, 5_000);
  const now = useNow();
  const navigate = useNavigate();
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
            <div className="panel-body"><PipelineMap snapshot={snapshot.data} local={local} /></div>
          </section>

          <EventStream />

          <div className={local ? "split wide-left" : undefined}>
            <section className="panel">
              <header className="panel-header">
                <h2>Recent checks</h2>
                <span className="subtle">Select one to open its trace</span>
              </header>
              {snapshot.data.recentActivity.length === 0 ? (
                <p className="panel-body subtle">No finalized checks yet.</p>
              ) : (
                <div className="table-scroll">
                  <table className="table compact">
                    <thead>
                      <tr>
                        <th scope="col">Verdict</th>
                        <th scope="col">Monitor</th>
                        <th scope="col">Check</th>
                        <th scope="col" className="num">Scheduled</th>
                        <th scope="col" className="num">Decided in</th>
                        <th scope="col">Incident</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.data.recentActivity.map((item, index) => {
                        const verdict = verdictState(item.verdict);
                        const open = () => navigate(`/monitors/${item.monitorId}?check=${item.executionId}`);
                        return (
                          <tr
                            key={item.executionId}
                            className="row-link"
                            style={{ animationDelay: `${index * 25}ms` }}
                            tabIndex={0}
                            onClick={open}
                            onKeyDown={(event) => { if (event.key === "Enter") open(); }}
                            aria-label={`Open trace for ${item.monitorName} check ${item.executionId.slice(0, 8)}`}
                          >
                            <td><StatusBadge label={verdict.label} tone={verdict.tone} /></td>
                            <td className="nowrap">{item.monitorName}</td>
                            <td className="mono subtle">{item.executionId.slice(0, 8)}</td>
                            <td className="num subtle" title={absoluteTime(item.scheduledAt)}>{relativeTime(item.scheduledAt, now)}</td>
                            <td className="num mono">{durationBetween(item.scheduledAt, item.finalizedAt)}</td>
                            <td>
                              {item.transition === "OPENED" && <StatusBadge label="Opened" tone="fault" />}
                              {item.transition === "RESOLVED" && <StatusBadge label="Resolved" tone="good" />}
                              {(item.transition === null || item.transition === "NONE" || item.transition === "IGNORED_STALE") && <span className="subtle">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            {local && <ChaosPanel />}
          </div>
        </>
      )}
    </>
  );
}
