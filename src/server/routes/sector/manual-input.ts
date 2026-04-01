import { execute, query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
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
    if (req.method === "GET") {
      const sectorName = normalizeName(req.query?.sector);
      const subsectorName = normalizeName(req.query?.subsector);
      if (!sectorName) {
        res.status(400).json({ ok: false, error: "Canonical sector id is required" });
        return;
      }

      const resolvedRows = await ensureCanonicalSelectionRows(sectorName, subsectorName || null);
      const rows = await query(
        `SELECT input_type, value, source, note, created_at
         FROM ${tables.sectorManualInputs}
         WHERE sector_id = ? AND (subsector_id IS ? OR subsector_id = ?)
         ORDER BY created_at DESC`,
        [resolvedRows.sector.id, resolvedRows.subsector?.id ?? null, resolvedRows.subsector?.id ?? null]
      );
      res.status(200).json({ ok: true, sector: resolvedRows.sector, subsector: resolvedRows.subsector, canonical: resolvedRows.canonical, inputs: rows });
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
      res.status(400).json({ ok: false, error: "Canonical sector id, inputType, and value are required" });
      return;
    }

    const resolvedRows = await ensureCanonicalSelectionRows(sectorName, subsectorName || null);
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO ${tables.sectorManualInputs}
       (sector_id, subsector_id, input_type, value, source, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [resolvedRows.sector.id, resolvedRows.subsector?.id ?? null, inputType, value, source || null, note || null, now]
    );

    res.status(200).json({
      ok: true,
      sector: resolvedRows.sector,
      subsector: resolvedRows.subsector,
      canonical: resolvedRows.canonical,
      inputType,
      value,
      source,
      note,
      createdAt: now,
    });
  } catch (error) {
    const message = (error as Error).message;
    const status = /Unknown canonical|is not part of sector/.test(message) ? 400 : 500;
    res.status(status).json({ ok: false, error: message });
  }
}
