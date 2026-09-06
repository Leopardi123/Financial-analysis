import assert from 'node:assert/strict';
import type { Tier1PreRevenueAssessment } from '../../tier1/preRevenue.ts';
import { adaptCanonicalPreRevenueToInvestmentScore } from '../canonicalPreRevenueAdapter.ts';

function tierAssessment(args: {
  status?: Tier1PreRevenueAssessment['status'];
  cycleStatus?: 'PASS' | 'FAIL' | 'NOT_VERIFIED';
  cycleTier?: 1 | 2 | 3 | null;
  lomTier?: 1 | 2 | 3 | null;
  scaleTier?: 1 | 2 | 3 | null;
  capitalReturnsTier?: 1 | 2 | 3 | null;
  survivalNpv10Usd?: number | null;
} = {}): Tier1PreRevenueAssessment {
  const lomTier = args.lomTier === undefined ? 1 : args.lomTier;
  const scaleTier = args.scaleTier === undefined ? 1 : args.scaleTier;
  const capitalReturnsTier = args.capitalReturnsTier === undefined ? 1 : args.capitalReturnsTier;
  const cycleTier = args.cycleTier === undefined ? 1 : args.cycleTier;
  return {
    status: args.status ?? 'TIER_1',
    classificationReason: 'test',
    primaryMetal: 'Au',
    primaryMetalRevenueShare: 1,
    gates: {
      lom: {
        status: lomTier === null ? 'NOT_VERIFIED' : lomTier === 1 ? 'PASS' : 'FAIL',
        tier: lomTier,
        value: 30,
        threshold: 15,
        unit: 'år',
        reason: 'test',
      },
      scale: {
        status: scaleTier === null ? 'NOT_VERIFIED' : scaleTier === 1 ? 'PASS' : 'FAIL',
        tier: scaleTier,
        value: 1,
        threshold: 1,
        unit: 'scale-equivalent',
        reason: 'test',
      },
      cost: { status: 'NOT_VERIFIED', tier: null, value: null, threshold: null, unit: null, reason: 'N/A' },
      cycle: {
        status: args.cycleStatus ?? (cycleTier === null ? 'NOT_VERIFIED' : 'PASS'),
        tier: cycleTier,
        value: 1,
        threshold: 0.85,
        unit: 'NPV downside beta',
        reason: 'test',
      },
      capitalReturns: {
        status: capitalReturnsTier === null ? 'NOT_VERIFIED' : capitalReturnsTier === 1 ? 'PASS' : 'FAIL',
        tier: capitalReturnsTier,
        value: 0.3,
        threshold: 0.25,
        unit: 'IRR',
        reason: 'test',
      },
    },
    support: {
      tierBasePriceMode: 'SPOT',
      tierBasePriceAsOfUtc: '2026-08-30T00:00:00.000Z',
      tierBaseNpv10Usd: 1,
      tierBaseIrr: 0.3,
      tierBaseNpvOverInitialCapex: 1,
      cycleNpv10Usd: 1,
      cycleDurationProductionPeriods: 5,
      cycleMultipliersByMetal: {},
      cycleMethod: 'test',
      cycleSurvivalNpv10Usd: args.survivalNpv10Usd === undefined ? 1 : args.survivalNpv10Usd,
      cycleSurvivalProductionPeriods: 7,
    } as Tier1PreRevenueAssessment['support'] & {
      cycleSurvivalNpv10Usd: number | null;
      cycleSurvivalProductionPeriods: number;
    },
    diagnostics: [],
  };
}

const snapshot = {
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
};

{
  const result = adaptCanonicalPreRevenueToInvestmentScore({
    snapshot,
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
  assert.equal(result.inputs.downsideRobustnessPass, true, 'positive 7y survival NPV10 independently passes Score-3 downside robustness');
  assert.equal(result.sources.downsideRobustnessPass, 'TIER1_PRE_REVENUE_7Y_SURVIVAL_NPV10');
  assert.equal(result.inputs.rawScore, null);
  assert.equal(result.sources.pNav, 'CORPORATE_PNAV_POST_FINANCING');
  assert.equal(result.sources.peak6xVsPrice, 'CORPORATE_PEAK_6X_VS_CURRENT_PRICE');
}

{
  const result = adaptCanonicalPreRevenueToInvestmentScore({
    snapshot,
    tierAssessment: tierAssessment({ cycleTier: 2, survivalNpv10Usd: 250 }),
    priceCurrentTargetCurrency: 2,
    manualExtraShares: 0,
    management: null,
    optionality: null,
    fatalFlaw: false,
  });

  assert.equal(result.inputs.cycleResistanceTier1Pass, false, 'Cycle Tier 2 is a verified false for the Tier-1 cycle gate, not unknown');
  assert.equal(result.inputs.downsideRobustnessPass, true, 'Cycle Tier 2 may still pass Score-3 downside when 7y survival NPV10 stays positive');
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
    tierAssessment: tierAssessment({ status: 'NOT_VERIFIED', cycleStatus: 'NOT_VERIFIED', cycleTier: null, survivalNpv10Usd: null }),
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
    tierAssessment: tierAssessment({ status: 'NOT_QUALIFIED', cycleStatus: 'FAIL', cycleTier: null, survivalNpv10Usd: -1 }),
    priceCurrentTargetCurrency: null,
    manualExtraShares: 0,
    management: null,
    optionality: null,
    fatalFlaw: true,
  });

  assert.equal(result.inputs.tier, null);
  assert.equal(result.inputs.valuationConvergence, 'NOT_VERIFIED');
  assert.equal(result.inputs.cycleResistanceTier1Pass, null, 'a cycle result without a classified Tier is not a verified Tier-1 comparison');
  assert.equal(result.inputs.downsideRobustnessPass, false, 'non-positive 7y survival NPV10 independently fails Score-3 downside robustness');
  assert.equal(result.inputs.fatalFlaw, true);
}

{
  const allowed = adaptCanonicalPreRevenueToInvestmentScore({
    snapshot,
    tierAssessment: tierAssessment({ status: 'TIER_3', lomTier: 3, scaleTier: 3, capitalReturnsTier: 1, cycleTier: 2, survivalNpv10Usd: 10 }),
    priceCurrentTargetCurrency: 2,
    manualExtraShares: 0,
    management: null,
    optionality: null,
    fatalFlaw: false,
  });
  assert.equal(allowed.inputs.tier3ScaleOrLomOnlyExceptionEligible, true, 'LOM and scale may both be Tier 3 when capital returns and cycle are no worse than Tier 2');
  assert.equal(allowed.sources.tier3ExceptionEligibility, 'TIER1_PRE_REVENUE_ACTIVE_GATE_TIERS');

  const blockedByCapitalReturns = adaptCanonicalPreRevenueToInvestmentScore({
    snapshot,
    tierAssessment: tierAssessment({ status: 'TIER_3', lomTier: 3, scaleTier: 1, capitalReturnsTier: 3, cycleTier: 1, survivalNpv10Usd: 10 }),
    priceCurrentTargetCurrency: 2,
    manualExtraShares: 0,
    management: null,
    optionality: null,
    fatalFlaw: false,
  });
  assert.equal(blockedByCapitalReturns.inputs.tier3ScaleOrLomOnlyExceptionEligible, false);

  const blockedByCycle = adaptCanonicalPreRevenueToInvestmentScore({
    snapshot,
    tierAssessment: tierAssessment({ status: 'TIER_3', lomTier: 1, scaleTier: 3, capitalReturnsTier: 1, cycleTier: 3, survivalNpv10Usd: 10 }),
    priceCurrentTargetCurrency: 2,
    manualExtraShares: 0,
    management: null,
    optionality: null,
    fatalFlaw: false,
  });
  assert.equal(blockedByCycle.inputs.tier3ScaleOrLomOnlyExceptionEligible, false);
}

console.log('canonicalPreRevenueAdapter tests passed');
