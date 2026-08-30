import assert from 'node:assert/strict';
import type { Tier1PreRevenueAssessment } from '../../tier1/preRevenue.ts';
import { adaptCanonicalPreRevenueToInvestmentScore } from '../canonicalPreRevenueAdapter.ts';

function tierAssessment(args: {
  status?: Tier1PreRevenueAssessment['status'];
  cycleStatus?: 'PASS' | 'FAIL' | 'NOT_VERIFIED';
  cycleTier?: 1 | 2 | 3 | null;
} = {}): Tier1PreRevenueAssessment {
  return {
    status: args.status ?? 'TIER_1',
    classificationReason: 'test',
    primaryMetal: 'Au',
    primaryMetalRevenueShare: 1,
    gates: {
      lom: { status: 'PASS', tier: 1, value: 30, threshold: 15, unit: 'år', reason: 'test' },
      scale: { status: 'PASS', tier: 1, value: 1, threshold: 1, unit: 'scale-equivalent', reason: 'test' },
      cost: { status: 'PASS', tier: 1, value: 1, threshold: 1, unit: 'USD/toz', reason: 'test' },
      cycle: {
        status: args.cycleStatus ?? 'PASS',
        tier: args.cycleTier === undefined ? 1 : args.cycleTier,
        value: 1,
        threshold: 0,
        unit: 'USD NPV10',
        reason: 'test',
      },
      capitalReturns: { status: 'PASS', tier: 1, value: 0.3, threshold: 0.25, unit: 'IRR', reason: 'test' },
    },
    support: {
      tierBasePriceMode: 'SPOT',
      tierBasePriceAsOfUtc: '2026-08-30T00:00:00.000Z',
      tierBaseNpv10Usd: 1,
      tierBaseIrr: 0.3,
      tierBaseNpvOverInitialCapex: 1,
      cycleNpv10Usd: 1,
      cycleDurationProductionPeriods: 3,
      cycleMultipliersByMetal: {},
      cycleMethod: 'test',
    },
    diagnostics: [],
  };
}

{
  const result = adaptCanonicalPreRevenueToInvestmentScore({
    snapshot: {
      NAV_today_TargetCurrency: 1_000,
      financing: { shares_post_financing: 100 },
      aggregation: { payableAuEqOz_total: [0, 10, 20, 0, 30, 0] },
      corporateValuationTimeSeries: {
        rows: [
          { evEbitda6xPerShare: 6 },
          { evEbitda6xPerShare: 10 },
          { evEbitda6xPerShare: null },
        ],
      },
    },
    tierAssessment: tierAssessment(),
    priceCurrentTargetCurrency: 2,
    manualExtraShares: 25,
    management: null,
    optionality: null,
    fatalFlaw: false,
  });

  // Compare Stocks P/NAV PF: price * (modeled PF + manual extra shares) / NAV.
  assert.equal(result.inputs.pNav, 0.25);

  // Compare Stocks Peak 6x / price: per-share 6x series scaled for extra shares.
  // 10 * (100 / 125) / 2 = 4x.
  assert.equal(result.inputs.peak6xVsPrice, 4);

  // 0.25x P/NAV + 4x Peak 6x / price reaches VERY_STRONG, not EXTREME.
  assert.equal(result.inputs.valuationConvergence, 'VERY_STRONG');
  assert.equal(result.sources.valuationConvergence, 'INVESTMENT_SCORE_CANONICAL_CONVERGENCE');

  // Positive canonical payable AuEq years are counted, not calendar span length.
  assert.equal(result.inputs.lomYears, 3);
  assert.equal(result.inputs.tier, 1);
  assert.equal(result.inputs.cycleResistanceTier1Pass, true);
  assert.equal(result.inputs.downsideRobustnessPass, null);
  assert.equal(result.inputs.rawScore, null);
  assert.equal(result.sources.pNav, 'COMPARE_STOCKS_PNAV_PF');
  assert.equal(result.sources.peak6xVsPrice, 'COMPARE_STOCKS_PEAK_6X_VS_PRICE');
}

{
  const result = adaptCanonicalPreRevenueToInvestmentScore({
    snapshot: {
      NAV_today_TargetCurrency: null,
      financing: { shares_post_financing: 100 },
      aggregation: { payableAuEqOz_total: [0, 1, null, 2] },
      corporateValuationTimeSeries: { rows: [] },
    },
    tierAssessment: tierAssessment({ status: 'NOT_VERIFIED', cycleStatus: 'NOT_VERIFIED', cycleTier: null }),
    priceCurrentTargetCurrency: 2,
    manualExtraShares: 0,
    management: null,
    optionality: null,
    fatalFlaw: null,
  });

  assert.equal(result.inputs.pNav, null);
  assert.equal(result.inputs.peak6xVsPrice, null);
  assert.equal(result.inputs.valuationConvergence, 'NOT_VERIFIED');
  assert.equal(result.inputs.lomYears, null);
  assert.equal(result.inputs.tier, null);
  assert.equal(result.inputs.cycleResistanceTier1Pass, null);
  assert.equal(result.sources.pNav, 'UNAVAILABLE');
  assert.equal(result.sources.valuationConvergence, 'UNAVAILABLE');
  assert.ok(result.diagnostics.some((item) => item.includes('Ej verifierad')));
}

{
  const result = adaptCanonicalPreRevenueToInvestmentScore({
    snapshot: null,
    tierAssessment: tierAssessment({ status: 'NOT_QUALIFIED', cycleStatus: 'FAIL', cycleTier: null }),
    priceCurrentTargetCurrency: null,
    manualExtraShares: 0,
    management: null,
    optionality: null,
    fatalFlaw: true,
  });

  assert.equal(result.inputs.tier, null);
  assert.equal(result.inputs.valuationConvergence, 'NOT_VERIFIED');
  assert.equal(result.inputs.cycleResistanceTier1Pass, false);
  assert.equal(result.inputs.fatalFlaw, true);
}
