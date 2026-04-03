import { ensureSchema } from "../../../../../api/_migrate.js";
import { buildPortfolioHistory } from "../../../../lib/portfolio-history/build.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();
    const result = await buildPortfolioHistory();
    const debug = String(req.query?.debug ?? "") === "1";

    res.status(200).json({
      ok: true,
      portfolios: result.portfolios.map((row) => ({
        portfolio_id: row.portfolio_id,
        return_20d: row.return_20d,
        return_65d: row.return_65d,
        return_200d: row.return_200d,
        short_direction: row.short_direction,
        medium_direction: row.medium_direction,
        long_direction: row.long_direction,
        trend_status: row.trend_status,
        relative_strength_bucket: row.relative_strength_bucket,
      })),
      ...(debug ? { diagnostics: result } : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
