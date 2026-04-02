import { query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";

export default async function handler(_req: any, res: any) {
  try {
    await ensureSchema();
    const rows = await query(
      `SELECT v2.ticker, COALESCE(c.name, v2.ticker) AS name
       FROM ${tables.companiesV2} v2
       LEFT JOIN ${tables.companies} c ON c.symbol = v2.ticker
       WHERE v2.active = 1
       ORDER BY v2.ticker`
    );
    const companies = rows.map((row: any) => ({
      ticker: String(row.ticker ?? "").toUpperCase(),
      name: String(row.name ?? row.ticker ?? ""),
    }));
    const tickers = companies.map((row) => row.ticker);
    res.status(200).json({ ok: true, tickers, companies });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
