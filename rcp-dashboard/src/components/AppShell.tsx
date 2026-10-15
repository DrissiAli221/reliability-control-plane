import { Activity, ArrowRight, BookOpen, Eye, ExternalLink, Gauge, LayoutList, LogOut, MoreHorizontal, Moon, Sun, Workflow } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { onboard, pipelineSnapshot } from "../api";
import { isLocalAuth } from "../auth";
import { useSession } from "../session";
import type { PipelineSnapshot } from "../types";
import { useLiveData, type LiveData } from "../useLiveData";
import { useFleetWatch } from "../tabSignal";
import { toggleTheme, useTheme } from "../theme";
import { CommandPalette, PaletteButton } from "./CommandPalette";
import { IncidentToasts } from "./IncidentToasts";
import { StatusBar } from "./StatusBar";
import { StatusDot } from "./StatusBadge";
import { APERTURE_CORE, APERTURE_LEFT, APERTURE_RIGHT } from "../brand";
import { TopBar } from "./TopBar";
import { Tour } from "./Tour";

const telemetryUrl = import.meta.env.VITE_GRAFANA_URL
  ?? (import.meta.env.DEV ? "http://localhost:3000/d/rcp-overview/rcp-overview" : null);

/**
 * The aperture mark: stepped violet and lavender brackets around a square. The square takes the text colour, so it
 * stays visible on light pages; gradient ids are per instance because several marks can share a page.
 */
export function BrandMark() {
  const id = useId();
  return (
    <svg className="brand-mark" viewBox="0 0 18 14" aria-hidden="true" shapeRendering="crispEdges">
      <defs>
        <linearGradient id={`${id}v`} x1="2" y1="2" x2="8" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9482ff" /><stop offset=".48" stopColor="#7c63ff" /><stop offset="1" stopColor="#8a73ff" />
        </linearGradient>
        <linearGradient id={`${id}l`} x1="10" y1="1" x2="16" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c1b0ff" /><stop offset=".5" stopColor="#ad94f8" /><stop offset="1" stopColor="#b5a1ff" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id}v)`} d={APERTURE_LEFT} />
      <path fill={`url(#${id}l)`} d={APERTURE_RIGHT} />
      <path fill="currentColor" d={APERTURE_CORE} />
    </svg>
  );
}

/** One dot-matrix light per probe region: green when it delivered results in the pipeline window, grey otherwise. */
function SidebarRegions({ snapshot }: { snapshot: LiveData<PipelineSnapshot> }) {
  const regions = snapshot.data?.regions;
  if (!regions || regions.length === 0) return null;
  return (
    <section className="sidebar-regions" aria-label="Probe regions">
      <p className="nav-label">Regions</p>
      <ul>
        {regions.map((region) => {
          const live = region.resultsReceived > 0 && !snapshot.error;
          return (
            <li key={region.region} className={live ? "live-region" : undefined}>
              <StatusDot tone={live ? "good" : "muted"} />
              <span className="mono">{region.region}</span>
              <span className="region-state">{live ? "reporting" : "quiet"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The sidebar footer folded into a menu for the narrow top header, where there is no room for it in line.
 * Hidden by CSS on desktop, where the footer itself is shown instead.
 */
export function MobileMenu({ local, readOnly, theme, onLogout }: { local: boolean; readOnly: boolean; theme: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function onPointer(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  function closeAndRestore() {
    setOpen(false);
    button.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeAndRestore();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      const items = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      if (items.length === 0) return;
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : event.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
      items[next].focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="mobile-menu" onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={button}
        type="button"
        className="icon-button mobile-menu-button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="mobile-menu-panel" ref={panel}>
          {local && <p className="env-note"><span className="env-pill">Local</span>Regions are simulated in one JVM; labels are not geographic evidence.</p>}
          {readOnly && <p className="identity demo-identity"><Eye size={14} aria-hidden="true" /> Live demo · read-only</p>}
          {local && !readOnly && <p className="identity">Local development identity</p>}
          <div role="menu" id={menuId} aria-label="More">
            <button type="button" role="menuitem" className="nav-item theme-button" onClick={choose(toggleTheme)}>
              {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
              {theme === "dark" ? "Light theme" : "Dark theme"}
            </button>
            {!(local && !readOnly) && (
              <button type="button" role="menuitem" className="nav-item" onClick={choose(onLogout)}>
                <LogOut size={16} aria-hidden="true" /> {readOnly ? "Leave the demo" : "Sign out"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const local = isLocalAuth();
  const { pathname } = useLocation();
  // A new page starts at its top; the browser would otherwise keep the previous page's scroll offset.
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  const { changes, dismiss } = useFleetWatch(pathname);
  const theme = useTheme();
  const session = useSession();
  const readOnly = session?.readOnly ?? false;
  const header = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const measure = () => document.documentElement.style.setProperty("--shell-header-height", `${element.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--shell-header-height"); };
  }, [readOnly]);
  // One poll feeds the top bar, the status strip and (below) the region lights.
  const snapshot = useLiveData(pipelineSnapshot, 15_000);

  // A brand-new account gets its example monitor once; the server makes repeat calls harmless, this just avoids them.
  useEffect(() => {
    if (!session || session.readOnly || local) return;
    const key = `rcp.onboarded.${session.subject}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      // Without storage we simply ask the server, which answers "nothing to do".
    }
    void onboard().then(() => {
      try { localStorage.setItem(key, "1"); } catch { /* not persisted */ }
    }).catch(() => undefined);
  }, [session, local]);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="workspace">
          <BrandMark />
          <div>
            <strong>Reliability Control Plane</strong>
            <span>{local ? "Local environment" : "Operator console"}</span>
          </div>
        </div>

        <PaletteButton />

        <nav className="nav" aria-label="Primary">
          <p className="nav-label">Monitoring</p>
          <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
            <Gauge size={16} aria-hidden="true" /> <span className="nav-text">Overview</span>
          </NavLink>
          <NavLink to="/monitors" className={() => `nav-item${pathname.startsWith("/monitors") ? " active" : ""}`}>
            <LayoutList size={16} aria-hidden="true" /> <span className="nav-text">Monitors</span>
          </NavLink>
          <NavLink to="/pipeline" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
            <Workflow size={16} aria-hidden="true" /> <span className="nav-text">Pipeline</span>
          </NavLink>
          {telemetryUrl && (
            <a className="nav-item" href={telemetryUrl} target="_blank" rel="noreferrer">
              <Activity size={16} aria-hidden="true" /> <span className="nav-text">Telemetry</span> <ExternalLink size={12} className="nav-external" aria-hidden="true" />
            </a>
          )}
          <p className="nav-label">Reference</p>
          <NavLink to="/learn" className={() => `nav-item${pathname.startsWith("/learn") ? " active" : ""}`}>
            <BookOpen size={16} aria-hidden="true" /> <span className="nav-text">How RCP works</span>
          </NavLink>
          <a className="nav-item nav-optional" href="https://github.com/DrissiAli221/reliability-control-plane" target="_blank" rel="noreferrer">
            <BookOpen size={16} aria-hidden="true" /> <span className="nav-text">Source</span> <ExternalLink size={12} className="nav-external" aria-hidden="true" />
          </a>
        </nav>

        <SidebarRegions snapshot={snapshot} />

        <div className="sidebar-footer">
          {local && (
            <p className="env-note">
              <span className="env-pill">Local</span>
              Regions are simulated in one JVM; labels are not geographic evidence.
            </p>
          )}
          <button type="button" className="nav-item theme-button" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            {theme === "dark" ? "Light theme" : "Dark theme"}
          </button>
          {readOnly && <span className="identity demo-identity"><Eye size={14} aria-hidden="true" /> Live demo · read-only</span>}
          {local && !readOnly
            ? <span className="identity">Local development identity</span>
            : <button type="button" className="nav-item" onClick={onLogout}><LogOut size={16} aria-hidden="true" /> {readOnly ? "Leave the demo" : "Sign out"}</button>}
        </div>
        <MobileMenu local={local} readOnly={readOnly} theme={theme} onLogout={onLogout} />
      </aside>
      <div className="column">
        <div className="shell-header" ref={header}>
          <TopBar pathname={pathname} updatedAt={snapshot.updatedAt} stale={snapshot.error !== null} />
          {readOnly && (
            <div className="demo-banner" role="note">
              <Eye size={16} aria-hidden="true" />
              <div className="demo-banner-body">
                <span className="demo-banner-text">
                  <strong className="demo-banner-full">You're exploring the live demo.</strong>
                  <span className="demo-banner-detail"> Everything is real and running; changes are switched off.</span>
                  <strong className="demo-banner-short">Live demo · read-only</strong>
                </span>
                {" "}
                <button type="button" className="demo-banner-cta" onClick={onLogout}>Monitor your own site <ArrowRight size={14} aria-hidden="true" /></button>
              </div>
            </div>
          )}
        </div>
        {/* Keyed by path so each page enters with the same short settle, including monitor-to-monitor moves. */}
        <div className="main" key={pathname}>
          {children}
        </div>
      </div>
      <StatusBar snapshot={snapshot} />
      <CommandPalette />
      <IncidentToasts changes={changes} dismiss={dismiss} />
      <Tour />
    </div>
  );
}
