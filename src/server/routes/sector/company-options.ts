import { query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export default async function handler(req: any, res: any) {
  try {
    await ensureSchema();
    const sector = normalizeText(req.query?.sector);
    const subsector = normalizeText(req.query?.subsector);
    const rows = await query(
      `SELECT c.id AS company_id,
              c.ticker,
              base.name AS company_name,
              CASE
                WHEN map.company_id IS NULL THEN 0
                ELSE 1
              END AS is_mapped
       FROM ${tables.companiesV2} c
       LEFT JOIN ${tables.companies} base ON base.symbol = c.ticker
       LEFT JOIN ${tables.companySectorMap} map
         ON map.company_id = c.id
        AND (? = '' OR map.sector_id = ?)
        AND (? = '' OR map.subsector_id = ?)
       WHERE c.active = 1
       ORDER BY is_mapped DESC, c.ticker ASC`,
      [sector, sector, subsector, subsector]
    );

    res.status(200).json({
      ok: true,
      companies: rows.map((row: any) => ({
        companyId: String(row.company_id ?? ""),
        ticker: String(row.ticker ?? ""),
        name: row.company_name ? String(row.company_name) : null,
        isMapped: Number(row.is_mapped ?? 0) === 1,
      })).filter((item: any) => item.companyId && item.ticker),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
