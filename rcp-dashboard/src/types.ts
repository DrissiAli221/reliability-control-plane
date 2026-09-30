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

export type MonitorDetail = {
  id: string;
  name: string;
  targetUrl: string;
  checkIntervalSeconds: number;
  timeoutMs: number;
  enabled: boolean;
  nextCheckAt: string | null;
  createdAt: string;
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

export type ReliabilityReport = {
  generatedAt: string;
  availability: AvailabilityReport;
  errorBudget: { allowedBadExecutions: number; observedBadExecutions: number; remainingExecutions: number };
  latency: { sampleCount: number; p50Ms: number | null; p95Ms: number | null; minimumSamples: number };
  incidentTimeline: Array<{ incidentId: string; eventType: "OPENED" | "RESOLVED"; occurredAt: string }>;
  incidentTimelineTruncated: boolean;
  limitations: string[];
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

export type JobTrace = {
  jobId: string;
  region: string;
  createdAt: string | null;
  publishedAt: string | null;
  failedPublishAttempts: number;
  publishFailedAt: string | null;
  publishLastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
  receivedAt: string | null;
  outcome: string | null;
  httpStatus: number | null;
  latencyMs: number | null;
  responseBytes: number | null;
  errorType: string | null;
};

export type ExecutionTrace = {
  executionId: string;
  monitorId: string;
  scheduledAt: string;
  createdAt: string;
  resultDeadlineAt: string;
  status: "PENDING" | "FINALIZED";
  verdict: Verdict | null;
  finalizedAt: string | null;
  expectedRegionCount: number;
  jobs: JobTrace[];
  evaluation: { verdict: Verdict; transition: Transition; evaluatedAt: string } | null;
};

export type Transition = "NONE" | "OPENED" | "RESOLVED" | "IGNORED_STALE";

export type IncidentStateView = {
  status: "HEALTHY" | "OPEN";
  consecutiveDown: number;
  consecutiveUp: number;
  failuresToOpen: number;
  successesToResolve: number;
  openedAt: string | null;
  lastEvaluatedAt: string | null;
  recentEvaluations: Array<{ executionId: string; scheduledAt: string; verdict: Verdict; transition: Transition; evaluatedAt: string }>;
};

export type PipelineSnapshot = {
  generatedAt: string;
  windowSeconds: number;
  enabledMonitors: number;
  dueMonitors: number;
  pendingOutbox: number;
  failedOutbox: number;
  oldestPendingOutboxSeconds: number;
  pendingExecutions: number;
  awaitingIncidentEvaluation: number;
  openIncidents: number;
  regions: Array<{ region: string; jobsPublished: number; resultsReceived: number; p50LatencyMs: number | null }>;
  recentActivity: Array<{
    monitorId: string;
    monitorName: string;
    executionId: string;
    scheduledAt: string;
    verdict: Verdict;
    finalizedAt: string;
    transition: Transition | null;
  }>;
};

export type FaultMode = "PASS_THROUGH" | "HTTP_503" | "CONNECTION_FAILURE" | "REQUEST_TIMEOUT" | "RESPONSE_TOO_LARGE";

export type LatencyHeatmap = {
  monitorId: string;
  from: string;
  to: string;
  bucketSeconds: number;
  latencyBoundsMs: number[];
  regions: Array<{ region: string; samples: number; counts: number[][] }>;
};

export type PipelineEvent = {
  at: string;
  type: "OutboxPublished" | "ResultIngested" | "ExecutionFinalized" | "IncidentOpened" | "IncidentResolved";
  monitorId: string;
  monitorName: string;
  executionId: string;
  region: string | null;
  outcome: string | null;
  httpStatus: number | null;
  latencyMs: number | null;
  detail: string | null;
};
