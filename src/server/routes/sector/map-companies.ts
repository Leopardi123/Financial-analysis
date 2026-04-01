import { execute, query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { assertAdminSecret } from "../../../../api/_auth.js";
import { ensureCanonicalSelectionRows } from "./canonicalTaxonomy.js";

function normalizeName(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export default async function handler(req: any, res: any) {
  try {
    await ensureSchema();
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }
    assertAdminSecret(req);

    const sectorName = normalizeName(req.body?.sector);
    const subsectorName = normalizeName(req.body?.subsector);
    const tickers = Array.isArray(req.body?.tickers) ? req.body.tickers : [];
    // category is non-canonical metadata.
    // Do NOT use for stage, exposure, or sector classification.
    const categoryMetadata = normalizeName(req.body?.category);

    if (!sectorName || tickers.length === 0) {
      res.status(400).json({ ok: false, error: "Canonical sector id and tickers are required" });
      return;
    }

    const resolvedRows = await ensureCanonicalSelectionRows(sectorName, subsectorName || null);

    const results: Array<{ ticker: string; status: string }> = [];
    const now = new Date().toISOString();

    for (const rawTicker of tickers) {
      const ticker = normalizeName(rawTicker).toUpperCase();
      if (!ticker) {
        continue;
      }
      const rows = await query(`SELECT id FROM ${tables.companiesV2} WHERE ticker = ?`, [ticker]);
      const companyId = Number(rows[0]?.id ?? 0);
      if (!companyId) {
        results.push({ ticker, status: "missing_company" });
        continue;
      }
      await execute(
        `INSERT OR IGNORE INTO ${tables.companySectorMap} (company_id, sector_id, subsector_id, category, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [companyId, resolvedRows.sector.id, resolvedRows.subsector?.id ?? null, categoryMetadata || null, now]
      );
      results.push({ ticker, status: "mapped" });
    }

    res.status(200).json({
      ok: true,
      sector: resolvedRows.sector,
      subsector: resolvedRows.subsector,
      canonical: resolvedRows.canonical,
      mapped: results.filter((result) => result.status === "mapped").length,
      results,
    });
  } catch (error) {
    const message = (error as Error).message;
    const status = message === "Unauthorized"
      ? 401
      : (/Unknown canonical|is not part of sector/.test(message) ? 400 : 500);
    res.status(status).json({ ok: false, error: status === 401 ? "Unauthorized: invalid admin password." : message });
  }
}
