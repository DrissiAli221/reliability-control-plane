import { Activity, BookOpen, ExternalLink, Gauge, LayoutList, LogOut, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { isLocalAuth } from "../auth";
import { useFleetWatch } from "../tabSignal";
import { CommandPalette, PaletteButton } from "./CommandPalette";
import { IncidentToasts } from "./IncidentToasts";
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

export function AppShell({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const local = isLocalAuth();
  const { pathname } = useLocation();
  const { changes, dismiss } = useFleetWatch(pathname);
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

        <div className="sidebar-footer">
          {local && (
            <p className="env-note">
              <span className="env-pill">Local</span>
              Regions are simulated in one JVM; labels are not geographic evidence.
            </p>
          )}
          {local
            ? <span className="identity">Local development identity</span>
            : <button type="button" className="nav-item" onClick={onLogout}><LogOut size={16} aria-hidden="true" /> Sign out</button>}
        </div>
      </aside>
      {/* Keyed by path so each page enters with the same short settle, including monitor-to-monitor moves. */}
      <div className="main" key={pathname}>{children}</div>
      <CommandPalette />
      <IncidentToasts changes={changes} dismiss={dismiss} />
      <Tour />
    </div>
  );
}
