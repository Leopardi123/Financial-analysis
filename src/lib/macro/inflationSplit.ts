import type { MacroIndicatorSnapshot, MacroSeriesInput } from "./types.ts";

export type InflationSplitRegion = "US" | "EA";

const TEN_YEAR_MONTHS = 120;

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function toCanonicalMonthly(points: Array<{ date: string; value: number | null }>) {
  const map = new Map<string, { date: string; value: number | null }>();
  for (const point of points) {
    const key = monthKey(point.date);
    const prev = map.get(key);
    if (!prev || point.date > prev.date) map.set(key, point);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, point]) => point);
}

function percentileRank(series: number[], value: number): number {
  if (series.length === 0) return 50;
  const lessOrEqual = series.filter((entry) => entry <= value).length;
  return (lessOrEqual / series.length) * 100;
}

function latestPercentile(
  series: MacroSeriesInput | undefined,
  asOfDate: string,
  valueTransform?: (value: number) => number,
): number | null {
  if (!series) return null;
  const monthly = toCanonicalMonthly(series.points).filter((point) => point.date <= asOfDate);
  const trailing = monthly.slice(-TEN_YEAR_MONTHS);
  const valid = trailing.map((point) => point.value).filter((value): value is number => typeof value === "number");
  if (valid.length < 24) return null;
  const latest = trailing[trailing.length - 1]?.value;
  if (typeof latest !== "number") return null;
  const transformedSeries = valueTransform ? valid.map(valueTransform) : valid;
  const transformedLatest = valueTransform ? valueTransform(latest) : latest;
  return percentileRank(transformedSeries, transformedLatest);
}

function weightedAverage(values: Array<{ value: number | null; weight: number }>): number | null {
  const valid = values.filter((item): item is { value: number; weight: number } => typeof item.value === "number");
  if (valid.length === 0) return null;
  const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;
  return valid.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function goodsCompositeFromIndicators(
  indicatorIds: string[],
  indicators: MacroIndicatorSnapshot[],
) {
  const byId = new Map(indicators.map((entry) => [entry.indicatorId, entry]));
  const used: Array<{ indicatorId: string; percentile10y: number }> = [];
  const missing: string[] = [];
  for (const id of indicatorIds) {
    const item = byId.get(id);
    if (!item || item.percentile10y === null) {
      missing.push(id);
      continue;
    }
    used.push({ indicatorId: id, percentile10y: item.percentile10y });
  }
  const score = used.length > 0
    ? used.reduce((sum, entry) => sum + entry.percentile10y, 0) / used.length
    : null;
  return { score, used, missing };
}

const GOODS_INDICATORS: Record<InflationSplitRegion, string[]> = {
  US: [
    "oil_brent_usd",
    "natgas_usd",
    "commodity_index",
    "industrial_metals_index",
    "copper_usd",
    "oil_yoy",
    "natgas_yoy",
    "copper_yoy",
    "commodity_index_yoy",
    "industrial_metals_yoy",
  ],
  EA: [
    "oil_brent_usd_ea",
    "natgas_usd_ea",
    "commodity_index_ea",
    "industrial_metals_index_ea",
    "copper_usd_ea",
    "oil_yoy_ea",
    "natgas_yoy_ea",
    "copper_yoy_ea",
    "commodity_index_yoy_ea",
    "industrial_metals_yoy_ea",
  ],
};

const REFERENCE_INDICATOR: Record<InflationSplitRegion, { id: string; label: string }> = {
  US: { id: "core_cpi_yoy_us", label: "Core CPI YoY" },
  EA: { id: "hicp_inflation_ea", label: "HICP inflation" },
};

export function computeInflationSplit(params: {
  region: string;
  asOfDate: string;
  indicators: MacroIndicatorSnapshot[];
  seriesMap: Map<string, MacroSeriesInput>;
}) {
  const region = params.region.toUpperCase();
  if (region !== "US" && region !== "EA") return null;
  const normalizedRegion = region as InflationSplitRegion;

  const goods = goodsCompositeFromIndicators(GOODS_INDICATORS[normalizedRegion], params.indicators);

  const monetaryComponents = normalizedRegion === "US"
    ? [
      { key: "central_bank_balance_sheet_score", weight: 0.30, seriesKey: "fed_balance_sheet_ratio_us" },
      { key: "money_supply_score", weight: 0.30, seriesKey: "m2_ratio_us" },
      { key: "private_credit_score", weight: 0.25, seriesKey: "private_credit_ratio_us" },
      { key: "real_rate_score", weight: 0.15, seriesKey: "real_policy_rate_us", invert: true },
    ]
    : [
      { key: "central_bank_balance_sheet_score", weight: 0.30, seriesKey: "ecb_balance_sheet_ratio_ea" },
      { key: "money_supply_score", weight: 0.30, seriesKey: "m3_ratio_ea" },
      { key: "private_credit_score", weight: 0.25, seriesKey: "private_credit_ratio_ea" },
      { key: "real_rate_score", weight: 0.15, seriesKey: "real_policy_rate_ea", invert: true },
    ];

  const monetaryUsed = monetaryComponents.map((component) => {
    const percentile10y = latestPercentile(
      params.seriesMap.get(component.seriesKey),
      params.asOfDate,
      component.invert ? (value) => -value : undefined,
    );
    return {
      component: component.key,
      seriesKey: component.seriesKey,
      weight: component.weight,
      percentile10y,
      inverted: Boolean(component.invert),
    };
  });

  const monetaryComposite = weightedAverage(monetaryUsed.map((entry) => ({ value: entry.percentile10y, weight: entry.weight })));

  const referenceMeta = REFERENCE_INDICATOR[normalizedRegion];
  const reference = params.indicators.find((entry) => entry.indicatorId === referenceMeta.id)?.percentile10y ?? null;

  return {
    goodsInflationComposite: goods.score,
    monetaryInflationComposite: monetaryComposite,
    actualInflationReference: reference,
    referenceLabel: referenceMeta.label,
    dominanceSpread: monetaryComposite === null || goods.score === null ? null : monetaryComposite - goods.score,
    dominance: (monetaryComposite === null || goods.score === null
      ? "neutral"
      : monetaryComposite > goods.score
        ? "monetary"
        : goods.score > monetaryComposite
          ? "goods"
          : "neutral") as "goods" | "monetary" | "neutral",
    model: {
      goods: {
        compositeId: normalizedRegion === "US" ? "goods_inflation_composite_us" : "goods_inflation_composite_ea",
        indicators: GOODS_INDICATORS[normalizedRegion],
        used: goods.used,
        missing: goods.missing,
      },
      monetary: {
        compositeId: normalizedRegion === "US" ? "monetary_inflation_composite_us" : "monetary_inflation_composite_ea",
        formula: "0.30*central_bank_balance_sheet_score + 0.30*money_supply_score + 0.25*private_credit_score + 0.15*real_rate_score",
        components: monetaryUsed,
        missing: monetaryUsed.filter((entry) => entry.percentile10y === null).map((entry) => entry.seriesKey),
      },
      reference: {
        indicatorId: referenceMeta.id,
        label: referenceMeta.label,
        missing: reference === null,
      },
    },
  };
}
