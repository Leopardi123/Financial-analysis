import { query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { evaluateCommodityProfile, type CommodityId, type CommodityIndicatorKey, type CommodityProfileInputIndicator } from "../../../lib/sector/commodityProfiles/index.js";

type IndicatorRow = {
  indicator_id: string;
  as_of_date: string;
  value_latest: number | null;
  percentile_10y: number | null;
  score: number | null;
  change_1m: number | null;
  change_3m: number | null;
  yoy: number | null;
};

type RegimeRow = {
  as_of_date: string;
  core_regime_label: string | null;
  hard_asset_overlay: string | null;
  macro_confidence: number | null;
  macro_regime_probability_json: string | null;
};

type GoldRawRow = {
  date: string;
  value: number | null;
};

const SUPPORTED_COMMODITIES = new Set<CommodityId>(["gold"]);
const INDICATOR_KEYS: CommodityIndicatorKey[] = [
  "gold_usd",
  "gold_minus_real_yield_spread",
  "real_yield_10y_us",
  "usd_broad_index",
  "usd_yoy",
  "core_cpi_yoy_us",
  "breakeven_10y_us",
];

function parseCommodity(value: unknown): CommodityId | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return SUPPORTED_COMMODITIES.has(normalized as CommodityId) ? (normalized as CommodityId) : null;
}

function safeJsonParse(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

function toOverlayMap(macroRegimeProbabilityJson: string | null): Record<string, number | null> {
  const parsed = safeJsonParse(macroRegimeProbabilityJson);
  const overlays = parsed.thematicOverlayScores;
  if (!overlays || typeof overlays !== "object") return {};
  const asObj = overlays as Record<string, unknown>;
  const out: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(asObj)) {
    out[key] = typeof value === "number" ? value : null;
  }
  return out;
}

function mergeOverlayMaps(
  primary: Record<string, number | null>,
  secondary: Record<string, number | null>,
): Record<string, number | null> {
  const out: Record<string, number | null> = { ...secondary };
  for (const [key, value] of Object.entries(primary)) {
    out[key] = value;
  }
  return out;
}

export default async function handler(req: any, res: any) {
  try {
    await ensureSchema();
    const commodity = parseCommodity(req.query?.commodity);
    if (!commodity) {
      res.status(400).json({ ok: false, error: "Unsupported commodity. Expected: gold" });
      return;
    }

    const globalRegimeRows = (await query(
      `SELECT as_of_date, core_regime_label, hard_asset_overlay, macro_confidence, macro_regime_probability_json
       FROM ${tables.macroRegimeSnapshots}
       WHERE region = 'GLOBAL'
       ORDER BY as_of_date DESC
       LIMIT 1`,
    )) as unknown as RegimeRow[];
    const usRegimeRows = (await query(
      `SELECT as_of_date, core_regime_label, hard_asset_overlay, macro_confidence, macro_regime_probability_json
       FROM ${tables.macroRegimeSnapshots}
       WHERE region = 'US'
       ORDER BY as_of_date DESC
       LIMIT 1`,
    )) as unknown as RegimeRow[];

    const globalRegime = globalRegimeRows[0] ?? null;
    const usRegime = usRegimeRows[0] ?? null;
    const asOf = globalRegime?.as_of_date ?? usRegime?.as_of_date ?? new Date().toISOString().slice(0, 10);

    const indicatorRows = (await query(
      `SELECT indicator_id, as_of_date, value_latest, percentile_10y, score, change_1m, change_3m, yoy
       FROM ${tables.macroIndicatorSnapshots}
       WHERE region = 'US'
         AND indicator_id IN (${INDICATOR_KEYS.map(() => "?").join(",")})
       ORDER BY as_of_date DESC`,
      INDICATOR_KEYS,
    )) as unknown as IndicatorRow[];

    const goldRawRows = (await query(
      `SELECT date, value
       FROM ${tables.macroRawDatapoints}
       WHERE region = 'US'
         AND source_type = 'auto'
         AND series_key = 'gold_usd'
         AND date >= date('now', '-10 years')
       ORDER BY date ASC`,
    )) as unknown as GoldRawRow[];
    const numericGoldValues = goldRawRows.map((row) => row.value).filter((value): value is number => typeof value === "number");
    const goldMean10y = numericGoldValues.length > 0
      ? numericGoldValues.reduce((sum, value) => sum + value, 0) / numericGoldValues.length
      : null;
    const goldStd10y = goldMean10y !== null && numericGoldValues.length > 1
      ? Math.sqrt(numericGoldValues.reduce((sum, value) => sum + ((value - goldMean10y) ** 2), 0) / numericGoldValues.length)
      : null;
    const goldLatest = numericGoldValues.length > 0 ? numericGoldValues[numericGoldValues.length - 1] : null;

    const indicatorByKey = new Map<CommodityIndicatorKey, CommodityProfileInputIndicator>();
    for (const key of INDICATOR_KEYS) {
      const row = indicatorRows.find((entry) => entry.indicator_id === key);
      if (!row) continue;
      indicatorByKey.set(key, {
        key,
        valueLatest: row.value_latest === null ? null : Number(row.value_latest),
        percentile10y: row.percentile_10y === null ? null : Number(row.percentile_10y),
        score: row.score === null ? null : Number(row.score),
        change1m: row.change_1m === null ? null : Number(row.change_1m),
        change3m: row.change_3m === null ? null : Number(row.change_3m),
        yoy: row.yoy === null ? null : Number(row.yoy),
        asOf: row.as_of_date ?? null,
        momentum12m: key === "gold_usd" ? (row.yoy === null ? null : Number(row.yoy)) : null,
        deviationFromMeanZ: key === "gold_usd"
          ? (() => {
            if (goldMean10y === null || goldStd10y === null || goldLatest === null || goldStd10y === 0) return null;
            return (goldLatest - goldMean10y) / goldStd10y;
          })()
          : null,
      });
    }

    const snapshot = evaluateCommodityProfile(commodity, {
      commodity,
      asOf,
      indicators: Object.fromEntries(indicatorByKey.entries()) as Partial<Record<CommodityIndicatorKey, CommodityProfileInputIndicator>>,
      overlays: mergeOverlayMaps(
        toOverlayMap(usRegime?.macro_regime_probability_json ?? null),
        toOverlayMap(globalRegime?.macro_regime_probability_json ?? null),
      ),
      manualInputs: {},
      macroContext: {
        coreRegimeLabel: globalRegime?.core_regime_label ?? usRegime?.core_regime_label ?? null,
        hardAssetOverlay: globalRegime?.hard_asset_overlay ?? usRegime?.hard_asset_overlay ?? null,
        macroConfidence: globalRegime?.macro_confidence === null || globalRegime?.macro_confidence === undefined
          ? null
          : Number(globalRegime.macro_confidence),
      },
    });

    if (!snapshot) {
      res.status(404).json({ ok: false, error: `No commodity profile for ${commodity}` });
      return;
    }

    res.status(200).json({
      ok: true,
      commodity,
      snapshot,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
