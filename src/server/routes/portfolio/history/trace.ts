import { ensureSchema } from "../../../../../api/_migrate.js";
import { readPortfolioHistoryCanonicalTrace } from "../../../../lib/portfolio-history/canonical.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }
    const portfolioId = String(req.query?.portfolio_id ?? "").trim();
    if (!portfolioId) {
      res.status(400).json({ ok: false, error: "portfolio_id is required" });
      return;
    }
    await ensureSchema();

    const compactMode = String(req.query?.compact_mode ?? "0") === "1";
    const fullMode = String(req.query?.full_mode ?? "0") === "1";
    const includePositions = String(req.query?.include_positions ?? "1") !== "0";
    const limitDaysRaw = Number(req.query?.limit_days ?? (fullMode ? 520 : 260));
    const limitDays = Number.isFinite(limitDaysRaw) ? Math.max(20, Math.min(2000, Math.floor(limitDaysRaw))) : 260;

    const { bundle, portfolio } = await readPortfolioHistoryCanonicalTrace(portfolioId);
    if (!portfolio) {
      res.status(404).json({ ok: false, error: `Unknown portfolio_id: ${portfolioId}` });
      return;
    }

    const limitedSeries = portfolio.daily_series.length > limitDays
      ? portfolio.daily_series.slice(portfolio.daily_series.length - limitDays)
      : portfolio.daily_series;

    const latestView = bundle.portfolios.find((p) => p.portfolio_id === portfolioId);
    const consistencyChecks = {
      latest_value_match: latestView?.latest_value_sek === portfolio.latest_value_sek,
      return_20d_match: latestView?.return_20d === portfolio.return_20d,
      return_65d_match: latestView?.return_65d === portfolio.return_65d,
      trend_completeness_match: latestView?.trend_completeness === portfolio.trend_completeness,
    };

    res.status(200).json({
      ok: true,
      canonical_source_version: bundle.canonical_source_version,
      portfolio_meta: {
        portfolio_id: portfolio.portfolio_id,
        portfolio_name: portfolio.portfolio_name,
        first_history_date: portfolio.first_history_date,
        last_history_date: portfolio.last_history_date,
        latest_value_sek: portfolio.latest_value_sek,
        data_quality: portfolio.data_quality,
      },
      raw_positions: includePositions ? {
        positions_included: portfolio.inclusion_debug.positions_included,
        positions_excluded: portfolio.inclusion_debug.positions_excluded,
        exclusion_reasons: portfolio.inclusion_debug.exclusion_reasons,
      } : undefined,
      raw_price_coverage_summary: {
        price_rows_found_in_db: portfolio.db_evidence.price_rows_found_in_db,
        first_db_price_date: portfolio.db_evidence.first_db_price_date,
        last_db_price_date: portfolio.db_evidence.last_db_price_date,
      },
      raw_fx_coverage_summary: {
        fx_rows_found_in_db: portfolio.db_evidence.fx_rows_found_in_db,
        first_db_fx_date: portfolio.db_evidence.first_db_fx_date,
        last_db_fx_date: portfolio.db_evidence.last_db_fx_date,
      },
      canonical_daily_portfolio_series: compactMode ? limitedSeries.map((d) => ({ date: d.date, market_value_sek: d.market_value_sek })) : limitedSeries,
      anchor_selection: {
        anchor_20d_date: portfolio.anchor_20d_date,
        anchor_65d_date: portfolio.anchor_65d_date,
        anchor_200d_date: portfolio.anchor_200d_date,
        anchor_20d_value_sek: portfolio.anchor_20d_value_sek,
        anchor_65d_value_sek: portfolio.anchor_65d_value_sek,
        anchor_200d_value_sek: portfolio.anchor_200d_value_sek,
      },
      return_validity_decisions: {
        return_20d: portfolio.return_20d,
        return_65d: portfolio.return_65d,
        return_200d: portfolio.return_200d,
        return_20d_valid: portfolio.return_20d_valid,
        return_65d_valid: portfolio.return_65d_valid,
        return_200d_valid: portfolio.return_200d_valid,
        invalid_reason_20d: portfolio.invalid_reason_20d,
        invalid_reason_65d: portfolio.invalid_reason_65d,
        invalid_reason_200d: portfolio.invalid_reason_200d,
      },
      cumulative_return_steps: {
        formula: "((latest/first)-1)*100",
        cumulative_return_pct: portfolio.cumulative_return_pct,
      },
      drawdown_steps: {
        formula: "((value_t/running_peak_t)-1)*100",
        drawdown_pct: portfolio.drawdown_pct,
      },
      inclusion_exclusion_reasons: portfolio.inclusion_debug,
      db_evidence: portfolio.db_evidence,
      consistency_checks_vs_latest_payload: consistencyChecks,
      consistency_hash: portfolio.consistency_hash,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
