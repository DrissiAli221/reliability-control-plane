import { accessToken, redirectToSignIn, sessionRejected } from "./auth";
import type {
  AvailabilityReport,
  CreateMonitorInput,
  CreatedMonitor,
  ExecutionTrace,
  FleetOverview,
  FaultMode,
  IncidentStateView,
  LatencyHeatmap,
  MonitorDetail,
  MonitorHistory,
  MonitorOverview,
  PipelineEvent,
  PipelineSnapshot,
  PublicStatusPage,
  Session,
  ReliabilityReport,
} from "./types";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

async function authorizedResponse(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = await accessToken();
  if (!token) {
    redirectToSignIn();
    throw new Error("Sign in to continue");
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  // A rejected token is a session problem, not a control-plane failure: renew it once, or go and sign in.
  if (response.status === 401) {
    if (!retried && (await sessionRejected()) === "retry") return authorizedResponse(path, init, true);
    if (retried) redirectToSignIn();
    throw new Error("Your session expired. Sign in again to continue.");
  }

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

export function currentSession(): Promise<Session> {
  return request("/api/me");
}

/** Gives a brand-new account its one example monitor; a no-op on every later call. */
export async function onboard(): Promise<void> {
  await authorizedResponse("/api/onboarding", { method: "POST" });
}

export function listMonitors(): Promise<MonitorOverview[]> {
  return request("/api/monitors");
}

export function getMonitor(monitorId: string): Promise<MonitorDetail> {
  return request(`/api/monitors/${encodeURIComponent(monitorId)}`);
}

export function monitorHistory(monitorId: string, days = 45): Promise<MonitorHistory> {
  return request(`/api/monitors/${encodeURIComponent(monitorId)}/history?days=${days}`);
}

export function latencyHeatmap(monitorId: string, hours = 24): Promise<LatencyHeatmap> {
  return request(`/api/monitors/${encodeURIComponent(monitorId)}/latency-heatmap?hours=${hours}`);
}

function reportWindow(days: number): URLSearchParams {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
}

export function reliabilityReport(monitorId: string, days = 7): Promise<ReliabilityReport> {
  return request(`/api/monitors/${encodeURIComponent(monitorId)}/reliability-report?${reportWindow(days)}`);
}

export function executionTrace(monitorId: string, executionId: string): Promise<ExecutionTrace> {
  return request(`/api/monitors/${encodeURIComponent(monitorId)}/executions/${encodeURIComponent(executionId)}/trace`);
}

export function incidentState(monitorId: string): Promise<IncidentStateView> {
  return request(`/api/monitors/${encodeURIComponent(monitorId)}/incident-state`);
}

export function fleetOverview(): Promise<FleetOverview> {
  return request("/api/overview");
}

export function pipelineSnapshot(): Promise<PipelineSnapshot> {
  return request("/api/pipeline");
}

export function pipelineEvents(): Promise<PipelineEvent[]> {
  return request("/api/pipeline/events");
}

/** Local profile only: the fault switch for the in-JVM probe adapters. */
export async function faultMode(): Promise<FaultMode> {
  return (await request<{ mode: FaultMode }>("/api/local/probe-fault")).mode;
}

export async function setFaultMode(mode: FaultMode): Promise<FaultMode> {
  return (await request<{ mode: FaultMode }>("/api/local/probe-fault", { method: "PUT", body: JSON.stringify({ mode }) })).mode;
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
  });
  return request(`/api/monitors/${encodeURIComponent(monitorId)}/availability?${query}`);
}

export async function reliabilityReportHtml(monitorId: string, days = 7): Promise<Blob> {
  const response = await authorizedResponse(
    `/api/monitors/${encodeURIComponent(monitorId)}/reliability-report/html?${reportWindow(days)}`,
    { headers: { Accept: "text/html" } },
  );
  return response.blob();
}

export async function reliabilityReportCsv(monitorId: string, days = 7): Promise<Blob> {
  const response = await authorizedResponse(
    `/api/monitors/${encodeURIComponent(monitorId)}/reliability-report/csv?${reportWindow(days)}`,
    { headers: { Accept: "text/csv" } },
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

export async function deleteMonitor(monitorId: string): Promise<void> {
  await authorizedResponse(`/api/monitors/${encodeURIComponent(monitorId)}`, { method: "DELETE" });
}
