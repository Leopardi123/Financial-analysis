import { query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";

export default async function handler(_req: any, res: any) {
  try {
    await ensureSchema();
    const rows = await query(
      `SELECT ticker FROM (
         SELECT ticker AS ticker
         FROM ${tables.companiesV2}
         WHERE active = 1
         UNION
         SELECT symbol AS ticker
         FROM ${tables.companies}
         UNION
         SELECT symbol AS ticker
         FROM ${tables.priceScreenSnapshot}
       )
       ORDER BY ticker`
    );
    const tickers = rows
      .map((row: any) => String(row.ticker ?? "").trim().toUpperCase())
      .filter(Boolean);
    res.status(200).json({ ok: true, tickers });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
