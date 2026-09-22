import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicStatus } from "./api";
import type { PublicStatusPage } from "./types";

export function PublicStatus() {
  const { slug = "" } = useParams();
  const [page, setPage] = useState<PublicStatusPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { publicStatus(slug).then(setPage).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Status page unavailable")); }, [slug]);

  if (error) return <main className="public-shell"><section className="public-card"><p className="eyebrow">Status unavailable</p><h1>{error}</h1></section></main>;
  if (!page) return <main className="public-shell"><section className="public-card"><p>Loading current status…</p></section></main>;
  const healthy = page.overallStatus === "OPERATIONAL";
  return (
    <main className="public-shell">
      <section className="public-card">
        <header><div><p className="eyebrow">Service status</p><h1>{page.name}</h1></div><span className={`public-overall ${healthy ? "good" : "fault"}`}>{page.overallStatus.replaceAll("_", " ")}</span></header>
        <div className="component-list">{page.components.map((component) => <article key={component.name}><div><span className={`target-beacon ${component.status === "OPERATIONAL" ? "good" : "fault"}`} /><strong>{component.name}</strong></div><span>{component.status.replaceAll("_", " ")}</span></article>)}</div>
        <footer>Last generated {new Date(page.generatedAt).toLocaleString()} · Status is derived from finalized regional evidence.</footer>
      </section>
    </main>
  );
}
