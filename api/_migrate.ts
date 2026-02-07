import { batch, execute } from "./_db.js";

const TABLES = {
  companiesV2: "companies_v2",
  financialReports: "financial_reports",
  financialPoints: "financial_points_v2",
  fetchLog: "fetch_log",
};

export async function ensureSchema() {
  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.companiesV2} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE,
      active INTEGER DEFAULT 1,
      last_fy_fetch_at TEXT,
      last_q_fetch_at TEXT
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

  await batch([
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
  ]);

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
