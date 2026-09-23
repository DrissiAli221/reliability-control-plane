import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = requiredEnvironment('BASE_URL').replace(/\/$/, '');
const TOKEN = requiredEnvironment('RCP_TOKEN');
const MONITOR_ID = requiredEnvironment('MONITOR_ID');
const RATE = positiveInteger(__ENV.RATE || '10', 'RATE');
const DURATION = __ENV.DURATION || '40s';
const P95_LIMIT_MS = positiveInteger(__ENV.P95_LIMIT_MS || '500', 'P95_LIMIT_MS');

export const options = {
    scenarios: {
        operator_reads: {
            executor: 'constant-arrival-rate',
            rate: RATE,
            timeUnit: '1s',
            duration: DURATION,
            preAllocatedVUs: Math.max(10, RATE),
            maxVUs: Math.max(50, RATE * 5),
        },
    },
    thresholds: {
        checks: ['rate>0.99'],
        http_req_failed: ['rate<0.01'],
        dropped_iterations: ['count==0'],
        [`http_req_duration{endpoint:monitor-list}`]: [`p(95)<${P95_LIMIT_MS}`],
        [`http_req_duration{endpoint:availability}`]: [`p(95)<${P95_LIMIT_MS}`],
        [`http_req_duration{endpoint:reliability-report}`]: [`p(95)<${P95_LIMIT_MS}`],
    },
};

const headers = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/json',
};

const reportFrom = encodeURIComponent(new Date(Date.now() - 60 * 60 * 1000).toISOString());
const reportTo = encodeURIComponent(new Date(Date.now() + 60 * 1000).toISOString());

export default function () {
    const monitors = http.get(`${BASE_URL}/api/monitors`, {
        headers,
        tags: { endpoint: 'monitor-list' },
    });
    check(monitors, {
        'monitor list returns 200': (response) => response.status === 200,
        'monitor list remains JSON': (response) => contentTypeIsJson(response),
    });

    const availability = http.get(
        `${BASE_URL}/api/monitors/${MONITOR_ID}/availability` +
        `?from=${reportFrom}&to=${reportTo}&sloTargetPercent=99.9`,
        {
            headers,
            tags: { endpoint: 'availability' },
        }
    );
    check(availability, {
        'availability returns 200': (response) => response.status === 200,
        'availability remains JSON': (response) => contentTypeIsJson(response),
        'availability belongs to requested monitor': (response) => {
            try {
                return response.json('monitorId') === MONITOR_ID;
            } catch (_) {
                return false;
            }
        },
    });

    const report = http.get(
        `${BASE_URL}/api/monitors/${MONITOR_ID}/reliability-report` +
        `?from=${reportFrom}&to=${reportTo}&sloTargetPercent=99.9`,
        {
            headers,
            tags: { endpoint: 'reliability-report' },
        }
    );
    check(report, {
        'reliability report returns 200': (response) => response.status === 200,
        'reliability report remains JSON': (response) => contentTypeIsJson(response),
        'report belongs to requested monitor': (response) => {
            try {
                return response.json('availability.monitorId') === MONITOR_ID;
            } catch (_) {
                return false;
            }
        },
    });
}

export function handleSummary(data) {
    const report = markdownReport(data);
    return {
        stdout: consoleSummary(data),
        '/results/summary.json': JSON.stringify(data, null, 2),
        '/results/report.md': report,
    };
}

function markdownReport(data) {
    const thresholdRows = thresholdResults(data)
        .map((threshold) => `| \`${threshold.metric}\` | \`${threshold.expression}\` | ${threshold.ok ? 'PASS' : 'FAIL'} |`)
        .join('\n');
    const allThresholdsPassed = thresholdResults(data).every((threshold) => threshold.ok);

    return `# RCP local load-test report

Generated: ${new Date().toISOString()}

## Outcome

**${allThresholdsPassed ? 'PASS' : 'FAIL'}** — all configured k6 thresholds ${allThresholdsPassed ? 'passed' : 'did not pass'}.

## Workload

- Scenario: sustained authenticated operator reads
- Arrival rate: ${RATE} iterations/second
- Requests per iteration: 3
- Duration: ${DURATION}
- Target monitor: \`${MONITOR_ID}\`
- API target: \`${BASE_URL}\`

Each iteration reads the monitor overview, calculates one-hour availability/SLO evidence, and generates the versioned reliability report JSON. It does not create monitors or mutate application state.

## Results

| Measurement | Value |
|---|---:|
| HTTP requests | ${integerMetric(data, 'http_reqs', 'count')} |
| Completed iterations | ${integerMetric(data, 'iterations', 'count')} |
| Dropped iterations | ${integerMetric(data, 'dropped_iterations', 'count')} |
| Failed-request rate | ${percentMetric(data, 'http_req_failed', 'rate')} |
| Check success rate | ${checkSuccessRate(data)} |
| Mean response time | ${durationMetric(data, 'http_req_duration', 'avg')} |
| p90 response time | ${durationMetric(data, 'http_req_duration', 'p(90)')} |
| p95 response time | ${durationMetric(data, 'http_req_duration', 'p(95)')} |
| Maximum response time | ${durationMetric(data, 'http_req_duration', 'max')} |

## Thresholds

| Metric | Requirement | Result |
|---|---|---|
${thresholdRows}

## Interpretation limits

This is a repeatable local engineering experiment, not a production capacity claim. Docker Desktop, one laptop, a single Spring JVM, local PostgreSQL, ElasticMQ, simulated region labels, and loopback networking differ materially from AWS latency, Lambda concurrency, real SQS, RDS, ALB behavior, quotas, and noisy-neighbor conditions. Use it to detect regressions, exercise overload behavior, and explain measurement—not to advertise a maximum requests-per-second figure.
`;
}

function consoleSummary(data) {
    const passed = thresholdResults(data).every((threshold) => threshold.ok);
    return [
        '',
        `RCP load-test result: ${passed ? 'PASS' : 'FAIL'}`,
        `requests=${integerMetric(data, 'http_reqs', 'count')}`,
        `failed=${percentMetric(data, 'http_req_failed', 'rate')}`,
        `p95=${durationMetric(data, 'http_req_duration', 'p(95)')}`,
        '',
    ].join(' ');
}

function thresholdResults(data) {
    const results = [];
    for (const [metricName, metric] of Object.entries(data.metrics)) {
        for (const [expression, result] of Object.entries(metric.thresholds || {})) {
            results.push({ metric: metricName, expression, ok: result.ok === true });
        }
    }
    return results.sort((left, right) => left.metric.localeCompare(right.metric));
}

function metricValue(data, metricName, valueName) {
    return data.metrics[metricName]?.values?.[valueName] ?? 0;
}

function integerMetric(data, metricName, valueName) {
    return Math.round(metricValue(data, metricName, valueName)).toString();
}

function durationMetric(data, metricName, valueName) {
    return `${metricValue(data, metricName, valueName).toFixed(2)} ms`;
}

function percentMetric(data, metricName, valueName) {
    return `${(metricValue(data, metricName, valueName) * 100).toFixed(3)}%`;
}

function checkSuccessRate(data) {
    const passes = metricValue(data, 'checks', 'passes');
    const failures = metricValue(data, 'checks', 'fails');
    const total = passes + failures;
    return total === 0 ? '0.000%' : `${((passes / total) * 100).toFixed(3)}%`;
}

function contentTypeIsJson(response) {
    return (response.headers['Content-Type'] || '').toLowerCase().includes('application/json');
}

function requiredEnvironment(name) {
    const value = __ENV[name];
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}

function positiveInteger(raw, name) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${name} must be a positive integer`);
    }
    return parsed;
}
