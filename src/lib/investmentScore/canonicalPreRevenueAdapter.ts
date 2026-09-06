import type { Tier1PreRevenueAssessment } from '../tier1/preRevenue.ts';
import {
  computePreRevenuePNavPostFinancing,
  computePreRevenuePeakSixTimesVsPrice,
} from '../corporate/preRevenueValuation.ts';
import { deriveCorporateProductionLife } from '../corporate/preRevenueProductionLife.ts';
import { assessValuationConvergence } from './valuationConvergence.ts';
import type {
  InvestmentScoreInputs,
  ManagementEvidence,
  OptionalityEvidence,
} from './types.ts';

type CorporateSnapshotForInvestmentScore = {
  NAV_today_TargetCurrency?: number | null;
  financing?: {
    shares_post_financing?: number | null;
  } | null;
  aggregation?: {
    corporateYearsByPeriod?: number[] | null;
  } | null;
  series?: {
    payableQtyByMetal?: Record<string, Array<number | null>> | null;
  } | null;
  corporateValuationTimeSeries?: {
    rows?: Array<{
      evEbitda6xPerShare?: number | null;
    }> | null;
  } | null;
};

type TierSupportWithSurvival = Tier1PreRevenueAssessment['support'] & {
  cycleSurvivalNpv10Usd?: number | null;
  cycleSurvivalProductionPeriods?: number | null;
};

export type CanonicalPreRevenueAdapterArgs = {
  snapshot: CorporateSnapshotForInvestmentScore | null;
  tierAssessment: Tier1PreRevenueAssessment | null;
  priceCurrentTargetCurrency: number | null;
  manualExtraShares: number;
  management: ManagementEvidence | null;
  optionality: OptionalityEvidence | null;
  fatalFlaw: boolean | null;
};

export type CanonicalPreRevenueAdapterResult = {
  inputs: InvestmentScoreInputs;
  diagnostics: string[];
  sources: {
    pNav: 'CORPORATE_PNAV_POST_FINANCING' | 'UNAVAILABLE';
    peak6xVsPrice: 'CORPORATE_PEAK_6X_VS_CURRENT_PRICE' | 'UNAVAILABLE';
    valuationConvergence: 'INVESTMENT_SCORE_CANONICAL_CONVERGENCE' | 'UNAVAILABLE';
    lomYears: 'CORPORATE_CANONICAL_PHYSICAL_PAYABLE_PRODUCTION_SPAN' | 'UNAVAILABLE';
    tier: 'TIER1_PRE_REVENUE_ASSESSMENT' | 'UNAVAILABLE';
    cycleResistanceTier1Pass: 'TIER1_PRE_REVENUE_CYCLE_GATE' | 'UNAVAILABLE';
    downsideRobustnessPass: 'TIER1_PRE_REVENUE_7Y_SURVIVAL_NPV10' | 'UNAVAILABLE';
    tier3ExceptionEligibility: 'TIER1_PRE_REVENUE_ACTIVE_GATE_TIERS' | 'UNAVAILABLE';
  };
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function tierFromAssessment(assessment: Tier1PreRevenueAssessment | null): 1 | 2 | 3 | null {
  if (!assessment) return null;
  if (assessment.status === 'TIER_1') return 1;
  if (assessment.status === 'TIER_2') return 2;
  if (assessment.status === 'TIER_3') return 3;
  return null;
}

function cycleResistanceTier1Pass(assessment: Tier1PreRevenueAssessment | null): boolean | null {
  const gate = assessment?.gates?.cycle;
  if (!gate || gate.status === 'NOT_VERIFIED' || gate.tier === null) return null;
  if (gate.status === 'PASS') return gate.tier === 1;
  if (gate.status === 'FAIL') return false;
  return null;
}

/**
 * Score-3 downside robustness is deliberately distinct from cycle Tier.
 * The Tier runtime already calculates a seven-production-year survival NPV10
 * under the canonical historical-low price stress. Positive survival NPV10 is
 * the Investment Score robustness pass; zero/negative is a fail.
 */
function downsideRobustnessFromSevenYearSurvival(
  assessment: Tier1PreRevenueAssessment | null,
): boolean | null {
  const support = assessment?.support as TierSupportWithSurvival | undefined;
  const survivalNpv10 = support?.cycleSurvivalNpv10Usd;
  if (!finite(survivalNpv10)) return null;
  return survivalNpv10 > 0;
}

/**
 * Exceptional Tier-3 -> Score-3 eligibility is structural only. Tier 3 may be
 * caused by scale, LOM, or both. Capital returns and cycle must each be Tier 1
 * or Tier 2. Management, optionality, valuation and downside requirements are
 * applied separately by the Investment Score engine.
 */
function tier3ScaleOrLomOnlyExceptionEligible(
  assessment: Tier1PreRevenueAssessment | null,
): boolean | null {
  const tier = tierFromAssessment(assessment);
  if (tier === null) return null;
  if (tier !== 3) return false;

  const lom = assessment?.gates?.lom;
  const scale = assessment?.gates?.scale;
  const capitalReturns = assessment?.gates?.capitalReturns;
  const cycle = assessment?.gates?.cycle;
  const gates = [lom, scale, capitalReturns, cycle];
  if (gates.some((gate) => !gate || gate.status === 'NOT_VERIFIED' || gate.tier === null)) return null;

  const tier3FromAllowedDimension = lom?.tier === 3 || scale?.tier === 3;
  const disallowedTier3 = capitalReturns?.tier === 3 || cycle?.tier === 3;
  return tier3FromAllowedDimension && !disallowedTier3;
}

export function adaptCanonicalPreRevenueToInvestmentScore(
  args: CanonicalPreRevenueAdapterArgs,
): CanonicalPreRevenueAdapterResult {
  const diagnostics: string[] = [];
  const snapshot = args.snapshot;

  const pNav = snapshot
    ? computePreRevenuePNavPostFinancing(snapshot, args.priceCurrentTargetCurrency, args.manualExtraShares)
    : null;
  const peak6xVsPrice = snapshot
    ? computePreRevenuePeakSixTimesVsPrice(snapshot, args.priceCurrentTargetCurrency, args.manualExtraShares)
    : null;
  const convergence = assessValuationConvergence({ pNav, peak6xVsPrice });
  const lomYears = snapshot
    ? deriveCorporateProductionLife({
        payableQtyByMetal: snapshot.series?.payableQtyByMetal,
        corporateYearsByPeriod: snapshot.aggregation?.corporateYearsByPeriod,
      }).lomYears
    : null;
  const tier = tierFromAssessment(args.tierAssessment);
  const cycleResistance = cycleResistanceTier1Pass(args.tierAssessment);
  const downsideRobustness = downsideRobustnessFromSevenYearSurvival(args.tierAssessment);
  const tier3ExceptionEligibility = tier3ScaleOrLomOnlyExceptionEligible(args.tierAssessment);

  if (pNav === null) diagnostics.push('P/NAV PF: Ej verifierad från canonical Corporate snapshot + current price.');
  if (peak6xVsPrice === null) diagnostics.push('Peak 6x / pris: Ej verifierad från canonical Corporate valuation time series + current price.');
  diagnostics.push(`Valuation convergence: ${convergence.reason}`);
  if (lomYears === null) diagnostics.push('LOM: Ej verifierad från canonical physical payable-by-metal production span.');
  if (tier === null) diagnostics.push('Tier: Ej verifierad från Tier1 pre-revenue assessment.');
  if (cycleResistance === null) diagnostics.push('Cykelresistens: Ej verifierad från Tier1 cycle gate.');
  if (downsideRobustness === null) diagnostics.push('Downside robustness: Ej verifierad eftersom 7-årig survival NPV10 saknas.');
  else diagnostics.push(`Downside robustness: 7-årig survival NPV10 ${downsideRobustness ? '> 0 (PASS)' : '≤ 0 (FAIL)'}.`);
  if (tier === 3 && tier3ExceptionEligibility === null) diagnostics.push('Tier-3-exception: Ej verifierad från aktiva Tier-gates.');

  diagnostics.push('rawScore lämnas Ej verifierad tills 4-10-modellen är kalibrerad.');

  return {
    inputs: {
      tier,
      pNav,
      peak6xVsPrice,
      valuationConvergence: convergence.classification,
      lomYears,
      cycleResistanceTier1Pass: cycleResistance,
      downsideRobustnessPass: downsideRobustness,
      tier3ScaleOrLomOnlyExceptionEligible: tier3ExceptionEligibility,
      fatalFlaw: args.fatalFlaw,
      management: args.management,
      optionality: args.optionality,
      rawScore: null,
    },
    diagnostics,
    sources: {
      pNav: pNav === null ? 'UNAVAILABLE' : 'CORPORATE_PNAV_POST_FINANCING',
      peak6xVsPrice: peak6xVsPrice === null ? 'UNAVAILABLE' : 'CORPORATE_PEAK_6X_VS_CURRENT_PRICE',
      valuationConvergence: convergence.classification === 'NOT_VERIFIED' ? 'UNAVAILABLE' : 'INVESTMENT_SCORE_CANONICAL_CONVERGENCE',
      lomYears: lomYears === null ? 'UNAVAILABLE' : 'CORPORATE_CANONICAL_PHYSICAL_PAYABLE_PRODUCTION_SPAN',
      tier: tier === null ? 'UNAVAILABLE' : 'TIER1_PRE_REVENUE_ASSESSMENT',
      cycleResistanceTier1Pass: cycleResistance === null ? 'UNAVAILABLE' : 'TIER1_PRE_REVENUE_CYCLE_GATE',
      downsideRobustnessPass: downsideRobustness === null ? 'UNAVAILABLE' : 'TIER1_PRE_REVENUE_7Y_SURVIVAL_NPV10',
      tier3ExceptionEligibility: tier3ExceptionEligibility === null ? 'UNAVAILABLE' : 'TIER1_PRE_REVENUE_ACTIVE_GATE_TIERS',
    },
  };
}
