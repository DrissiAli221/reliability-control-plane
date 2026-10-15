import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTheme } from "../theme";
import embedScript from "../../public/visual-guide/embed.js?raw";

import { guideForPath, GUIDE_VIEWS, legacyGuidePath } from "../visualGuide";
import { LoadingNote, Sk } from "../components/Skeleton";
import { NotFoundPage } from "./NotFoundPage";
import { ErrorState } from "./MonitorsPage";

/** Approximate content heights, [wide, narrow], from measured frames; the last measured height replaces them within a session. */
const EXPECTED_HEIGHT: Record<string, readonly [number, number]> = {
  deployment: [1228, 768],
  lifecycle: [1650, 981],
  verdicts: [1695, 1291],
  availability: [1727, 1459],
  machine: [594, 888],
};
const narrow = () => typeof window.matchMedia === "function" && window.matchMedia("(max-width: 900px)").matches;
const storageKey = (name: string, isNarrow: boolean) => `rcp.guide.height.${name}.${isNarrow ? "narrow" : "wide"}`;

function expectedHeight(name: string): number {
  const isNarrow = narrow();
  try {
    const stored = Number(sessionStorage.getItem(storageKey(name, isNarrow)));
    if (Number.isFinite(stored) && stored >= 200 && stored <= 14000) return stored;
  } catch {
    // Without storage the defaults still reserve a sensible height.
  }
  return (EXPECTED_HEIGHT[name] ?? [900, 900])[isNarrow ? 1 : 0];
}

/** Shaped like the figure: a control bar and the canvas, in the dashboard's own loading blocks. */
function FigureSkeleton() {
  return (
    <div className="guide-skeleton" aria-hidden="true">
      <div className="guide-skeleton-bar"><Sk w={360} h={26} /><Sk w={160} h={32} className="guide-skeleton-actions" /></div>
      <div className="guide-skeleton-canvas"><Sk w="100%" h="100%" /></div>
    </div>
  );
}

function Figure({ name, title }: { name: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [document, setDocument] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [expected] = useState(() => expectedHeight(name));
  const theme = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

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
          // The figure starts in the dashboard's theme so it never flashes the other one before the first theme message.
          const embedded = html
            .replace(/<html\b/, `<html data-theme="${themeRef.current}"`)
            .replace('<meta charset', `<base href="${base}"><meta charset`)
            .replace('<script src="./embed.js"></script>', () => `<script>${embedScript.replace(/<\/script/gi, "<\\/script")}</script>`);
          setDocument(embedded);
        }
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [name, attempt]);

  useEffect(() => {
    function resize(event: MessageEvent) {
      // Sandboxed figures have opaque origins. Identify the exact mounted frame instead.
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "rcp-guide-size") return;
      const next = event.data.height;
      if (typeof next === "number" && Number.isFinite(next) && next >= 200 && next <= 14000) {
        setHeight(Math.ceil(next));
        setRevealed(true);
        try {
          sessionStorage.setItem(storageKey(name, narrow()), String(Math.ceil(next)));
        } catch {
          // Remembering the height is only a convenience.
        }
      }
    }
    window.addEventListener("message", resize);
    return () => window.removeEventListener("message", resize);
  }, [name]);

  // A frame that never reports a size (hidden tab, blocked script) is still shown after a moment, at the reserved height.
  useEffect(() => {
    if (!document) return;
    const timer = window.setTimeout(() => setRevealed(true), 2500);
    return () => window.clearTimeout(timer);
  }, [document]);

  function sendTheme() {
    frame.current?.contentWindow?.postMessage({ type: "rcp-guide-theme", theme }, "*");
  }
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: "rcp-guide-theme", theme }, "*");
  }, [theme]);

  function retry() {
    setFailed(false);
    setDocument(null);
    setAttempt((value) => value + 1);
    return Promise.resolve();
  }

  if (failed) return <ErrorState title="The figure could not load" message="The illustration did not download. Check your connection and try again." retry={retry} />;
  return (
    <div className="guide-stage" style={{ height: height ?? expected }} aria-busy={!revealed}>
      {!revealed && <FigureSkeleton />}
      {!revealed && <LoadingNote label="figure" />}
      {document && <iframe ref={frame} title={title} srcDoc={document} sandbox="allow-scripts allow-downloads" onLoad={sendTheme} className="guide-frame" data-ready={revealed} scrolling={height === null ? "auto" : "no"} style={{ height: height ?? expected }} />}
    </div>
  );
}

export function VisualGuidePage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  if (pathname === "/learn") return <Navigate replace to={legacyGuidePath(params.get("diagram"))} />;
  const selected = guideForPath(pathname);
  if (!selected) return <NotFoundPage />;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>How RCP works</h1>
          <p><strong>Five views of how a check becomes a verdict and an incident decision.</strong> Illustrative examples; they don't query live services or change your monitors.</p>
        </div>
      </header>
      <section className="panel" aria-label={selected.title}>
        <header className="panel-header guide-header">
          <nav className="segmented" aria-label="Visual guide">
            {GUIDE_VIEWS.map((view) => (
              <button key={view.id} type="button" aria-pressed={view.id === selected.id} onClick={() => navigate(`/learn/${view.id}`)}>{view.label}</button>
            ))}
          </nav>
          <span className="subtle" title={selected.intro}>{selected.intro}</span>
        </header>
        <Figure key={selected.id} name={selected.artifact} title={selected.title} />
      </section>
    </>
  );
}
