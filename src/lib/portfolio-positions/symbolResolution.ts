import { query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";

export type PositionSymbolWarningCode = "symbol_not_matched" | "symbol_matched_no_price_history";

export type PositionSymbolWarning = {
  code: PositionSymbolWarningCode;
  message: string;
  symbol: string;
  resolved_symbol: string | null;
};

export type PositionSymbolResolution = {
  raw_symbol: string;
  resolved_symbol: string | null;
  matched_company: boolean;
  has_daily_price_history: boolean;
  daily_price_history_rows: number;
  has_screen_snapshot: boolean;
  warnings: PositionSymbolWarning[];
};

export async function resolvePositionSymbol(rawSymbol: string): Promise<PositionSymbolResolution> {
  const normalized = String(rawSymbol ?? "").trim().toUpperCase();
  if (!normalized) {
    return {
      raw_symbol: "",
      resolved_symbol: null,
      matched_company: false,
      has_daily_price_history: false,
      daily_price_history_rows: 0,
      has_screen_snapshot: false,
      warnings: [],
    };
  }

  const companyRows = await query(
    `SELECT ticker
     FROM ${tables.companiesV2}
     WHERE ticker = ?
     LIMIT 1`,
    [normalized],
  ) as Array<{ ticker?: unknown }>;

  const matchedCompany = companyRows.length > 0;
  const resolvedSymbol = matchedCompany ? String(companyRows[0]?.ticker ?? normalized).trim().toUpperCase() : null;
  const historySymbol = resolvedSymbol ?? normalized;

  const historyRows = await query(
    `SELECT COUNT(*) AS count
     FROM ${tables.dailyPriceHistory}
     WHERE symbol = ?`,
    [historySymbol],
  ) as Array<{ count?: number | string }>;
  const dailyPriceHistoryRows = Number(historyRows[0]?.count ?? 0);
  const hasDailyPriceHistory = dailyPriceHistoryRows > 0;

  const snapshotRows = await query(
    `SELECT 1 AS has_row
     FROM ${tables.priceScreenSnapshot}
     WHERE symbol = ?
     LIMIT 1`,
    [historySymbol],
  ) as Array<{ has_row?: number | string }>;
  const hasScreenSnapshot = snapshotRows.length > 0;

  const warnings: PositionSymbolWarning[] = [];

  if (!matchedCompany) {
    warnings.push({
      code: "symbol_not_matched",
      message: "Symbol not matched to canonical company universe; trend/history coverage may fail.",
      symbol: normalized,
      resolved_symbol: null,
    });
  } else if (!hasDailyPriceHistory) {
    warnings.push({
      code: "symbol_matched_no_price_history",
      message: "Symbol matched, but no price history exists yet; trend may be unavailable until history is ingested.",
      symbol: normalized,
      resolved_symbol: resolvedSymbol,
    });
  }

  return {
    raw_symbol: normalized,
    resolved_symbol: resolvedSymbol,
    matched_company: matchedCompany,
    has_daily_price_history: hasDailyPriceHistory,
    daily_price_history_rows: dailyPriceHistoryRows,
    has_screen_snapshot: hasScreenSnapshot,
    warnings,
  };
}
