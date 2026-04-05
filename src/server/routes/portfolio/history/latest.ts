import { query } from "../../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../../api/_migrate.js";
import { listPortfolioConfigs } from "../../../../lib/portfolio-admin/repository.js";

function computeLookbackReturn(values: number[], lookbackDays: number): number | null {
  if (values.length <= lookbackDays) return null;
  const latest = values[values.length - 1];
  const past = values[values.length - 1 - lookbackDays];
  if (!Number.isFinite(latest) || !Number.isFinite(past) || past === 0) return null;
  return ((latest / past) - 1) * 100;
}

function computeDirection(returnPct: number | null): string {
  if (typeof returnPct !== "number" || !Number.isFinite(returnPct)) return "unavailable";
  if (returnPct > 2.0) return "positive";
  if (returnPct < -2.0) return "negative";
  return "neutral";
}

function computeTrendStatus(shortDirection: string, mediumDirection: string, longDirection: string): string {
  if (shortDirection === "unavailable" && mediumDirection === "unavailable" && longDirection === "unavailable") {
    return "unavailable";
  }
  if (longDirection === "positive" && mediumDirection === "positive" && (shortDirection === "positive" || shortDirection === "neutral")) {
    return "strong_uptrend";
  }
  if (longDirection === "negative" && mediumDirection === "negative" && (shortDirection === "negative" || shortDirection === "neutral")) {
    return "downtrend";
  }
  if (shortDirection === "positive" && (mediumDirection === "positive" || mediumDirection === "neutral")) return "improving";
  if (shortDirection === "negative" && (mediumDirection === "negative" || mediumDirection === "neutral")) return "weakening";
  return "neutral";
}

function computeCompleteness(availableDays: number): "full" | "partial" | "unavailable" {
  if (availableDays >= 200) return "full";
  if (availableDays >= 65) return "partial";
  return "unavailable";
}

function buildUnavailableTrendDebugFromMetrics(metrics: {
  available_days: number;
  return_20d: number | null;
  return_65d: number | null;
  return_200d: number | null;
  short_direction: string;
  medium_direction: string;
  long_direction: string;
  trend_status: string;
  trend_completeness: string;
}) {
  const reason = metrics.available_days < 65 ? "insufficient_history" : "trend_debug_unavailable";
  return {
    attempted: true,
    available_days: metrics.available_days,
    return_20d: metrics.return_20d,
    return_65d: metrics.return_65d,
    return_200d: metrics.return_200d,
    short_direction: metrics.short_direction,
    medium_direction: metrics.medium_direction,
    long_direction: metrics.long_direction,
    trend_status: metrics.trend_status,
    trend_completeness: metrics.trend_completeness,
    reason,
  };
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();

    const configs = await listPortfolioConfigs();
    const portfolioIds = configs.map((row) => row.portfolio_id);
    const placeholders = portfolioIds.map(() => "?").join(", ");
    const historyRows = portfolioIds.length > 0
      ? await query(
        `SELECT portfolio_id, as_of_date, market_value
         FROM ${tables.portfolioHistoryDaily}
         WHERE portfolio_id IN (${placeholders}) AND market_value IS NOT NULL
         ORDER BY portfolio_id ASC, as_of_date ASC`,
        portfolioIds
      )
      : [];
    const snapshotDateRows = await query(`SELECT MAX(as_of_date) AS as_of_date FROM ${tables.portfolioSnapshots}`);
    const latestSnapshotDate = String(snapshotDateRows[0]?.as_of_date ?? "").trim();
    const snapshotDebugRows = latestSnapshotDate
      ? await query(
        `SELECT portfolio_id, debug_payload_json, relative_strength_bucket
         FROM ${tables.portfolioSnapshots}
         WHERE as_of_date = ?`,
        [latestSnapshotDate]
      )
      : [];
    const snapshotByPortfolio = new Map(
      (snapshotDebugRows as any[]).map((row) => [String(row.portfolio_id ?? ""), row])
    );
    const byPortfolio = new Map<string, Array<{ as_of_date: string; market_value: number }>>();
    for (const row of historyRows as any[]) {
      const portfolioId = String(row.portfolio_id ?? "");
      const asOfDate = String(row.as_of_date ?? "");
      const marketValue = Number(row.market_value ?? NaN);
      if (!portfolioId || !asOfDate || !Number.isFinite(marketValue) || marketValue <= 0) continue;
      const bucket = byPortfolio.get(portfolioId) ?? [];
      bucket.push({ as_of_date: asOfDate, market_value: marketValue });
      byPortfolio.set(portfolioId, bucket);
    }

    const portfolios = portfolioIds.map((portfolioId) => {
      const series = byPortfolio.get(portfolioId) ?? [];
      const values = series.map((point) => point.market_value);
      const availableDays = series.length;
      const return20d = computeLookbackReturn(values, 20);
      const return65d = computeLookbackReturn(values, 65);
      const return200d = computeLookbackReturn(values, 200);
      const shortDirection = computeDirection(return20d);
      const mediumDirection = computeDirection(return65d);
      const longDirection = computeDirection(return200d);
      const trendCompleteness = computeCompleteness(availableDays);
      const trendStatus = trendCompleteness === "unavailable"
        ? "unavailable"
        : computeTrendStatus(shortDirection, mediumDirection, longDirection);
      const snapshotRow = snapshotByPortfolio.get(portfolioId) as any;
      return {
        portfolio_id: portfolioId,
        as_of_date: series.length > 0 ? series[series.length - 1]?.as_of_date ?? "" : "",
        available_days: availableDays,
        return_20d: return20d,
        return_65d: return65d,
        return_200d: return200d,
        short_direction: shortDirection,
        medium_direction: mediumDirection,
        long_direction: longDirection,
        trend_status: trendStatus,
        trend_completeness: trendCompleteness,
        relative_strength_bucket: snapshotRow?.relative_strength_bucket == null ? "unavailable" : String(snapshotRow.relative_strength_bucket),
        debug_payload_json: snapshotRow?.debug_payload_json ?? null,
        first_history_date: series.length > 0 ? series[0]?.as_of_date ?? null : null,
        last_history_date: series.length > 0 ? series[series.length - 1]?.as_of_date ?? null : null,
      };
    });

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
    const lastBuildRows = await query(
      `SELECT last_success_at
       FROM ${tables.portfolioBuildMeta}
       WHERE pipeline_name = 'history'
       LIMIT 1`
    );
    const lastHistoryBuild = String(lastBuildRows[0]?.last_success_at ?? "").trim() || null;

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
        trend_completeness: String(row.trend_completeness ?? "unavailable"),
        available_days: Number(row.available_days ?? 0),
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
                ...(trendDebug ?? buildUnavailableTrendDebugFromMetrics({
                  available_days: Number(row.available_days ?? 0),
                  return_20d: row.return_20d == null ? null : Number(row.return_20d),
                  return_65d: row.return_65d == null ? null : Number(row.return_65d),
                  return_200d: row.return_200d == null ? null : Number(row.return_200d),
                  short_direction: String(row.short_direction ?? "unavailable"),
                  medium_direction: String(row.medium_direction ?? "unavailable"),
                  long_direction: String(row.long_direction ?? "unavailable"),
                  trend_status: String(row.trend_status ?? "unavailable"),
                  trend_completeness: String(row.trend_completeness ?? "unavailable"),
                })),
                first_history_date: row.first_history_date ?? null,
                last_history_date: row.last_history_date ?? null,
              };
            }),
            total: {
              included_portfolios: null,
              history_days_available: Number((await query(`SELECT COUNT(*) AS count FROM ${tables.totalPortfolioHistoryDaily}`))[0]?.count ?? 0),
              aggregation_source: "portfolio_history_daily_aggregation",
              daily_return_pct: total?.daily_return_pct == null ? null : Number(total.daily_return_pct),
              cumulative_return_pct: total?.cumulative_return_pct == null ? null : Number(total.cumulative_return_pct),
              drawdown_pct: total?.drawdown_pct == null ? null : Number(total.drawdown_pct),
              data_quality: total?.data_quality ?? null,
              included_portfolio_count: total?.included_portfolio_count ?? null,
              last_history_build: lastHistoryBuild,
              contributing_portfolio_ids: portfolios
                .filter((row: any) => String(row.as_of_date ?? "") === latestTotalDate)
                .map((row: any) => String(row.portfolio_id ?? "")),
            },
          },
        }
        : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
