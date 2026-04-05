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

    const debugMode = String(req.query?.debug ?? "") === "1";
    const positions = await listPortfolioPositions(portfolioId);
    const counts = await query(`SELECT COUNT(*) AS count FROM ${tables.portfolioPositions} WHERE portfolio_id = ?`, [portfolioId]);
    const totalPositions = Number(counts[0]?.count ?? 0);

    if (!debugMode) {
      res.status(200).json({ ok: true, positions, stats: { total_positions: totalPositions } });
      return;
    }

    const duplicateIds = positions
      .map((row) => row.id)
      .filter((id, index, all) => all.indexOf(id) !== index);
    const duplicateSymbols = await query(
      `SELECT symbol,
              COUNT(*) AS duplicate_count,
              GROUP_CONCAT(id) AS ids
       FROM ${tables.portfolioPositions}
       WHERE portfolio_id = ?
       GROUP BY symbol
       HAVING COUNT(*) > 1
       ORDER BY duplicate_count DESC, symbol ASC`,
      [portfolioId]
    );
    const explodedJoinRows = await query(
      `SELECT COUNT(*) AS joined_count
       FROM ${tables.portfolioPositions} p
       LEFT JOIN ${tables.companySectorMap} map ON map.company_id = p.company_id
       LEFT JOIN ${tables.companyCommodityOverride} commodity ON commodity.company_id = p.company_id
       WHERE p.portfolio_id = ?`,
      [portfolioId]
    );
    const rawIds = await query(
      `SELECT id
       FROM ${tables.portfolioPositions}
       WHERE portfolio_id = ?
       ORDER BY active_position DESC, updated_at DESC, id DESC`,
      [portfolioId]
    );

    res.status(200).json({
      ok: true,
      positions,
      stats: { total_positions: totalPositions },
      diagnostics: {
        portfolio_id: portfolioId,
        rendered_row_count: positions.length,
        stored_row_count: totalPositions,
        raw_row_id_count: rawIds.length,
        rendered_duplicate_row_ids: Array.from(new Set(duplicateIds)),
        old_join_row_count: Number(explodedJoinRows[0]?.joined_count ?? 0),
        same_symbol_rows: duplicateSymbols,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
