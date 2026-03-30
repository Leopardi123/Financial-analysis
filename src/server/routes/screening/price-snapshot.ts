import { query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { computePriceScreenSnapshot, type DailyPriceRow } from "../../../lib/prices/screening/snapshotEngine.js";

export default async function handler(req: any, res: any) {
  try {
    await ensureSchema();

    const symbol = typeof req.query?.symbol === "string" ? req.query.symbol.trim().toUpperCase() : "";
    const symbolsParam = typeof req.query?.symbols === "string" ? req.query.symbols : "";
    const debug = String(req.query?.debug ?? "") === "1";

    if (symbol) {
      const snapshotRows = await query(
        `SELECT * FROM ${tables.priceScreenSnapshot} WHERE symbol = ? LIMIT 1`,
        [symbol],
      );

      if (!debug) {
        res.status(200).json({ ok: true, symbol, snapshot: snapshotRows[0] ?? null });
        return;
      }

      const rows = await query(
        `SELECT symbol, price_date, close, adjusted_close, volume, source, currency
         FROM ${tables.dailyPriceHistory}
         WHERE symbol = ?
         ORDER BY price_date DESC
         LIMIT 120`,
        [symbol],
      ) as unknown as DailyPriceRow[];
      const ascRows = [...rows].sort((a, b) => a.price_date.localeCompare(b.price_date));
      const recomputed = computePriceScreenSnapshot(symbol, ascRows);

      res.status(200).json({
        ok: true,
        symbol,
        snapshot: snapshotRows[0] ?? null,
        debug: recomputed.debug,
      });
      return;
    }

    const explicitSymbols = symbolsParam
      .split(",")
      .map((item: string) => item.trim().toUpperCase())
      .filter(Boolean);

    const rows = explicitSymbols.length > 0
      ? await query(
        `SELECT s.*, c.name
         FROM ${tables.priceScreenSnapshot} s
         LEFT JOIN ${tables.companies} c ON c.symbol = s.symbol
         WHERE s.symbol IN (${explicitSymbols.map(() => "?").join(",")})
         ORDER BY s.symbol`,
        explicitSymbols,
      )
      : await query(
        `SELECT s.*, c.name
         FROM ${tables.priceScreenSnapshot} s
         LEFT JOIN ${tables.companies} c ON c.symbol = s.symbol
         ORDER BY s.symbol`,
      );

    res.status(200).json({ ok: true, rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
