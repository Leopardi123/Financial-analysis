import type { InStatement } from "@libsql/client";
import { batch, query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";
import { MACRO_INDICATOR_CATALOG } from "./catalog.js";
import { runGlobalMacroEngine } from "./engine.js";
import type { MacroSeriesInput } from "./types";

type RawPointRow = {
  series_key: string;
  date: string;
  value: number | null;
};

type ExistingIndicatorRow = {
  indicator_id: string;
  value_latest: number | null;
  percentile_10y: number | null;
  score: number | null;
  freshness_days: number | null;
  coverage_10y_pct: number | null;
  data_date_latest: string | null;
  change_1m: number | null;
  change_3m: number | null;
  yoy: number | null;
  source_type: string | null;
  signal_class: string | null;
  driver_note: string | null;
};

type ExistingRegimeRow = {
  block_scores_json: string | null;
  macro_score_total: number | null;
  macro_confidence: number | null;
  core_regime_label: string | null;
  growth_overlay: string | null;
  stress_overlay: string | null;
  hard_asset_overlay: string | null;
  clear_signal_strength: number | null;
  speculative_signal_strength: number | null;
  top_drivers_json: string | null;
};

function roundOrNull(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function toCanonicalMonthly(points: Array<{ date: string; value: number | null }>) {
  const map = new Map<string, { date: string; value: number | null }>();
  for (const point of points) {
    const month = point.date.slice(0, 7);
    const prev = map.get(month);
    if (!prev || point.date > prev.date) {
      map.set(month, point);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function bySeries(rawPoints: RawPointRow[]): MacroSeriesInput[] {
  const map = new Map<string, MacroSeriesInput>();
  for (const row of rawPoints) {
    const key = String(row.series_key);
    const bucket = map.get(key) ?? { seriesKey: key, points: [] };
    bucket.points.push({ date: String(row.date), value: row.value === null ? null : Number(row.value) });
    map.set(key, bucket);
  }
  return Array.from(map.values());
}

function getIndicatorDerivedStats(seriesMap: Map<string, MacroSeriesInput>, inputKey: string) {
  const source = seriesMap.get(inputKey);
  if (!source) {
    return {
      dataDateLatest: null,
      change1m: null,
      change3m: null,
      yoy: null,
    };
  }

  const monthly = toCanonicalMonthly(source.points);
  const valid = monthly.filter((point) => typeof point.value === "number") as Array<{ date: string; value: number }>;
  if (valid.length === 0) {
    return {
      dataDateLatest: null,
      change1m: null,
      change3m: null,
      yoy: null,
    };
  }

  const latest = valid[valid.length - 1];
  const prev1m = valid.length > 1 ? valid[valid.length - 2] : null;
  const prev3m = valid.length > 3 ? valid[valid.length - 4] : null;
  const prev12m = valid.length > 12 ? valid[valid.length - 13] : null;

  return {
    dataDateLatest: latest.date,
    change1m: prev1m ? roundOrNull(latest.value - prev1m.value) : null,
    change3m: prev3m ? roundOrNull(latest.value - prev3m.value) : null,
    yoy: prev12m ? roundOrNull(latest.value - prev12m.value) : null,
  };
}

function changedIndicator(existing: ExistingIndicatorRow | undefined, next: {
  value_latest: number | null;
  percentile_10y: number | null;
  score: number | null;
  freshness_days: number | null;
  coverage_10y_pct: number;
  data_date_latest: string | null;
  change_1m: number | null;
  change_3m: number | null;
  yoy: number | null;
  source_type: string;
  signal_class: string;
  driver_note: string | null;
}): boolean {
  if (!existing) return true;
  return (
    roundOrNull(existing.value_latest) !== roundOrNull(next.value_latest)
    || roundOrNull(existing.percentile_10y) !== roundOrNull(next.percentile_10y)
    || (existing.score ?? null) !== (next.score ?? null)
    || (existing.freshness_days ?? null) !== (next.freshness_days ?? null)
    || roundOrNull(existing.coverage_10y_pct) !== roundOrNull(next.coverage_10y_pct)
    || (existing.data_date_latest ?? null) !== (next.data_date_latest ?? null)
    || roundOrNull(existing.change_1m) !== roundOrNull(next.change_1m)
    || roundOrNull(existing.change_3m) !== roundOrNull(next.change_3m)
    || roundOrNull(existing.yoy) !== roundOrNull(next.yoy)
    || String(existing.source_type ?? "") !== next.source_type
    || String(existing.signal_class ?? "") !== next.signal_class
    || String(existing.driver_note ?? "") !== String(next.driver_note ?? "")
  );
}

function changedRegime(existing: ExistingRegimeRow | undefined, next: {
  block_scores_json: string;
  macro_score_total: number | null;
  macro_confidence: number;
  core_regime_label: string;
  growth_overlay: string;
  stress_overlay: string;
  hard_asset_overlay: string;
  clear_signal_strength: number | null;
  speculative_signal_strength: number | null;
  top_drivers_json: string;
}): boolean {
  if (!existing) return true;
  return (
    String(existing.block_scores_json ?? "") !== next.block_scores_json
    || roundOrNull(existing.macro_score_total) !== roundOrNull(next.macro_score_total)
    || roundOrNull(existing.macro_confidence) !== roundOrNull(next.macro_confidence)
    || String(existing.core_regime_label ?? "") !== next.core_regime_label
    || String(existing.growth_overlay ?? "") !== next.growth_overlay
    || String(existing.stress_overlay ?? "") !== next.stress_overlay
    || String(existing.hard_asset_overlay ?? "") !== next.hard_asset_overlay
    || roundOrNull(existing.clear_signal_strength) !== roundOrNull(next.clear_signal_strength)
    || roundOrNull(existing.speculative_signal_strength) !== roundOrNull(next.speculative_signal_strength)
    || String(existing.top_drivers_json ?? "") !== next.top_drivers_json
  );
}

export async function runAndPersistMacroSnapshots(params: { region: string; asOfDate?: string }) {
  const region = params.region.toUpperCase();
  const rawPoints = (await query(
    `SELECT series_key, date, value
     FROM ${tables.macroRawDatapoints}
     WHERE region = ? AND source_type = 'auto'
     ORDER BY series_key ASC, date ASC`,
    [region],
  )) as unknown as RawPointRow[];

  if (rawPoints.length === 0) {
    return {
      asOfDate: params.asOfDate ?? null,
      region,
      rawPointCount: 0,
      indicatorCount: 0,
      indicatorWrites: 0,
      regimeWrites: 0,
      wroteAny: false,
      emptyInvalid: true,
      regime: null,
      indicators: [],
    };
  }

  const series = bySeries(rawPoints);
  const seriesMap = new Map(series.map((item) => [item.seriesKey, item]));

  const { regime, indicators } = runGlobalMacroEngine({
    region,
    asOfDate: params.asOfDate,
    series,
  });

  const catalogById = new Map(
    MACRO_INDICATOR_CATALOG.filter((entry) => entry.region === region).map((entry) => [entry.indicatorId, entry]),
  );

  const existingIndicators = (await query(
    `SELECT indicator_id, value_latest, percentile_10y, score, freshness_days, coverage_10y_pct,
            data_date_latest, change_1m, change_3m, yoy, source_type, signal_class, driver_note
     FROM ${tables.macroIndicatorSnapshots}
     WHERE region = ? AND as_of_date = ?`,
    [region, regime.asOfDate],
  )) as unknown as ExistingIndicatorRow[];
  const existingIndicatorById = new Map(existingIndicators.map((row) => [String(row.indicator_id), row]));

  const topDriverIds = new Set(regime.topDrivers.map((driver) => driver.indicatorId));
  const now = new Date().toISOString();
  const indicatorStatements: InStatement[] = [];

  for (const indicator of indicators) {
    const catalog = catalogById.get(indicator.indicatorId);
    const derived = getIndicatorDerivedStats(seriesMap, catalog?.inputs?.[0] ?? "");
    const next = {
      value_latest: roundOrNull(indicator.valueLatest),
      percentile_10y: roundOrNull(indicator.percentile10y),
      score: indicator.score,
      freshness_days: indicator.freshnessDays,
      coverage_10y_pct: roundOrNull(indicator.coverage10yPct) ?? 0,
      data_date_latest: derived.dataDateLatest,
      change_1m: derived.change1m,
      change_3m: derived.change3m,
      yoy: derived.yoy,
      source_type: indicator.sourceType,
      signal_class: indicator.signalClass,
      driver_note: topDriverIds.has(indicator.indicatorId) ? "top_driver" : null,
    };

    if (!changedIndicator(existingIndicatorById.get(indicator.indicatorId), next)) {
      continue;
    }

    indicatorStatements.push({
      sql: `INSERT INTO ${tables.macroIndicatorSnapshots}
            (as_of_date, region, indicator_id, signal_class, source_type, data_date_latest,
             value_latest, change_1m, change_3m, yoy, percentile_10y, score, freshness_days,
             coverage_10y_pct, driver_note, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(as_of_date, region, indicator_id) DO UPDATE SET
              signal_class = excluded.signal_class,
              source_type = excluded.source_type,
              data_date_latest = excluded.data_date_latest,
              value_latest = excluded.value_latest,
              change_1m = excluded.change_1m,
              change_3m = excluded.change_3m,
              yoy = excluded.yoy,
              percentile_10y = excluded.percentile_10y,
              score = excluded.score,
              freshness_days = excluded.freshness_days,
              coverage_10y_pct = excluded.coverage_10y_pct,
              driver_note = excluded.driver_note,
              updated_at = excluded.updated_at`,
      args: [
        regime.asOfDate,
        region,
        indicator.indicatorId,
        indicator.signalClass,
        indicator.sourceType,
        next.data_date_latest,
        next.value_latest,
        next.change_1m,
        next.change_3m,
        next.yoy,
        next.percentile_10y,
        next.score,
        next.freshness_days,
        next.coverage_10y_pct,
        next.driver_note,
        now,
      ],
    });
  }

  const blockScoresJson = JSON.stringify(regime.blockScores);
  const topDriversJson = JSON.stringify(regime.topDrivers);
  const existingRegimeRows = (await query(
    `SELECT block_scores_json, macro_score_total, macro_confidence, core_regime_label,
            growth_overlay, stress_overlay, hard_asset_overlay,
            clear_signal_strength, speculative_signal_strength, top_drivers_json
     FROM ${tables.macroRegimeSnapshots}
     WHERE region = ? AND as_of_date = ?
     LIMIT 1`,
    [region, regime.asOfDate],
  )) as unknown as ExistingRegimeRow[];

  const nextRegime = {
    block_scores_json: blockScoresJson,
    macro_score_total: roundOrNull(regime.macroScoreTotal),
    macro_confidence: regime.macroConfidence,
    core_regime_label: regime.coreRegimeLabel,
    growth_overlay: regime.growthOverlay,
    stress_overlay: regime.stressOverlay,
    hard_asset_overlay: regime.hardAssetOverlay,
    clear_signal_strength: roundOrNull(regime.clearSignalStrength),
    speculative_signal_strength: roundOrNull(regime.speculativeSignalStrength),
    top_drivers_json: topDriversJson,
  };

  const regimeStatements: InStatement[] = [];
  if (changedRegime(existingRegimeRows[0], nextRegime)) {
    regimeStatements.push({
      sql: `INSERT INTO ${tables.macroRegimeSnapshots}
            (as_of_date, region, block_scores_json, macro_score_total, macro_confidence,
             core_regime_label, growth_overlay, stress_overlay, hard_asset_overlay,
             clear_signal_strength, speculative_signal_strength, top_drivers_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(as_of_date, region) DO UPDATE SET
              block_scores_json = excluded.block_scores_json,
              macro_score_total = excluded.macro_score_total,
              macro_confidence = excluded.macro_confidence,
              core_regime_label = excluded.core_regime_label,
              growth_overlay = excluded.growth_overlay,
              stress_overlay = excluded.stress_overlay,
              hard_asset_overlay = excluded.hard_asset_overlay,
              clear_signal_strength = excluded.clear_signal_strength,
              speculative_signal_strength = excluded.speculative_signal_strength,
              top_drivers_json = excluded.top_drivers_json,
              updated_at = excluded.updated_at`,
      args: [
        regime.asOfDate,
        region,
        nextRegime.block_scores_json,
        nextRegime.macro_score_total,
        nextRegime.macro_confidence,
        nextRegime.core_regime_label,
        nextRegime.growth_overlay,
        nextRegime.stress_overlay,
        nextRegime.hard_asset_overlay,
        nextRegime.clear_signal_strength,
        nextRegime.speculative_signal_strength,
        nextRegime.top_drivers_json,
        now,
      ],
    });
  }

  const statements = [...indicatorStatements, ...regimeStatements];
  if (statements.length > 0) {
    await batch(statements);
  }

  return {
    asOfDate: regime.asOfDate,
    region,
    rawPointCount: rawPoints.length,
    indicatorCount: indicators.length,
    indicatorWrites: indicatorStatements.length,
    regimeWrites: regimeStatements.length,
    wroteAny: statements.length > 0,
    emptyInvalid: false,
    regime,
    indicators,
  };
}
