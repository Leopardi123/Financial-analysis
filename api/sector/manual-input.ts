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
    if (req.method === "GET") {
      const sectorName = normalizeName(req.query?.sector);
      const subsectorName = normalizeName(req.query?.subsector);
      if (!sectorName) {
        res.status(400).json({ ok: false, error: "Sector is required" });
        return;
      }
      const sector = await ensureSector(sectorName);
      if (!sector?.id) {
        res.status(500).json({ ok: false, error: "Failed to resolve sector" });
        return;
      }
      const subsector = subsectorName ? await ensureSubsector(sector.id, subsectorName) : null;
      const rows = await query(
        `SELECT input_type, value, source, note, created_at
         FROM ${tables.sectorManualInputs}
         WHERE sector_id = ? AND (subsector_id IS ? OR subsector_id = ?)
         ORDER BY created_at DESC`,
        [sector.id, subsector?.id ?? null, subsector?.id ?? null]
      );
      res.status(200).json({ ok: true, sector, subsector, inputs: rows });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    const sectorName = normalizeName(req.body?.sector);
    const subsectorName = normalizeName(req.body?.subsector);
    const inputType = normalizeName(req.body?.inputType);
    const value = normalizeName(req.body?.value);
    const source = normalizeName(req.body?.source);
    const note = normalizeName(req.body?.note);

    if (!sectorName || !inputType || !value) {
      res.status(400).json({ ok: false, error: "Sector, inputType, and value are required" });
      return;
    }

    const sector = await ensureSector(sectorName);
    if (!sector?.id) {
      res.status(500).json({ ok: false, error: "Failed to resolve sector" });
      return;
    }
    const subsector = subsectorName ? await ensureSubsector(sector.id, subsectorName) : null;
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO ${tables.sectorManualInputs}
       (sector_id, subsector_id, input_type, value, source, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sector.id, subsector?.id ?? null, inputType, value, source || null, note || null, now]
    );

    res.status(200).json({ ok: true, sector, subsector, inputType, value, source, note, createdAt: now });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
