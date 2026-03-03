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

function uniqueSortedStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
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
}): CorporateModeledValuationTimeline {
  const tps = uniqueSorted(
    args.projects
      .map((project) => project.productionStartPeriod)
      .filter((tp): tp is number => Number.isInteger(tp) && (tp as number) > 0),
  );
  const lastTp = tps.length > 0 ? tps[tps.length - 1] : null;

  const markers: CorporateModeledTimelineMarker[] = tps.map((tp) => {
    const tpDates = uniqueSortedStrings(
      args.projects
        .filter((project) => project.productionStartPeriod === tp)
        .map((project) => project.periodEndDatesUtc[tp] ?? null)
        .filter((date): date is string => typeof date === 'string' && date.length > 0),
    );

    if (tpDates.length !== 1) {
      return {
        tp,
        yearLabelUsed: tpDates.length > 0 ? tpDates[0] : null,
        corporateTpIndexUsed: null,
        fcfTailSumUSD: null,
        value_high: null,
        value_low: null,
        value_mid_if_any: null,
        nullReasonIfAny: tpDates.length === 0
          ? 'Missing production-start date for tp'
          : 'Multiple production-start dates found for same tp',
      };
    }

    const yearLabelUsed = tpDates[0];
    const corporateTp = args.corporatePeriodEndDatesUtc.indexOf(yearLabelUsed);
    if (!Number.isInteger(corporateTp) || corporateTp < 0) {
      return {
        tp,
        yearLabelUsed,
        corporateTpIndexUsed: null,
        fcfTailSumUSD: null,
        value_high: null,
        value_low: null,
        value_mid_if_any: null,
        nullReasonIfAny: 'Production-start date not found in corporate timeline',
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
    const fcfTailSumUSD = args.fcfUSD_total
      .slice(corporateTp)
      .reduce<number | null>((sum, value) => {
        if (sum === null || value === null || !Number.isFinite(value)) return null;
        return sum + value;
      }, 0);
    const nullReasonIfAny = valueHigh === null || valueLow === null
      ? [...lista2.errors, ...lista2.warnings].join(' | ') || 'Missing required valuation inputs'
      : null;

    return {
      tp,
      yearLabelUsed,
      corporateTpIndexUsed: corporateTp,
      fcfTailSumUSD,
      value_high: valueHigh,
      value_low: valueLow,
      value_mid_if_any: null,
      nullReasonIfAny,
    };
  });

  return {
    tps,
    lastTp,
    rangeEndTp: lastTp,
    markers,
  };
}
