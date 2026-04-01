import { execute, query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import type { CommodityKey } from "../../../lib/commodities/commodityExposureTypes.js";

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function safeNumber(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

const ALLOWED_COMMODITIES = new Set<string>([
  "gold", "silver", "copper", "uranium", "nickel", "zinc", "lead", "pgm", "tin",
  "tungsten", "lithium", "coal", "iron_ore", "oil", "gas", "vanadium", "other",
]);

function normalizeCommodity(value: unknown): CommodityKey | null {
  const key = normalizeText(value).toLowerCase();
  if (!ALLOWED_COMMODITIES.has(key)) return null;
  return key as CommodityKey;
}

export default async function handler(req: any, res: any) {
  try {
    await ensureSchema();

    if (req.method === "GET") {
      const sector = normalizeText(req.query?.sector);
      const subsector = normalizeText(req.query?.subsector);
      const rows = await query(
        `SELECT map.company_id, map.sector_id, map.subsector_id, c.ticker,
                o.commodity, o.weight, o.source, o.note, o.updated_at
         FROM ${tables.companySectorMap} map
         LEFT JOIN ${tables.companiesV2} c ON c.id = map.company_id
         LEFT JOIN ${tables.companyCommodityOverride} o ON o.company_id = map.company_id
         WHERE (? = '' OR map.sector_id = ?)
           AND (? = '' OR map.subsector_id = ?)
         ORDER BY map.company_id ASC, o.updated_at DESC`,
        [sector, sector, subsector, subsector]
      );
      const grouped = new Map<string, any>();
      for (const row of rows as any[]) {
        const companyId = String(row.company_id ?? "");
        if (!companyId) continue;
        if (!grouped.has(companyId)) {
          grouped.set(companyId, {
            companyId,
            ticker: row.ticker ? String(row.ticker) : null,
            canonicalSectorId: String(row.sector_id ?? ""),
            canonicalSubsectorId: row.subsector_id ? String(row.subsector_id) : null,
            source: row.source ? String(row.source) : null,
            note: row.note ? String(row.note) : null,
            updatedAt: row.updated_at ? String(row.updated_at) : null,
            exposures: [] as Array<{ commodity: CommodityKey; weight: number }>,
          });
        }
        const commodity = normalizeCommodity(row.commodity);
        const weight = safeNumber(row.weight);
        if (commodity && weight && weight > 0) {
          grouped.get(companyId).exposures.push({ commodity, weight });
        }
      }
      res.status(200).json({ ok: true, overrides: Array.from(grouped.values()) });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    const ticker = normalizeText(req.body?.ticker).toUpperCase();
    const source = normalizeText(req.body?.source);
    const note = normalizeText(req.body?.note);
    const exposuresRaw = Array.isArray(req.body?.exposures) ? req.body.exposures : [];

    if (!ticker) {
      res.status(400).json({ ok: false, error: "ticker is required" });
      return;
    }

    const companyRows = await query(`SELECT id FROM ${tables.companiesV2} WHERE ticker = ?`, [ticker]);
    const companyId = Number(companyRows[0]?.id ?? 0);
    if (!companyId) {
      res.status(404).json({ ok: false, error: `Unknown ticker: ${ticker}` });
      return;
    }

    const exposures = exposuresRaw
      .map((row: any) => ({
        commodity: normalizeCommodity(row?.commodity),
        weight: safeNumber(row?.weight),
      }))
      .filter((row: any) => row.commodity && row.weight && row.weight > 0);

    if (exposures.length === 0) {
      res.status(400).json({ ok: false, error: "At least one commodity row with weight > 0 is required" });
      return;
    }

    const uniqueCommodities = new Set(exposures.map((row: any) => row.commodity));
    if (uniqueCommodities.size !== exposures.length) {
      res.status(400).json({ ok: false, error: "Duplicate commodities are not allowed" });
      return;
    }

    const total = exposures.reduce((acc: number, row: any) => acc + Number(row.weight), 0);
    if (total < 0.98 || total > 1.02) {
      res.status(400).json({ ok: false, error: `Weights must sum to 1.0 (received ${total.toFixed(3)})` });
      return;
    }

    const normalized = exposures.map((row: any) => ({
      commodity: row.commodity as CommodityKey,
      weight: Number(row.weight) / total,
    }));

    await execute(`DELETE FROM ${tables.companyCommodityOverride} WHERE company_id = ?`, [companyId]);
    const now = new Date().toISOString();
    for (const item of normalized) {
      await execute(
        `INSERT INTO ${tables.companyCommodityOverride} (company_id, commodity, weight, source, note, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [companyId, item.commodity, item.weight, source || null, note || null, now]
      );
    }

    res.status(200).json({
      ok: true,
      ticker,
      companyId,
      source: source || null,
      note: note || null,
      updatedAt: now,
      exposures: normalized,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
