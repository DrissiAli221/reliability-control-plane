import { accessToken } from "./auth";
import type {
  AvailabilityReport,
  CreateMonitorInput,
  CreatedMonitor,
  MonitorHistory,
  MonitorOverview,
  PublicStatusPage,
} from "./types";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

async function authorizedResponse(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  if (!token) throw new Error("Sign in to continue");

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as
      | { detail?: string; title?: string }
      | null;
    throw new Error(problem?.detail ?? problem?.title ?? `Request failed (${response.status})`);
  }
  return response;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await authorizedResponse(path, init)).json() as Promise<T>;
}

export function listMonitors(): Promise<MonitorOverview[]> {
  return request("/api/monitors");
}

export function monitorHistory(monitorId: string, days = 45): Promise<MonitorHistory> {
  return request(`/api/monitors/${encodeURIComponent(monitorId)}/history?days=${days}`);
}

export function createMonitor(input: CreateMonitorInput): Promise<CreatedMonitor> {
  return request("/api/monitors", { method: "POST", body: JSON.stringify(input) });
}

export async function setMonitorEnabled(monitorId: string, enabled: boolean): Promise<void> {
  await request(`/api/monitors/${encodeURIComponent(monitorId)}/enabled`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export function availability(monitorId: string, days = 7): Promise<AvailabilityReport> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const query = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    sloTargetPercent: "99.9",
  });
  return request(`/api/monitors/${encodeURIComponent(monitorId)}/availability?${query}`);
}

export async function reliabilityReportHtml(monitorId: string, days = 7): Promise<Blob> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  const response = await authorizedResponse(
    `/api/monitors/${encodeURIComponent(monitorId)}/reliability-report/html?${query}`,
    { headers: { Accept: "text/html" } },
  );
  return response.blob();
}

export async function publicStatus(slug: string, signal?: AbortSignal): Promise<PublicStatusPage> {
  const response = await fetch(`${apiBase}/status/${encodeURIComponent(slug)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(response.status === 404 ? "Status page not found" : "Status page unavailable");
  return response.json() as Promise<PublicStatusPage>;
}
