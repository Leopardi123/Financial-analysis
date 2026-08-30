import type { Tier1PreRevenueAssessment } from '../tier1/preRevenue.ts';
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
    payableAuEqOz_total?: Array<number | null> | null;
  } | null;
  corporateValuationTimeSeries?: {
    rows?: Array<{
      evEbitda6xPerShare?: number | null;
    }> | null;
  } | null;
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
    pNav: 'COMPARE_STOCKS_PNAV_PF' | 'UNAVAILABLE';
    peak6xVsPrice: 'COMPARE_STOCKS_PEAK_6X_VS_PRICE' | 'UNAVAILABLE';
    valuationConvergence: 'INVESTMENT_SCORE_CANONICAL_CONVERGENCE' | 'UNAVAILABLE';
    lomYears: 'COMPARE_STOCKS_CANONICAL_PAYABLE_AUEQ_PRODUCTION_YEARS' | 'UNAVAILABLE';
    tier: 'TIER1_PRE_REVENUE_ASSESSMENT' | 'UNAVAILABLE';
    cycleResistanceTier1Pass: 'TIER1_PRE_REVENUE_CYCLE_GATE' | 'UNAVAILABLE';
    downsideRobustnessPass: 'TIER1_PRE_REVENUE_CYCLE_GATE_V0_CALIBRATION' | 'UNAVAILABLE';
  };
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validExtraShares(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function postFinancingShares(
  snapshot: CorporateSnapshotForInvestmentScore,
  manualExtraShares: number,
): number | null {
  const modeled = snapshot.financing?.shares_post_financing;
  if (!finite(modeled) || modeled <= 0) return null;
  return modeled + validExtraShares(manualExtraShares);
}

function pNavPostFinancing(
  snapshot: CorporateSnapshotForInvestmentScore,
  price: number | null,
  manualExtraShares: number,
): number | null {
  const sharesPf = postFinancingShares(snapshot, manualExtraShares);
  const nav = snapshot.NAV_today_TargetCurrency;
  if (!finite(price) || price < 0 || !finite(sharesPf) || sharesPf <= 0 || !finite(nav) || nav <= 0) {
    return null;
  }
  return (price * sharesPf) / nav;
}

function peakSixTimesVsPrice(
  snapshot: CorporateSnapshotForInvestmentScore,
  price: number | null,
  manualExtraShares: number,
): number | null {
  if (!finite(price) || price <= 0) return null;
  const rows = snapshot.corporateValuationTimeSeries?.rows;
  if (!Array.isArray(rows)) return null;

  const modeledShares = snapshot.financing?.shares_post_financing;
  const extra = validExtraShares(manualExtraShares);
  const scale = extra > 0 && finite(modeledShares) && modeledShares > 0
    ? modeledShares / (modeledShares + extra)
    : 1;

  let peakPerShare: number | null = null;
  for (const row of rows) {
    const value = row?.evEbitda6xPerShare;
    if (!finite(value)) continue;
    const adjusted = value * scale;
    peakPerShare = peakPerShare === null ? adjusted : Math.max(peakPerShare, adjusted);
  }
  return peakPerShare === null ? null : peakPerShare / price;
}

function canonicalPayableAuEqProductionYears(
  values: Array<number | null> | null | undefined,
): number | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  const firstPositive = values.findIndex((value) => finite(value) && value > 0);
  let lastPositive = -1;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (finite(values[i]) && (values[i] as number) > 0) {
      lastPositive = i;
      break;
    }
  }
  if (firstPositive < 0 || lastPositive < firstPositive) return null;

  let years = 0;
  for (let i = firstPositive; i <= lastPositive; i += 1) {
    const value = values[i];
    if (!finite(value) || value < 0) return null;
    if (value > 0) years += 1;
  }
  return years > 0 ? years : null;
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
  if (!gate || gate.status === 'NOT_VERIFIED') return null;
  if (gate.status === 'PASS' && gate.tier === 1) return true;
  if (gate.status === 'FAIL') return false;
  return null;
}

export function adaptCanonicalPreRevenueToInvestmentScore(
  args: CanonicalPreRevenueAdapterArgs,
): CanonicalPreRevenueAdapterResult {
  const diagnostics: string[] = [];
  const snapshot = args.snapshot;

  const pNav = snapshot
    ? pNavPostFinancing(snapshot, args.priceCurrentTargetCurrency, args.manualExtraShares)
    : null;
  const peak6xVsPrice = snapshot
    ? peakSixTimesVsPrice(snapshot, args.priceCurrentTargetCurrency, args.manualExtraShares)
    : null;
  const convergence = assessValuationConvergence({ pNav, peak6xVsPrice });
  const lomYears = snapshot
    ? canonicalPayableAuEqProductionYears(snapshot.aggregation?.payableAuEqOz_total)
    : null;
  const tier = tierFromAssessment(args.tierAssessment);
  const cycleResistance = cycleResistanceTier1Pass(args.tierAssessment);

  if (pNav === null) diagnostics.push('P/NAV PF: Ej verifierad från canonical Corporate snapshot + current price.');
  if (peak6xVsPrice === null) diagnostics.push('Peak 6x / pris: Ej verifierad från canonical Corporate valuation time series + current price.');
  diagnostics.push(`Valuation convergence: ${convergence.reason}`);
  if (lomYears === null) diagnostics.push('LOM: Ej verifierad från canonical payable AuEq production series.');
  if (tier === null) diagnostics.push('Tier: Ej verifierad från Tier1 pre-revenue assessment.');
  if (cycleResistance === null) diagnostics.push('Cykelresistens: Ej verifierad från Tier1 cycle gate.');

  // v0 calibration rule: Score-3 downside robustness deliberately reuses the
  // exact same canonical Tier cycle gate as Scores 1-2. This is not claimed to
  // be a permanently separate robustness model; it is an explicit starting
  // assumption to be calibrated against real project JSON before final lock.
  diagnostics.push('v0 kalibrering: Score-3 downside robustness = samma canonical Tier cycle gate som cykelresistens. Regeln ska omprövas mot test-JSON.');
  diagnostics.push('rawScore lämnas Ej verifierad tills 4-10-modellen är kalibrerad.');

  return {
    inputs: {
      tier,
      pNav,
      peak6xVsPrice,
      valuationConvergence: convergence.classification,
      lomYears,
      cycleResistanceTier1Pass: cycleResistance,
      downsideRobustnessPass: cycleResistance,
      fatalFlaw: args.fatalFlaw,
      management: args.management,
      optionality: args.optionality,
      rawScore: null,
    },
    diagnostics,
    sources: {
      pNav: pNav === null ? 'UNAVAILABLE' : 'COMPARE_STOCKS_PNAV_PF',
      peak6xVsPrice: peak6xVsPrice === null ? 'UNAVAILABLE' : 'COMPARE_STOCKS_PEAK_6X_VS_PRICE',
      valuationConvergence: convergence.classification === 'NOT_VERIFIED' ? 'UNAVAILABLE' : 'INVESTMENT_SCORE_CANONICAL_CONVERGENCE',
      lomYears: lomYears === null ? 'UNAVAILABLE' : 'COMPARE_STOCKS_CANONICAL_PAYABLE_AUEQ_PRODUCTION_YEARS',
      tier: tier === null ? 'UNAVAILABLE' : 'TIER1_PRE_REVENUE_ASSESSMENT',
      cycleResistanceTier1Pass: cycleResistance === null ? 'UNAVAILABLE' : 'TIER1_PRE_REVENUE_CYCLE_GATE',
      downsideRobustnessPass: cycleResistance === null ? 'UNAVAILABLE' : 'TIER1_PRE_REVENUE_CYCLE_GATE_V0_CALIBRATION',
    },
  };
}
