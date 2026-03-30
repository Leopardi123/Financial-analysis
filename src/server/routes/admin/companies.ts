import { assertAdminSecret } from "../../../../api/_auth.js";
import { execute, query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { ingestDailyPricesAndRefreshSnapshot } from "../../../lib/prices/screening/ingest.js";
import { setPriceStatusFailed, setPriceStatusPending, setPriceStatusReady } from "../../../lib/prices/screening/status.js";

function normalizeTickers(tickers: unknown): string[] {
  if (!Array.isArray(tickers)) {
    return [];
  }
  return tickers
    .map((ticker) => (typeof ticker === "string" ? ticker.trim().toUpperCase() : ""))
    .filter(Boolean);
}

export default async function handler(req: any, res: any) {
  try {
    assertAdminSecret(req);

    await ensureSchema();
    const tickers = normalizeTickers(req.body?.tickers);
    if (tickers.length === 0) {
      res.status(400).json({ ok: false, error: "No tickers provided" });
      return;
    }

    const existingRows = await query(
      `SELECT ticker FROM ${tables.companiesV2}
       WHERE ticker IN (${tickers.map(() => "?").join(", ")})`,
      tickers,
    ) as unknown as Array<{ ticker: string }>;
    const existingSet = new Set(existingRows.map((row) => String(row.ticker).toUpperCase()));
    const newTickers = tickers.filter((ticker) => !existingSet.has(ticker));

    for (const ticker of tickers) {
      await execute(
        `INSERT INTO ${tables.companiesV2} (ticker, active)
         VALUES (?, 1)
         ON CONFLICT(ticker) DO UPDATE SET active = 1`,
        [ticker]
      );
      if (newTickers.includes(ticker)) {
        await setPriceStatusPending(ticker);
      }
    }

    const priceInit: Array<{ ticker: string; status: "ready" | "failed"; note?: string }> = [];
    for (const ticker of newTickers) {
      try {
        const ingest = await ingestDailyPricesAndRefreshSnapshot(ticker);
        const snapshotDateRows = await query(
          `SELECT as_of_date
           FROM ${tables.priceScreenSnapshot}
           WHERE symbol = ?
           LIMIT 1`,
          [ticker],
        ) as Array<{ as_of_date?: string | null }>;
        const asOfDate = snapshotDateRows[0]?.as_of_date ?? null;
        await setPriceStatusReady(ticker, asOfDate);
        priceInit.push({ ticker, status: "ready", note: `inserted=${ingest.inserted}, updated=${ingest.updated}, unchanged=${ingest.unchanged}` });
      } catch (error) {
        const message = (error as Error).message;
        await setPriceStatusFailed(ticker, message);
        priceInit.push({ ticker, status: "failed", note: message });
      }
    }

    const rows = await query(
      `SELECT COUNT(*) as count FROM ${tables.companiesV2} WHERE ticker IN (${tickers
        .map(() => "?")
        .join(", ")})`,
      tickers
    );

    res.status(200).json({ ok: true, count: Number(rows[0]?.count ?? tickers.length), newTickers, priceInit });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
