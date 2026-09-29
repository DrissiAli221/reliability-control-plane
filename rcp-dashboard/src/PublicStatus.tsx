import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicStatus } from "./api";
import type { PublicStatusPage } from "./types";

const REFRESH_INTERVAL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

export function PublicStatus() {
  const { slug = "" } = useParams();
  const [page, setPage] = useState<PublicStatusPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let currentRequest: AbortController | null = null;
    setPage(null);
    setError(null);

    const refresh = () => {
      currentRequest?.abort();
      const request = new AbortController();
      currentRequest = request;
      const timeout = window.setTimeout(() => {
        request.abort();
        if (active && currentRequest === request) setError("Status page refresh timed out");
      }, REQUEST_TIMEOUT_MS);
      publicStatus(slug, request.signal)
        .then((result) => {
          if (!active || currentRequest !== request || request.signal.aborted) return;
          setPage(result);
          setError(null);
        })
        .catch((reason: unknown) => {
          if (!active || currentRequest !== request) return;
          setError(request.signal.aborted
            ? "Status page refresh timed out"
            : reason instanceof Error ? reason.message : "Status page unavailable");
        })
        .finally(() => window.clearTimeout(timeout));
    };

    refresh();
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
      currentRequest?.abort();
    };
  }, [slug]);

  if (error) return <main className="public-shell"><section className="public-card"><p className="eyebrow">Status unavailable</p><h1>{error}</h1></section></main>;
  if (!page) return <main className="public-shell"><section className="public-card"><p>Loading current status…</p></section></main>;
  const overallTone = page.overallStatus === "OPERATIONAL" ? "good" : page.overallStatus === "UNKNOWN" ? "muted" : "fault";
  return (
    <main className="public-shell">
      <section className="public-card">
        <header><div><p className="eyebrow">Service status</p><h1>{page.name}</h1></div><span className={`public-overall ${overallTone}`}>{page.overallStatus.replaceAll("_", " ")}</span></header>
        <div className="component-list">{page.components.map((component) => <article key={component.name}><div><span className={`target-beacon ${component.status === "OPERATIONAL" ? "good" : ["PAUSED", "UNKNOWN", "STALE"].includes(component.status) ? "muted" : "fault"}`} /><strong>{component.name}</strong></div><span>{component.status.replaceAll("_", " ")}</span></article>)}</div>
        <footer>Last generated {new Date(page.generatedAt).toLocaleString()} · Active status is derived from recent finalized regional evidence; paused or stale components are not currently measured.</footer>
      </section>
    </main>
  );
}
