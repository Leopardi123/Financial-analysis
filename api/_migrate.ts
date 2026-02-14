import { execute } from "./_db.js";

let migrated = false;

// IMPORTANT: Other parts of the codebase expect these keys to exist.
// We only migrate `companies` here, but we keep the full table-name map
// so server routes compile.
export const tables = {
  companies: "companies",
  companiesV2: "companies_v2",
  companySectorMap: "company_sector_map",
  sectors: "sectors",
  subsectors: "subsectors",
  financialPoints: "financial_points",
  sectorMetrics: "sector_metrics",

  // MISSING keys referenced by server routes:
  financialReports: "financial_reports",
  sectorManualInputs: "sector_manual_inputs",
} as const;


export async function ensureSchema() {
  if (migrated) return;

  // TEMP: reset schema if old companies table exists with wrong columns.
  // Safe because we can re-populate from FMP via refresh.
  await execute(`DROP TABLE IF EXISTS ${tables.companies};`);

  await execute(`
    CREATE TABLE IF NOT EXISTS ${tables.companies} (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      exchange TEXT,
      type TEXT,
      normalized_name TEXT NOT NULL
    );
  `);

  await execute(`CREATE INDEX IF NOT EXISTS idx_companies_name ON ${tables.companies}(name);`);
  await execute(
    `CREATE INDEX IF NOT EXISTS idx_companies_normalized ON ${tables.companies}(normalized_name);`
  );

  migrated = true;
}
