import { assertCronSecret } from "../../../../api/_auth.js";
import { query } from "../../../../api/_db.js";
import { requireFmpApiKey } from "../../../../api/_fmp.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { ingestDailyPricesAndRefreshSnapshot } from "../../../lib/prices/screening/ingest.js";
import { markAllActiveAsStale, setPriceStatusFailed, setPriceStatusReady } from "../../../lib/prices/screening/status.js";

const MAX_RETRIES = 1;

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    assertCronSecret(req);
    if (!requireFmpApiKey()) {
      res.status(500).json({ ok: false, error: "FMP_API_KEY missing" });
      return;
    }

    await ensureSchema();
    await markAllActiveAsStale();

    const rows = await query(
      `SELECT ticker
       FROM ${tables.companiesV2}
       WHERE active = 1
       ORDER BY ticker`,
    ) as unknown as Array<{ ticker: string }>;

    const results: Array<{ ticker: string; ok: boolean; attempts: number; error?: string }> = [];

    for (const row of rows) {
      const ticker = String(row.ticker).trim().toUpperCase();
      if (!ticker) continue;

      let attempts = 0;
      let lastError = "";
      let ok = false;

      while (attempts <= MAX_RETRIES && !ok) {
        attempts += 1;
        try {
          await ingestDailyPricesAndRefreshSnapshot(ticker);
          const snapshot = await query(
            `SELECT as_of_date
             FROM ${tables.priceScreenSnapshot}
             WHERE symbol = ?
             LIMIT 1`,
            [ticker],
          ) as Array<{ as_of_date?: string | null }>;
          await setPriceStatusReady(ticker, snapshot[0]?.as_of_date ?? null);
          ok = true;
        } catch (error) {
          lastError = (error as Error).message;
          if (attempts > MAX_RETRIES) {
            await setPriceStatusFailed(ticker, lastError);
          }
        }
      }

      results.push({
        ticker,
        ok,
        attempts,
        ...(ok ? {} : { error: lastError }),
      });
    }

    res.status(200).json({
      ok: true,
      scheduled_hint: "Recommended nightly schedule around 04:30 UTC (~05:30 CET)",
      total: results.length,
      ready: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
