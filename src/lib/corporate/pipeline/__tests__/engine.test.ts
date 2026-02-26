import { computeCorporatePipeline } from '../engine.ts';
import type { CorporatePipelineInput } from '../types.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertApproxEqual(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function makeBaseInput(): CorporatePipelineInput {
  return {
    discountRate: 0.1,
    projects: {
      masterN: 1,
      projects: [
        {
          id: 'A',
          productionStartPeriod: 0,
          grossRevenueUSD: [100, 110],
          capexUSD: [5, 6],
          fcffUSD: [10, 20],
          sustainingCostUSD: [2, 3],
          payableAuEqOz: [1, 1],
        },
        {
          id: 'B',
          productionStartPeriod: 0,
          grossRevenueUSD: [10, 20],
          capexUSD: [1, 1],
          fcffUSD: [1, 2],
          sustainingCostUSD: [1, 1],
          payableAuEqOz: [0.5, 0.5],
        },
      ],
    },
    financing: {
      fx_USD_to_TargetCurrency: 10,
      cash_TargetCurrency_t0: 2000,
      debt_TargetCurrency_t0: 500,
      cashUsedForProjectFinancing_TargetCurrency_t0: 0,
    },
    market: {
      price_current_TargetCurrency: 10,
      shares_current: 1000,
    },
    equityFinancing: {
      equityNeeded_TargetCurrency: 100,
      equityRaisePrice_TargetCurrency_perShare: 5,
      roundToWholeShares: true,
    },
  };
}

(function runCorporatePipelineTests() {
  const happy = computeCorporatePipeline(makeBaseInput());

  assertEqual(happy.projects.fcffUSD_total[0], 11, 'happy path should aggregate corporate FCFF period 0');
  assertEqual(happy.projects.fcffUSD_total[1], 22, 'happy path should aggregate corporate FCFF period 1');
  assertEqual(happy.financing.navToday_TargetCurrency, 1810, 'happy path should wire NAV from financing');
  assertEqual(happy.marketValue.ev_TargetCurrency, 8500, 'happy path should wire EV through market value');
  assertEqual(
    happy.equityFinancing.shares_post_financing,
    1020,
    'happy path should wire shares_post_financing from equity financing',
  );

  assertApproxEqual(
    happy.perShare.navToday_perShare_TargetCurrency as number,
    (happy.financing.navToday_TargetCurrency as number) / (happy.equityFinancing.shares_post_financing as number),
    1e-12,
    'happy path NAV/share should use financing NAV and post-financing shares',
  );

  const expectedDcfProdStartPresentUsd = (10 + 20 / 1.1) + (1 + 2 / 1.1);
  const expectedDcfProdStartPresentTarget = expectedDcfProdStartPresentUsd * 10;
  assertApproxEqual(
    happy.projects.dcfProdStart_present_USD_total as number,
    expectedDcfProdStartPresentUsd,
    1e-12,
    'happy path should compute DCF prod-start present total at projects layer',
  );
  assertApproxEqual(
    happy.perShare.dcfProdStart_present_perShare_TargetCurrency as number,
    expectedDcfProdStartPresentTarget / (happy.equityFinancing.shares_post_financing as number),
    1e-12,
    'happy path should compute DCF prod-start present/share from target-currency aggregate and post-financing shares',
  );

  const nullPropagationInput = makeBaseInput();
  nullPropagationInput.projects.projects[1].fcffUSD[1] = null;

  const nullPropagation = computeCorporatePipeline(nullPropagationInput);

  assertEqual(
    nullPropagation.projects.npvToday_USD_total,
    null,
    'projects should produce null npvToday_USD_total when FCFF series contains null',
  );
  assertEqual(
    nullPropagation.financing.npvToday_TargetCurrency,
    null,
    'financing should propagate null npvToday_TargetCurrency from projects',
  );
  assertEqual(
    nullPropagation.marketValue.ev_over_npv,
    null,
    'market value should propagate null EV/NPV multiple when NPV is null',
  );
  assertEqual(
    nullPropagation.marketValue.ev_over_nav,
    null,
    'market value should propagate null EV/NAV multiple when NAV is null',
  );
  assertEqual(
    nullPropagation.perShare.npvToday_perShare_TargetCurrency,
    null,
    'per-share should propagate null NPV/share when financing NPV is null',
  );
  assertEqual(
    nullPropagation.perShare.navToday_perShare_TargetCurrency,
    null,
    'per-share should propagate null NAV/share when financing NAV is null',
  );
  assertEqual(
    nullPropagation.perShare.cfLOM_perShare_TargetCurrency,
    null,
    'per-share should propagate null CF LOM/share when projects cfLOM is null',
  );
  assertEqual(
    nullPropagation.perShare.dcfProdStart_present_perShare_TargetCurrency,
    null,
    'per-share should propagate null DCF prod-start present/share when project DCF aggregate is null',
  );

  console.log('Corporate pipeline engine tests passed');
})();
