type TimelineLista2Metrics = {
  DCF_prodStart_exCapex_TargetCurrency: number | null;
  DCF_prodStart_exCapex_perShare_TargetCurrency: number | null;
  NAV_prodStart_TargetCurrency: number | null;
  NAV_prodStart_perShare_TargetCurrency: number | null;
};

type TimelineLista2DebugMetrics = {
  DCF_prodStart_exCapex_TargetCurrency: number | null;
  NAV_prodStart_TargetCurrency: number | null;
  DCF_prodStart_exCapex_perShare_TargetCurrency: number | null;
  NAV_prodStart_perShare_TargetCurrency: number | null;
};

export type CorporateModeledTimelineMarker = {
  tp: number;
  yearLabelUsed: string | null;
  corporateTpIndexUsed: number | null;
  fcfTailSumUSD: number | null;
  value_high: number | null;
  value_low: number | null;
  value_mid_if_any: number | null;
  nullReasonIfAny: string | null;
  debug?: {
    sharesDenominatorUsed: number | null;
    sharesDenominatorType: 'shares_post_financing';
    value_low_total_TargetCurrency: number | null;
    value_high_total_TargetCurrency: number | null;
    lista2_DCF_prodStart_exCapex_TargetCurrency_used: number | null;
    lista2_NAV_prodStart_TargetCurrency_used: number | null;
    lista2_DCF_prodStart_exCapex_TargetCurrency_debug?: number | null;
    lista2_NAV_prodStart_TargetCurrency_debug?: number | null;
    lista2_DCF_match?: boolean | null;
    lista2_NAV_match?: boolean | null;
    list2Debug_DCF_prodStart_exCapex_TargetCurrency?: number | null;
    list2Debug_NAV_prodStart_TargetCurrency?: number | null;
    delta_DCF?: number | null;
    delta_NAV?: number | null;
    relDelta_DCF?: number | null;
    relDelta_NAV?: number | null;
    fxUsed?: number | null;
    discountRateUsed?: number | null;
  };
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
  }>;
  yearsByPeriod: number[];
  fcfUSD_total: Array<number | null>;
  capexUSD_total: Array<number | null>;
  masterN: number;
  shares_post_financing: number | null;
  lista2MetricsByTp: Record<number, TimelineLista2Metrics | undefined>;
  lista2DebugByTp?: Record<number, TimelineLista2DebugMetrics | undefined>;
  fxUsed?: number | null;
  discountRateUsed?: number | null;
  includeDebugSanity?: boolean;
  diagnosticsWarnings?: string[];
}): CorporateModeledValuationTimeline {
  const tps = uniqueSorted(
    args.projects
      .map((project) => project.productionStartPeriod)
      .filter((tp): tp is number => Number.isInteger(tp) && (tp as number) > 0),
  );
  const lastTp = tps.length > 0 ? tps[tps.length - 1] : null;

  const markers: CorporateModeledTimelineMarker[] = tps.map((tp) => {
    const corporateTp = tp;
    if (tp < 0 || tp >= args.yearsByPeriod.length) {
      throw new Error(
        `corporate modeled timeline: tp ${tp} is outside yearsByPeriod bounds (length=${args.yearsByPeriod.length})`,
      );
    }
    const markerYear = args.yearsByPeriod[tp];
    const yearLabelUsed = String(markerYear);

    if (!Number.isInteger(corporateTp) || corporateTp < 0 || corporateTp > args.masterN) {
      return {
        tp,
        yearLabelUsed,
        corporateTpIndexUsed: null,
        fcfTailSumUSD: null,
        value_high: null,
        value_low: null,
        value_mid_if_any: null,
        nullReasonIfAny: 'tp_outside_corporate_axis',
        sanity: args.includeDebugSanity
          ? {
              tp,
              tpDate: null,
              corporateTpIndexUsed: null,
              corporateDateUsed: null,
              matchMode: 'missing',
              tpMatches: true,
              yearLabelExpected: yearLabelUsed,
              yearLabelUsed,
              yearLabelMatches: true,
              fcfTailSumUSD_expected: null,
              fcfTailSumUSD_used: null,
              fcfTailMatches: null,
            }
          : undefined,
      };
    }

    const lista2ForTp = args.lista2MetricsByTp[corporateTp];
    const lista2DebugForTp = args.lista2DebugByTp?.[corporateTp] ?? null;
    const denom = Number.isFinite(args.shares_post_financing) ? args.shares_post_financing : null;
    const valueLowTotalRaw = lista2ForTp?.NAV_prodStart_TargetCurrency ?? null;
    const valueHighTotalRaw = lista2ForTp?.DCF_prodStart_exCapex_TargetCurrency ?? null;
    const valueLowTotal = Number.isFinite(valueLowTotalRaw) ? valueLowTotalRaw : null;
    const valueHighTotal = Number.isFinite(valueHighTotalRaw) ? valueHighTotalRaw : null;
    const valueLowPerShare = valueLowTotal !== null && denom !== null && denom > 0
      ? valueLowTotal / denom
      : null;
    const valueHighPerShare = valueHighTotal !== null && denom !== null && denom > 0
      ? valueHighTotal / denom
      : null;

    if (valueLowTotal === null) {
      args.diagnosticsWarnings?.push('Missing NAV_prodStart_TargetCurrency for marker low');
    }
    if (valueHighTotal === null) {
      args.diagnosticsWarnings?.push('Missing DCF_prodStart_exCapex_TargetCurrency for marker high');
    }
    if (denom === null || denom <= 0) {
      args.diagnosticsWarnings?.push('Invalid shares_post_financing denominator for corporate modeled marker');
    }
    const fcfTailSlice = args.fcfUSD_total.slice(corporateTp, args.masterN + 1);
    const fcfTailSumUSD = fcfTailSlice
      .reduce<number | null>((sum, value) => {
        if (sum === null || value === null || !Number.isFinite(value)) return null;
        return sum + value;
      }, 0);

    const yearLabelExpected = yearLabelUsed;
    const tpMatches = true;
    const yearLabelMatches = true;
    const fcfTailSumUSDExpected = fcfTailSlice.some((value) => value === null || !Number.isFinite(value))
      ? null
      : (fcfTailSlice as number[]).reduce((sum, value) => sum + value, 0);
    const fcfTailMatches = fcfTailSumUSDExpected === null || fcfTailSumUSD === null
      ? null
      : Math.abs(fcfTailSumUSD - fcfTailSumUSDExpected) <= 1e-6 * Math.max(1, Math.abs(fcfTailSumUSDExpected));
    const invalidDenominator = denom === null || denom <= 0;
    const denominatorNullReason = invalidDenominator
      ? 'Invalid shares_post_financing denominator'
      : null;
    const reasonParts: string[] = [];
    if (valueLowTotal === null) reasonParts.push('missing NAV_prodStart_TargetCurrency for marker low');
    if (valueHighTotal === null) reasonParts.push('missing DCF_prodStart_exCapex_TargetCurrency for marker high');

    const lista2DcfDebug = typeof lista2DebugForTp?.DCF_prodStart_exCapex_TargetCurrency === 'number'
      ? lista2DebugForTp.DCF_prodStart_exCapex_TargetCurrency
      : null;
    const lista2NavDebug = typeof lista2DebugForTp?.NAV_prodStart_TargetCurrency === 'number'
      ? lista2DebugForTp.NAV_prodStart_TargetCurrency
      : null;
    const deltaDcf = valueHighTotal !== null && lista2DcfDebug !== null ? valueHighTotal - lista2DcfDebug : null;
    const deltaNav = valueLowTotal !== null && lista2NavDebug !== null ? valueLowTotal - lista2NavDebug : null;
    const relDeltaDcf = deltaDcf !== null ? Math.abs(deltaDcf) / Math.max(1, Math.abs(lista2DcfDebug as number)) : null;
    const relDeltaNav = deltaNav !== null ? Math.abs(deltaNav) / Math.max(1, Math.abs(lista2NavDebug as number)) : null;
    const dcfMatchesDebug = relDeltaDcf !== null ? relDeltaDcf < 1e-6 : null;
    const navMatchesDebug = relDeltaNav !== null ? relDeltaNav < 1e-6 : null;
    const mismatchAgainstList2Debug = dcfMatchesDebug === false || navMatchesDebug === false;
    if (mismatchAgainstList2Debug) {
      reasonParts.push('markers != list2Debug; refusing to display inconsistent byTp values (no fallback)');
    }
    const nullReasonIfAny = mismatchAgainstList2Debug
      ? 'markers != list2Debug; refusing to display inconsistent byTp values (no fallback)'
      : (reasonParts.length > 0 ? reasonParts.join(' | ') : null);

    return {
      tp,
      yearLabelUsed,
      corporateTpIndexUsed: corporateTp,
      fcfTailSumUSD,
      value_high: mismatchAgainstList2Debug ? null : valueHighPerShare,
      value_low: mismatchAgainstList2Debug ? null : valueLowPerShare,
      value_mid_if_any: null,
      nullReasonIfAny: denominatorNullReason ?? nullReasonIfAny,
      debug: {
        sharesDenominatorUsed: denom,
        sharesDenominatorType: 'shares_post_financing',
        value_low_total_TargetCurrency: valueLowTotal,
        value_high_total_TargetCurrency: valueHighTotal,
        lista2_DCF_prodStart_exCapex_TargetCurrency_used: valueHighTotal,
        lista2_NAV_prodStart_TargetCurrency_used: valueLowTotal,
        lista2_DCF_prodStart_exCapex_TargetCurrency_debug: lista2DcfDebug,
        lista2_NAV_prodStart_TargetCurrency_debug: lista2NavDebug,
        lista2_DCF_match: dcfMatchesDebug,
        lista2_NAV_match: navMatchesDebug,
        list2Debug_DCF_prodStart_exCapex_TargetCurrency: lista2DcfDebug,
        list2Debug_NAV_prodStart_TargetCurrency: lista2NavDebug,
        delta_DCF: deltaDcf,
        delta_NAV: deltaNav,
        relDelta_DCF: relDeltaDcf,
        relDelta_NAV: relDeltaNav,
        fxUsed: args.fxUsed ?? null,
        discountRateUsed: args.discountRateUsed ?? null,
      },
      sanity: args.includeDebugSanity
        ? {
            tp,
            tpDate: null,
            corporateTpIndexUsed: corporateTp,
            corporateDateUsed: null,
            matchMode: 'exact',
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
