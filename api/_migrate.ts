import { batch, execute, query } from "./_db.js";
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
  companyCommodityOverride: "company_commodity_override",
  companyProjects: "company_projects",
  macroRawDatapoints: "macro_raw_datapoints",
  macroIndicatorCatalog: "macro_indicator_catalog",
  macroIndicatorSnapshots: "macro_indicator_snapshots",
  macroRegimeSnapshots: "macro_regime_snapshots",
  macroIngestRuns: "macro_ingest_runs",
  macroLatestReadCache: "macro_latest_read_cache",
  macroHistoryReadCache: "macro_history_read_cache",
  dailyPriceHistory: "daily_price_history",
  priceScreenSnapshot: "price_screen_snapshot",
  screeningPriceRefreshState: "screening_price_refresh_state",
  portfolioAdminConfig: "portfolio_admin_config",
  portfolioSnapshots: "portfolio_snapshots",
  portfolioPositions: "portfolio_positions",
  portfolioHistoryDaily: "portfolio_history_daily",
  totalPortfolioHistoryDaily: "total_portfolio_history_daily",
};

export async function ensureSchema() {
  const ensureColumnExists = async (table: string, column: string, definition: string) => {
    const info = await query(`PRAGMA table_info(${table})`) as Array<{ name?: string }>;
    const exists = info.some((row) => String(row.name ?? "") === column);
    if (!exists) {
      await execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

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
    `CREATE TABLE IF NOT EXISTS ${TABLES.screeningPriceRefreshState} (
      scope TEXT PRIMARY KEY,
      symbols_json TEXT NOT NULL,
      total_count INTEGER NOT NULL,
      offset INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'idle',
      targets_source TEXT NOT NULL DEFAULT 'fresh',
      last_controller_stage TEXT,
      last_worker_started INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      updated_at TEXT NOT NULL
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

  // category is intentionally non-canonical metadata; do not use for stage/exposure logic.
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
    `CREATE TABLE IF NOT EXISTS ${TABLES.companyCommodityOverride} (
      company_id INTEGER NOT NULL,
      commodity TEXT NOT NULL,
      weight REAL NOT NULL,
      source TEXT,
      note TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id, commodity)
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
      data_date_latest TEXT,
      value_latest REAL,
      change_1m REAL,
      change_3m REAL,
      yoy REAL,
      percentile_10y REAL,
      score INTEGER,
      freshness_days INTEGER,
      coverage_10y_pct REAL NOT NULL,
      driver_note TEXT,
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
      macro_regime_probability_json TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (as_of_date, region)
    )`
  );



  try {
    await execute(`ALTER TABLE ${TABLES.macroRegimeSnapshots} ADD COLUMN macro_regime_probability_json TEXT`);
  } catch {
    // column already exists
  }

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.macroIngestRuns} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempted_at TEXT NOT NULL,
      region TEXT NOT NULL,
      mode TEXT NOT NULL,
      success INTEGER NOT NULL,
      fred_api_key_present INTEGER NOT NULL,
      admin_authorized INTEGER NOT NULL,
      db_connected INTEGER NOT NULL,
      fetch_started INTEGER NOT NULL,
      fetch_succeeded INTEGER NOT NULL,
      fetched_series INTEGER NOT NULL,
      fetched_observation_count INTEGER NOT NULL,
      insert_attempted INTEGER NOT NULL,
      attempted_inserts INTEGER NOT NULL,
      inserted_row_count INTEGER NOT NULL,
      series_results_json TEXT,
      failing_step TEXT,
      error_message TEXT
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.macroLatestReadCache} (
      region TEXT PRIMARY KEY,
      as_of_date TEXT,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.macroHistoryReadCache} (
      region TEXT NOT NULL,
      resolution TEXT NOT NULL,
      range_key TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (region, resolution, range_key)
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.dailyPriceHistory} (
      symbol TEXT NOT NULL,
      price_date TEXT NOT NULL,
      close REAL NOT NULL,
      adjusted_close REAL,
      volume REAL,
      source TEXT NOT NULL,
      currency TEXT,
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(symbol, price_date)
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.portfolioAdminConfig} (
      portfolio_id TEXT PRIMARY KEY,
      portfolio_name TEXT NOT NULL,
      portfolio_type TEXT NOT NULL,
      active INTEGER NOT NULL,
      visible_in_overview INTEGER NOT NULL,
      included_in_total_portfolio INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      target_weight_pct REAL NOT NULL,
      min_weight_pct REAL NOT NULL,
      max_weight_pct REAL NOT NULL,
      strategic_risk_level TEXT NOT NULL,
      hedging_allowed INTEGER NOT NULL,
      max_hedge_pct REAL,
      rebalance_mode TEXT NOT NULL,
      role_description TEXT NOT NULL,
      long_term_purpose TEXT,
      notes TEXT,
      allowed_hedge_types_json TEXT NOT NULL,
      hedge_purpose_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      rebalance_priority INTEGER,
      max_single_position_pct REAL,
      max_sector_concentration_pct REAL,
      max_commodity_concentration_pct REAL,
      max_junior_exposure_pct REAL,
      max_illiquid_exposure_pct REAL,
      analyst_override_allowed INTEGER,
      analyst_override_note TEXT,
      override_expiry_date TEXT
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.portfolioPositions} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      company_id INTEGER,
      instrument_id TEXT,
      display_name TEXT,
      shares REAL NOT NULL,
      avg_cost REAL,
      entry_date TEXT,
      asset_type TEXT NOT NULL,
      thesis TEXT,
      notes TEXT,
      manual_sector_id INTEGER,
      manual_subsector_id INTEGER,
      manual_commodity_id TEXT,
      mapping_source TEXT NOT NULL DEFAULT 'inherited',
      mapping_override_active INTEGER NOT NULL DEFAULT 0,
      active_position INTEGER NOT NULL DEFAULT 1,
      exited_at TEXT,
      manual_price REAL,
      currency TEXT,
      market_value REAL,
      as_of_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.portfolioSnapshots} (
      portfolio_id TEXT NOT NULL,
      as_of_date TEXT NOT NULL,
      market_value REAL,
      actual_weight_pct REAL,
      target_weight_pct REAL NOT NULL,
      min_weight_pct REAL NOT NULL,
      max_weight_pct REAL NOT NULL,
      weight_status TEXT NOT NULL,
      rebalance_status TEXT NOT NULL,
      signal_completeness TEXT NOT NULL,
      cash_value REAL,
      cash_weight_pct REAL,
      debug_payload_json TEXT,
      PRIMARY KEY (portfolio_id, as_of_date)
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.portfolioHistoryDaily} (
      portfolio_id TEXT NOT NULL,
      as_of_date TEXT NOT NULL,
      total_return_index REAL,
      market_value REAL,
      daily_return_pct REAL,
      cumulative_return_pct REAL,
      drawdown_pct REAL,
      cash_weight_pct REAL,
      data_source TEXT,
      data_quality TEXT,
      PRIMARY KEY (portfolio_id, as_of_date)
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.totalPortfolioHistoryDaily} (
      as_of_date TEXT PRIMARY KEY,
      total_return_index REAL,
      market_value REAL,
      daily_return_pct REAL,
      cumulative_return_pct REAL,
      drawdown_pct REAL,
      total_cash_value REAL,
      total_cash_weight_pct REAL,
      included_portfolio_count INTEGER,
      data_quality TEXT
    )`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.priceScreenSnapshot} (
      symbol TEXT PRIMARY KEY,
      as_of_date TEXT NOT NULL,
      last_close REAL,
      return_5d REAL,
      return_20d REAL,
      return_60d REAL,
      high_20d REAL,
      high_60d REAL,
      high_252d REAL,
      drawdown_20d REAL,
      drawdown_60d REAL,
      drawdown_252d REAL,
      ma20 REAL,
      ma50 REAL,
      trend_state TEXT,
      recovery_state TEXT,
      history_points_used INTEGER,
      source TEXT,
      updated_at TEXT NOT NULL
    )`
  );
  await ensureColumnExists(TABLES.priceScreenSnapshot, "high_252d", "REAL");
  await ensureColumnExists(TABLES.priceScreenSnapshot, "drawdown_252d", "REAL");
  await ensureColumnExists(TABLES.portfolioPositions, "company_id", "INTEGER");
  await ensureColumnExists(TABLES.portfolioPositions, "instrument_id", "TEXT");
  await ensureColumnExists(TABLES.portfolioPositions, "display_name", "TEXT");
  await ensureColumnExists(TABLES.portfolioPositions, "shares", "REAL");
  await ensureColumnExists(TABLES.portfolioPositions, "avg_cost", "REAL");
  await ensureColumnExists(TABLES.portfolioPositions, "entry_date", "TEXT");
  await ensureColumnExists(TABLES.portfolioPositions, "asset_type", "TEXT");
  await ensureColumnExists(TABLES.portfolioPositions, "thesis", "TEXT");
  await ensureColumnExists(TABLES.portfolioPositions, "notes", "TEXT");
  await ensureColumnExists(TABLES.portfolioPositions, "manual_sector_id", "INTEGER");
  await ensureColumnExists(TABLES.portfolioPositions, "manual_subsector_id", "INTEGER");
  await ensureColumnExists(TABLES.portfolioPositions, "manual_commodity_id", "TEXT");
  await ensureColumnExists(TABLES.portfolioPositions, "mapping_source", "TEXT");
  await ensureColumnExists(TABLES.portfolioPositions, "mapping_override_active", "INTEGER");
  await ensureColumnExists(TABLES.portfolioPositions, "active_position", "INTEGER");
  await ensureColumnExists(TABLES.portfolioPositions, "exited_at", "TEXT");
  await ensureColumnExists(TABLES.portfolioPositions, "manual_price", "REAL");
  await ensureColumnExists(TABLES.portfolioPositions, "currency", "TEXT");
  await ensureColumnExists(TABLES.portfolioPositions, "created_at", "TEXT");
  await ensureColumnExists(TABLES.portfolioPositions, "updated_at", "TEXT");

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
      sql: `CREATE INDEX IF NOT EXISTS idx_daily_price_history_symbol_date_desc
            ON ${TABLES.dailyPriceHistory} (symbol, price_date DESC)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_daily_price_history_date
            ON ${TABLES.dailyPriceHistory} (price_date)`,
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
      sql: `CREATE INDEX IF NOT EXISTS idx_macro_ingest_runs_region_attempted
            ON ${TABLES.macroIngestRuns} (region, attempted_at DESC)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_macro_latest_read_cache_asof
            ON ${TABLES.macroLatestReadCache} (as_of_date)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_macro_history_read_cache_updated
            ON ${TABLES.macroHistoryReadCache} (updated_at DESC)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_company_projects_symbol
            ON ${TABLES.companyProjects} (symbol)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_company_projects_symbol_project
            ON ${TABLES.companyProjects} (symbol, project_id)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_portfolio_admin_sort_order
            ON ${TABLES.portfolioAdminConfig} (sort_order, portfolio_id)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_portfolio_admin_active_included
            ON ${TABLES.portfolioAdminConfig} (active, included_in_total_portfolio)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_portfolio_positions_portfolio
            ON ${TABLES.portfolioPositions} (portfolio_id, active_position, updated_at DESC)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_portfolio_positions_symbol
            ON ${TABLES.portfolioPositions} (symbol)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_as_of_date
            ON ${TABLES.portfolioSnapshots} (as_of_date DESC, portfolio_id)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_portfolio_history_daily_portfolio_date
            ON ${TABLES.portfolioHistoryDaily} (portfolio_id, as_of_date DESC)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_total_portfolio_history_daily_date
            ON ${TABLES.totalPortfolioHistoryDaily} (as_of_date DESC)`,
    },
  ]);

  await ensureColumnExists(TABLES.portfolioSnapshots, "return_20d", "REAL");
  await ensureColumnExists(TABLES.portfolioSnapshots, "return_65d", "REAL");
  await ensureColumnExists(TABLES.portfolioSnapshots, "return_200d", "REAL");
  await ensureColumnExists(TABLES.portfolioSnapshots, "short_direction", "TEXT");
  await ensureColumnExists(TABLES.portfolioSnapshots, "medium_direction", "TEXT");
  await ensureColumnExists(TABLES.portfolioSnapshots, "long_direction", "TEXT");
  await ensureColumnExists(TABLES.portfolioSnapshots, "trend_status", "TEXT");
  await ensureColumnExists(TABLES.portfolioSnapshots, "relative_strength_bucket", "TEXT");
  await ensureColumnExists(TABLES.portfolioSnapshots, "annualized_vol_65d", "REAL");
  await ensureColumnExists(TABLES.portfolioSnapshots, "current_drawdown_pct", "REAL");
  await ensureColumnExists(TABLES.portfolioSnapshots, "top_holding_weight_pct", "REAL");
  await ensureColumnExists(TABLES.portfolioSnapshots, "cyclicality_score", "REAL");
  await ensureColumnExists(TABLES.portfolioSnapshots, "volatility_component_score", "REAL");
  await ensureColumnExists(TABLES.portfolioSnapshots, "drawdown_component_score", "REAL");
  await ensureColumnExists(TABLES.portfolioSnapshots, "concentration_component_score", "REAL");
  await ensureColumnExists(TABLES.portfolioSnapshots, "cyclicality_component_score", "REAL");
  await ensureColumnExists(TABLES.portfolioSnapshots, "risk_score", "REAL");
  await ensureColumnExists(TABLES.portfolioSnapshots, "risk_status", "TEXT");
  await ensureColumnExists(TABLES.portfolioSnapshots, "risk_mismatch_flag", "INTEGER");
  await ensureColumnExists(TABLES.portfolioSnapshots, "risk_debug_json", "TEXT");
  await ensureColumnExists(TABLES.portfolioSnapshots, "hedge_need_score", "REAL");
  await ensureColumnExists(TABLES.portfolioSnapshots, "hedge_status", "TEXT");
  await ensureColumnExists(TABLES.portfolioSnapshots, "suggested_hedge_type", "TEXT");
  await ensureColumnExists(TABLES.portfolioSnapshots, "hedge_policy_applied", "TEXT");
  await ensureColumnExists(TABLES.portfolioSnapshots, "hedge_debug_json", "TEXT");

  try {
    await execute(`ALTER TABLE ${TABLES.companiesV2} ADD COLUMN fiscal_year_end TEXT`);
  } catch {
    // Column already exists.
  }

  try {
    await execute(`ALTER TABLE ${TABLES.macroIndicatorSnapshots} ADD COLUMN data_date_latest TEXT`);
  } catch {
    // Column already exists.
  }

  try {
    await execute(`ALTER TABLE ${TABLES.macroIndicatorSnapshots} ADD COLUMN change_1m REAL`);
  } catch {
    // Column already exists.
  }

  try {
    await execute(`ALTER TABLE ${TABLES.macroIndicatorSnapshots} ADD COLUMN change_3m REAL`);
  } catch {
    // Column already exists.
  }

  try {
    await execute(`ALTER TABLE ${TABLES.macroIndicatorSnapshots} ADD COLUMN yoy REAL`);
  } catch {
    // Column already exists.
  }

  try {
    await execute(`ALTER TABLE ${TABLES.macroIndicatorSnapshots} ADD COLUMN driver_note TEXT`);
  } catch {
    // Column already exists.
  }

  try {
    await execute(`ALTER TABLE ${TABLES.macroIngestRuns} ADD COLUMN series_results_json TEXT`);
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
