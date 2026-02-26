import { buildCorporateSnapshot, computeMarketValue } from '../buildCorporateSnapshot.ts';
import type { CorporateFinancingOutput } from '../../financing/types.ts';
import type { CorporateAggregationOutput } from '../../types.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertAlmostEqual(actual: number | null, expected: number, message: string): void {
  if (actual === null || Math.abs(actual - expected) > 1e-12) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function baseFinancing(): CorporateFinancingOutput {
  return {
    cash_used_for_build_TargetCurrency: 0,
    cash_t0_post_TargetCurrency: 200,
    new_debt_TargetCurrency: 0,
    debt_t0_post_TargetCurrency: 300,
    equity_raised_TargetCurrency: 0,
    new_shares: 0,
    shares_post_financing: 1000,
    NPV_today_TargetCurrency: 500,
    NAV_today_TargetCurrency: 400,
    Debt_to_Equity_ratio: 0,
    npvToday_TargetCurrency: 500,
    navToday_TargetCurrency: 400,
    cash_AfterCashFirst_TargetCurrency_t0: 200,
    debt_TargetCurrency_t0: 300,
    netCash_TargetCurrency_t0: -100,
    enterpriseAdjustments_TargetCurrency_t0: 0,
    evAdditive_Component_TargetCurrency_t0: -100,
  };
}

function baseAggregation(): CorporateAggregationOutput {
  return {
    corporatePeriodEndDatesUtc: [],
    corporateMasterN: 0,
    capexUSD_total: [],
    fcffUSD_total: [],
    sustainingCostUSD_total: [],
    payableAuEqOz_total: [],
    aiscAuEqUSDPerOz_LOM: null,
    CF_LOM_USD: null,
    NPV_today_USD: 50,
    diagnostics: {
      projectCount: 0,
      usedDatesCount: 0,
      nullPeriods: 0,
      notes: [],
    },
  };
}

(function runSnapshotTests() {
  const financing = baseFinancing();

  const happy = computeMarketValue({
    market: {
      shares_current: 100,
      price_current_TargetCurrency: 10,
    },
    financing,
  });

  assertEqual(happy.MarketCap_TargetCurrency, 1000, 'happy path computes market cap');
  assertEqual(happy.EV_TargetCurrency, 1100, 'happy path computes EV');
  assertAlmostEqual(happy.EV_over_NPV, 2.2, 'happy path computes EV over NPV');
  assertAlmostEqual(happy.EV_over_NAV, 2.75, 'happy path computes EV over NAV');
  assertAlmostEqual(happy.P_over_NAV, 2.5, 'happy path computes P over NAV');
  assertAlmostEqual(happy.EV_perShare_TargetCurrency, 11, 'happy path computes EVPS');

  const sharesNowRule = computeMarketValue({
    market: {
      shares_current: 100,
      price_current_TargetCurrency: 10,
    },
    financing: {
      ...financing,
      shares_post_financing: 1000,
    },
  });
  assertAlmostEqual(
    sharesNowRule.EV_perShare_TargetCurrency,
    11,
    'EVPS uses shares_current and not shares_post_financing',
  );

  const nullPrice = computeMarketValue({
    market: {
      shares_current: 100,
      price_current_TargetCurrency: null,
    },
    financing,
  });
  assertEqual(nullPrice.MarketCap_TargetCurrency, null, 'null price gives null market cap');
  assertEqual(nullPrice.EV_TargetCurrency, null, 'null price gives null EV');
  assertEqual(nullPrice.EV_over_NPV, null, 'null EV gives null EV_over_NPV');
  assertEqual(nullPrice.EV_over_NAV, null, 'null EV gives null EV_over_NAV');
  assertEqual(nullPrice.P_over_NAV, null, 'null market cap gives null P_over_NAV');


  const negativeDenominators = computeMarketValue({
    market: {
      shares_current: 100,
      price_current_TargetCurrency: 10,
    },
    financing: {
      ...financing,
      NPV_today_TargetCurrency: -500,
      NAV_today_TargetCurrency: -400,
    },
  });
  assertEqual(negativeDenominators.EV_over_NPV, null, 'non-positive NPV gives null EV_over_NPV');
  assertEqual(negativeDenominators.EV_over_NAV, null, 'non-positive NAV gives null EV_over_NAV');
  assertEqual(negativeDenominators.P_over_NAV, null, 'non-positive NAV gives null P_over_NAV');

  const withAdjustments = computeMarketValue({
    market: {
      shares_current: 100,
      price_current_TargetCurrency: 10,
      preferredEquity_TargetCurrency: 50,
      minorityInterest_TargetCurrency: 25,
    },
    financing,
  });
  assertEqual(
    withAdjustments.EnterpriseAdjustments_TargetCurrency,
    75,
    'enterprise adjustments sum preferred and minority',
  );
  assertEqual(withAdjustments.EV_TargetCurrency, 1175, 'adjustments increase EV');

  const snapshot = buildCorporateSnapshot({
    targetCurrency: 'SEK',
    aggregation: baseAggregation(),
    financing,
    market: {
      shares_current: 100,
      price_current_TargetCurrency: 10,
    },
  });

  assertEqual(snapshot.targetCurrency, 'SEK', 'snapshot keeps target currency');
  assertEqual(snapshot.NPV_today_TargetCurrency, 500, 'snapshot keeps convenience NPV');
  assertEqual(snapshot.NAV_today_TargetCurrency, 400, 'snapshot keeps convenience NAV');
  assertEqual(snapshot.MarketCap_TargetCurrency, 1000, 'snapshot exposes root-level market cap');
  assertEqual(snapshot.EV_TargetCurrency, 1100, 'snapshot exposes root-level EV');
  assertAlmostEqual(snapshot.EV_perShare_TargetCurrency, 11, 'snapshot exposes root-level EV per share');
  assertAlmostEqual(snapshot.EV_over_NPV, 2.2, 'snapshot exposes root-level EV over NPV');
  assertAlmostEqual(snapshot.EV_over_NAV, 2.75, 'snapshot exposes root-level EV over NAV');
  assertAlmostEqual(snapshot.P_over_NAV, 2.5, 'snapshot exposes root-level P over NAV');

  console.log('Corporate snapshot market value tests passed');
})();
