import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runCorporateSnapshotPipeline } from '../runCorporateSnapshot.ts';

async function loadFixture(): Promise<Record<string, unknown>> {
  const fixturePath = path.resolve('scripts/fixtures/snapshot-requests/abra_minimal.json');
  const fixtureRaw = await readFile(fixturePath, 'utf8');
  const parsed = JSON.parse(fixtureRaw) as Record<string, unknown>;
  const currentYear = new Date().getUTCFullYear();
  const projects = parsed.projects as Array<Record<string, unknown>>;
  for (const project of projects) {
    const rawJson = project.rawJson as Record<string, unknown>;
    rawJson.version = 'project_json_v2';
    const time = rawJson.time as Record<string, unknown>;
    const tp = Number.isInteger(time.productionStartPeriod) ? time.productionStartPeriod as number : 0;
    time.productionStartYear = currentYear + tp;
  }
  return parsed;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const baseBody = await loadFixture();
const dynamicBody = clone(baseBody);
const evidenceBody = clone(baseBody);

const dynamicRaw = (dynamicBody.projects as Array<Record<string, unknown>>)[0].rawJson as Record<string, unknown>;
const evidenceRaw = (evidenceBody.projects as Array<Record<string, unknown>>)[0].rawJson as Record<string, unknown>;

// Both runtime cases use the same dynamic tax rule. The second case additionally carries
// report-deck tax evidence that must not alter spot runtime tax or FCFF.
(dynamicRaw.economics as Record<string, unknown>).taxRate = 0.27;
(evidenceRaw.economics as Record<string, unknown>).taxRate = 0.27;

const dynamicSeries = dynamicRaw.series as Record<string, unknown>;
const evidenceSeries = evidenceRaw.series as Record<string, unknown>;
const length = (dynamicSeries.operatingCostsUSD as Array<number | null>).length;
const reportTaxCashFlowUSD = new Array<number | null>(length).fill(0);
const terminalProceedsUSD = new Array<number | null>(length).fill(0);
reportTaxCashFlowUSD[0] = 50;
reportTaxCashFlowUSD[Math.min(2, length - 1)] = -30;
terminalProceedsUSD[length - 1] = 70;
evidenceSeries.taxCashFlowUSD = reportTaxCashFlowUSD;
evidenceSeries.terminalProceedsUSD = terminalProceedsUSD;

const dynamicResult = await runCorporateSnapshotPipeline({ body: dynamicBody, refresh: false });
const evidenceResult = await runCorporateSnapshotPipeline({ body: evidenceBody, refresh: false });
assert.equal(dynamicResult.ok, true);
assert.equal(evidenceResult.ok, true);
if (!dynamicResult.ok || !evidenceResult.ok) process.exit(1);

const dynamic = dynamicResult.snapshot.series;
const evidence = evidenceResult.snapshot.series;
assert.ok(dynamic && evidence);

assert.deepEqual(evidence.totalRevenue_USD, dynamic.totalRevenue_USD, 'report tax evidence must not alter runtime revenue');
assert.deepEqual(evidence.ebitUSD, dynamic.ebitUSD, 'report tax evidence must not alter runtime EBIT');
assert.deepEqual(evidence.taxUSD, dynamic.taxUSD, 'report tax evidence must not override dynamic runtime tax');

for (let t = 0; t < length; t += 1) {
  const dynamicFcff: number | null = dynamic.fcffUSD[t] ?? null;
  const evidenceFcff: number | null = evidence.fcffUSD[t] ?? null;
  assert.equal(typeof dynamicFcff, 'number');
  assert.equal(typeof evidenceFcff, 'number');
  const expectedDelta = terminalProceedsUSD[t] ?? 0;
  assert.ok(
    Math.abs((evidenceFcff as number) - (dynamicFcff as number) - expectedDelta) < 1e-6,
    `runtime FCFF delta at t=${t} must contain terminal proceeds only, never report tax evidence`,
  );
}

console.log('explicitTaxTerminalSnapshot.test.ts passed');
