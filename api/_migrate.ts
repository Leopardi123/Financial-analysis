import { batch, execute } from "./_db.js";

const TABLES = {
  companies: "companies",
  companiesV2: "companies_v2",
  financialReports: "financial_reports",
  financialPoints: "financial_points_v2",
  fetchLog: "fetch_log",
  sectors: "sectors",
  subsectors: "subsectors",
  sectorMetrics: "sector_metrics",
  sectorManualInputs: "sector_manual_inputs",
  cycleScores: "cycle_scores",
  assumptionsLog: "assumptions_log",
  companySectorMap: "company_sector_map",
};

export async function ensureSchema() {

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.companies} (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      exchange TEXT,
      type TEXT,
      normalized_name TEXT NOT NULL
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.companiesV2} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE,
      active INTEGER DEFAULT 1,
      last_fy_fetch_at TEXT,
      last_q_fetch_at TEXT,
      fiscal_year_end TEXT
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.financialReports} (
      company_id INTEGER NOT NULL,
      statement TEXT NOT NULL,
      period TEXT NOT NULL,
      fiscal_date TEXT NOT NULL,
      data_json TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'fmp',
      fetched_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id, statement, period, fiscal_date)
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.financialPoints} (
      company_id INTEGER NOT NULL,
      statement TEXT NOT NULL,
      period TEXT NOT NULL,
      fiscal_date TEXT NOT NULL,
      field TEXT NOT NULL,
      value REAL,
      fetched_at TEXT NOT NULL,
      UNIQUE(company_id, statement, period, fiscal_date, field)
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.fetchLog} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_at TEXT,
      ticker TEXT,
      period TEXT,
      statement TEXT,
      ok INTEGER,
      error TEXT
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.sectors} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.subsectors} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sector_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(sector_id, name)
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.sectorMetrics} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sector_id INTEGER NOT NULL,
      subsector_id INTEGER,
      metric TEXT NOT NULL,
      period TEXT,
      value REAL,
      source TEXT,
      as_of TEXT NOT NULL
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.sectorManualInputs} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sector_id INTEGER NOT NULL,
      subsector_id INTEGER,
      input_type TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT,
      note TEXT,
      created_at TEXT NOT NULL
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.cycleScores} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sector_id INTEGER NOT NULL,
      subsector_id INTEGER,
      score REAL,
      phase TEXT,
      explanation_json TEXT,
      computed_at TEXT NOT NULL
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.assumptionsLog} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sector_id INTEGER NOT NULL,
      subsector_id INTEGER,
      assumption TEXT NOT NULL,
      rationale TEXT,
      created_at TEXT NOT NULL
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.companySectorMap} (
      company_id INTEGER NOT NULL,
      sector_id INTEGER NOT NULL,
      subsector_id INTEGER,
      category TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(company_id, sector_id, subsector_id)
    )`
  );

  await batch([
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_companies_name
            ON ${TABLES.companies} (name)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_companies_normalized
            ON ${TABLES.companies} (normalized_name)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_companies_normalized_name
            ON ${TABLES.companies} (normalized_name)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_reports_company
            ON ${TABLES.financialReports} (company_id)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_reports_company_stmt_period_date
            ON ${TABLES.financialReports} (company_id, statement, period, fiscal_date)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_fp_company_stmt_period_date
            ON ${TABLES.financialPoints} (company_id, statement, period, fiscal_date)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_fp_company_field
            ON ${TABLES.financialPoints} (company_id, field)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_subsectors_sector
            ON ${TABLES.subsectors} (sector_id)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_sector_metrics_sector
            ON ${TABLES.sectorMetrics} (sector_id, subsector_id)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_sector_manual_inputs_sector
            ON ${TABLES.sectorManualInputs} (sector_id, subsector_id)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_cycle_scores_sector
            ON ${TABLES.cycleScores} (sector_id, subsector_id)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_company_sector_map_sector
            ON ${TABLES.companySectorMap} (sector_id, subsector_id)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_company_sector_map_company
            ON ${TABLES.companySectorMap} (company_id)`,
    },
  ]);

  try {
    await execute(`ALTER TABLE ${TABLES.companiesV2} ADD COLUMN fiscal_year_end TEXT`);
  } catch {
    // Column already exists.
  }

  await migrateCompanies();
}

async function migrateCompanies() {
  try {
    await execute(
      `INSERT OR IGNORE INTO ${TABLES.companiesV2} (ticker, active, last_fy_fetch_at, last_q_fetch_at)
       SELECT ticker, active, last_annual_fetch_at, last_quarterly_fetch_at
       FROM companies`
    );
  } catch {
    // Ignore if legacy table does not exist yet.
  }
}

export const tables = TABLES;
