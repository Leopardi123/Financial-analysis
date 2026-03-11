import type { InStatement } from "@libsql/client";
import { assertAdminSecret } from "../../../../api/_auth.js";
import { batch } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { buildDerivedSeries, fetchFredSeries, US_FRED_SERIES } from "../../../lib/macro/fred.js";

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    assertAdminSecret(req);
    await ensureSchema();

    const modeRaw = String(req.query?.mode ?? "latest").toLowerCase();
    const mode: "backfill" | "latest" = modeRaw === "backfill" ? "backfill" : "latest";
    const region = String(req.query?.region ?? "US").toUpperCase();

    if (region !== "US") {
      res.status(400).json({ ok: false, error: "Only region=US is supported in this phase" });
      return;
    }

    const now = new Date().toISOString();
    const sourceSeriesMap: Record<string, Array<{ date: string; value: number | null }>> = {};
    for (const entry of US_FRED_SERIES) {
      sourceSeriesMap[entry.seriesKey] = await fetchFredSeries({ fredSeriesId: entry.fredSeriesId, mode });
    }

    const derivedSeriesMap = buildDerivedSeries(sourceSeriesMap);

    const statements: InStatement[] = [];
    let sourceRowCount = 0;
    let derivedRowCount = 0;

    for (const [seriesKey, points] of Object.entries(sourceSeriesMap)) {
      for (const point of points) {
        sourceRowCount += 1;
        statements.push({
          sql: `INSERT INTO ${tables.macroRawDatapoints}
                (source, source_type, region, series_key, date, value, fetched_at)
                VALUES (?, 'auto', ?, ?, ?, ?, ?)
                ON CONFLICT(source, region, series_key, date) DO UPDATE SET
                  value = excluded.value,
                  fetched_at = excluded.fetched_at
                WHERE COALESCE(${tables.macroRawDatapoints}.value, -9.99999999e99) != COALESCE(excluded.value, -9.99999999e99)`,
          args: ["fred", region, seriesKey, point.date, point.value, now],
        });
      }
    }

    for (const [seriesKey, points] of Object.entries(derivedSeriesMap)) {
      for (const point of points) {
        derivedRowCount += 1;
        statements.push({
          sql: `INSERT INTO ${tables.macroRawDatapoints}
                (source, source_type, region, series_key, date, value, fetched_at)
                VALUES (?, 'auto', ?, ?, ?, ?, ?)
                ON CONFLICT(source, region, series_key, date) DO UPDATE SET
                  value = excluded.value,
                  fetched_at = excluded.fetched_at
                WHERE COALESCE(${tables.macroRawDatapoints}.value, -9.99999999e99) != COALESCE(excluded.value, -9.99999999e99)`,
          args: ["fred_derived", region, seriesKey, point.date, point.value, now],
        });
      }
    }

    const chunks = chunk(statements, 250);
    for (const part of chunks) {
      if (part.length > 0) {
        await batch(part);
      }
    }

    res.status(200).json({
      ok: true,
      mode,
      region,
      sourceSeries: US_FRED_SERIES.map((entry) => entry.seriesKey),
      sourceRowCount,
      derivedSeries: Object.keys(derivedSeriesMap),
      derivedRowCount,
      writeStatements: statements.length,
      batchChunks: chunks.length,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
