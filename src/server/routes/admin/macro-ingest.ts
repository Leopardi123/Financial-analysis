import type { InStatement } from "@libsql/client";
import { assertAdminSecret, getAdminSecret } from "../../../../api/_auth.js";
import { batch } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { loadCanonicalMacroSeries } from "../../../lib/macro/canonicalMacroSeries.js";


function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

export default async function handler(req: any, res: any) {
  const attemptedAt = new Date().toISOString();
  const modeRaw = String(req.query?.mode ?? "latest").toLowerCase();
  const mode: "backfill" | "latest" = modeRaw === "backfill" ? "backfill" : "latest";
  const region = String(req.query?.region ?? "US").toUpperCase();

  const seriesResults: Array<{
    seriesId: string;
    seriesKey: string;
    fetchSuccess: boolean;
    observationsFetched: number;
    errorMessage: string | null;
    meta?: Record<string, unknown>;
  }> = [];

  const debug = {
    endpointReachable: true,
    fredApiKeyPresent: String(process.env.FRED_API_KEY ?? "").trim().length > 0,
    adminSecretConfigured: Boolean(getAdminSecret()),
    adminAuthorized: false,
    dbConnected: false,
    fetchStarted: false,
    fetchSucceeded: false,
    fetchedSeries: 0,
    fetchedObservationCount: 0,
    insertAttempted: false,
    attemptedInserts: 0,
    insertedRowCount: 0,
    duplicateOrUnchangedRows: 0,
    dedupeOnlyRun: false,
    ingestOutcome: "not_started" as "not_started" | "nothing_to_write" | "inserted_new_rows" | "dedupe_or_unchanged_only",
    failingStep: null as string | null,
    errorMessage: null as string | null,
    seriesResults,
  };

  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    if (!["US", "EA", "SE"].includes(region)) {
      res.status(400).json({ ok: false, error: "Supported regions: US, EA, SE" });
      return;
    }

    try {
      assertAdminSecret(req);
      debug.adminAuthorized = true;
    } catch (error) {
      debug.failingStep = "auth";
      debug.errorMessage = (error as Error).message;
      res.status(401).json({
        ok: false,
        error: "Unauthorized",
        debug: {
          ...debug,
          adminGuardBlocked: true,
          authReason: debug.adminSecretConfigured ? "unauthorized" : "missing admin secret",
        },
      });
      return;
    }

    await ensureSchema();
    debug.dbConnected = true;

    const now = new Date().toISOString();
    debug.fetchStarted = true;

    const { sourceSeries, derivedSeries } = await loadCanonicalMacroSeries(region as "US" | "EA" | "SE", mode);

    for (const [seriesKey, rows] of Object.entries(sourceSeries)) {
      const source = region === "US"
        ? (["gold_usd", "silver_usd"].includes(seriesKey) ? "fmp" : "fred")
        : (region === "EA"
          ? (seriesKey.includes("ea") || seriesKey.includes("hicp") || seriesKey.includes("debt") || seriesKey.includes("deficit") ? "eurostat_ecb" : "fmp")
          : "scb_riksbank");
      seriesResults.push({
        seriesId: `${source}:${seriesKey}`,
        seriesKey,
        fetchSuccess: rows.length > 0,
        observationsFetched: rows.length,
        errorMessage: rows.length > 0 ? null : "No observations",
      });
      if (rows.length > 0) {
        debug.fetchedSeries += 1;
        debug.fetchedObservationCount += rows.length;
      }
    }

    debug.fetchSucceeded = debug.fetchedSeries > 0;

    const sourceSeriesMap = sourceSeries;
    const derivedSeriesMap = derivedSeries;

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
          args: [region === "US"
            ? (["gold_usd", "silver_usd"].includes(seriesKey) ? "fmp" : "fred")
            : (region === "EA"
              ? (seriesKey.includes("ea") || seriesKey.includes("hicp") || seriesKey.includes("debt") || seriesKey.includes("deficit") ? "eurostat_ecb" : "fmp")
              : "scb_riksbank"), region, seriesKey, point.date, point.value, now],
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

    debug.insertAttempted = statements.length > 0;
    debug.attemptedInserts = statements.length;
    const chunks = chunk(statements, 250);
    for (const part of chunks) {
      if (part.length === 0) continue;
      const results = await batch(part);
      for (const result of results) {
        debug.insertedRowCount += Number(result.rowsAffected ?? 0);
      }
    }

    debug.duplicateOrUnchangedRows = Math.max(0, debug.attemptedInserts - debug.insertedRowCount);
    debug.dedupeOnlyRun = debug.attemptedInserts > 0 && debug.insertedRowCount === 0;
    debug.ingestOutcome = debug.attemptedInserts === 0
      ? "nothing_to_write"
      : debug.insertedRowCount > 0
        ? "inserted_new_rows"
        : "dedupe_or_unchanged_only";

    const allSeriesFailed = debug.fetchedSeries === 0;
    if (allSeriesFailed) {
      debug.failingStep = "fetch";
      debug.errorMessage = `All configured source series failed for region ${region}`;
    }

    await batch([
      {
        sql: `INSERT INTO ${tables.macroIngestRuns}
              (attempted_at, region, mode, success, fred_api_key_present, admin_authorized,
               db_connected, fetch_started, fetch_succeeded, fetched_series, fetched_observation_count,
               insert_attempted, attempted_inserts, inserted_row_count, series_results_json, failing_step, error_message)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          attemptedAt,
          region,
          mode,
          allSeriesFailed ? 0 : 1,
          debug.fredApiKeyPresent ? 1 : 0,
          1,
          debug.dbConnected ? 1 : 0,
          1,
          debug.fetchSucceeded ? 1 : 0,
          debug.fetchedSeries,
          debug.fetchedObservationCount,
          debug.insertAttempted ? 1 : 0,
          debug.attemptedInserts,
          debug.insertedRowCount,
          JSON.stringify(seriesResults),
          debug.failingStep,
          debug.errorMessage,
        ],
      },
    ]);

    const statusCode = allSeriesFailed ? 502 : 200;
    res.status(statusCode).json({
      ok: !allSeriesFailed,
      partialSuccess: !allSeriesFailed && debug.fetchedSeries < Object.keys(sourceSeriesMap).length,
      mode,
      region,
      sourceSeries: Object.keys(sourceSeriesMap),
      sourceRowCount,
      derivedSeries: Object.keys(derivedSeriesMap),
      derivedRowCount,
      writeStatements: statements.length,
      batchChunks: chunks.length,
      ingestSummary: {
        fetchedRows: debug.fetchedObservationCount,
        attemptedInserts: debug.attemptedInserts,
        newRowsInserted: debug.insertedRowCount,
        duplicateOrUnchangedRows: debug.duplicateOrUnchangedRows,
        dedupeOnlyRun: debug.dedupeOnlyRun,
        ingestOutcome: debug.ingestOutcome,
      },
      debug,
    });
  } catch (error) {
    debug.errorMessage = (error as Error).message;
    if (!debug.failingStep) {
      if (!debug.fetchStarted) debug.failingStep = "init";
      else if (!debug.fetchSucceeded) debug.failingStep = "fetch";
      else if (!debug.insertAttempted) debug.failingStep = "prepare_insert";
      else debug.failingStep = "db_write";
    }

    if (debug.dbConnected) {
      try {
        await batch([
          {
            sql: `INSERT INTO ${tables.macroIngestRuns}
                  (attempted_at, region, mode, success, fred_api_key_present, admin_authorized,
                   db_connected, fetch_started, fetch_succeeded, fetched_series, fetched_observation_count,
                   insert_attempted, attempted_inserts, inserted_row_count, series_results_json, failing_step, error_message)
                  VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              attemptedAt,
              region,
              mode,
              debug.fredApiKeyPresent ? 1 : 0,
              debug.adminAuthorized ? 1 : 0,
              debug.dbConnected ? 1 : 0,
              debug.fetchStarted ? 1 : 0,
              debug.fetchSucceeded ? 1 : 0,
              debug.fetchedSeries,
              debug.fetchedObservationCount,
              debug.insertAttempted ? 1 : 0,
              debug.attemptedInserts,
              debug.insertedRowCount,
              JSON.stringify(seriesResults),
              debug.failingStep,
              debug.errorMessage,
            ],
          },
        ]);
      } catch {
        // swallow logging failures
      }
    }

    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({
      ok: false,
      error: (error as Error).message,
      ingestSummary: {
        fetchedRows: debug.fetchedObservationCount,
        attemptedInserts: debug.attemptedInserts,
        newRowsInserted: debug.insertedRowCount,
        duplicateOrUnchangedRows: debug.duplicateOrUnchangedRows,
        dedupeOnlyRun: debug.dedupeOnlyRun,
        ingestOutcome: debug.ingestOutcome,
      },
      debug,
    });
  }
}
