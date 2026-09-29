export type Verdict = "UP" | "DOWN" | "DISAGREEMENT" | "NO_DATA";

export type MonitorOverview = {
  id: string;
  name: string;
  targetUrl: string;
  enabled: boolean;
  nextCheckAt: string | null;
  incidentStatus: "HEALTHY" | "OPEN" | null;
  latestVerdict: Verdict | null;
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
  minimumEvidenceCoveragePercent: number;
  sloMet: boolean | null;
  upExecutions: number;
  downExecutions: number;
  disagreementExecutions: number;
  noDataExecutions: number;
  conclusiveExecutions: number;
  totalFinalizedExecutions: number;
  pendingExecutions: number;
  missingExecutions: number;
  expectedOpportunities: number;
  denominatorPolicy: string;
};

export type DayStatus = "OPERATIONAL" | "DEGRADED" | "OUTAGE" | "NO_DATA";

export type DailyEvidence = {
  day: string;
  up: number;
  down: number;
  disagreement: number;
  noData: number;
  status: DayStatus;
};

export type RegionSummary = {
  region: string;
  httpSamples: number;
  p50Ms: number | null;
  p95Ms: number | null;
  lastOutcome: string;
  lastHttpStatus: number | null;
  lastLatencyMs: number | null;
  lastCompletedAt: string;
};

export type RecentCheck = {
  executionId: string;
  scheduledAt: string;
  verdict: Verdict;
  results: Array<{ region: string; outcome: string; httpStatus: number | null; latencyMs: number }>;
};

export type MonitorHistory = {
  monitorId: string;
  generatedAt: string;
  days: DailyEvidence[];
  regions: RegionSummary[];
  recentChecks: RecentCheck[];
};

export type PublicComponentStatus = "OPERATIONAL" | "DEGRADED" | "OUTAGE" | "PAUSED" | "STALE" | "UNKNOWN";

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
    measuredUptimePercent?: number | null;
    history?: DailyEvidence[];
  }>;
};
