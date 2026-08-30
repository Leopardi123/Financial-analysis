import type { Tier1PreRevenueAssessment } from '../tier1/preRevenue.ts';
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
    lomYears: 'COMPARE_STOCKS_CANONICAL_PAYABLE_AUEQ_PRODUCTION_YEARS' | 'UNAVAILABLE';
    tier: 'TIER1_PRE_REVENUE_ASSESSMENT' | 'UNAVAILABLE';
    cycleResistanceTier1Pass: 'TIER1_PRE_REVENUE_CYCLE_GATE' | 'UNAVAILABLE';
  };
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validExtraShares(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/**
 * Mirrors CompareStocks' canonical PF share basis without mutating Corporate
 * snapshot state. Manual extra shares are additive to modeled PF shares.
 */
function postFinancingShares(
  snapshot: CorporateSnapshotForInvestmentScore,
  manualExtraShares: number,
): number | null {
  const modeled = snapshot.financing?.shares_post_financing;
  if (!finite(modeled) || modeled <= 0) return null;
  return modeled + validExtraShares(manualExtraShares);
}

/**
 * Exact metric basis used by PRE REVENUE Compare Stocks:
 * (current price * PF shares incl. manual extra shares) / NAV today.
 */
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

/**
 * Compare Stocks adjusts Corporate's 6x EV/EBITDA per-share series for manual
 * extra shares using modeled PF shares / total PF shares, then takes the peak.
 */
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

/**
 * Exact PRE REVENUE Compare Stocks LOM convention: count positive canonical
 * payable AuEq years between first and last positive year, rejecting invalid
 * negative/non-finite observations inside the production span.
 */
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
  const lomYears = snapshot
    ? canonicalPayableAuEqProductionYears(snapshot.aggregation?.payableAuEqOz_total)
    : null;
  const tier = tierFromAssessment(args.tierAssessment);
  const cycleResistance = cycleResistanceTier1Pass(args.tierAssessment);

  if (pNav === null) diagnostics.push('P/NAV PF: Ej verifierad från canonical Corporate snapshot + current price.');
  if (peak6xVsPrice === null) diagnostics.push('Peak 6x / pris: Ej verifierad från canonical Corporate valuation time series + current price.');
  if (lomYears === null) diagnostics.push('LOM: Ej verifierad från canonical payable AuEq production series.');
  if (tier === null) diagnostics.push('Tier: Ej verifierad från Tier1 pre-revenue assessment.');
  if (cycleResistance === null) diagnostics.push('Cykelresistens: Ej verifierad från Tier1 cycle gate.');

  // Deliberately NOT inferred here:
  // - valuationConvergenceScore1Pass requires its own canonical convergence rule;
  // - downsideRobustnessPass for Score 3 has not yet been defined as equivalent
  //   to the stricter Tier cycle gate;
  // - rawScore awaits 4-10 calibration.
  diagnostics.push('Valuation convergence, Score-3 downside robustness och rawScore lämnas Ej verifierade tills respektive kanonisk regel är definierad.');

  return {
    inputs: {
      tier,
      pNav,
      peak6xVsPrice,
      valuationConvergenceScore1Pass: null,
      lomYears,
      cycleResistanceTier1Pass: cycleResistance,
      downsideRobustnessPass: null,
      fatalFlaw: args.fatalFlaw,
      management: args.management,
      optionality: args.optionality,
      rawScore: null,
    },
    diagnostics,
    sources: {
      pNav: pNav === null ? 'UNAVAILABLE' : 'COMPARE_STOCKS_PNAV_PF',
      peak6xVsPrice: peak6xVsPrice === null ? 'UNAVAILABLE' : 'COMPARE_STOCKS_PEAK_6X_VS_PRICE',
      lomYears: lomYears === null ? 'UNAVAILABLE' : 'COMPARE_STOCKS_CANONICAL_PAYABLE_AUEQ_PRODUCTION_YEARS',
      tier: tier === null ? 'UNAVAILABLE' : 'TIER1_PRE_REVENUE_ASSESSMENT',
      cycleResistanceTier1Pass: cycleResistance === null ? 'UNAVAILABLE' : 'TIER1_PRE_REVENUE_CYCLE_GATE',
    },
  };
}
