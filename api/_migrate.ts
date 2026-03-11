import { batch, execute } from "./_db.js";
import { ensurePriceSchema } from "../src/lib/prices/db/schema.js";
import { seedPriceRegistry } from "../src/lib/prices/db/seed.js";

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
  companyProjects: "company_projects",
  macroRawDatapoints: "macro_raw_datapoints",
  macroIndicatorCatalog: "macro_indicator_catalog",
  macroIndicatorSnapshots: "macro_indicator_snapshots",
  macroRegimeSnapshots: "macro_regime_snapshots",
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



  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.macroRawDatapoints} (
      source TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'auto',
      region TEXT NOT NULL,
      series_key TEXT NOT NULL,
      date TEXT NOT NULL,
      value REAL,
      fetched_at TEXT NOT NULL,
      UNIQUE(source, region, series_key, date)
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.macroIndicatorCatalog} (
      indicator_id TEXT NOT NULL,
      region TEXT NOT NULL,
      block TEXT NOT NULL,
      signal_class TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      inputs_json TEXT NOT NULL,
      transform TEXT NOT NULL,
      scoring TEXT NOT NULL,
      weight REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (indicator_id, region)
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.macroIndicatorSnapshots} (
      as_of_date TEXT NOT NULL,
      region TEXT NOT NULL,
      indicator_id TEXT NOT NULL,
      signal_class TEXT NOT NULL,
      source_type TEXT NOT NULL,
      value_latest REAL,
      percentile_10y REAL,
      score INTEGER,
      freshness_days INTEGER,
      coverage_10y_pct REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (as_of_date, region, indicator_id)
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.macroRegimeSnapshots} (
      as_of_date TEXT NOT NULL,
      region TEXT NOT NULL,
      block_scores_json TEXT NOT NULL,
      macro_score_total REAL,
      macro_confidence REAL NOT NULL,
      core_regime_label TEXT NOT NULL,
      growth_overlay TEXT NOT NULL,
      stress_overlay TEXT NOT NULL,
      hard_asset_overlay TEXT NOT NULL,
      clear_signal_strength REAL,
      speculative_signal_strength REAL,
      top_drivers_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (as_of_date, region)
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.companyProjects} (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      project_id TEXT NOT NULL,
      project_name TEXT,
      json_version TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL,
      UNIQUE(symbol, project_id)
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
      sql: `CREATE INDEX IF NOT EXISTS idx_reports_company_period_stmt_date
            ON ${TABLES.financialReports} (company_id, period, statement, fiscal_date)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_fp_company_stmt_period_date
            ON ${TABLES.financialPoints} (company_id, statement, period, fiscal_date)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_fp_company_period_stmt_date
            ON ${TABLES.financialPoints} (company_id, period, statement, fiscal_date)`,
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


    {
      sql: `CREATE INDEX IF NOT EXISTS idx_macro_raw_series_date
            ON ${TABLES.macroRawDatapoints} (region, series_key, date)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_macro_indicator_snapshots_region_date
            ON ${TABLES.macroIndicatorSnapshots} (region, as_of_date)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_macro_regime_snapshots_region_date
            ON ${TABLES.macroRegimeSnapshots} (region, as_of_date)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_company_projects_symbol
            ON ${TABLES.companyProjects} (symbol)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_company_projects_symbol_project
            ON ${TABLES.companyProjects} (symbol, project_id)`,
    },
  ]);

  try {
    await execute(`ALTER TABLE ${TABLES.companiesV2} ADD COLUMN fiscal_year_end TEXT`);
  } catch {
    // Column already exists.
  }

  await migrateCompanies();
  await ensurePriceSchema();
  await seedPriceRegistry();
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
