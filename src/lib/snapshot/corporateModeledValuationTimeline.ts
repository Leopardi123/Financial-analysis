import { computeLista2CfDcfMetrics } from './lista2CfDcf.ts';

export type CorporateModeledTimelineMarker = {
  tp: number;
  yearLabelUsed: string | null;
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

export function buildCorporateModeledValuationTimeline(args: {
  productionStartPeriods: Array<number | null | undefined>;
  periodEndDatesUtc: string[];
  fcfUSD_total: Array<number | null>;
  masterN: number;
  discountRate: number;
  shares_post_financing: number | null;
  fx_USD_to_TargetCurrency: number | null;
  npvToday_USD: number | null;
}): CorporateModeledValuationTimeline {
  const tps = uniqueSorted(
    args.productionStartPeriods.filter((tp): tp is number => Number.isInteger(tp) && (tp as number) > 0),
  );
  const lastTp = tps.length > 0 ? tps[tps.length - 1] : null;

  const markers: CorporateModeledTimelineMarker[] = tps.map((tp) => {
    const lista2 = computeLista2CfDcfMetrics({
      fcfUSD_total: args.fcfUSD_total,
      masterN: args.masterN,
      productionStartPeriod: tp,
      discountRate: args.discountRate,
      shares_post_financing: args.shares_post_financing,
      fx_USD_to_TargetCurrency: args.fx_USD_to_TargetCurrency,
      npvToday_USD: args.npvToday_USD,
    });

    const valueHigh = lista2.metrics.DCF_prodStart_exCapex_perShare_TargetCurrency;
    const valueLow = lista2.metrics.DCF_prodStart_present_perShare_TargetCurrency;
    const nullReasonIfAny = valueHigh === null || valueLow === null
      ? [...lista2.errors, ...lista2.warnings].join(' | ') || 'Missing required valuation inputs'
      : null;

    return {
      tp,
      yearLabelUsed: args.periodEndDatesUtc[tp] ?? null,
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
