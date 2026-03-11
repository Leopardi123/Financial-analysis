import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { query } from "../../../../api/_db.js";
import { MACRO_INDICATOR_CATALOG } from "../../../lib/macro/catalog.js";
import { runGlobalMacroEngine } from "../../../lib/macro/engine.js";
import type { MacroSeriesInput } from "../../../lib/macro/types";

type RawPointRow = {
  series_key: string;
  date: string;
  value: number | null;
};

function getNullReason(indicator: { coverage10yPct: number; valueLatest: number | null; score: number | null }): string | null {
  if (indicator.score !== null) return null;
  if (indicator.valueLatest === null) return "Missing latest value";
  if (indicator.coverage10yPct < 80) return "Coverage under 80% on 10y window";
  return "Score unavailable";
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  await ensureSchema();

  const region = String(req.query?.region ?? "US").toUpperCase();
  const asOfDate = String(req.query?.asOfDate ?? "").trim() || undefined;

  const rawPoints = (await query(
    `SELECT series_key, date, value
     FROM ${tables.macroRawDatapoints}
     WHERE region = ? AND source_type = 'auto'
     ORDER BY series_key ASC, date ASC`,
    [region],
  )) as unknown as RawPointRow[];

  const bySeries = new Map<string, MacroSeriesInput>();
  for (const row of rawPoints) {
    const key = String(row.series_key);
    const bucket = bySeries.get(key) ?? { seriesKey: key, points: [] };
    bucket.points.push({ date: String(row.date), value: row.value === null ? null : Number(row.value) });
    bySeries.set(key, bucket);
  }

  const { regime, indicators } = runGlobalMacroEngine({
    region,
    asOfDate,
    series: Array.from(bySeries.values()),
  });

  const catalogById = new Map(
    MACRO_INDICATOR_CATALOG.filter((entry) => entry.region === region).map((entry) => [entry.indicatorId, entry]),
  );

  const enrichedIndicators = indicators.map((indicator) => {
    const catalog = catalogById.get(indicator.indicatorId);
    return {
      ...indicator,
      block: catalog?.block ?? "D_CREDIBILITY",
      title: catalog?.title ?? indicator.indicatorId,
      nullReason: getNullReason(indicator),
    };
  });

  const scoredCount = enrichedIndicators.filter((item) => item.score !== null).length;
  const partialData = enrichedIndicators.length > 0 && scoredCount < enrichedIndicators.length;

  res.status(200).json({
    ok: true,
    globalMacro: {
      regime,
      indicators: enrichedIndicators,
      dataStatus: rawPoints.length > 0 ? "automated" : "insufficient",
      writePolicy: "read_only",
      stats: {
        rawPointCount: rawPoints.length,
        seriesCount: bySeries.size,
        indicatorCount: enrichedIndicators.length,
        scoredCount,
        partialData,
      },
    },
  });
}
