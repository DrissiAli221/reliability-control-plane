import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useTheme } from "../theme";
import embedScript from "../../public/visual-guide/embed.js?raw";

import { guideForPath, GUIDE_VIEWS, legacyGuidePath } from "../visualGuide";
import { NotFoundPage } from "./NotFoundPage";

function Figure({ name, title }: { name: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);
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
          const embedded = html
            .replace('<meta charset', `<base href="${base}"><meta charset`)
            .replace('<script src="./embed.js"></script>', () => `<script>${embedScript.replace(/<\/script/gi, "<\\/script")}</script>`);
          setDocument(embedded);
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

  if (failed) return <p className="panel-body" role="alert">The figure could not load. Reload the page and try again.</p>;
  if (!document) return <p className="panel-body subtle" role="status">Loading figure…</p>;
  return <iframe ref={frame} title={title} srcDoc={document} sandbox="allow-scripts allow-downloads allow-popups" onLoad={sendTheme} className="guide-frame" scrolling={height === null ? "auto" : "no"} style={{ height: height ?? "max(480px, 75vh)" }} />;
}

export function VisualGuidePage() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  if (pathname === "/learn") return <Navigate replace to={legacyGuidePath(params.get("diagram"))} />;
  const selected = guideForPath(pathname);
  if (!selected) return <NotFoundPage />;

  return (
    <>
      <header className="page-header"><h1>How RCP works</h1></header>
      <nav className="guide-nav" aria-label="Visual guide">
        {GUIDE_VIEWS.map((view) => <Link key={view.id} to={`/learn/${view.id}`} aria-current={view.id === selected.id ? "page" : undefined}>{view.label}</Link>)}
      </nav>
      <p className="guide-intro">{selected.intro}</p>
      <section className="guide-figure" aria-label={selected.title}>
        <Figure key={selected.id} name={selected.artifact} title={selected.title} />
      </section>
      <p className="guide-note">Configuration and illustrative examples; these figures do not query live cloud services or change your monitors.</p>
    </>
  );
}
