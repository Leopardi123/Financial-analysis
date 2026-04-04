import { ensureSchema, tables } from "../../../../../api/_migrate.js";
import { query } from "../../../../../api/_db.js";
import { listPortfolioPositions } from "../../../../lib/portfolio-positions/repository.js";

export default async function handler(req: any, res: any) {
  try {
    await ensureSchema();
    const portfolioId = String(req.query?.portfolio_id ?? "").trim();
    if (!portfolioId) {
      res.status(400).json({ ok: false, error: "portfolio_id is required" });
      return;
    }

    const positions = await listPortfolioPositions(portfolioId);
    const counts = await query(`SELECT COUNT(*) AS count FROM ${tables.portfolioPositions} WHERE portfolio_id = ?`, [portfolioId]);
    res.status(200).json({ ok: true, positions, stats: { total_positions: Number(counts[0]?.count ?? 0) } });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
