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
      aggregation: { corporateYearsByPeriod: [2029, 2030, 2031, 2032, 2033, 2034] },
      series: { payableQtyByMetal: { Au: [0, 10, 20, 0, 30, 0] } },
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

  assert.equal(result.inputs.pNav, 0.25);
  assert.equal(result.inputs.peak6xVsPrice, 4);
  assert.equal(result.inputs.valuationConvergence, 'VERY_STRONG');
  assert.equal(result.sources.valuationConvergence, 'INVESTMENT_SCORE_CANONICAL_CONVERGENCE');
  assert.equal(result.inputs.lomYears, 4, 'LOM is first-to-last physical payable production span, including an idle year inside the span');
  assert.equal(result.sources.lomYears, 'CORPORATE_CANONICAL_PHYSICAL_PAYABLE_PRODUCTION_SPAN');
  assert.equal(result.inputs.tier, 1);
  assert.equal(result.inputs.cycleResistanceTier1Pass, true);
  assert.equal(result.inputs.downsideRobustnessPass, true, 'Score-3 downside robustness reuses the canonical Tier cycle gate during v0 calibration');
  assert.equal(result.sources.downsideRobustnessPass, 'TIER1_PRE_REVENUE_CYCLE_GATE_V0_CALIBRATION');
  assert.equal(result.inputs.rawScore, null);
  assert.equal(result.sources.pNav, 'CORPORATE_PNAV_POST_FINANCING');
  assert.equal(result.sources.peak6xVsPrice, 'CORPORATE_PEAK_6X_VS_CURRENT_PRICE');
}

{
  const result = adaptCanonicalPreRevenueToInvestmentScore({
    snapshot: {
      NAV_today_TargetCurrency: null,
      financing: { shares_post_financing: 100 },
      aggregation: { corporateYearsByPeriod: [2030, 2031, 2032, 2033] },
      series: { payableQtyByMetal: { Au: [0, 1, null, 2] } },
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
  assert.equal(result.inputs.downsideRobustnessPass, null);
  assert.equal(result.sources.pNav, 'UNAVAILABLE');
  assert.equal(result.sources.valuationConvergence, 'UNAVAILABLE');
  assert.equal(result.sources.downsideRobustnessPass, 'UNAVAILABLE');
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
  assert.equal(result.inputs.downsideRobustnessPass, false, 'failed Tier cycle gate also fails Score-3 downside robustness during v0 calibration');
  assert.equal(result.inputs.fatalFlaw, true);
}
