import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { query } from "../../../../api/_db.js";
import { listCanonicalTaxonomy } from "./canonicalTaxonomy.js";

export default async function handler(_req: any, res: any) {
  try {
    await ensureSchema();
    const taxonomy = listCanonicalTaxonomy();
    const sectors = await query(`SELECT id, name FROM ${tables.sectors}`);
    const subsectors = await query(`SELECT id, name, sector_id FROM ${tables.subsectors}`);
    res.status(200).json({ ok: true, taxonomy, sector_rows: sectors, subsector_rows: subsectors });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
