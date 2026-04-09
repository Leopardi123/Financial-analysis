import { query } from "../../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../../api/_migrate.js";
import { loadPortfolioConfigsForHistoryBuild } from "../../../../lib/portfolio-history/build.js";
import { materializePortfolioHistoryCanonical } from "../../../../lib/portfolio-history/canonical.js";

export default async function handler(req: any, res: any) {
  let stage:
    | "start_stage"
    | "schema_stage"
    | "load_config_stage"
    | "write_stage"
    | "completion_stage"
    | "timeout_stage"
    | "error_stage" = "start_stage";
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    stage = "schema_stage";
    await ensureSchema();
    stage = "load_config_stage";
    const portfolioSource = await loadPortfolioConfigsForHistoryBuild();
    const portfoliosBeforeFilter = portfolioSource.portfolios;
    const portfoliosAfterFilter = portfolioSource.portfolios;
    stage = "write_stage";
    const result = await materializePortfolioHistoryCanonical();
    stage = "completion_stage";
    const debug = String(req.query?.debug ?? "") === "1";
    const [historyStatsRows, totalStatsRows, lastBuildRows] = await Promise.all([
      query(
        `SELECT COUNT(*) AS rows_written,
                MIN(as_of_date) AS earliest_date,
                MAX(as_of_date) AS latest_date
         FROM ${tables.portfolioHistoryDaily}`
      ),
      query(
        `SELECT COUNT(*) AS rows_written,
                MIN(as_of_date) AS earliest_date,
                MAX(as_of_date) AS latest_date
         FROM ${tables.totalPortfolioHistoryDaily}`
      ),
      query(
        `SELECT last_success_at
         FROM ${tables.portfolioBuildMeta}
         WHERE pipeline_name = 'history'
         LIMIT 1`
      ),
    ]);
    const historyStats = historyStatsRows[0] as any;
    const totalStats = totalStatsRows[0] as any;
    const lastHistoryBuild = String(lastBuildRows[0]?.last_success_at ?? "").trim() || null;
    const warnings: string[] = [];
    if (portfoliosAfterFilter.length > 0 && result.portfolios.length === 0) {
      warnings.push("portfolio_processing_mismatch: portfolio_admin_config has rows but build returned 0 processed portfolios");
    }
    const earliestDate = [String(historyStats?.earliest_date ?? "").trim(), String(totalStats?.earliest_date ?? "").trim()]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))[0] ?? null;
    const latestDate = [String(historyStats?.latest_date ?? "").trim(), String(totalStats?.latest_date ?? "").trim()]
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0] ?? null;

    res.status(200).json({
      ok: true,
      status: "success",
      route: "/api/portfolio/history/build",
      portfolios_processed: result.portfolios.length,
      portfolios_found_before_filter: portfoliosBeforeFilter.length,
      portfolios_after_filter: portfoliosAfterFilter.length,
      source_table_used: portfolioSource.source_table_used,
      query_used: portfolioSource.query_used,
      database_url: portfolioSource.db_url_masked,
      runtime_environment: portfolioSource.runtime_env,
      filters_applied: portfolioSource.filters_applied,
      history_rows_written: Number(historyStats?.rows_written ?? 0),
      total_rows_written: Number(totalStats?.rows_written ?? 0),
      earliest_date: earliestDate,
      latest_date: latestDate,
      last_history_build: lastHistoryBuild,
      warnings,
      portfolios: result.portfolios.map((row) => ({
        portfolio_id: row.portfolio_id,
        available_days: row.daily_series.length,
        history_source: "canonical_v2",
        return_20d: row.return_20d,
        return_65d: row.return_65d,
        return_200d: row.return_200d,
        short_direction: row.short_direction,
        medium_direction: row.medium_direction,
        long_direction: row.long_direction,
        trend_status: row.trend_status,
        trend_completeness: row.trend_completeness,
        relative_strength_rank: null,
        relative_strength_bucket: null,
        data_quality: row.data_quality,
      })),
      total: result.total,
      notes: {
        manual_rebuild_executed: true,
        cron_invokes_history_build: false,
      },
      ...(debug
        ? {
          diagnostics: {
            ...result,
            route_debug: {
              start_stage: "start_stage",
              write_stage: "write_stage",
              completion_stage: "completion_stage",
              current_stage: stage,
              timeout_stage: null,
            },
          },
        }
        : {}),
    });
  } catch (error) {
    stage = (error as Error).message.includes("timeout") ? "timeout_stage" : "error_stage";
    res.status(500).json({
      ok: false,
      error: (error as Error).message,
      route_debug: {
        start_stage: "start_stage",
        write_stage: "write_stage",
        completion_stage: "completion_stage",
        current_stage: stage,
        timeout_stage: stage === "timeout_stage" ? "timeout_stage" : null,
      },
    });
  }
}
