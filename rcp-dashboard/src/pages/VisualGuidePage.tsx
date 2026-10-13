import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useTheme } from "../theme";

const diagrams = [
  { id: "deployment", title: "Deployment", detail: "Where the services run and how they connect." },
  { id: "lifecycle", title: "Life of one check", detail: "From durable intent to observations, a verdict and an incident decision." },
  { id: "verdicts", title: "Verdicts and incidents", detail: "How two regional observations become a verdict, then change a streak." },
  { id: "availability", title: "Availability and coverage", detail: "Why a clean percentage needs enough evidence behind it." },
] as const;

function Figure({ name, title }: { name: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1000);
  const [document, setDocument] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    const controller = new AbortController();
    // CloudFront deliberately denies framing HTTP responses. srcDoc preserves that policy
    // while isolating the exported figure in an opaque-origin sandbox.
    fetch(`/visual-guide/${name}.html`, { signal: controller.signal, credentials: "omit" })
      .then((response) => {
        if (!response.ok) throw new Error("Figure unavailable");
        return response.text();
      })
      .then((html) => {
        if (!controller.signal.aborted) {
          const base = new URL("/visual-guide/", window.location.href).href;
          setDocument(html.replace('<meta charset', `<base href="${base}"><meta charset`));
        }
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [name]);

  useEffect(() => {
    function resize(event: MessageEvent) {
      // Sandboxed figures have opaque origins. Identify the exact mounted frame instead.
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "rcp-guide-size") return;
      const next = event.data.height;
      if (typeof next === "number" && Number.isFinite(next) && next >= 200 && next <= 14000) setHeight(Math.ceil(next));
    }
    window.addEventListener("message", resize);
    return () => window.removeEventListener("message", resize);
  }, []);

  function sendTheme() {
    frame.current?.contentWindow?.postMessage({ type: "rcp-guide-theme", theme }, "*");
  }
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: "rcp-guide-theme", theme }, "*");
  }, [theme]);

  if (failed) return <p className="panel-body" role="alert">The figure could not load. Reload the page or use “Open figure” above.</p>;
  if (!document) return <p className="panel-body subtle" role="status">Loading figure…</p>;
  return <iframe ref={frame} title={title} srcDoc={document} sandbox="allow-scripts allow-downloads" onLoad={sendTheme} className="guide-frame" style={{ height }} />;
}

export function VisualGuidePage() {
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const machine = pathname === "/learn/machine";
  const selected = diagrams.find((diagram) => diagram.id === params.get("diagram")) ?? diagrams[0];
  const name = machine ? "machine" : selected.id;
  const title = machine ? "The monitoring machine" : selected.title;
  useEffect(() => { document.title = `RCP · ${title}`; }, [title]);

  return (
    <>
      <header className="page-header">
        <div><h1>How RCP works</h1><p>Follow the evidence, from one scheduled check to a supported decision.</p></div>
      </header>
      <nav className="guide-views" aria-label="Guide views">
        <Link to="/learn" aria-current={!machine ? "page" : undefined}>Diagrams</Link>
        <Link to="/learn/machine" aria-current={machine ? "page" : undefined}>Interactive machine</Link>
      </nav>
      {!machine && <nav className="guide-diagrams" aria-label="Choose a diagram">
        {diagrams.map((diagram) => <button className="button secondary" key={diagram.id} type="button" aria-pressed={selected.id === diagram.id} onClick={() => setParams({ diagram: diagram.id }, { replace: true })}>{diagram.title}</button>)}
      </nav>}
      <section className="panel guide-panel" aria-labelledby="guide-title">
        <header className="panel-header guide-heading">
          <div><h2 id="guide-title">{title}</h2><p>{machine ? "Run a check, inspect each stage, or play the outage-to-recovery sequence. These examples are illustrative." : selected.detail}</p></div>
          <a href={`/visual-guide/${name}.html`} target="_blank" rel="noreferrer" className="guide-open">Open figure <ArrowUpRight size={14} aria-hidden="true" /></a>
        </header>
        <Figure key={name} name={name} title={title} />
      </section>
      <p className="guide-note">The figures explain configuration and decision rules. Their examples run locally in your browser and do not change monitors or query live cloud services.</p>
    </>
  );
}
