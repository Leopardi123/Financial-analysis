import { ensureSchema } from "../../../../../api/_migrate.js";
import { buildPortfolioSnapshots } from "../../../../lib/portfolio-snapshots/build.js";
import { buildPortfolioHistory } from "../../../../lib/portfolio-history/build.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();
    const result = await buildPortfolioSnapshots();
    const historyResult = await buildPortfolioHistory();
    const debug = String(req.query?.debug ?? "") === "1";

    res.status(200).json({
      ok: true,
      as_of_date: result.as_of_date,
      portfolios: result.portfolios.map((item) => ({
        portfolio_id: item.portfolio_id,
        market_value: item.market_value,
        actual_weight_pct: item.actual_weight_pct,
        target_weight_pct: item.target_weight_pct,
        min_weight_pct: item.min_weight_pct,
        max_weight_pct: item.max_weight_pct,
        weight_status: item.weight_status,
        rebalance_status: item.rebalance_status,
      })),
      total: {
        total_market_value: result.total_market_value,
        allocation_plan_status: result.allocation_plan_status,
      },
      ...(debug ? { diagnostics: { snapshots: result.debug, history: historyResult } } : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
