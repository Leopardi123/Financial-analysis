import { execute, query } from "../_db.js";
import { ensureSchema, tables } from "../_migrate.js";

function normalizeName(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

async function ensureSector(name: string) {
  const now = new Date().toISOString();
  await execute(
    `INSERT OR IGNORE INTO ${tables.sectors} (name, created_at) VALUES (?, ?)`,
    [name, now]
  );
  const rows = await query(`SELECT id, name FROM ${tables.sectors} WHERE name = ?`, [name]);
  return rows[0] as { id: number; name: string } | undefined;
}

async function ensureSubsector(sectorId: number, name: string) {
  const now = new Date().toISOString();
  await execute(
    `INSERT OR IGNORE INTO ${tables.subsectors} (sector_id, name, created_at) VALUES (?, ?, ?)`,
    [sectorId, name, now]
  );
  const rows = await query(
    `SELECT id, name FROM ${tables.subsectors} WHERE sector_id = ? AND name = ?`,
    [sectorId, name]
  );
  return rows[0] as { id: number; name: string } | undefined;
}

export default async function handler(req: any, res: any) {
  try {
    await ensureSchema();
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    const sectorName = normalizeName(req.body?.sector);
    const subsectorName = normalizeName(req.body?.subsector);
    const tickers = Array.isArray(req.body?.tickers) ? req.body.tickers : [];

    if (!sectorName || tickers.length === 0) {
      res.status(400).json({ ok: false, error: "Sector and tickers are required" });
      return;
    }

    const sector = await ensureSector(sectorName);
    if (!sector?.id) {
      res.status(500).json({ ok: false, error: "Failed to resolve sector" });
      return;
    }
    const subsector = subsectorName ? await ensureSubsector(sector.id, subsectorName) : null;

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
        `INSERT OR IGNORE INTO ${tables.companySectorMap} (company_id, sector_id, subsector_id, created_at)
         VALUES (?, ?, ?, ?)`,
        [companyId, sector.id, subsector?.id ?? null, now]
      );
      results.push({ ticker, status: "mapped" });
    }

    res.status(200).json({
      ok: true,
      sector,
      subsector,
      mapped: results.filter((result) => result.status === "mapped").length,
      results,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
