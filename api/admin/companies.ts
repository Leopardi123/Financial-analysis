import { assertCronSecret } from "../_auth.js";
import { execute } from "../_db";

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

    const tickers = normalizeTickers(req.body?.tickers);
    if (tickers.length === 0) {
      res.status(400).json({ ok: false, error: "No tickers provided" });
      return;
    }

    for (const ticker of tickers) {
      await execute(
        `INSERT INTO companies (ticker, active)
         VALUES (?, 1)
         ON CONFLICT(ticker) DO UPDATE SET active = 1`,
        [ticker]
      );
    }

    res.status(200).json({ ok: true, count: tickers.length });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
