import { Activity, ArrowRight, BookOpen, Eye, ExternalLink, Gauge, LayoutList, LogOut, Moon, Sun, Workflow } from "lucide-react";
import { useEffect, type ReactNode } from "react";
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
import { TopBar } from "./TopBar";
import { Tour } from "./Tour";

const telemetryUrl = import.meta.env.VITE_GRAFANA_URL
  ?? (import.meta.env.DEV ? "http://localhost:3000/d/rcp-overview/rcp-overview" : null);

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="0.5" y="0.5" width="23" height="23" rx="6" />
      <path d="M4.5 13h3.2l2-5.5 3.6 10 2.2-4.5h4" />
    </svg>
  );
}

/** One square light per probe region: lit green when it delivered results in the pipeline window, grey otherwise. */
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
              <i className="region-light" aria-hidden="true" />
              <span className="mono">{region.region}</span>
              <span className="region-state">{live ? "reporting" : "quiet"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AppShell({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const local = isLocalAuth();
  const { pathname } = useLocation();
  const { changes, dismiss } = useFleetWatch(pathname);
  const theme = useTheme();
  const session = useSession();
  const readOnly = session?.readOnly ?? false;
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
            <Gauge size={16} aria-hidden="true" /> Overview
          </NavLink>
          <NavLink to="/monitors" className={() => `nav-item${pathname.startsWith("/monitors") ? " active" : ""}`}>
            <LayoutList size={16} aria-hidden="true" /> Monitors
          </NavLink>
          <NavLink to="/pipeline" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
            <Workflow size={16} aria-hidden="true" /> Pipeline
          </NavLink>
          {telemetryUrl && (
            <a className="nav-item" href={telemetryUrl} target="_blank" rel="noreferrer">
              <Activity size={16} aria-hidden="true" /> Telemetry <ExternalLink size={12} className="nav-external" aria-hidden="true" />
            </a>
          )}
          <p className="nav-label">Reference</p>
          <a className="nav-item nav-optional" href="https://github.com/DrissiAli221/reliability-control-plane" target="_blank" rel="noreferrer">
            <BookOpen size={16} aria-hidden="true" /> Source <ExternalLink size={12} className="nav-external" aria-hidden="true" />
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
          <button type="button" className="nav-item" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            {theme === "dark" ? "Light theme" : "Dark theme"}
          </button>
          {readOnly && <span className="identity demo-identity"><Eye size={14} aria-hidden="true" /> Live demo · read-only</span>}
          {local && !readOnly
            ? <span className="identity">Local development identity</span>
            : <button type="button" className="nav-item" onClick={onLogout}><LogOut size={16} aria-hidden="true" /> {readOnly ? "Leave the demo" : "Sign out"}</button>}
        </div>
      </aside>
      <div className="column">
        <TopBar pathname={pathname} updatedAt={snapshot.updatedAt} stale={snapshot.error !== null} />
        {/* Keyed by path so each page enters with the same short settle, including monitor-to-monitor moves. */}
        <div className="main" key={pathname}>
          {readOnly && (
            <div className="demo-banner" role="note">
              <Eye size={16} aria-hidden="true" />
              <span><strong>You're exploring the live demo.</strong> Everything is real and running; changes are switched off.</span>
              <button type="button" className="demo-banner-cta" onClick={onLogout}>Monitor your own site <ArrowRight size={14} aria-hidden="true" /></button>
            </div>
          )}
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
