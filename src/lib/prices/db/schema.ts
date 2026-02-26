import { batch, execute } from "../../../../api/_db.js";

export const PRICE_TABLES = {
  registry: "price_key_registry",
  providerMap: "price_provider_map",
  eodMonthly: "price_eod_monthly",
} as const;

export async function ensurePriceSchema(): Promise<void> {
  await execute(
    `CREATE TABLE IF NOT EXISTS ${PRICE_TABLES.registry} (
      price_key TEXT PRIMARY KEY,
      canonical_unit TEXT NOT NULL,
      kind TEXT NOT NULL,
      description TEXT NOT NULL,
      decimals INTEGER NOT NULL DEFAULT 6
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${PRICE_TABLES.providerMap} (
      price_key TEXT PRIMARY KEY REFERENCES ${PRICE_TABLES.registry}(price_key),
      provider TEXT NOT NULL,
      provider_symbol TEXT NOT NULL,
      provider_kind TEXT NOT NULL,
      notes TEXT
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${PRICE_TABLES.eodMonthly} (
      price_key TEXT NOT NULL REFERENCES ${PRICE_TABLES.registry}(price_key),
      yyyymm TEXT NOT NULL,
      encoding TEXT NOT NULL,
      payload TEXT NOT NULL,
      provider TEXT NOT NULL,
      source_symbol TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL,
      PRIMARY KEY (price_key, yyyymm)
    )`
  );

  await batch([
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_price_eod_monthly_key
            ON ${PRICE_TABLES.eodMonthly}(price_key)`,
    },
  ]);
}
