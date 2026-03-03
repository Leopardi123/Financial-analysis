import { computeLista2CfDcfMetrics } from './lista2CfDcf.ts';

export type CorporateModeledTimelineMarker = {
  tp: number;
  yearLabelUsed: string | null;
  corporateTpIndexUsed: number | null;
  fcfTailSumUSD: number | null;
  value_high: number | null;
  value_low: number | null;
  value_mid_if_any: number | null;
  nullReasonIfAny: string | null;
  sanity?: {
    tp: number;
    tpDate: string | null;
    corporateTpIndexUsed: number | null;
    corporateDateUsed: string | null;
    matchMode: 'exact' | 'next_ge' | 'missing';
    tpMatches: boolean;
    yearLabelExpected: string | null;
    yearLabelUsed: string | null;
    yearLabelMatches: boolean;
    fcfTailSumUSD_expected: number | null;
    fcfTailSumUSD_used: number | null;
    fcfTailMatches: boolean | null;
  };
};

export type CorporateModeledValuationTimeline = {
  tps: number[];
  lastTp: number | null;
  rangeEndTp: number | null;
  markers: CorporateModeledTimelineMarker[];
};

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

export function mapProjectTpToCorporateIndex(
  projectPeriodEndDatesUtc: string[],
  tp: number,
  corporatePeriodEndDatesUtc: string[],
): {
  tpDate: string | null;
  corporateIndex: number | null;
  matchMode: 'exact' | 'next_ge' | 'missing';
} {
  if (!Number.isInteger(tp) || tp < 0 || tp >= projectPeriodEndDatesUtc.length) {
    return { tpDate: null, corporateIndex: null, matchMode: 'missing' };
  }

  const tpDate = projectPeriodEndDatesUtc[tp] ?? null;
  if (!tpDate || corporatePeriodEndDatesUtc.length === 0) {
    return { tpDate, corporateIndex: null, matchMode: 'missing' };
  }

  const exactIndex = corporatePeriodEndDatesUtc.indexOf(tpDate);
  if (exactIndex >= 0) {
    return { tpDate, corporateIndex: exactIndex, matchMode: 'exact' };
  }

  const nextGeIndex = corporatePeriodEndDatesUtc.findIndex((date) => date >= tpDate);
  if (nextGeIndex >= 0) {
    return { tpDate, corporateIndex: nextGeIndex, matchMode: 'next_ge' };
  }

  return { tpDate, corporateIndex: null, matchMode: 'missing' };
}


export function buildCorporateModeledValuationTimeline(args: {
  projects: Array<{
    productionStartPeriod: number | null | undefined;
    periodEndDatesUtc: string[];
  }>;
  corporatePeriodEndDatesUtc: string[];
  fcfUSD_total: Array<number | null>;
  masterN: number;
  discountRate: number;
  shares_post_financing: number | null;
  fx_USD_to_TargetCurrency: number | null;
  npvToday_USD: number | null;
  includeDebugSanity?: boolean;
}): CorporateModeledValuationTimeline {
  const tps = uniqueSorted(
    args.projects
      .map((project) => project.productionStartPeriod)
      .filter((tp): tp is number => Number.isInteger(tp) && (tp as number) > 0),
  );
  const lastTp = tps.length > 0 ? tps[tps.length - 1] : null;

  const markers: CorporateModeledTimelineMarker[] = tps.map((tp) => {
    const projectForTp = args.projects.find((project) => project.productionStartPeriod === tp);
    const mapping = mapProjectTpToCorporateIndex(
      projectForTp?.periodEndDatesUtc ?? [],
      tp,
      args.corporatePeriodEndDatesUtc,
    );
    const corporateTp = mapping.corporateIndex;
    const corporateDateUsed = corporateTp === null ? null : (args.corporatePeriodEndDatesUtc[corporateTp] ?? null);
    const yearLabelUsed = corporateDateUsed;

    if (!projectForTp || mapping.tpDate === null) {
      return {
        tp,
        yearLabelUsed,
        corporateTpIndexUsed: null,
        fcfTailSumUSD: null,
        value_high: null,
        value_low: null,
        value_mid_if_any: null,
        nullReasonIfAny: 'tp_out_of_project_periodEndDatesUtc',
        sanity: args.includeDebugSanity
          ? {
              tp,
              tpDate: mapping.tpDate,
              corporateTpIndexUsed: null,
              corporateDateUsed,
              matchMode: mapping.matchMode,
              tpMatches: false,
              yearLabelExpected: mapping.tpDate,
              yearLabelUsed,
              yearLabelMatches: false,
              fcfTailSumUSD_expected: null,
              fcfTailSumUSD_used: null,
              fcfTailMatches: null,
            }
          : undefined,
      };
    }

    if (corporateTp === null || !Number.isInteger(corporateTp) || corporateTp < 0 || corporateTp > args.masterN) {
      return {
        tp,
        yearLabelUsed,
        corporateTpIndexUsed: null,
        fcfTailSumUSD: null,
        value_high: null,
        value_low: null,
        value_mid_if_any: null,
        nullReasonIfAny: args.corporatePeriodEndDatesUtc.length === 0
          ? 'corporate_periodEndDatesUtc_missing'
          : 'tpDate_outside_corporate_axis',
        sanity: args.includeDebugSanity
          ? {
              tp,
              tpDate: mapping.tpDate,
              corporateTpIndexUsed: null,
              corporateDateUsed,
              matchMode: mapping.matchMode,
              tpMatches: false,
              yearLabelExpected: mapping.tpDate,
              yearLabelUsed,
              yearLabelMatches: false,
              fcfTailSumUSD_expected: null,
              fcfTailSumUSD_used: null,
              fcfTailMatches: null,
            }
          : undefined,
      };
    }

    const lista2 = computeLista2CfDcfMetrics({
      fcfUSD_total: args.fcfUSD_total,
      masterN: args.masterN,
      productionStartPeriod: corporateTp,
      discountRate: args.discountRate,
      shares_post_financing: args.shares_post_financing,
      fx_USD_to_TargetCurrency: args.fx_USD_to_TargetCurrency,
      npvToday_USD: args.npvToday_USD,
    });

    const valueHigh = lista2.metrics.DCF_prodStart_exCapex_perShare_TargetCurrency;
    const valueLow = lista2.metrics.DCF_prodStart_present_perShare_TargetCurrency;
    const fcfTailSlice = args.fcfUSD_total.slice(corporateTp, args.masterN + 1);
    const fcfTailSumUSD = fcfTailSlice
      .reduce<number | null>((sum, value) => {
        if (sum === null || value === null || !Number.isFinite(value)) return null;
        return sum + value;
      }, 0);

    const yearLabelExpected = mapping.tpDate;
    const tpMatches = corporateDateUsed === mapping.tpDate;
    const yearLabelMatches = yearLabelUsed === yearLabelExpected;
    const fcfTailSumUSDExpected = fcfTailSlice.some((value) => value === null || !Number.isFinite(value))
      ? null
      : (fcfTailSlice as number[]).reduce((sum, value) => sum + value, 0);
    const fcfTailMatches = fcfTailSumUSDExpected === null || fcfTailSumUSD === null
      ? null
      : Math.abs(fcfTailSumUSD - fcfTailSumUSDExpected) <= 1e-6 * Math.max(1, Math.abs(fcfTailSumUSDExpected));
    const sanityFailureChecks: string[] = [];
    if (!tpMatches) sanityFailureChecks.push('tpMatches');
    if (!yearLabelMatches) sanityFailureChecks.push('yearLabelMatches');
    if (fcfTailMatches === false) sanityFailureChecks.push('fcfTailMatches');

    const baseNullReason = valueHigh === null || valueLow === null
      ? [...lista2.errors, ...lista2.warnings].join(' | ') || 'Missing required valuation inputs'
      : null;
    const sanityNullReason = sanityFailureChecks.length > 0
      ? `SANITY_FAIL:${sanityFailureChecks.join(',')}`
      : null;
    const nullReasonIfAny = sanityNullReason ?? baseNullReason;
    const hideValuesForSanityFailure = sanityNullReason !== null;

    return {
      tp,
      yearLabelUsed,
      corporateTpIndexUsed: corporateTp,
      fcfTailSumUSD,
      value_high: hideValuesForSanityFailure ? null : valueHigh,
      value_low: hideValuesForSanityFailure ? null : valueLow,
      value_mid_if_any: null,
      nullReasonIfAny,
      sanity: args.includeDebugSanity
        ? {
            tp,
            tpDate: mapping.tpDate,
            corporateTpIndexUsed: corporateTp,
            corporateDateUsed,
            matchMode: mapping.matchMode,
            tpMatches,
            yearLabelExpected,
            yearLabelUsed,
            yearLabelMatches,
            fcfTailSumUSD_expected: fcfTailSumUSDExpected,
            fcfTailSumUSD_used: fcfTailSumUSD,
            fcfTailMatches,
          }
        : undefined,
    };
  });

  return {
    tps,
    lastTp,
    rangeEndTp: lastTp,
    markers,
  };
}
