import { query } from "../../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../../api/_migrate.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();
    const portfolioId = String(req.query?.portfolio_id ?? "").trim();
    if (!portfolioId) {
      res.status(400).json({ ok: false, error: "portfolio_id query parameter is required" });
      return;
    }

    const rows = await query(
      `SELECT portfolio_id, as_of_date, total_return_index, market_value, daily_return_pct, cumulative_return_pct,
              drawdown_pct, cash_weight_pct, data_source, data_quality
       FROM ${tables.portfolioHistoryDaily}
       WHERE portfolio_id = ?
       ORDER BY as_of_date ASC`,
      [portfolioId]
    );

    const debug = String(req.query?.debug ?? "") === "1";

    res.status(200).json({
      ok: true,
      portfolio_id: portfolioId,
      series: rows,
      ...(debug
        ? {
          diagnostics: {
            history_source: rows.length > 0 ? String((rows[rows.length - 1] as any).data_source ?? "unavailable") : "unavailable",
            available_days: rows.length,
            data_quality: rows.length > 0 ? String((rows[rows.length - 1] as any).data_quality ?? "partial") : "partial",
          },
        }
        : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
