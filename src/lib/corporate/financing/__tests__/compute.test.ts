import { computeCorporateFinancing } from '../compute.ts';
import { computeCorporateCashWaterfall } from '../cashWaterfall.ts';
import type { CorporateFinancingInput } from '../types.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertClose(actual: number | null, expected: number, message: string): void {
  if (actual === null || Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertThrows(fn: () => void, message: string): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

function baseInput(): CorporateFinancingInput {
  return {
    NPV_today_USD: 100,
    targetCurrency: 'SEK',
    fx_USD_to_TargetCurrency: 10,
    cash_t0_TargetCurrency: 1000,
    debt_t0_TargetCurrency: 0,
    shares_current: 100,
    price_current_TargetCurrency: 2,
    buildFundingNeed_USD: 50,
  };
}

(function runTests() {
  const case1 = computeCorporateFinancing(baseInput());
  assertEqual(case1.cash_used_for_build_TargetCurrency, 500, 'case1 cash-first uses build funding from cash');
  assertEqual(case1.equity_raised_TargetCurrency, 0, 'case1 no equity raise needed');
  assertEqual(case1.new_debt_TargetCurrency, 0, 'case1 no debt raise needed');
  assertEqual(case1.cash_t0_post_TargetCurrency, 500, 'case1 post cash should be reduced');
  assertEqual(case1.NPV_today_TargetCurrency, 1000, 'case1 npv converted to target currency');
  assertEqual(case1.NAV_today_TargetCurrency, 1500, 'case1 nav includes post cash and debt');
  assertEqual(case1.financing_provenance.debt_fraction, 'DEFAULT', 'case1 default debt fraction provenance');
  assertEqual(case1.financing_provenance.equity_fraction, 'DEFAULT', 'case1 default equity fraction provenance');
  assertEqual(case1.financing_provenance.canonical_default_split_applied, true, 'case1 canonical 0/100 split is defaulted');

  const case2Input = baseInput();
  case2Input.cash_t0_TargetCurrency = 100;
  const case2 = computeCorporateFinancing(case2Input);
  assertEqual(case2.cash_used_for_build_TargetCurrency, 100, 'case2 uses all available cash');
  assertEqual(case2.equity_raised_TargetCurrency, 400, 'case2 raises residual need as equity');
  assertEqual(case2.new_shares, 200, 'case2 new shares from raise amount / price');
  assertEqual(case2.shares_post_financing, 300, 'case2 post-financing shares include new shares');

  const case3Input = baseInput();
  case3Input.cash_t0_TargetCurrency = 0;
  case3Input.buildFundingNeed_USD = 100;
  case3Input.financingPlan = {
    debt_fraction: 0.4,
    equity_fraction: 0.6,
  };
  const case3 = computeCorporateFinancing(case3Input);
  assertEqual(case3.new_debt_TargetCurrency, 400, 'case3 debt split should match fraction');
  assertEqual(case3.equity_raised_TargetCurrency, 600, 'case3 equity split should match fraction');
  assertEqual(case3.financing_provenance.debt_fraction, 'USER', 'case3 explicit untagged debt fraction is user input');
  assertEqual(case3.financing_provenance.equity_fraction, 'USER', 'case3 explicit untagged equity fraction is user input');
  assertEqual(case3.financing_provenance.canonical_default_split_applied, false, 'case3 explicit split is not canonical default provenance');

  const case4Input = baseInput();
  case4Input.financingPlan = {
    use_cash_first: false,
  };
  const case4 = computeCorporateFinancing(case4Input);
  assertEqual(case4.cash_used_for_build_TargetCurrency, 0, 'case4 cash-first disabled should not use cash');
  assertEqual(case4.equity_raised_TargetCurrency, 500, 'case4 full build need raised');
  assertEqual(case4.financing_provenance.debt_fraction, 'DEFAULT', 'case4 split remains canonical default');
  assertEqual(case4.financing_provenance.equity_fraction, 'DEFAULT', 'case4 split remains canonical default');
  assertEqual(case4.financing_provenance.use_cash_first, 'USER', 'case4 explicit cash-first setting is user provenance');

  const case5Input = baseInput();
  case5Input.financingPlan = {
    debt_fraction: 0.8,
    equity_fraction: 0.3,
  };
  assertThrows(
    () => computeCorporateFinancing(case5Input),
    'case5 fractions not summing to 1 should throw',
  );

  const case6Input = baseInput();
  case6Input.NPV_today_USD = null;
  case6Input.cash_t0_TargetCurrency = 0;
  case6Input.debt_t0_TargetCurrency = 50;
  case6Input.buildFundingNeed_USD = 0;
  const case6 = computeCorporateFinancing(case6Input);
  assertClose(case6.Debt_to_Equity_ratio, 0.25, 'case6 debt-to-equity should use market-now equity');

  const case7Input = baseInput();
  case7Input.NPV_today_USD = 10;
  case7Input.fx_USD_to_TargetCurrency = 10;
  case7Input.cash_t0_TargetCurrency = 0;
  case7Input.debt_t0_TargetCurrency = 40;
  case7Input.buildFundingNeed_USD = 0;
  const case7 = computeCorporateFinancing(case7Input);
  assertEqual(case7.NPV_today_TargetCurrency, 100, 'case7 npv should equal 100 in target currency');
  assertEqual(case7.NAV_today_TargetCurrency, 60, 'case7 nav should include debt at t0');
  assertEqual((case7.NAV_today_TargetCurrency as number) - (case7.NPV_today_TargetCurrency as number), -40, 'case7 nav-npv delta should equal -40');

  const case8Input = baseInput();
  case8Input.cash_t0_TargetCurrency = 0;
  case8Input.financingPlan = {
    debt_fraction: 0.3,
    equity_fraction: 0.7,
    provenance_source: 'REPORT',
  };
  const case8 = computeCorporateFinancing(case8Input);
  assertEqual(case8.financing_provenance.debt_fraction, 'REPORT', 'case8 report debt provenance is preserved');
  assertEqual(case8.financing_provenance.equity_fraction, 'REPORT', 'case8 report equity provenance is preserved');
  assertEqual(case8.new_debt_TargetCurrency, 150, 'case8 provenance must not change debt math');
  assertEqual(case8.equity_raised_TargetCurrency, 350, 'case8 provenance must not change equity math');

  const currentYear = new Date().getUTCFullYear();
  const liveRebasedWaterfall = computeCorporateCashWaterfall({
    yearsByPeriod: [currentYear - 2, currentYear - 1, currentYear, currentYear + 1],
    latestQuarterlyCash: 50,
    useLatestQuarterlyCash: true,
    cashUsedPercent: 1,
    minimumCashReserve: 0,
    debtPercent: 0,
    fxUSDToTargetCurrency: 1,
    equityRaisePriceTargetCurrency: 1,
    sharesCurrent: 100,
    projects: [
      {
        projectId: 'producer',
        constructionStartPeriod: 0,
        capexNeedByPeriod: [100, 100, 0, 0],
        fcffIncludesConstructionCapex: true,
        fcffByPeriod: [-100, 50, 40, 40],
      },
      {
        projectId: 'future',
        constructionStartPeriod: 1,
        capexNeedByPeriod: [0, 80, 120, 0],
        fcffIncludesConstructionCapex: true,
        fcffByPeriod: [0, -80, -120, 0],
      },
    ],
  });
  assertEqual(liveRebasedWaterfall.rows.length, 2, 'waterfall runtime fallback should omit historical calendar rows');
  assertEqual(liveRebasedWaterfall.rows[0]?.period, 0, 'rebased waterfall period zero should be valuation year');
  assertEqual(liveRebasedWaterfall.rows[0]?.year, currentYear, 'rebased waterfall first year should be current valuation year');
  assertEqual(liveRebasedWaterfall.rows[0]?.projectCapexNeed, 120, 'only valuation-year future CAPEX should remain');
  assertEqual(liveRebasedWaterfall.rows[0]?.operatingCashGenerated, 40, 'historical producer FCFF must not be replayed; valuation-year producer FCFF remains');
  assertEqual(liveRebasedWaterfall.totalInitialCashUsed, 50, 'today cash should be introduced once at valuation year');
  assertEqual(liveRebasedWaterfall.totalExternalFundingNeed, 30, 'residual funding should exclude historical producer and project CAPEX');
  assertEqual(liveRebasedWaterfall.totalNewShares, 30, 'new shares should fund only residual valuation-year-plus need');

  const explicitRebasedWaterfall = computeCorporateCashWaterfall({
    yearsByPeriod: [2030, 2031, 2032],
    valuationYear: 2031,
    latestQuarterlyCash: 30,
    useLatestQuarterlyCash: true,
    cashUsedPercent: 1,
    minimumCashReserve: 0,
    debtPercent: 0,
    fxUSDToTargetCurrency: 1,
    equityRaisePriceTargetCurrency: 1,
    sharesCurrent: 100,
    projects: [{
      projectId: 'future-explicit',
      constructionStartPeriod: 0,
      capexNeedByPeriod: [90, 50, 0],
      fcffIncludesConstructionCapex: true,
      fcffByPeriod: [-90, -50, 20],
    }],
  });
  assertEqual(explicitRebasedWaterfall.rows.length, 2, 'explicit valuationYear should define the financing axis');
  assertEqual(explicitRebasedWaterfall.rows[0]?.year, 2031, 'explicit valuationYear should be first waterfall year');
  assertEqual(explicitRebasedWaterfall.totalInitialCashUsed, 30, 'explicit valuation-year cash should be used once');
  assertEqual(explicitRebasedWaterfall.totalExternalFundingNeed, 20, 'historical 2030 CAPEX must be sunk');

  console.log('Corporate financing Lista 5 tests passed');
})();