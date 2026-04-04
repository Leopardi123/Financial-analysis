import { ensureSchema } from "../../../../../api/_migrate.js";
import { buildPortfolioHedgeAndDryPowder } from "../../../../lib/portfolio-hedge/build.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();
    const result = await buildPortfolioHedgeAndDryPowder();
    const debug = String(req.query?.debug ?? "") === "1";

    res.status(200).json({
      ok: true,
      portfolios: result.portfolios.map((row) => ({
        portfolio_id: row.portfolio_id,
        as_of_date: row.as_of_date,
        hedge_need_score: row.hedge_need_score,
        hedge_status: row.hedge_status,
        suggested_hedge_type: row.suggested_hedge_type,
        hedge_policy_applied: row.hedge_policy_applied,
      })),
      total: result.total,
      ...(debug ? { diagnostics: result.debug } : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
