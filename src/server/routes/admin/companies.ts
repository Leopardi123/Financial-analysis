import { assertCronSecret } from "../../../../api/_auth.js";
import { execute, query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";

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
    assertCronSecret(req);

    await ensureSchema();
    const tickers = normalizeTickers(req.body?.tickers);
    if (tickers.length === 0) {
      res.status(400).json({ ok: false, error: "No tickers provided" });
      return;
    }

    for (const ticker of tickers) {
      await execute(
        `INSERT INTO ${tables.companiesV2} (ticker, active)
         VALUES (?, 1)
         ON CONFLICT(ticker) DO UPDATE SET active = 1`,
        [ticker]
      );
    }

    const rows = await query(
      `SELECT COUNT(*) as count FROM ${tables.companiesV2} WHERE ticker IN (${tickers
        .map(() => "?")
        .join(", ")})`,
      tickers
    );

    res.status(200).json({ ok: true, count: Number(rows[0]?.count ?? tickers.length) });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
