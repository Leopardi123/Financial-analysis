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
const legacyBody = clone(baseBody);
const explicitBody = clone(baseBody);

const legacyRaw = (legacyBody.projects as Array<Record<string, unknown>>)[0].rawJson as Record<string, unknown>;
const explicitRaw = (explicitBody.projects as Array<Record<string, unknown>>)[0].rawJson as Record<string, unknown>;

// Compare against the exact legacy zero-tax path: no taxRate and no explicit cash-tax field.
// This test verifies cash-flow plumbing only. It does not assert that a report-locked
// explicit tax series is a spot-sensitive tax model when runtime metal prices differ
// from the technical-report deck.
const legacyEconomics = (legacyRaw.economics ?? {}) as Record<string, unknown>;
delete legacyEconomics.taxRate;
legacyRaw.economics = legacyEconomics;
const explicitEconomics = (explicitRaw.economics ?? {}) as Record<string, unknown>;
delete explicitEconomics.taxRate;
explicitRaw.economics = explicitEconomics;

const legacySeries = legacyRaw.series as Record<string, unknown>;
const explicitSeries = explicitRaw.series as Record<string, unknown>;
const length = (legacySeries.operatingCostsUSD as Array<number | null>).length;
const taxCashFlowUSD = new Array<number | null>(length).fill(0);
const terminalProceedsUSD = new Array<number | null>(length).fill(0);
const constructionCreditT = 0;
const operatingTaxT = Math.min(2, length - 1);
const terminalT = length - 1;
taxCashFlowUSD[constructionCreditT] = 50;
taxCashFlowUSD[operatingTaxT] = -30;
terminalProceedsUSD[terminalT] = 70;
explicitSeries.taxCashFlowUSD = taxCashFlowUSD;
explicitSeries.terminalProceedsUSD = terminalProceedsUSD;

const legacyResult = await runCorporateSnapshotPipeline({ body: legacyBody, refresh: false });
const explicitResult = await runCorporateSnapshotPipeline({ body: explicitBody, refresh: false });
assert.equal(legacyResult.ok, true);
assert.equal(explicitResult.ok, true);
if (!legacyResult.ok || !explicitResult.ok) process.exit(1);

const legacy = legacyResult.snapshot.series;
const explicit = explicitResult.snapshot.series;
assert.ok(legacy && explicit);

// Explicit tax and terminal proceeds are cash-flow-only inputs: operating EBIT/revenue must not move.
assert.deepEqual(explicit.totalRevenue_USD, legacy.totalRevenue_USD);
assert.deepEqual(explicit.ebitUSD, legacy.ebitUSD);

assert.equal(explicit.taxUSD[constructionCreditT], -50, 'positive explicit tax cash flow is a refundable credit (negative taxUSD)');
assert.equal(explicit.taxUSD[operatingTaxT], 30, 'negative explicit tax cash flow is a tax payment (positive taxUSD)');

for (let t = 0; t < length; t += 1) {
  const legacyFcff: number | null = legacy.fcffUSD[t] ?? null;
  const explicitFcff: number | null = explicit.fcffUSD[t] ?? null;
  assert.equal(typeof legacyFcff, 'number');
  assert.equal(typeof explicitFcff, 'number');
  const expectedDelta = (taxCashFlowUSD[t] ?? 0) + (terminalProceedsUSD[t] ?? 0);
  assert.ok(
    Math.abs((explicitFcff as number) - (legacyFcff as number) - expectedDelta) < 1e-6,
    `FCFF delta at t=${t} should equal explicit tax cash flow + terminal proceeds`,
  );
}

console.log('explicitTaxTerminalSnapshot.test.ts passed');
