import { query } from "../../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../../api/_migrate.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();
    const rows = await query(
      `SELECT as_of_date, total_return_index, market_value, daily_return_pct, cumulative_return_pct,
              drawdown_pct, total_cash_value, total_cash_weight_pct, included_portfolio_count, data_quality
       FROM ${tables.totalPortfolioHistoryDaily}
       ORDER BY as_of_date ASC`
    );

    const debug = String(req.query?.debug ?? "") === "1";

    res.status(200).json({
      ok: true,
      series: rows,
      ...(debug
        ? {
          diagnostics: {
            history_days_available: rows.length,
            aggregation_source: "positions_or_snapshots",
            data_quality: rows.length > 0 ? String((rows[rows.length - 1] as any).data_quality ?? "partial") : "partial",
          },
        }
        : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
