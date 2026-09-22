export type MonitorOverview = {
  id: string;
  name: string;
  targetUrl: string;
  enabled: boolean;
  nextCheckAt: string | null;
  incidentStatus: "OPEN" | "RESOLVED" | null;
  latestVerdict: "UP" | "DOWN" | "DISAGREEMENT" | "NO_DATA" | null;
  latestCheckedAt: string | null;
};

export type CreateMonitorInput = {
  name: string;
  targetUrl: string;
  checkIntervalSeconds: number;
  timeoutMs: number;
};

export type CreatedMonitor = CreateMonitorInput & {
  id: string;
  enabled: boolean;
  nextCheckAt: string;
  createdAt: string;
};

export type AvailabilityReport = {
  monitorId: string;
  from: string;
  to: string;
  sloTargetPercent: number;
  measuredAvailabilityPercent: number | null;
  evidenceCoveragePercent: number;
  sloMet: boolean | null;
  upExecutions: number;
  downExecutions: number;
  disagreementExecutions: number;
  noDataExecutions: number;
  conclusiveExecutions: number;
  totalFinalizedExecutions: number;
  denominatorPolicy: string;
};

export type PublicStatusPage = {
  name: string;
  slug: string;
  overallStatus: string;
  generatedAt: string;
  components: Array<{
    name: string;
    status: string;
    latestVerdict: string | null;
    latestCheckedAt: string | null;
  }>;
};
