import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runCorporateSnapshotPipeline } from '../runCorporateSnapshot.ts';
import {
  selectCanonicalValuationMetrics,
  selectValuationChart,
  selectValuationChartDisplayRange,
} from '../../valuation/canonicalValuationTimeline.ts';

async function loadFixture(): Promise<Record<string, unknown>> {
  const fixturePath = path.resolve('scripts/fixtures/snapshot-requests/abra_minimal.json');
  const fixtureRaw = await readFile(fixturePath, 'utf8');
  const parsed = JSON.parse(fixtureRaw) as Record<string, unknown>;
  const currentYear = new Date().getUTCFullYear();
  const projects = Array.isArray(parsed.projects) ? parsed.projects as Array<Record<string, unknown>> : [];

  for (const project of projects) {
    const rawJson = (project.rawJson ?? null) as Record<string, unknown> | null;
    if (!rawJson || typeof rawJson !== 'object') continue;
    rawJson.version = 'project_json_v2';
    const time = (rawJson.time ?? null) as Record<string, unknown> | null;
    if (!time || typeof time !== 'object') continue;
    const tp = Number.isInteger(time.productionStartPeriod) ? (time.productionStartPeriod as number) : 0;
    time.productionStartYear = currentYear + tp;
  }

  return parsed;
}

function setFirstModelYear(body: Record<string, unknown>, firstYear: number, projectIndex = 0): void {
  const project = (body.projects as Array<Record<string, unknown>>)[projectIndex];
  const raw = project.rawJson as Record<string, unknown>;
  const time = raw.time as Record<string, unknown>;
  time.productionStartYear = firstYear + (time.productionStartPeriod as number);
}

function cloneProject(source: Record<string, unknown>, projectId: string): Record<string, unknown> {
  const project = structuredClone(source);
  project.projectId = projectId;
  const raw = project.rawJson as Record<string, unknown>;
  const meta = raw.meta as Record<string, unknown>;
  meta.projectId = projectId;
  return project;
}

function assertApprox(actual: unknown, expected: unknown, message: string, tolerance = 1e-8): void {
  assert.equal(typeof actual, 'number', `${message}: actual must be numeric`);
  assert.equal(typeof expected, 'number', `${message}: expected must be numeric`);
  const a = actual as number;
  const e = expected as number;
  const scale = Math.max(1, Math.abs(a), Math.abs(e));
  assert.ok(Math.abs(a - e) <= tolerance * scale, `${message}: actual=${a} expected=${e}`);
}

async function run(): Promise<void> {
  const currentYear = new Date().getUTCFullYear();

  {
    const body = await loadFixture();
    const projects = body.projects as Array<Record<string, unknown>>;
    projects.push(cloneProject(projects[0], 'ABRA_SECOND_PRE_REVENUE'));
    body.valuationYear = currentYear;

    const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
    assert.equal(result.ok, true, 'pre-revenue multi-project snapshot must compute');
    if (result.ok) {
      assert.equal(typeof result.snapshot.corporate?.lista3Metrics?.IRR, 'number', 'pre-revenue multi-project portfolio must retain canonical corporate IRR');
      const debug = result.diagnostics.meta.corporateLista3Debug?.perMetric?.IRR;
      assert.notEqual(debug?.intermediates?.method, 'NEXT_PROJECT_IRR', 'pre-revenue multi-project portfolio must not switch to NEXT_PROJECT_IRR');
    }
  }

  {
    const body = await loadFixture();
    setFirstModelYear(body, currentYear - 3);
    body.valuationYear = currentYear;

    const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
    assert.equal(result.ok, true, 'producing portfolio without future project must compute');
    if (result.ok) {
      assert.equal(result.snapshot.corporate?.lista3Metrics?.IRR, null, 'producing portfolio without future construction must show IRR N/A');
      const debug = result.diagnostics.meta.corporateLista3Debug?.perMetric?.IRR;
      assert.equal(debug?.intermediates?.method, 'NEXT_PROJECT_IRR');
      assert.deepEqual(debug?.intermediates?.selectedProjectIds, []);

      const snapshot = result.snapshot as any;
      const timeline = snapshot.canonicalValuationTimeline;
      const milestones = (snapshot.projectStartMilestones ?? []) as Array<{ corporatePeriodIndex: number; calendarYear: number }>;
      const selection = selectValuationChart(timeline, milestones.map((milestone) => milestone.corporatePeriodIndex));
      const display = selectValuationChartDisplayRange(timeline, selection, 'corporate');
      assert.equal(milestones.length, 0, 'historical production start must not remain a current valuation milestone');
      assert.equal(selection.selectedStartPeriod, timeline.todayPeriod, 'producer without a future project must anchor chart DCF at today');
      assert.equal(display.points[0]?.calendarYear, currentYear, 'producer chart must start at the valuation year');
      assertApprox(selection.today.high, timeline.periods[timeline.todayPeriod].dcfPerShareTarget, 'producer without future project must show full rolling Corporate DCF at today');
    }
  }

  {
    const body = await loadFixture();
    const projects = body.projects as Array<Record<string, unknown>>;
    projects.push(cloneProject(projects[0], 'ABRA_NEXT_BUILD'));
    setFirstModelYear(body, currentYear - 3, 0);
    setFirstModelYear(body, currentYear + 1, 1);
    body.valuationYear = currentYear;

    const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
    assert.equal(result.ok, true, 'producing portfolio with future project must compute');
    if (result.ok) {
      const debug = result.diagnostics.meta.corporateLista3Debug?.perMetric?.IRR;
      assert.equal(debug?.intermediates?.method, 'NEXT_PROJECT_IRR');
      assert.deepEqual(debug?.intermediates?.selectedProjectIds, ['ABRA_NEXT_BUILD']);
      assert.equal(debug?.intermediates?.constructionStartYear, currentYear + 1);
      assert.equal(typeof result.snapshot.corporate?.lista3Metrics?.IRR, 'number');
    }
  }

  {
    const body = await loadFixture();
    const projects = body.projects as Array<Record<string, unknown>>;
    const source = projects[0];
    projects.push(cloneProject(source, 'ABRA_NEXT_EARLY'), cloneProject(source, 'ABRA_NEXT_LATE'));
    setFirstModelYear(body, currentYear - 3, 0);
    setFirstModelYear(body, currentYear + 1, 1);
    setFirstModelYear(body, currentYear + 3, 2);
    body.valuationYear = currentYear;

    const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
    assert.equal(result.ok, true, 'earliest-construction selection case must compute');
    if (result.ok) {
      const debug = result.diagnostics.meta.corporateLista3Debug?.perMetric?.IRR;
      assert.equal(debug?.intermediates?.method, 'NEXT_PROJECT_IRR');
      assert.deepEqual(debug?.intermediates?.selectedProjectIds, ['ABRA_NEXT_EARLY']);
      assert.equal(debug?.intermediates?.constructionStartYear, currentYear + 1);
    }
  }

  {
    const body = await loadFixture();
    const projects = body.projects as Array<Record<string, unknown>>;
    const source = projects[0];
    projects.push(cloneProject(source, 'ABRA_NEXT_TIED_A'), cloneProject(source, 'ABRA_NEXT_TIED_B'));
    setFirstModelYear(body, currentYear - 3, 0);
    setFirstModelYear(body, currentYear + 1, 1);
    setFirstModelYear(body, currentYear + 1, 2);
    body.valuationYear = currentYear;

    const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
    assert.equal(result.ok, true, 'tied earliest-construction aggregation case must compute');
    if (result.ok) {
      const debug = result.diagnostics.meta.corporateLista3Debug?.perMetric?.IRR;
      assert.equal(debug?.intermediates?.method, 'NEXT_PROJECT_IRR');
      assert.deepEqual(debug?.intermediates?.selectedProjectIds, ['ABRA_NEXT_TIED_A', 'ABRA_NEXT_TIED_B']);
      assert.equal(debug?.intermediates?.constructionStartYear, currentYear + 1);
      assert.equal(typeof result.snapshot.corporate?.lista3Metrics?.IRR, 'number');
    }
  }

  {
    const body = await loadFixture();
    const projects = body.projects as Array<Record<string, unknown>>;
    projects.push(cloneProject(projects[0], 'ABRA_FUTURE_CURRENT_YEAR_ANCHOR'));
    setFirstModelYear(body, currentYear - 3, 0);
    setFirstModelYear(body, currentYear + 1, 1);
    body.valuationYear = currentYear;

    const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
    assert.equal(result.ok, true, 'current-year valuation anchor case must compute');
    if (result.ok) {
      const snapshot = result.snapshot as any;
      const timeline = snapshot.canonicalValuationTimeline;
      const milestones = (snapshot.projectStartMilestones ?? []) as Array<{ corporatePeriodIndex: number; calendarYear: number }>;
      const startPeriods = milestones.map((milestone) => milestone.corporatePeriodIndex);
      const selection = selectValuationChart(timeline, startPeriods);
      const display = selectValuationChartDisplayRange(timeline, selection, 'corporate');
      const today = timeline.periods[timeline.todayPeriod];

      assert.equal(today.calendarYear, currentYear, 'valuation today must be the current valuation year');
      assert.equal(display.points[0]?.calendarYear, currentYear, 'chart must start at the valuation year');
      assert.equal(display.points.some((point) => point.calendarYear < currentYear), false, 'chart must not render historical years');
      assert.equal(milestones.some((milestone) => milestone.calendarYear < currentYear), false, 'historical project starts must not be current valuation milestones');
      assert.equal(today.npvAtPeriodTarget, snapshot.NPV_today_TargetCurrency, 'NPV must be anchored at valuation year');
      assert.equal(today.navAtPeriodTarget, snapshot.NAV_today_TargetCurrency, 'NAV must be anchored at valuation year');

      const startPeriod = selection.selectedStartPeriod;
      assert.equal(typeof startPeriod, 'number', 'producer with a future project must expose a future production-start milestone');
      assert.ok((startPeriod as number) > timeline.todayPeriod, 'selected producer milestone must be after today');
      const start = timeline.periods[startPeriod as number];
      assert.ok(start, 'selected future milestone must exist in canonical timeline');

      let interimPresentUsd = 0;
      for (const period of timeline.periods.slice(timeline.todayPeriod, startPeriod as number)) {
        assert.equal(typeof period.fcffUSD, 'number', `interim FCFF ${period.calendarYear} must be numeric`);
        assert.equal(typeof period.discountFactorFromToday, 'number', `discount factor ${period.calendarYear} must be numeric`);
        interimPresentUsd += (period.fcffUSD as number) * (period.discountFactorFromToday as number);
      }
      assert.equal(typeof start.dcfAtPeriodUSD, 'number', 'future residual DCF must be numeric');
      assert.equal(typeof start.discountFactorFromToday, 'number', 'future start discount factor must be numeric');
      const residualPresentUsd = (start.dcfAtPeriodUSD as number) * (start.discountFactorFromToday as number);
      assertApprox(
        today.dcfAtPeriodUSD,
        interimPresentUsd + residualPresentUsd,
        'producer DCF today must equal interim actual FCFF PV plus future-start residual PV exactly once',
      );
      assertApprox(selection.today.high, today.dcfPerShareTarget, 'producer chart today must show full rolling Corporate DCF rather than only future residual PV');

      assertApprox(start.npvAtPeriodTarget, start.dcfAtPeriodTarget, 'active-producer future NPV must not subtract already-dated construction CAPEX a second time');
      assertApprox(
        start.navAtPeriodTarget,
        (start.dcfAtPeriodTarget as number) + (start.netCashTarget as number),
        'active-producer future NAV must equal residual DCF plus canonical net cash without duplicate historic CAPEX',
      );

      const canonical = selectCanonicalValuationMetrics(timeline);
      assert.equal(canonical.npvStart, null, 'historical producer start must not leak into canonical Corporate NPV-start scalar');
      assert.equal(canonical.navStart, null, 'historical producer start must not leak into canonical Corporate NAV-start scalar');
      assert.equal(canonical.dcfStart, null, 'historical producer start must not leak into canonical Corporate DCF-start scalar');
      assertApprox(canonical.npvToday, today.npvAtPeriodTarget, 'canonical Corporate NPV today must remain anchored at valuation year');
      assertApprox(canonical.navToday, today.navAtPeriodTarget, 'canonical Corporate NAV today must remain anchored at valuation year');
    }
  }

  console.log('producerNextProjectIrr.prebuild.test.ts passed');
}

await run();
