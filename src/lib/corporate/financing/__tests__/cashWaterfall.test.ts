import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCorporateCashWaterfall, CORPORATE_OPERATIONAL_FUNDING_KEY } from '../cashWaterfall.ts';

const run = (overrides: Partial<Parameters<typeof computeCorporateCashWaterfall>[0]> = {}) => computeCorporateCashWaterfall({
  latestQuarterlyCash: 0, useLatestQuarterlyCash: false, cashUsedPercent: 1,
  minimumCashReserve: 0, debtPercent: 0.5, projects: [],
  fxUSDToTargetCurrency: 1, equityRaisePriceTargetCurrency: 1, sharesCurrent: 100,
  ...overrides,
});
const project = (projectId: string, fcffByPeriod: Array<number | null>, capexNeedByPeriod: Array<number | null>, includes = false, debtPercent?: number) => ({
  projectId, constructionStartPeriod: Math.max(0, capexNeedByPeriod.findIndex(Boolean)),
  fcffByPeriod, capexNeedByPeriod, fcffIncludesConstructionCapex: includes, debtPercent,
});

test('finances negative operating cash without construction CAPEX', () => {
  const result = run({ debtPercent: 0, projects: [project('A', [-25], [0])] });
  assert.deepEqual(
    [result.rows[0].operationalFundingNeed, result.rows[0].totalExternalFundingNeed, result.rows[0].equityRaised, result.rows[0].closingCash, result.rows[0].unfundedGap],
    [25, 25, 25, 0, 0],
  );
});

test('negative operating cash restores the minimum reserve', () => {
  const result = run({ latestQuarterlyCash: 20, useLatestQuarterlyCash: true, minimumCashReserve: 10, debtPercent: 0, projects: [project('A', [-15], [0])] });
  assert.deepEqual([result.rows[0].operationalFundingNeed, result.rows[0].totalExternalFundingNeed, result.rows[0].closingCash], [5, 5, 10]);
});

test('negative reported opening cash is normalized to zero and then financed to reserve', () => {
  const result = run({ latestQuarterlyCash: -20, useLatestQuarterlyCash: true, minimumCashReserve: 10, projects: [project('A', [0], [0])] });
  assert.deepEqual([result.initialCashAvailable, result.rows[0].operationalFundingNeed, result.rows[0].closingCash], [10, 0, 10]);
});

test('positive operations cash and construction CAPEX preserve chronological cash-first behavior', () => {
  const result = run({ projects: [project('A', [100, 100], [0, 0]), project('B', [0, 0], [0, 150])] });
  assert.deepEqual([result.rows[1].internalCashUsed, result.rows[1].debtAdded, result.rows[1].equityRaised, result.rows[1].closingCash], [150, 0, 0, 50]);
});

test('negative operations and construction CAPEX are financed exactly once', () => {
  const result = run({ latestQuarterlyCash: 40, useLatestQuarterlyCash: true, minimumCashReserve: 10, debtPercent: 0, projects: [project('A', [-20], [25])] });
  const row = result.rows[0];
  assert.deepEqual([row.preFinancingCash, row.constructionFundingNeed, row.operationalFundingNeed, row.totalExternalFundingNeed, row.closingCash], [-5, 15, 0, 15, 10]);
});

test('publishes separate construction and operating financing components', () => {
  const result = run({ debtPercent: 0.25, projects: [project('A', [-20], [25])] });
  const row = result.rows[0];
  assert.deepEqual([row.constructionFundingNeed, row.operationalFundingNeed], [25, 20]);
  assert.deepEqual([row.constructionDebtAdded, row.constructionEquityRaised], [6.25, 18.75]);
  assert.deepEqual([row.operationalDebtAdded, row.operationalEquityRaised], [5, 15]);
  assert.equal(row.operationalNewShares, 15);
});

test('future cash cannot finance an earlier operating or construction deficit', () => {
  const result = run({ projects: [project('A', [-20, 150], [0, 0]), project('B', [0, 0], [100, 0])] });
  assert.equal(result.rows[0].totalExternalFundingNeed, 120);
  assert.equal(result.rows[1].openingCash, 0);
});

test('construction CAPEX embedded in FCFF is grossed up and deducted exactly once', () => {
  const result = run({ projects: [project('B', [-100], [100], true)] });
  assert.deepEqual([result.rows[0].operatingCashGenerated, result.rows[0].constructionCapex, result.rows[0].totalExternalFundingNeed, result.rows[0].closingCash], [0, 100, 100, 0]);
});

test('cash is carried once and cannot be reused after construction', () => {
  const result = run({ latestQuarterlyCash: 80, useLatestQuarterlyCash: true, cashUsedPercent: 0.5, projects: [project('A', [60, 0], [0, 0]), project('B', [0, 0], [0, 150])] });
  assert.deepEqual([result.totalInitialCashUsed, result.totalInternallyGeneratedCashUsed, result.totalInternalCashUsed, result.totalExternalFundingNeed], [40, 60, 100, 50]);
});

test('minimum reserve holds after operations, construction and financing in every computable period', () => {
  const result = run({ latestQuarterlyCash: 50, useLatestQuarterlyCash: true, minimumCashReserve: [20, 30, 40], projects: [project('A', [-40, 70, -80], [0, 100, 0])] });
  result.rows.forEach((row) => assert.ok((row.closingCash as number) >= row.minimumCashReserve));
});

test('cash-first disabled retains its existing policy of excluding reported cash', () => {
  const first = run({ latestQuarterlyCash: 100, useLatestQuarterlyCash: false, cashUsedPercent: 0, projects: [project('B', [0], [120])] });
  const second = run({ latestQuarterlyCash: 1000, useLatestQuarterlyCash: false, cashUsedPercent: 1, projects: [project('B', [0], [120])] });
  assert.deepEqual([first.totalInitialCashUsed, first.totalExternalFundingNeed, first.debtAdded, first.equityRaised], [0, 120, 60, 60]);
  assert.deepEqual(second, first);
});

test('full need follows the existing debt/equity split', () => {
  const result = run({ debtPercent: 0.25, projects: [project('A', [-20], [100])] });
  assert.deepEqual([result.totalExternalFundingNeed, result.debtAdded, result.equityRaised, result.unfundedGap], [120, 30, 90, 0]);
});

test('full equity creates periodized and cumulative shares', () => {
  const result = run({ debtPercent: 0, fxUSDToTargetCurrency: 2, equityRaisePriceTargetCurrency: 4, sharesCurrent: 100, projects: [project('A', [-20, 10, -40], [0, 0, 0])] });
  assert.deepEqual(result.newSharesByPeriod, [10, 0, 15]);
  assert.deepEqual(result.cumulativeNewSharesByPeriod, [10, 10, 25]);
  assert.deepEqual(result.cumulativeCanonicalSharesByPeriod, [110, 110, 125]);
});

test('full debt creates no new shares', () => {
  const result = run({ debtPercent: 1, projects: [project('A', [-25], [0])] });
  assert.deepEqual([result.debtAdded, result.equityRaised, result.totalNewShares], [25, 0, 0]);
});

test('positive equity with invalid issue price is explicitly not computable and poisons cumulative shares', () => {
  const result = run({ debtPercent: 0, equityRaisePriceTargetCurrency: 0, projects: [project('A', [-25, 10], [0, 0])] });
  assert.equal(result.rows[0].status, 'NOT_COMPUTABLE');
  assert.equal(result.rows[0].newShares, null);
  assert.match(result.rows[0].diagnostics[0], /issue price/);
  assert.deepEqual(result.cumulativeNewSharesByPeriod, [null, null]);
});

test('multi-project operating deficit is attributed pro rata and totals reconcile', () => {
  const result = run({ debtPercent: 0, projects: [project('A', [-20], [0]), project('B', [-30], [0])] });
  assert.deepEqual(result.rows[0].equityRaisedByProject, { A: 20, B: 30 });
  assert.equal(result.rows[0].equityRaised, 50);
});

test('reversed input ordering leaves totals unchanged', () => {
  const a = project('A', [-20], [0]); const b = project('B', [-30], [0]);
  const forward = run({ projects: [a, b] }); const reverse = run({ projects: [b, a] });
  assert.deepEqual([forward.totalExternalFundingNeed, forward.debtAdded, forward.equityRaised], [reverse.totalExternalFundingNeed, reverse.debtAdded, reverse.equityRaised]);
});

test('same-year project attribution is deterministic by stable project id', () => {
  const result = run({ latestQuarterlyCash: 50, useLatestQuarterlyCash: true, debtPercent: 0, projects: [project('B', [0], [50]), project('A', [0], [50])] });
  assert.deepEqual(result.rows[0].internalCashUsedByProject, { A: 50, B: 0 });
  assert.deepEqual(result.rows[0].equityRaisedByProject, { A: 0, B: 50 });
});

test('a reserve-only deficit receives explicit Corporate attribution', () => {
  const result = run({ minimumCashReserve: [0, 20], projects: [project('A', [0, 0], [0, 0])] });
  assert.equal(result.rows[1].debtAddedByProject[CORPORATE_OPERATIONAL_FUNDING_KEY], 10);
  assert.equal(result.rows[1].equityRaisedByProject[CORPORATE_OPERATIONAL_FUNDING_KEY], 10);
  assert.equal(result.rows[1].unfundedGap, 0);
});

test('null FCFF is not silently converted to zero', () => {
  const result = run({ projects: [project('A', [null], [0])] });
  assert.equal(result.rows[0].status, 'NOT_COMPUTABLE');
  assert.equal(result.rows[0].closingCash, null);
});
