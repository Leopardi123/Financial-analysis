import { query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";

export default async function handler(_req: any, res: any) {
  try {
    await ensureSchema();
    const q = String(_req.query?.q ?? "").trim().toUpperCase();
    const rawLimit = Number(_req.query?.limit ?? 0);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 500) : null;
    const slim = String(_req.query?.slim ?? "") === "1";
    const whereSql = q
      ? `WHERE v2.active = 1 AND (UPPER(v2.ticker) LIKE ? OR UPPER(COALESCE(c.name, v2.ticker)) LIKE ?)`
      : `WHERE v2.active = 1`;
    const args: Array<string | number> = q ? [`%${q}%`, `%${q}%`] : [];
    const limitSql = limit ? ` LIMIT ?` : "";
    if (limit) args.push(limit);
    const rows = await query(
      `SELECT v2.ticker, COALESCE(c.name, v2.ticker) AS name
       FROM ${tables.companiesV2} v2
       LEFT JOIN ${tables.companies} c ON c.symbol = v2.ticker
       ${whereSql}
       ORDER BY v2.ticker${limitSql}`,
      args
    );
    const companies = rows.map((row: any) => ({
      ticker: String(row.ticker ?? "").toUpperCase(),
      name: String(row.name ?? row.ticker ?? ""),
    }));
    const tickers = companies.map((row) => row.ticker);
    res.status(200).json(slim ? { ok: true, tickers } : { ok: true, tickers, companies });
  } catch (error) {
    const debugMode = String(_req.query?.debug ?? "") === "1";
    const debugMessage = (error as Error).message;
    res.status(500).json({
      ok: false,
      error: {
        type: "data_access_error",
        message: "Company universe is temporarily unavailable.",
        ...(debugMode ? { debugMessage } : {}),
      },
    });
  }
}
