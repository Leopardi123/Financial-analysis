import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runCorporateSnapshotPipeline } from '../runCorporateSnapshot.ts';

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

  console.log('producerNextProjectIrr.prebuild.test.ts passed');
}

await run();
