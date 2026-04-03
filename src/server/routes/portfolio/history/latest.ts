import { query } from "../../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../../api/_migrate.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();

    const snapshotDateRows = await query(`SELECT MAX(as_of_date) AS as_of_date FROM ${tables.portfolioSnapshots}`);
    const latestSnapshotDate = String(snapshotDateRows[0]?.as_of_date ?? "").trim();

    const portfolios = latestSnapshotDate
      ? await query(
        `SELECT portfolio_id, as_of_date, return_20d, return_65d, return_200d,
                short_direction, medium_direction, long_direction,
                trend_status, relative_strength_bucket, debug_payload_json
         FROM ${tables.portfolioSnapshots}
         WHERE as_of_date = ?
         ORDER BY portfolio_id ASC`,
        [latestSnapshotDate]
      )
      : [];

    const totalDateRows = await query(`SELECT MAX(as_of_date) AS as_of_date FROM ${tables.totalPortfolioHistoryDaily}`);
    const latestTotalDate = String(totalDateRows[0]?.as_of_date ?? "").trim();

    const totalRows = latestTotalDate
      ? await query(
        `SELECT as_of_date, market_value, daily_return_pct, cumulative_return_pct, drawdown_pct, included_portfolio_count, data_quality
         FROM ${tables.totalPortfolioHistoryDaily}
         WHERE as_of_date = ?
         LIMIT 1`,
        [latestTotalDate]
      )
      : [];

    const total = totalRows[0] as any;
    const debug = String(req.query?.debug ?? "") === "1";

    res.status(200).json({
      ok: true,
      portfolios: portfolios.map((row: any) => ({
        portfolio_id: String(row.portfolio_id ?? ""),
        as_of_date: String(row.as_of_date ?? ""),
        return_20d: row.return_20d == null ? null : Number(row.return_20d),
        return_65d: row.return_65d == null ? null : Number(row.return_65d),
        return_200d: row.return_200d == null ? null : Number(row.return_200d),
        short_direction: String(row.short_direction ?? "unavailable"),
        medium_direction: String(row.medium_direction ?? "unavailable"),
        long_direction: String(row.long_direction ?? "unavailable"),
        trend_status: String(row.trend_status ?? "unavailable"),
        relative_strength_bucket: String(row.relative_strength_bucket ?? "unavailable"),
      })),
      total: {
        as_of_date: latestTotalDate || null,
        market_value: total?.market_value == null ? null : Number(total.market_value),
        daily_return_pct: total?.daily_return_pct == null ? null : Number(total.daily_return_pct),
        cumulative_return_pct: total?.cumulative_return_pct == null ? null : Number(total.cumulative_return_pct),
        drawdown_pct: total?.drawdown_pct == null ? null : Number(total.drawdown_pct),
      },
      ...(debug
        ? {
          diagnostics: {
            portfolios: portfolios.map((row: any) => {
              let trendDebug = null;
              if (typeof row.debug_payload_json === "string" && row.debug_payload_json.trim()) {
                try {
                  const parsed = JSON.parse(row.debug_payload_json);
                  trendDebug = parsed?.trend ?? null;
                } catch {
                  trendDebug = null;
                }
              }
              return {
                portfolio_id: String(row.portfolio_id ?? ""),
                ...(trendDebug ?? {}),
              };
            }),
            total: {
              included_portfolios: null,
              history_days_available: null,
              aggregation_source: null,
              data_quality: total?.data_quality ?? null,
              included_portfolio_count: total?.included_portfolio_count ?? null,
            },
          },
        }
        : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
