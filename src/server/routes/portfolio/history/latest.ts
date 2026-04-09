import { ensureSchema } from "../../../../../api/_migrate.js";
import { readPortfolioHistoryCanonicalLatest } from "../../../../lib/portfolio-history/canonical.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }
    await ensureSchema();
    const debug = String(req.query?.debug ?? "") === "1";
    const canonical = await readPortfolioHistoryCanonicalLatest();

    const portfolios = canonical.portfolios.map((p) => ({
      portfolio_id: p.portfolio_id,
      portfolio_name: p.portfolio_name,
      latest_date: p.last_history_date,
      latest_value_sek: p.latest_value_sek,
      return_20d: p.return_20d,
      return_65d: p.return_65d,
      return_200d: p.return_200d,
      return_20d_valid: p.return_20d_valid,
      return_65d_valid: p.return_65d_valid,
      return_200d_valid: p.return_200d_valid,
      invalid_reason_20d: p.invalid_reason_20d,
      invalid_reason_65d: p.invalid_reason_65d,
      invalid_reason_200d: p.invalid_reason_200d,
      short_direction: p.short_direction,
      medium_direction: p.medium_direction,
      long_direction: p.long_direction,
      trend_status: p.trend_status,
      trend_completeness: p.trend_completeness,
      data_quality: p.data_quality,
      consistency_hash: p.consistency_hash,
    }));

    const mismatches = portfolios.flatMap((p) => {
      const trace = canonical.portfolios.find((x) => x.portfolio_id === p.portfolio_id);
      if (!trace) return [`missing_trace:${p.portfolio_id}`];
      const reasons: string[] = [];
      if (p.latest_value_sek !== trace.latest_value_sek) reasons.push("latest_value_mismatch");
      if (p.return_65d !== trace.return_65d) reasons.push("return_65d_mismatch");
      if (p.trend_completeness !== trace.trend_completeness) reasons.push("trend_completeness_mismatch");
      return reasons.map((r) => `${p.portfolio_id}:${r}`);
    });

    res.status(200).json({
      ok: true,
      canonical_source_version: canonical.canonical_source_version,
      date_rule: canonical.date_rule,
      continuity_rule: canonical.continuity_rule,
      total_aggregation_rule: canonical.total_aggregation_rule,
      portfolios,
      total: canonical.total,
      ...(debug
        ? {
          diagnostics: {
            canonical,
            mismatch_flag: mismatches.length > 0,
            mismatch_reasons: mismatches,
            latest_trace_match: mismatches.length === 0,
            latest_card_match: null,
            ui_value_match: null,
          },
        }
        : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
