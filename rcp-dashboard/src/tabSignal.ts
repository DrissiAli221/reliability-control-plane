import { useCallback, useEffect, useRef, useState } from "react";
import { listMonitors } from "./api";
import type { MonitorOverview } from "./types";

const ACCENT = "#7c6cff";
const FAULT = "#e5484d";
const POLL_MS = 15_000;

/** The brand square, drawn red while any incident is open so a background tab still shows trouble. */
export function faviconSvg(incident: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${incident ? FAULT : ACCENT}"/>`
    + `<path d="M5 17h4.5l2.8-7.5 5 13.5 3-6H27" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="square" stroke-linejoin="miter"/></svg>`;
}

export function tabTitle(page: string, openIncidents: number): string {
  return `${openIncidents > 0 ? `(${openIncidents}) ` : ""}RCP · ${page}`;
}

function pageName(pathname: string): string {
  if (pathname.startsWith("/monitors/")) return "Monitor";
  if (pathname.startsWith("/monitors")) return "Monitors";
  if (pathname.startsWith("/pipeline")) return "Pipeline";
  return pathname === "/" ? "Overview" : "Not found";
}

export type IncidentChange = { key: string; monitorId: string; monitorName: string; kind: "opened" | "resolved"; at: number };

/**
 * Incident transitions between two polls. The first poll only records a baseline, so opening the console
 * does not announce incidents that were already open; those are on the page already.
 */
export function incidentChanges(previous: Map<string, boolean> | null, monitors: MonitorOverview[], at: number): IncidentChange[] {
  if (!previous) return [];
  return monitors.flatMap((monitor): IncidentChange[] => {
    const open = monitor.incidentStatus === "OPEN";
    const was = previous.get(monitor.id);
    if (was === undefined || was === open) return [];
    return [{ key: `${monitor.id}-${at}`, monitorId: monitor.id, monitorName: monitor.name, kind: open ? "opened" : "resolved", at }];
  });
}

function notifyDesktop(change: IncidentChange) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
  new Notification(change.kind === "opened" ? `Incident opened · ${change.monitorName}` : `Resolved · ${change.monitorName}`, {
    body: change.kind === "opened" ? "Every region agreed the target is down." : "Consecutive UP checks closed the incident.",
    tag: change.monitorId,
  });
}

/**
 * Watches the fleet from any console page: a count of open incidents in the tab title, a red favicon, and a toast
 * (plus a desktop notification when allowed and the tab is hidden) whenever an incident opens or resolves.
 * A failed poll keeps the last known state rather than clearing the alarm.
 */
export function useFleetWatch(pathname: string): { changes: IncidentChange[]; dismiss: (key: string) => void } {
  const [openIncidents, setOpenIncidents] = useState(0);
  const [changes, setChanges] = useState<IncidentChange[]>([]);
  const previous = useRef<Map<string, boolean> | null>(null);
  const dismiss = useCallback((key: string) => setChanges((current) => current.filter((change) => change.key !== key)), []);

  useEffect(() => {
    let active = true;
    const poll = () => listMonitors()
      .then((monitors) => {
        if (!active) return;
        const fresh = incidentChanges(previous.current, monitors, Date.now());
        previous.current = new Map(monitors.map((monitor) => [monitor.id, monitor.incidentStatus === "OPEN"]));
        setOpenIncidents(monitors.filter((monitor) => monitor.incidentStatus === "OPEN").length);
        if (fresh.length) {
          fresh.forEach(notifyDesktop);
          setChanges((current) => [...current, ...fresh].slice(-4));
        }
      })
      .catch(() => undefined);
    void poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    document.title = tabTitle(pageName(pathname), openIncidents);
  }, [pathname, openIncidents]);

  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/svg+xml";
    link.href = `data:image/svg+xml,${encodeURIComponent(faviconSvg(openIncidents > 0))}`;
  }, [openIncidents]);

  return { changes, dismiss };
}
