import { query } from "../../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../../api/_migrate.js";
import { buildPortfolioHistory, loadPortfolioConfigsForHistoryBuild } from "../../../../lib/portfolio-history/build.js";

function maskDatabaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname || "unknown";
    return `${url.protocol}//***@${host}${url.pathname}`;
  } catch {
    return "***";
  }
}

function detectRuntimeEnvironment(): string {
  const vercelEnv = String(process.env.VERCEL_ENV ?? "").trim();
  if (vercelEnv) return `vercel:${vercelEnv}`;
  const nodeEnv = String(process.env.NODE_ENV ?? "").trim();
  return nodeEnv ? `node:${nodeEnv}` : "unknown";
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();
    const portfolioSource = await loadPortfolioConfigsForHistoryBuild();
    const portfoliosBeforeFilter = portfolioSource.portfolios;
    const portfoliosAfterFilter = portfolioSource.portfolios;
    const result = await buildPortfolioHistory();
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
      query_used: `SELECT * FROM ${portfolioSource.source_table_used}`,
      database_url: maskDatabaseUrl(process.env.TURSO_DATABASE_URL),
      runtime_environment: detectRuntimeEnvironment(),
      filters_applied: portfolioSource.filters_applied,
      history_rows_written: Number(historyStats?.rows_written ?? 0),
      total_rows_written: Number(totalStats?.rows_written ?? 0),
      earliest_date: earliestDate,
      latest_date: latestDate,
      last_history_build: lastHistoryBuild,
      warnings,
      portfolios: result.portfolios.map((row) => ({
        portfolio_id: row.portfolio_id,
        available_days: row.available_days,
        history_source: row.history_source,
        return_20d: row.return_20d,
        return_65d: row.return_65d,
        return_200d: row.return_200d,
        short_direction: row.short_direction,
        medium_direction: row.medium_direction,
        long_direction: row.long_direction,
        trend_status: row.trend_status,
        trend_completeness: row.trend_completeness,
        relative_strength_rank: row.relative_strength_rank,
        relative_strength_bucket: row.relative_strength_bucket,
        data_quality: row.data_quality,
      })),
      total: result.total,
      notes: {
        manual_rebuild_executed: true,
        cron_invokes_history_build: false,
      },
      ...(debug ? { diagnostics: result } : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
