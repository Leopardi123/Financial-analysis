import type { MacroIndicatorCatalogEntry, MacroIndicatorSnapshot } from "./types.ts";
import { SIGNAL_CLASS_WEIGHT } from "./catalog.ts";

export type InflationSplitRegion = "US" | "EA";

export type InflationCompositeConfig = {
  id: string;
  label: string;
  indicators: string[];
};

export type InflationSplitConfig = {
  goods: InflationCompositeConfig;
  monetary: InflationCompositeConfig;
  referenceIndicatorId: string;
  referenceLabel: string;
};

export const INFLATION_SPLIT_CONFIG: Record<InflationSplitRegion, InflationSplitConfig> = {
  US: {
    goods: {
      id: "goods_inflation_composite_us",
      label: "Inflation, varor",
      indicators: [
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
    },
    monetary: {
      id: "monetary_inflation_composite_us",
      label: "Inflation, monetär",
      indicators: [
        "core_cpi_us",
        "core_cpi_yoy_us",
        "breakeven_10y_us",
        "fed_balance_sheet_total",
        "fed_balance_sheet_yoy",
        "m2_yoy",
        "m2_momentum",
      ],
    },
    referenceIndicatorId: "core_cpi_yoy_us",
    referenceLabel: "Core CPI YoY",
  },
  EA: {
    goods: {
      id: "goods_inflation_composite_ea",
      label: "Inflation, varor",
      indicators: [
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
    },
    monetary: {
      id: "monetary_inflation_composite_ea",
      label: "Inflation, monetär",
      indicators: [
        "hicp_inflation_ea",
        "hicp_momentum_ea",
        "ecb_balance_sheet_ea",
        "m3_growth_ea",
      ],
    },
    referenceIndicatorId: "hicp_inflation_ea",
    referenceLabel: "HICP inflation",
  },
};

function scoreToPercent(score: number): number {
  return Math.max(0, Math.min(100, ((score + 2) / 4) * 100));
}

function compositeFromIndicators(
  indicatorIds: string[],
  indicators: MacroIndicatorSnapshot[],
  catalogById: Map<string, MacroIndicatorCatalogEntry>,
) {
  const indicatorById = new Map(indicators.map((item) => [item.indicatorId, item]));
  const contributions: Array<{ indicatorId: string; weight: number; score: number; normalizedScore: number }> = [];
  const missing: string[] = [];

  for (const indicatorId of indicatorIds) {
    const snapshot = indicatorById.get(indicatorId);
    const meta = catalogById.get(indicatorId);
    if (!snapshot || snapshot.score === null || !meta) {
      missing.push(indicatorId);
      continue;
    }
    const weight = meta.blockWeight * SIGNAL_CLASS_WEIGHT[meta.signalClass];
    contributions.push({
      indicatorId,
      weight,
      score: snapshot.score,
      normalizedScore: scoreToPercent(snapshot.score),
    });
  }

  if (contributions.length === 0) {
    return {
      score: null,
      contributions,
      missing,
    };
  }

  const weighted = contributions.reduce(
    (acc, item) => ({ sum: acc.sum + item.score * item.weight, weight: acc.weight + item.weight }),
    { sum: 0, weight: 0 },
  );
  const score = weighted.weight > 0 ? scoreToPercent(weighted.sum / weighted.weight) : null;
  return {
    score,
    contributions,
    missing,
  };
}

export function computeInflationSplit(
  region: string,
  indicators: MacroIndicatorSnapshot[],
  catalog: MacroIndicatorCatalogEntry[],
) {
  const normalizedRegion = region.toUpperCase();
  if (normalizedRegion !== "US" && normalizedRegion !== "EA") return null;
  const config = INFLATION_SPLIT_CONFIG[normalizedRegion as InflationSplitRegion];
  const catalogById = new Map(catalog.map((entry) => [entry.indicatorId, entry]));
  const goods = compositeFromIndicators(config.goods.indicators, indicators, catalogById);
  const monetary = compositeFromIndicators(config.monetary.indicators, indicators, catalogById);
  const referenceSnapshot = indicators.find((entry) => entry.indicatorId === config.referenceIndicatorId);

  return {
    goodsInflationComposite: goods.score,
    monetaryInflationComposite: monetary.score,
    actualInflationReference: referenceSnapshot?.score === null || referenceSnapshot?.score === undefined
      ? null
      : scoreToPercent(referenceSnapshot.score),
    referenceLabel: config.referenceLabel,
    dominance: (goods.score === null || monetary.score === null
      ? "neutral"
      : goods.score > monetary.score
        ? "goods"
        : monetary.score > goods.score
          ? "monetary"
          : "neutral") as "goods" | "monetary" | "neutral",
    model: {
      goods: {
        compositeId: config.goods.id,
        indicators: config.goods.indicators,
        used: goods.contributions,
        missing: goods.missing,
      },
      monetary: {
        compositeId: config.monetary.id,
        indicators: config.monetary.indicators,
        used: monetary.contributions,
        missing: monetary.missing,
      },
      reference: {
        indicatorId: config.referenceIndicatorId,
        label: config.referenceLabel,
        missing: referenceSnapshot?.score === null || referenceSnapshot?.score === undefined,
      },
    },
  };
}
