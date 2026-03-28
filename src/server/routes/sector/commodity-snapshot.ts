import { query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { evaluateCommodityProfile, type CommodityId, type CommodityIndicatorKey, type CommodityProfileInputIndicator } from "../../../lib/sector/commodityProfiles/index.js";
import { buildCommodityTrendStructure } from "../../../lib/sector/commodityTrendStructure.js";

type IndicatorRow = {
  indicator_id: string;
  region: string;
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
const TREND_HISTORY_LOOKBACK_YEARS = 30;

const SUPPORTED_COMMODITIES = new Set<CommodityId>(["gold", "copper"]);
const COMMODITY_INDICATOR_KEYS: Record<CommodityId, CommodityIndicatorKey[]> = {
  gold: [
    "gold_usd",
    "gold_minus_real_yield_spread",
    "real_yield_10y_us",
    "usd_broad_index",
    "usd_yoy",
    "core_cpi_yoy_us",
    "breakeven_10y_us",
    "vix_index",
    "hy_spread_us",
    "financial_conditions_index",
  ],
  copper: [
    "copper_usd",
    "china_cli",
    "pmi_us",
    "copper_lme_inventory",
    "copper_capex_proxy",
  ],
};

const PRICE_SERIES_BY_COMMODITY: Record<CommodityId, CommodityIndicatorKey> = {
  gold: "gold_usd",
  copper: "copper_usd",
};

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
    const debugEnabled = String(req.query?.debug ?? "").trim() === "1";
    const commodity = parseCommodity(req.query?.commodity);
    if (!commodity) {
      res.status(400).json({ ok: false, error: "Unsupported commodity. Expected: gold or copper" });
      return;
    }

    const indicatorKeys = COMMODITY_INDICATOR_KEYS[commodity];
    const priceSeriesKey = PRICE_SERIES_BY_COMMODITY[commodity];

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
      `SELECT indicator_id, region, as_of_date, value_latest, percentile_10y, score, change_1m, change_3m, yoy
       FROM ${tables.macroIndicatorSnapshots}
       WHERE region IN ('US', 'GLOBAL')
         AND indicator_id IN (${indicatorKeys.map(() => "?").join(",")})
       ORDER BY as_of_date DESC`,
      indicatorKeys,
    )) as unknown as IndicatorRow[];

    const commodityRawRows = (await query(
      `SELECT date, value
       FROM ${tables.macroRawDatapoints}
       WHERE region = 'US'
         AND source_type = 'auto'
         AND series_key = ?
         AND date >= date('now', ?)
       ORDER BY date ASC`,
      [priceSeriesKey, `-${TREND_HISTORY_LOOKBACK_YEARS} years`],
    )) as unknown as GoldRawRow[];
    const numericCommodityValues = commodityRawRows.map((row) => row.value).filter((value): value is number => typeof value === "number");
    const commodityMean10y = numericCommodityValues.length > 0
      ? numericCommodityValues.reduce((sum, value) => sum + value, 0) / numericCommodityValues.length
      : null;
    const commodityStd10y = commodityMean10y !== null && numericCommodityValues.length > 1
      ? Math.sqrt(numericCommodityValues.reduce((sum, value) => sum + ((value - commodityMean10y) ** 2), 0) / numericCommodityValues.length)
      : null;
    const commodityLatest = numericCommodityValues.length > 0 ? numericCommodityValues[numericCommodityValues.length - 1] : null;
    const trendModel = buildCommodityTrendStructure(
      commodityRawRows.map((row) => ({ date: row.date, value: row.value === null ? null : Number(row.value) })),
      5,
    );

    const indicatorByKey = new Map<CommodityIndicatorKey, CommodityProfileInputIndicator>();
    const indicatorSelectionDebug: Array<{
      key: CommodityIndicatorKey;
      selectedRegion: string | null;
      selectedAsOf: string | null;
      candidates: Array<{ region: string; asOf: string }>;
      note: string;
    }> = [];
    for (const key of indicatorKeys) {
      const candidates = indicatorRows
        .filter((entry) => entry.indicator_id === key)
        .sort((a, b) => String(b.as_of_date).localeCompare(String(a.as_of_date)));
      const preferredRegion = key === "china_cli" ? "GLOBAL" : "US";
      const preferredRegionCandidates = candidates.filter((entry) => entry.region === preferredRegion);
      const demandSignalKey = key === "china_cli" || key === "pmi_us";
      const row = demandSignalKey
        ? (
          preferredRegionCandidates.find((entry) =>
            typeof entry.value_latest === "number" && (typeof entry.change_3m === "number" || typeof entry.change_1m === "number"),
          )
          ?? preferredRegionCandidates.find((entry) => typeof entry.value_latest === "number")
          ?? candidates.find((entry) =>
            typeof entry.value_latest === "number" && (typeof entry.change_3m === "number" || typeof entry.change_1m === "number"),
          )
          ?? preferredRegionCandidates[0]
          ?? candidates[0]
          ?? null
        )
        : (preferredRegionCandidates[0] ?? candidates[0] ?? null);
      if (!row) {
        indicatorSelectionDebug.push({
          key,
          selectedRegion: null,
          selectedAsOf: null,
          candidates: [],
          note: `No snapshot rows found for ${key} in US/GLOBAL.`,
        });
        continue;
      }
      indicatorByKey.set(key, {
        key,
        valueLatest: row.value_latest === null ? null : Number(row.value_latest),
        percentile10y: row.percentile_10y === null ? null : Number(row.percentile_10y),
        score: row.score === null ? null : Number(row.score),
        change1m: row.change_1m === null ? null : Number(row.change_1m),
        change3m: row.change_3m === null ? null : Number(row.change_3m),
        yoy: row.yoy === null ? null : Number(row.yoy),
        asOf: row.as_of_date ?? null,
        momentum12m: key === priceSeriesKey ? (row.yoy === null ? null : Number(row.yoy)) : null,
        deviationFromMeanZ: key === priceSeriesKey
          ? (() => {
            if (commodityMean10y === null || commodityStd10y === null || commodityLatest === null || commodityStd10y === 0) return null;
            return (commodityLatest - commodityMean10y) / commodityStd10y;
          })()
          : null,
      });
      indicatorSelectionDebug.push({
        key,
        selectedRegion: row.region ?? null,
        selectedAsOf: row.as_of_date ?? null,
        candidates: candidates.map((candidate) => ({ region: candidate.region, asOf: candidate.as_of_date })),
        note: demandSignalKey
          ? `Demand-signal selection favored rows with non-null level + momentum. Preferred region=${preferredRegion}, selected=${row.region}.`
          : row.region === preferredRegion
            ? `Selected preferred region=${preferredRegion}.`
            : `Preferred region=${preferredRegion} missing; used fallback region=${row.region}.`,
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
      trendSignal: {
        structure: trendModel.trendStructureState,
        expansion: trendModel.trendExpansionState,
        completeness: trendModel.trendDataCompleteness,
        score: trendModel.degradationLevel === "insufficient" ? null : trendModel.points.length > 0 ? (() => {
          const structure = trendModel.trendStructureState;
          const expansion = trendModel.trendExpansionState;
          const structureScore = structure === "bullish_aligned" ? 1 : structure === "bullish_but_narrowing" ? 0.5 : structure === "bearish_short_term" ? -0.5 : 0;
          const expansionScore = expansion === "expanding" ? 1 : expansion === "flat" ? 0.5 : expansion === "narrowing" ? -0.5 : expansion === "negative_short_spread" ? -1 : 0;
          if (structure === "insufficient" || expansion === "insufficient") return null;
          return Math.max(-1, Math.min(1, structureScore * 0.6 + expansionScore * 0.4));
        })() : null,
      },
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

    const snapshotWithTrendAlias = {
      ...snapshot,
      trend_signal: snapshot.trendSignal ?? null,
    };

    res.status(200).json({
      ok: true,
      commodity,
      snapshot: snapshotWithTrendAlias,
      trendPriceHistory: commodityRawRows.map((row) => ({
        date: row.date,
        value: row.value === null ? null : Number(row.value),
      })),
      trendPriceMeta: {
        lookbackYearsRequested: TREND_HISTORY_LOOKBACK_YEARS,
        observationCount: commodityRawRows.length,
        fromDate: commodityRawRows[0]?.date ?? null,
        toDate: commodityRawRows[commodityRawRows.length - 1]?.date ?? null,
      },
      ...(debugEnabled
        ? {
          ...(function buildPmiDebug() {
            const chinaCli = indicatorByKey.get("china_cli");
            const pmiUs = indicatorByKey.get("pmi_us");
            const chinaCliSelection = indicatorSelectionDebug.find((item) => item.key === "china_cli");
            const pmiUsSelection = indicatorSelectionDebug.find((item) => item.key === "pmi_us");
            return {
              pmiDebug: {
                chinaCli: {
                  valueLatest: chinaCli?.valueLatest ?? null,
                  change3m: chinaCli?.change3m ?? null,
                  change1m: chinaCli?.change1m ?? null,
                  asOf: chinaCli?.asOf ?? null,
                  selectedRegion: chinaCliSelection?.selectedRegion ?? null,
                  used: Boolean(chinaCli),
                },
                pmiUs: {
                  valueLatest: pmiUs?.valueLatest ?? null,
                  change3m: pmiUs?.change3m ?? null,
                  change1m: pmiUs?.change1m ?? null,
                  asOf: pmiUs?.asOf ?? null,
                  selectedRegion: pmiUsSelection?.selectedRegion ?? null,
                  used: "supplemental_only",
                },
              },
            };
          })(),
          debug: {
            mode: "snapshot_only",
            externalFetchAttempted: false,
            externalFetchReason: "This endpoint reads persisted macro snapshots only; no live external fetch is attempted at request time.",
            indicatorKeysRequested: indicatorKeys,
            indicatorSelection: indicatorSelectionDebug,
            priceSeriesKey,
            priceSeriesWindow10y: {
              observationCount: numericCommodityValues.length,
              mean10y: commodityMean10y,
              std10y: commodityStd10y,
              latest: commodityLatest,
            },
            chinaCliAvailable: indicatorByKey.has("china_cli"),
            pmiUsAvailable: indicatorByKey.has("pmi_us"),
            blockers: [
              ...(!indicatorByKey.has("china_cli")
                ? ["china_cli missing in macro_indicator_snapshots (US/GLOBAL), so Copper phase remains Unknown by design."]
                : []),
            ],
          },
        }
        : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
