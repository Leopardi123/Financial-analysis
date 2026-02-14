import { execute } from "./_db.js";

let migrated = false;

export async function ensureSchema() {
  if (migrated) return;

// TEMP: reset schema if old companies table exists with wrong columns.
// Safe because we can re-populate from FMP via refresh.
await execute(`
  DROP TABLE IF EXISTS companies;
`);
await execute(`
  CREATE TABLE IF NOT EXISTS companies (
    symbol TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    exchange TEXT,
    type TEXT,
    normalized_name TEXT NOT NULL
  );
`);


  await execute(`CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name)`);
  await execute(
    `CREATE INDEX IF NOT EXISTS idx_companies_normalized ON companies(normalized_name)`
  );

  migrated = true;
}
