import { query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";

type MappingRow = {
  company_id?: unknown;
  ticker?: unknown;
  company_name?: unknown;
  category?: unknown;
  sector_name?: unknown;
  subsector_name?: unknown;
  commodity?: unknown;
};

let companySectorMapHasCategoryColumn: boolean | null = null;

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

async function detectCategoryColumnSupport() {
  if (companySectorMapHasCategoryColumn !== null) {
    return companySectorMapHasCategoryColumn;
  }
  const tableInfo = await query(`PRAGMA table_info(${tables.companySectorMap})`);
  companySectorMapHasCategoryColumn = (tableInfo as Array<{ name?: unknown }>).some((column) =>
    String(column?.name ?? "").toLowerCase() === "category"
  );
  return companySectorMapHasCategoryColumn;
}

export default async function handler(_req: any, res: any) {
  try {
    await ensureSchema();
    const canReadCategory = await detectCategoryColumnSupport();
    const categorySelect = canReadCategory ? "map.category" : "NULL AS category";
    const rows = await query(
      `SELECT map.company_id,
              c.ticker,
              c.name AS company_name,
              ${categorySelect},
              s.name AS sector_name,
              ss.name AS subsector_name,
              o.commodity
       FROM ${tables.companySectorMap} map
       LEFT JOIN ${tables.companiesV2} c ON c.id = map.company_id
       LEFT JOIN ${tables.sectors} s ON s.id = map.sector_id
       LEFT JOIN ${tables.subsectors} ss ON ss.id = map.subsector_id
       LEFT JOIN ${tables.companyCommodityOverride} o ON o.company_id = map.company_id
       ORDER BY c.ticker ASC, map.company_id ASC`,
      []
    );

    const grouped = new Map<string, {
      companyId: string;
      ticker: string;
      companyName: string | null;
      sectorId: string;
      subsectorId: string | null;
      category: string | null;
      specificMappings: string[];
    }>();

    for (const row of rows as MappingRow[]) {
      const companyId = String(row.company_id ?? "");
      const ticker = normalizeText(row.ticker).toUpperCase();
      const sectorId = normalizeText(row.sector_name);
      const subsectorIdRaw = normalizeText(row.subsector_name);
      const categoryRaw = normalizeText(row.category);
      if (!companyId || !ticker || !sectorId) {
        continue;
      }
      const subsectorId = subsectorIdRaw || null;
      const category = categoryRaw || null;
      const key = `${companyId}::${sectorId}::${subsectorId ?? ""}::${category ?? ""}`;
      if (!grouped.has(key)) {
        const companyNameRaw = normalizeText(row.company_name);
        grouped.set(key, {
          companyId,
          ticker,
          companyName: companyNameRaw || null,
          sectorId,
          subsectorId,
          category,
          specificMappings: [],
        });
      }
      const commodity = normalizeText(row.commodity).toLowerCase();
      if (commodity) {
        const entry = grouped.get(key)!;
        if (!entry.specificMappings.includes(commodity)) {
          entry.specificMappings.push(commodity);
        }
      }
    }

    const mappings = Array.from(grouped.values()).map((entry) => ({
      ...entry,
      specificMappings: entry.specificMappings.sort((a, b) => a.localeCompare(b)),
    }));

    res.status(200).json({ ok: true, mappings });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
