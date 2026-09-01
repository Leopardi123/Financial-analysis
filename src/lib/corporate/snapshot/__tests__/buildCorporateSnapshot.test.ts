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
    financing_provenance: {
      debt_fraction: 'DEFAULT',
      equity_fraction: 'DEFAULT',
      use_cash_first: 'DEFAULT',
      cash_use_percent: 'DEFAULT',
      canonical_default_split_applied: true,
    },
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
    corporateYearsByPeriod: [],
    corporateMasterN: 0,
    capexUSD_total: [],
    fcffUSD_total: [],
    grossRevenueUSD_total: [],
    auPriceUSDPerOz: [],
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

(function runTests() {
  const market = computeMarketValue({
    NPV_today_TargetCurrency: 500,
    NAV_today_TargetCurrency: 400,
    shares_current: 100,
    price_current_TargetCurrency: 10,
    preferredEquity_TargetCurrency: 20,
    minorityInterest_TargetCurrency: 30,
    cash_t0_post_TargetCurrency: 200,
    debt_t0_post_TargetCurrency: 300,
  });

  assertEqual(market.MarketCap_TargetCurrency, 1000, 'market cap');
  assertEqual(market.EnterpriseAdjustments_TargetCurrency, 150, 'enterprise adjustments');
  assertEqual(market.EV_TargetCurrency, 1150, 'enterprise value');
  assertAlmostEqual(market.EV_over_NPV, 2.3, 'EV/NPV');
  assertAlmostEqual(market.EV_over_NAV, 2.875, 'EV/NAV');
  assertAlmostEqual(market.P_over_NAV, 2.5, 'P/NAV');
  assertAlmostEqual(market.EV_perShare_TargetCurrency, 11.5, 'EV per share');

  const snapshot = buildCorporateSnapshot({
    targetCurrency: 'CAD',
    aggregation: baseAggregation(),
    financing: baseFinancing(),
    market: {
      shares_current: 100,
      price_current_TargetCurrency: 10,
      preferredEquity_TargetCurrency: 20,
      minorityInterest_TargetCurrency: 30,
    },
    cfDcfMetrics: {
      CF_LOM_USD: 100,
      CF_LOM_perShare_USD: 0.1,
      CF_LOM_prodStart_perShare_USD: 0.1,
      DCF_prodStart_exCapex_USD: 80,
      DCF_prodStart_exCapex_perShare_USD: 0.08,
      DCF_prodStart_present_USD: 70,
      DCF_prodStart_present_perShare_USD: 0.07,
      Payback_approx_years: 3,
      Payback_real_years: 4,
    },
    lista3aMetrics: {
      ROI_10Y_pct: 10,
      LOM_average_EBIT_ROCE_pct: 12,
      LOM_discounted_EBIT_ROCE_pct: 11,
    },
    lista4Metrics: {
      NPV_over_ETLV: 2,
      DCF_present_over_ETLV: 1.8,
      DCF_prodStart_over_ETLV: 2.1,
      Revenue_10Y_USD: 1000,
      FCFF_10Y_USD: 400,
      AuEq_Oz_10Y: 100,
      InSituValue_10Y_USD: 5000,
      InSituValue_perShare_10Y_USD: 5,
    },
    fx_USD_to_TargetCurrency: 2,
  });

  assertEqual(snapshot.targetCurrency, 'CAD', 'snapshot currency');
  assertEqual(snapshot.NPV_today_TargetCurrency, 500, 'snapshot NPV');
  assertEqual(snapshot.NAV_today_TargetCurrency, 400, 'snapshot NAV');
  assertEqual(snapshot.MarketCap_TargetCurrency, 1000, 'snapshot market cap');
  assertEqual(snapshot.EV_TargetCurrency, 1150, 'snapshot EV');
  assertEqual(snapshot.CF_LOM_TargetCurrency, 200, 'snapshot CF LOM conversion');
  assertEqual(snapshot.DCF_prodStart_present_TargetCurrency, 140, 'snapshot DCF conversion');
  assertEqual(snapshot.Revenue_10Y_TargetCurrency, 2000, 'snapshot revenue conversion');
  assertEqual(snapshot.InSituValue_perShare_10Y_TargetCurrency, 10, 'snapshot in-situ/share conversion');
  assertEqual(snapshot.financing.financing_provenance.canonical_default_split_applied, true, 'snapshot preserves financing provenance');

  console.log('Corporate snapshot tests passed');
})();
