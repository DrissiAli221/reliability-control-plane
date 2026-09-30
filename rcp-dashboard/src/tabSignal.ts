import { useEffect, useState } from "react";
import { listMonitors } from "./api";

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

/**
 * Keeps the browser tab honest from any console page: a count of open incidents in the title and a red favicon.
 * A failed poll keeps the last known state rather than clearing the alarm.
 */
export function useTabSignal(pathname: string): void {
  const [openIncidents, setOpenIncidents] = useState(0);

  useEffect(() => {
    let active = true;
    const poll = () => listMonitors()
      .then((monitors) => { if (active) setOpenIncidents(monitors.filter((monitor) => monitor.incidentStatus === "OPEN").length); })
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
}
