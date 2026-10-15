// Isolated browser audit: fixtures enter through HTTP; never signs into or changes a deployed service.
// npm install --no-save playwright (or set RCP_PLAYWRIGHT_MODULE to an existing installation).
// RCP_AUDIT_URL=http://127.0.0.1:5188 node scripts/audit-final-round.mjs /tmp/rcp-audit
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.RCP_PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(process.argv[2] || '/tmp/rcp-final-round-audit');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.RCP_AUDIT_URL || 'http://127.0.0.1:5188';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('Audit requires an isolated local server');
const now = Date.now(), DAY = 86400000, iso = n => new Date(n).toISOString();
const monitor = { id: 'drill', name: 'Scheduled outage drill', targetUrl: 'https://rcp-ali.duckdns.org/drill/status.html',
  enabled: true, createdAt: iso(now - 9.5 * DAY), nextCheckAt: iso(now + 60000), checkIntervalSeconds: 60, timeoutMs: 5000,
  latestVerdict: 'UP', incidentStatus: 'HEALTHY', latestCheckedAt: iso(now - 10000) };
const evidence = days => ({ monitorId: 'drill', from: iso(now - days * DAY), to: iso(now), monitoringSince: monitor.createdAt,
  sloTargetPercent: 99.9, measuredAvailabilityPercent: 97.75, evidenceCoveragePercent: 99.8,
  minimumEvidenceCoveragePercent: 95, sloMet: false, upExecutions: 12600, downExecutions: 300,
  disagreementExecutions: 15, noDataExecutions: 0, conclusiveExecutions: 12900, totalFinalizedExecutions: 12915,
  pendingExecutions: 0, missingExecutions: 12, expectedOpportunities: 12927, denominatorPolicy: 'UP_AND_DOWN_ONLY' });
const timeline = days => Array.from({ length: Math.min(days, 9) * 12 }, (_, i) => {
  const at = now - Math.min(days, 9) * DAY + i * 7200000;
  return [{ incidentId: `incident-${i}`, eventType: 'OPENED', occurredAt: iso(at) },
    { incidentId: `incident-${i}`, eventType: 'RESOLVED', occurredAt: iso(at + 600000) }];
}).flat();
const history = { monitorId: 'drill', from: iso(now - 90 * DAY), to: iso(now), regions: ['eu-west-1', 'us-east-1'].map(region => ({ region, httpSamples: 1000, p50Ms: 200, p95Ms: 500, lastOutcome: 'HTTP_RESPONSE', lastHttpStatus: 200, lastLatencyMs: 200, lastCompletedAt: iso(now) })), recentChecks: [],
  days: Array.from({ length: 90 }, (_, i) => ({ day: iso(now - (89 - i) * DAY).slice(0, 10),
    status: i < 80 ? 'NO_DATA' : i % 3 === 0 ? 'DEGRADED' : 'OUTAGE',
    up: i < 80 ? 0 : 1380, down: i < 80 ? 0 : 60, disagreement: i < 80 ? 0 : 2, noData: 0 })) };
const reports = [], errors = [];
try {
  for (const theme of ['dark', 'light']) for (const width of [1440, 380, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(15000);
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(theme => { localStorage.setItem('rcp.theme', theme); }, theme);
    let mode = 'worst';
    await page.route('**/local/token', r => r.fulfill({ json: { accessToken: 'audit-only', expiresInSeconds: 3600 } }));
    await page.route('**/api/**', async r => {
      const url = new URL(r.request().url()); const path = url.pathname;
      const days = Number(url.searchParams.get('days') || 7);
      let body;
      if (path === '/api/me') body = { subject: 'audit-demo', readOnly: true, limits: { maxPerOwner: 5, maxTotal: 30, minIntervalSeconds: 60, maxTimeoutMs: 5000 }, usage: { ownedMonitors: 0, totalMonitors: 0 } };
      else if (path === '/api/monitors') body = [monitor];
      else if (path === '/api/monitors/drill') body = monitor;
      else if (path.endsWith('/history')) body = history;
      else if (path.endsWith('/availability')) body = evidence(days);
      else if (path.endsWith('/reliability-report')) {
        if (mode === 'error') return r.fulfill({ status: 503, json: { detail: 'Audit unavailable' } });
        if (mode === 'loading') await new Promise(resolve => setTimeout(resolve, 1500));
        body = { schemaVersion: 'rcp-report-v1', generatedAt: iso(now), sourceDataWatermark: iso(now - 10000),
          monitorName: monitor.name, targetUrl: monitor.targetUrl, availability: evidence(days),
          latency: { sampleCount: 20000, minimumSamples: 20, p50Ms: 200, p95Ms: 500 },
          errorBudget: { allowedBadExecutions: 12.9, observedBadExecutions: 300, remainingExecutions: -287.1 },
          incidentTimeline: mode === 'empty' ? [] : mode === 'one' ? timeline(1).slice(0, 2) : timeline(days),
          incidentTimelineTruncated: false, limitations: [], caveats: [] };
      } else if (path.endsWith('/latency-heatmap')) {
        const hours = Number(url.searchParams.get('hours') || 24), columns = hours * 2;
        body = { monitorId: 'drill', from: iso(now - hours * 3600000), to: iso(now), bucketSeconds: 1800, latencyBoundsMs: [50,100,200,400,800],
          regions: ['eu-west-1', 'us-east-1'].map(region => ({ region, samples: 1000,
            counts: Array.from({ length: columns }, () => [1,2,3,4,5,1]),
            p50Ms: Array(columns).fill(200), p95Ms: Array(columns).fill(500), windowP50Ms: 200, windowP95Ms: 500 })) };
      } else if (path.endsWith('/incident-state')) body = { status: 'HEALTHY', consecutiveDown: 0, consecutiveUp: 2, failuresToOpen: 2, successesToResolve: 2, openedAt: null, lastEvaluatedAt: iso(now), recentEvaluations: [] };
      else if (path === '/api/pipeline') body = { generatedAt: iso(now), windowSeconds: 300, enabledMonitors: 10, dueMonitors: 0,
        pendingOutbox: 0, failedOutbox: 0, oldestPendingOutboxSeconds: 0, pendingExecutions: 0, awaitingIncidentEvaluation: 0,
        openIncidents: 0, regions: ['eu-west-1', 'us-east-1'].map(region => ({ region, jobsPublished: 50, resultsReceived: 50, p50LatencyMs: 200 })), recentActivity: [] };
      else body = [];
      await r.fulfill({ json: body });
    });
    await page.goto(`${base}/monitors/drill?window=90d&data=worst`);
    await page.getByText('Uptime · 90d', { exact: true }).waitFor();
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const control = document.createElement('nav'); control.setAttribute('aria-label', 'Audit fixture');
      control.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:100;display:flex;background:#eee;color:#111;padding:4px;font:12px system-ui';
      for (const state of ['worst', 'empty', 'one', 'error', 'loading']) {
        const b = document.createElement('button'); b.textContent = state;
        b.onclick = () => { const url = new URL(location.href); url.searchParams.set('data', state); window.dispatchEvent(new CustomEvent('audit-fixture', { detail: state })); history.replaceState(null, '', url); };
        control.append(b);
      } document.body.append(control);
    });
    await page.exposeFunction('auditFixture', state => { mode = state; });
    await page.evaluate(() => window.addEventListener('audit-fixture', e => window.auditFixture(e.detail)));
    for (const period of ['24 h', '7 d', '30 d', '90 d']) {
      await page.getByRole('group', { name: 'Report period' }).getByRole('button', { name: period }).click();
      await page.waitForTimeout(150);
      for (const range of ['24 h', '7 d']) {
        await page.getByRole('group', { name: 'Window', exact: true }).getByRole('button', { name: range }).click();
        await page.waitForTimeout(100);
        if (!(await page.getByRole('group', { name: 'Report period' }).getByRole('button', { name: period }).getAttribute('aria-pressed') === 'true')) throw new Error('Chart changed report period');
        if (!(await page.getByText('Last 45 days · UTC', { exact: true }).count())) throw new Error('Period changed availability bar');
      }
      reports.push(await page.evaluate(({ theme, width, period }) => ({ theme, width, period,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        trackers: [...document.querySelectorAll('.metric-visual .tracker-bars')].map(el => ({ width: el.clientWidth, scroll: el.scrollWidth, parent: el.closest(".metric-visual").clientWidth })) }), { theme, width, period }));
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${theme}-${width}.png`, fullPage: true });
    for (const state of ['empty', 'one', 'error', 'loading', 'worst']) {
      mode = state;
      const group = page.getByRole('group', { name: 'Report period' });
      await group.getByRole('button', { name: '30 d' }).click();
      if (state === 'empty') await page.getByText('No incidents recorded in this period', { exact: true }).waitFor();
      else if (state === 'error') await page.getByText(/Couldn.t refresh/).waitFor();
      else if (state === 'loading') await page.getByText(/Updating|Retrying/).waitFor();
      await page.waitForTimeout(state === 'loading' ? 1700 : 150);
      if (state !== 'error') await page.getByText('Uptime · 30d', { exact: true }).waitFor();
      await group.getByRole('button', { name: '90 d' }).click();
      await page.waitForTimeout(state === 'loading' ? 1700 : 150);
    }
    if (width === 1440) {
      await page.keyboard.press('Meta+k');
      await page.getByRole('dialog', { name: 'Command palette' }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'Command palette' }).waitFor({ state: 'hidden' });
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) throw new Error('Page overflows at 200% zoom');
      await page.screenshot({ path: `${output}/zoom-${theme}.png`, fullPage: true });
      await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    }
    const drill = page.locator('[data-tour="outage-drill"]');
    if (width === 1440 && await drill.count()) await drill.screenshot({ path: `${output}/drill-${theme}.png` });
    await page.evaluate(() => scrollTo(0, 700));
    reports.push(await page.evaluate(({ theme, width }) => ({ theme, width,
      bannerTop: document.querySelector('.demo-banner')?.getBoundingClientRect().top,
      topbarBottom: document.querySelector('.topbar')?.getBoundingClientRect().bottom }), { theme, width }));
    await page.close();
  }
  if (errors.length) throw new Error(errors.join('\n'));
  if (reports.some(r => r.pageOverflow || r.trackers?.some(t => t.scroll > t.parent + 1))) throw new Error('Tracker or page overflow');
  await writeFile(`${output}/measurements.json`, JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports));
} finally { await browser.close(); }
