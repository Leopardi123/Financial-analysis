import { ensureSchema } from "../../../../../api/_migrate.js";
import { getLatestPortfolioRisk } from "../../../../lib/portfolio-risk/build.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();
    const result = await getLatestPortfolioRisk();
    const debug = String(req.query?.debug ?? "") === "1";

    res.status(200).json({
      ok: true,
      portfolios: result.portfolios.map((row) => ({
        portfolio_id: row.portfolio_id,
        as_of_date: row.as_of_date,
        annualized_vol_65d: row.annualized_vol_65d,
        current_drawdown_pct: row.current_drawdown_pct,
        top_holding_weight_pct: row.top_holding_weight_pct,
        cyclicality_score: row.cyclicality_score,
        volatility_component_score: row.volatility_component_score,
        drawdown_component_score: row.drawdown_component_score,
        concentration_component_score: row.concentration_component_score,
        cyclicality_component_score: row.cyclicality_component_score,
        risk_score: row.risk_score,
        risk_status: row.risk_status,
        risk_mismatch_flag: row.risk_mismatch_flag,
      })),
      total: result.total,
      ...(debug ? { diagnostics: result.debug } : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
