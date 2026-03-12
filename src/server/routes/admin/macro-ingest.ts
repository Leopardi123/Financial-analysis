import type { InStatement } from "@libsql/client";
import { assertAdminSecret, getAdminSecret } from "../../../../api/_auth.js";
import { batch } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { fetchStableJson } from "../../../../api/_fmp.js";
import { buildDerivedSeries, fetchFredSeries, US_FRED_SERIES } from "../../../lib/macro/fred.js";



const PMI_FRED_FALLBACK_IDS = ["INDPRO", "NAPM"];

function normalizeFmpEodRows(payload: unknown): Array<{ date: string; value: number | null }> {
  const candidates = Array.isArray(payload)
    ? payload
    : (typeof payload === "object" && payload !== null && Array.isArray((payload as { historical?: unknown[] }).historical)
      ? ((payload as { historical?: unknown[] }).historical as unknown[])
      : []);

  return candidates
    .map((row) => {
      if (typeof row !== "object" || row === null) return null;
      const dateRaw = (row as { date?: unknown }).date;
      const closeRaw = (row as { close?: unknown }).close;
      const date = typeof dateRaw === "string" ? dateRaw.slice(0, 10) : null;
      const close = typeof closeRaw === "number" && Number.isFinite(closeRaw) ? closeRaw : null;
      if (!date) return null;
      return { date, value: close };
    })
    .filter((row): row is { date: string; value: number | null } => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}


function summarizeSeriesRange(rows: Array<{ date: string; value: number | null }>) {
  return {
    minDate: rows[0]?.date ?? null,
    maxDate: rows[rows.length - 1]?.date ?? null,
    rowCount: rows.length,
  };
}

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
    goldRequest: {
      endpoint: "historical-price-eod/full",
      symbol: "GCUSD",
      from: "2000-01-01",
      to: new Date().toISOString().slice(0, 10),
      fetchedMinDate: null as string | null,
      fetchedMaxDate: null as string | null,
      fetchedRowCount: 0,
    },
    silverRequest: {
      endpoint: "historical-price-eod/full",
      symbol: "SIUSD",
      from: "2000-01-01",
      to: new Date().toISOString().slice(0, 10),
      fetchedMinDate: null as string | null,
      fetchedMaxDate: null as string | null,
      fetchedRowCount: 0,
    },
  };

  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    if (region !== "US") {
      res.status(400).json({ ok: false, error: "Only region=US is supported in this phase" });
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

    const sourceSeriesMap: Record<string, Array<{ date: string; value: number | null }>> = {};
    for (const entry of US_FRED_SERIES) {
      const candidateSeriesIds = entry.seriesKey === "pmi_us"
        ? Array.from(new Set([entry.fredSeriesId, ...(entry.fallbackFredSeriesIds ?? []), ...PMI_FRED_FALLBACK_IDS]))
        : Array.from(new Set([entry.fredSeriesId, ...(entry.fallbackFredSeriesIds ?? [])]));

      let fetched = false;
      const attemptErrors: string[] = [];
      for (const candidateSeriesId of candidateSeriesIds) {
        try {
          const observations = await fetchFredSeries({
            fredSeriesId: candidateSeriesId,
            mode,
            latestLookbackMonths: entry.latestLookbackMonths,
            backfillLookbackYears: entry.backfillLookbackYears,
          });
          sourceSeriesMap[entry.seriesKey] = observations;
          debug.fetchedSeries += 1;
          debug.fetchedObservationCount += observations.length;
          seriesResults.push({
            seriesId: candidateSeriesId,
            seriesKey: entry.seriesKey,
            fetchSuccess: true,
            observationsFetched: observations.length,
            errorMessage: null,
          });
          fetched = true;
          break;
        } catch (error) {
          attemptErrors.push(`${candidateSeriesId}: ${(error as Error).message}`);
        }
      }

      if (!fetched) {
        seriesResults.push({
          seriesId: candidateSeriesIds.join("|"),
          seriesKey: entry.seriesKey,
          fetchSuccess: false,
          observationsFetched: 0,
          errorMessage: attemptErrors.join("; ") || "All PMI candidates failed",
        });
      }
    }

    try {
      const goldFrom = "2000-01-01";
      const goldTo = new Date().toISOString().slice(0, 10);
      debug.goldRequest.from = goldFrom;
      debug.goldRequest.to = goldTo;

      const goldPayload = await fetchStableJson<unknown>("historical-price-eod/full", { symbol: "GCUSD", from: goldFrom, to: goldTo });
      const goldRows = normalizeFmpEodRows(goldPayload);
      const goldRange = summarizeSeriesRange(goldRows);
      debug.goldRequest.fetchedMinDate = goldRange.minDate;
      debug.goldRequest.fetchedMaxDate = goldRange.maxDate;
      debug.goldRequest.fetchedRowCount = goldRange.rowCount;

      sourceSeriesMap.gold_usd = goldRows;
      debug.fetchedSeries += goldRows.length > 0 ? 1 : 0;
      debug.fetchedObservationCount += goldRows.length;
      seriesResults.push({
        seriesId: `historical-price-eod/full?symbol=GCUSD&from=${goldFrom}&to=${goldTo}`,
        seriesKey: "gold_usd",
        fetchSuccess: goldRows.length > 0,
        observationsFetched: goldRows.length,
        errorMessage: null,
        meta: {
          requestPattern: "single_request_with_explicit_from_to",
          endpoint: "historical-price-eod/full",
          symbol: "GCUSD",
          from: goldFrom,
          to: goldTo,
          fetchedMinDate: goldRange.minDate,
          fetchedMaxDate: goldRange.maxDate,
          fetchedRowCount: goldRange.rowCount,
        },
      });
    } catch (error) {
      seriesResults.push({
        seriesId: "historical-price-eod/full?symbol=GCUSD",
        seriesKey: "gold_usd",
        fetchSuccess: false,
        observationsFetched: 0,
        errorMessage: (error as Error).message,
        meta: {
          requestPattern: "single_request_with_explicit_from_to",
          endpoint: "historical-price-eod/full",
          symbol: "GCUSD",
          from: debug.goldRequest.from,
          to: debug.goldRequest.to,
        },
      });
    }


    try {
      const silverFrom = "2000-01-01";
      const silverTo = new Date().toISOString().slice(0, 10);
      debug.silverRequest.from = silverFrom;
      debug.silverRequest.to = silverTo;

      const silverPayload = await fetchStableJson<unknown>("historical-price-eod/full", { symbol: "SIUSD", from: silverFrom, to: silverTo });
      const silverRows = normalizeFmpEodRows(silverPayload);
      const silverRange = summarizeSeriesRange(silverRows);
      debug.silverRequest.fetchedMinDate = silverRange.minDate;
      debug.silverRequest.fetchedMaxDate = silverRange.maxDate;
      debug.silverRequest.fetchedRowCount = silverRange.rowCount;

      sourceSeriesMap.silver_usd = silverRows;
      debug.fetchedSeries += silverRows.length > 0 ? 1 : 0;
      debug.fetchedObservationCount += silverRows.length;
      seriesResults.push({
        seriesId: `historical-price-eod/full?symbol=SIUSD&from=${silverFrom}&to=${silverTo}`,
        seriesKey: "silver_usd",
        fetchSuccess: silverRows.length > 0,
        observationsFetched: silverRows.length,
        errorMessage: null,
        meta: {
          requestPattern: "single_request_with_explicit_from_to",
          endpoint: "historical-price-eod/full",
          symbol: "SIUSD",
          from: silverFrom,
          to: silverTo,
          fetchedMinDate: silverRange.minDate,
          fetchedMaxDate: silverRange.maxDate,
          fetchedRowCount: silverRange.rowCount,
        },
      });
    } catch (error) {
      seriesResults.push({
        seriesId: "historical-price-eod/full?symbol=SIUSD",
        seriesKey: "silver_usd",
        fetchSuccess: false,
        observationsFetched: 0,
        errorMessage: (error as Error).message,
        meta: {
          requestPattern: "single_request_with_explicit_from_to",
          endpoint: "historical-price-eod/full",
          symbol: "SIUSD",
          from: debug.silverRequest.from,
          to: debug.silverRequest.to,
        },
      });
    }

    debug.fetchSucceeded = debug.fetchedSeries > 0;

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
          args: [["gold_usd", "silver_usd"].includes(seriesKey) ? "fmp" : "fred", region, seriesKey, point.date, point.value, now],
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
      debug.errorMessage = "All configured FRED series failed";
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
      partialSuccess: !allSeriesFailed && debug.fetchedSeries < (US_FRED_SERIES.length + 1),
      mode,
      region,
      sourceSeries: [...US_FRED_SERIES.map((entry) => entry.seriesKey), "gold_usd"],
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
