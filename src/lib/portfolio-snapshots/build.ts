import { execute, query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";
import { listPortfolioConfigs } from "../portfolio-admin/repository.js";
import type { PortfolioAdminConfig } from "../portfolio-admin/types.js";
import type {
  AllocationPlanStatus,
  RebalanceStatus,
  SignalCompleteness,
  SnapshotBuildRow,
  WeightStatus,
} from "./types.js";

function utcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function computeWeightStatus(actualWeightPct: number | null, minWeightPct: number, maxWeightPct: number): {
  weightStatus: WeightStatus;
  bandWidth: number | null;
  distanceToEdge: number | null;
} {
  if (!isFiniteNumber(actualWeightPct) || !isFiniteNumber(minWeightPct) || !isFiniteNumber(maxWeightPct)) {
    return { weightStatus: "unavailable", bandWidth: null, distanceToEdge: null };
  }

  const bandWidth = maxWeightPct - minWeightPct;
  const distanceToEdge = Math.min(
    Math.abs(actualWeightPct - minWeightPct),
    Math.abs(maxWeightPct - actualWeightPct)
  );

  if (actualWeightPct < minWeightPct) {
    const lowerBreak = minWeightPct - actualWeightPct;
    const criticalThreshold = Math.max(2.0, 0.33 * bandWidth);
    if (lowerBreak > criticalThreshold) {
      return { weightStatus: "critical_underweight", bandWidth, distanceToEdge };
    }
    return { weightStatus: "underweight", bandWidth, distanceToEdge };
  }

  if (actualWeightPct > maxWeightPct) {
    const upperBreak = actualWeightPct - maxWeightPct;
    const criticalThreshold = Math.max(2.0, 0.33 * bandWidth);
    if (upperBreak > criticalThreshold) {
      return { weightStatus: "critical_overweight", bandWidth, distanceToEdge };
    }
    return { weightStatus: "overweight", bandWidth, distanceToEdge };
  }

  const watchThreshold = Math.max(1.0, 0.25 * bandWidth);
  if (distanceToEdge <= watchThreshold) {
    return { weightStatus: "watch", bandWidth, distanceToEdge };
  }

  return { weightStatus: "within_band", bandWidth, distanceToEdge };
}

function computeRebalanceStatus(weightStatus: WeightStatus, rebalanceMode: PortfolioAdminConfig["rebalance_mode"]): RebalanceStatus {
  const base: RebalanceStatus = (() => {
    switch (weightStatus) {
      case "within_band":
        return "no_action";
      case "watch":
        return "monitor";
      case "underweight":
      case "overweight":
        return "rebalance_soon";
      case "critical_underweight":
      case "critical_overweight":
        return "rebalance_now";
      default:
        return "unavailable";
    }
  })();

  if (rebalanceMode === "strict" && weightStatus === "watch") {
    return "rebalance_soon";
  }

  return base;
}

function computeAllocationPlanStatus(weightStatuses: WeightStatus[]): AllocationPlanStatus {
  if (weightStatuses.some((status) => status === "critical_underweight" || status === "critical_overweight")) {
    return "materially_outside_allocation_plan";
  }
  if (weightStatuses.some((status) => status === "underweight" || status === "overweight" || status === "unavailable")) {
    return "outside_allocation_plan";
  }
  return "within_allocation_plan";
}

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await query(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [tableName]);
  return rows.length > 0;
}

type PositionValuationDebug = {
  portfolio_id: string;
  positions_found_count: number;
  positions_active_count: number;
  positions_valued_count: number;
  positions_unvalued_count: number;
  included_market_value: number;
  positions: Array<{
    position_id: number;
    symbol: string;
    display_name: string | null;
    instrument_type: string | null;
    shares: number | null;
    manual_price: number | null;
    resolved_live_price: number | null;
    valuation_method_used: "explicit_market_value" | "manual_price" | "live_price" | "unresolved";
    market_value_contribution: number | null;
    inclusion_status: "included" | "excluded" | "unvalued";
    exclusion_reason: string | null;
    unvalued_reason: string | null;
  }>;
};

async function getMarketValuesFromPositions(): Promise<{ marketValueByPortfolio: Map<string, number>; valuationDebugByPortfolio: Map<string, PositionValuationDebug> }> {
  const rows = await query(
    `SELECT p.id,
            p.portfolio_id,
            p.symbol,
            p.display_name,
            p.asset_type,
            p.active_position,
            p.market_value,
            p.shares,
            p.manual_price
     FROM ${tables.portfolioPositions} p`
  );
  const latestPrices = await query(
    `SELECT d.symbol, COALESCE(d.adjusted_close, d.close) AS live_price
     FROM ${tables.dailyPriceHistory} d
     INNER JOIN (
       SELECT symbol, MAX(price_date) AS latest_price_date
       FROM ${tables.dailyPriceHistory}
       GROUP BY symbol
     ) latest ON latest.symbol = d.symbol AND latest.latest_price_date = d.price_date`
  );
  const livePriceBySymbol = new Map<string, number>();
  for (const row of latestPrices as Array<{ symbol?: unknown; live_price?: unknown }>) {
    const symbol = String(row.symbol ?? "").trim().toUpperCase();
    const livePrice = Number(row.live_price ?? NaN);
    if (symbol && Number.isFinite(livePrice) && livePrice > 0) {
      livePriceBySymbol.set(symbol, livePrice);
    }
  }

  const marketValueByPortfolio = new Map<string, number>();
  const valuationDebugByPortfolio = new Map<string, PositionValuationDebug>();

  for (const row of rows as Array<Record<string, unknown>>) {
    const portfolioId = String(row.portfolio_id ?? "").trim();
    if (!portfolioId) continue;

    const positionId = Number(row.id ?? NaN);
    const symbol = String(row.symbol ?? "").trim() || "(unknown)";
    const activePosition = Number(row.active_position ?? 0) === 1;
    const displayName = typeof row.display_name === "string" && row.display_name.trim() ? row.display_name.trim() : null;
    const instrumentType = typeof row.asset_type === "string" && row.asset_type.trim() ? row.asset_type.trim() : null;
    const directMarketValue = Number(row.market_value ?? NaN);
    const shares = Number(row.shares ?? NaN);
    const manualPrice = Number(row.manual_price ?? NaN);
    const normalizedSymbol = symbol.toUpperCase();
    const livePrice = livePriceBySymbol.get(normalizedSymbol) ?? null;

    const bucket = valuationDebugByPortfolio.get(portfolioId) ?? {
      portfolio_id: portfolioId,
      positions_found_count: 0,
      positions_active_count: 0,
      positions_valued_count: 0,
      positions_unvalued_count: 0,
      included_market_value: 0,
      positions: [],
    };

    bucket.positions_found_count += 1;
    if (!activePosition) {
      bucket.positions.push({
        position_id: Number.isFinite(positionId) ? positionId : -1,
        symbol,
        display_name: displayName,
        instrument_type: instrumentType,
        shares: Number.isFinite(shares) ? shares : null,
        manual_price: Number.isFinite(manualPrice) ? manualPrice : null,
        resolved_live_price: livePrice,
        valuation_method_used: "unresolved",
        market_value_contribution: null,
        inclusion_status: "excluded",
        exclusion_reason: "Position inactive",
        unvalued_reason: null,
      });
      valuationDebugByPortfolio.set(portfolioId, bucket);
      continue;
    }

    bucket.positions_active_count += 1;
    const hasShares = Number.isFinite(shares) && shares > 0;
    const hasExplicitMarketValue = Number.isFinite(directMarketValue) && directMarketValue >= 0;
    const hasManualPrice = Number.isFinite(manualPrice) && manualPrice > 0;
    const hasLivePrice = typeof livePrice === "number" && Number.isFinite(livePrice) && livePrice > 0;

    let valuationMethod: "explicit_market_value" | "manual_price" | "live_price" | "unresolved" = "unresolved";
    let marketValueContribution: number | null = null;
    let unvaluedReason: string | null = null;

    if (hasExplicitMarketValue) {
      valuationMethod = "explicit_market_value";
      marketValueContribution = directMarketValue;
    } else if (hasManualPrice && hasShares) {
      valuationMethod = "manual_price";
      marketValueContribution = shares * manualPrice;
    } else if (hasLivePrice && hasShares) {
      valuationMethod = "live_price";
      marketValueContribution = shares * livePrice;
    } else {
      if (!hasShares) {
        unvaluedReason = "Missing or invalid shares";
      } else if (Number.isFinite(manualPrice) && manualPrice === 0) {
        unvaluedReason = "manual_price is 0 and treated as missing pricing input";
      } else if (!hasLivePrice) {
        unvaluedReason = "No live price available for symbol";
      } else {
        unvaluedReason = "Position saved but valuation method could not be resolved";
      }
    }

    if (marketValueContribution !== null) {
      bucket.positions_valued_count += 1;
      bucket.included_market_value += marketValueContribution;
      bucket.positions.push({
        position_id: Number.isFinite(positionId) ? positionId : -1,
        symbol,
        display_name: displayName,
        instrument_type: instrumentType,
        shares: Number.isFinite(shares) ? shares : null,
        manual_price: Number.isFinite(manualPrice) ? manualPrice : null,
        resolved_live_price: livePrice,
        valuation_method_used: valuationMethod,
        market_value_contribution: marketValueContribution,
        inclusion_status: "included",
        exclusion_reason: null,
        unvalued_reason: null,
      });
    } else {
      bucket.positions_unvalued_count += 1;
      bucket.positions.push({
        position_id: Number.isFinite(positionId) ? positionId : -1,
        symbol,
        display_name: displayName,
        instrument_type: instrumentType,
        shares: Number.isFinite(shares) ? shares : null,
        manual_price: Number.isFinite(manualPrice) ? manualPrice : null,
        resolved_live_price: livePrice,
        valuation_method_used: valuationMethod,
        market_value_contribution: null,
        inclusion_status: "unvalued",
        exclusion_reason: null,
        unvalued_reason: unvaluedReason,
      });
    }

    valuationDebugByPortfolio.set(portfolioId, bucket);
  }

  for (const [portfolioId, debug] of valuationDebugByPortfolio.entries()) {
    if (debug.positions_valued_count > 0 && Number.isFinite(debug.included_market_value)) {
      marketValueByPortfolio.set(portfolioId, debug.included_market_value);
    }
  }
  return { marketValueByPortfolio, valuationDebugByPortfolio };
}

async function getMarketValuesFromLatestSnapshots(): Promise<Map<string, number>> {
  const rows = await query(
    `SELECT s.portfolio_id, s.market_value
     FROM ${tables.portfolioSnapshots} s
     INNER JOIN (
       SELECT portfolio_id, MAX(as_of_date) AS latest_as_of_date
       FROM ${tables.portfolioSnapshots}
       GROUP BY portfolio_id
     ) latest ON latest.portfolio_id = s.portfolio_id AND latest.latest_as_of_date = s.as_of_date`
  );

  const out = new Map<string, number>();
  for (const row of rows as Array<{ portfolio_id?: unknown; market_value?: unknown }>) {
    const id = String(row.portfolio_id ?? "").trim();
    const value = Number(row.market_value ?? NaN);
    if (id && Number.isFinite(value)) {
      out.set(id, value);
    }
  }
  return out;
}

export async function buildPortfolioSnapshots() {
  const asOfDate = utcDateString();
  const portfolios = await listPortfolioConfigs();

  const hasPositionsTable = await tableExists(tables.portfolioPositions);
  let marketValueByPortfolio = new Map<string, number>();
  let valuationDebugByPortfolio = new Map<string, PositionValuationDebug>();
  if (hasPositionsTable) {
    const fromPositions = await getMarketValuesFromPositions();
    marketValueByPortfolio = fromPositions.marketValueByPortfolio;
    valuationDebugByPortfolio = fromPositions.valuationDebugByPortfolio;
  } else {
    marketValueByPortfolio = await getMarketValuesFromLatestSnapshots();
  }

  const included = portfolios.filter((item) => item.active && item.included_in_total_portfolio);
  const includedIds = new Set(included.map((item) => item.portfolio_id));

  const includedWithMarketValue = included.filter((item) => marketValueByPortfolio.has(item.portfolio_id));
  const totalMarketValue = includedWithMarketValue.reduce((sum, item) => sum + (marketValueByPortfolio.get(item.portfolio_id) ?? 0), 0);

  let signalCompleteness: SignalCompleteness = "full";
  const hasAnyUnvaluedIncludedPositions = included.some((portfolio) => {
    const valuationDebug = valuationDebugByPortfolio.get(portfolio.portfolio_id);
    return (valuationDebug?.positions_unvalued_count ?? 0) > 0;
  });
  if (includedWithMarketValue.length === 0 || totalMarketValue <= 0) {
    signalCompleteness = "unavailable";
  } else if (includedWithMarketValue.length < included.length || hasAnyUnvaluedIncludedPositions) {
    signalCompleteness = "partial";
  }

  const rows: SnapshotBuildRow[] = [];
  const debugRows: Array<Record<string, unknown>> = [];

  for (const portfolio of portfolios) {
    const marketValue = marketValueByPortfolio.has(portfolio.portfolio_id)
      ? (marketValueByPortfolio.get(portfolio.portfolio_id) ?? null)
      : null;

    const eligibleForWeight = includedIds.has(portfolio.portfolio_id)
      && isFiniteNumber(marketValue)
      && totalMarketValue > 0;

    const actualWeightPct = eligibleForWeight
      ? ((marketValue as number) / totalMarketValue) * 100
      : null;

    const weightEval = includedIds.has(portfolio.portfolio_id)
      ? computeWeightStatus(actualWeightPct, portfolio.min_weight_pct, portfolio.max_weight_pct)
      : { weightStatus: "unavailable" as WeightStatus, bandWidth: null, distanceToEdge: null };

    const rebalanceStatus = includedIds.has(portfolio.portfolio_id)
      ? computeRebalanceStatus(weightEval.weightStatus, portfolio.rebalance_mode)
      : "unavailable";

    const valuationDebug = valuationDebugByPortfolio.get(portfolio.portfolio_id) ?? null;
    const debugPayload = {
      portfolio_id: portfolio.portfolio_id,
      snapshot_market_value: marketValue,
      market_value: marketValue,
      actual_weight_pct: actualWeightPct,
      bandWidth: weightEval.bandWidth,
      distanceToEdge: weightEval.distanceToEdge,
      weight_status: weightEval.weightStatus,
      rebalance_status: rebalanceStatus,
      positions_found_count: valuationDebug?.positions_found_count ?? 0,
      positions_active_count: valuationDebug?.positions_active_count ?? 0,
      positions_valued_count: valuationDebug?.positions_valued_count ?? 0,
      positions_unvalued_count: valuationDebug?.positions_unvalued_count ?? 0,
      position_valuation_details: valuationDebug?.positions ?? [],
      valuation_state: valuationDebug
        ? (valuationDebug.positions_valued_count > 0
          ? (valuationDebug.positions_unvalued_count > 0 ? "partial" : "full")
          : "configured_but_unvalued")
        : "no_active_positions",
    };

    debugRows.push(debugPayload);

    const row: SnapshotBuildRow = {
      portfolio_id: portfolio.portfolio_id,
      as_of_date: asOfDate,
      market_value: marketValue,
      actual_weight_pct: actualWeightPct,
      target_weight_pct: portfolio.target_weight_pct,
      min_weight_pct: portfolio.min_weight_pct,
      max_weight_pct: portfolio.max_weight_pct,
      weight_status: weightEval.weightStatus,
      rebalance_status: rebalanceStatus,
      signal_completeness: signalCompleteness,
      cash_value: null,
      cash_weight_pct: null,
      debug_payload_json: JSON.stringify(debugPayload),
      rebalance_mode: portfolio.rebalance_mode,
      active: portfolio.active,
      included_in_total_portfolio: portfolio.included_in_total_portfolio,
    };

    rows.push(row);

    await execute(
      `INSERT INTO ${tables.portfolioSnapshots} (
        portfolio_id, as_of_date,
        market_value, actual_weight_pct,
        target_weight_pct, min_weight_pct, max_weight_pct,
        weight_status, rebalance_status, signal_completeness,
        cash_value, cash_weight_pct,
        debug_payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(portfolio_id, as_of_date)
      DO UPDATE SET
        market_value = excluded.market_value,
        actual_weight_pct = excluded.actual_weight_pct,
        target_weight_pct = excluded.target_weight_pct,
        min_weight_pct = excluded.min_weight_pct,
        max_weight_pct = excluded.max_weight_pct,
        weight_status = excluded.weight_status,
        rebalance_status = excluded.rebalance_status,
        signal_completeness = excluded.signal_completeness,
        cash_value = excluded.cash_value,
        cash_weight_pct = excluded.cash_weight_pct,
        debug_payload_json = excluded.debug_payload_json`,
      [
        row.portfolio_id,
        row.as_of_date,
        row.market_value,
        row.actual_weight_pct,
        row.target_weight_pct,
        row.min_weight_pct,
        row.max_weight_pct,
        row.weight_status,
        row.rebalance_status,
        row.signal_completeness,
        row.cash_value,
        row.cash_weight_pct,
        row.debug_payload_json,
      ]
    );
  }

  const includedStatuses = rows
    .filter((row) => row.active && row.included_in_total_portfolio)
    .map((row) => row.weight_status);

  return {
    as_of_date: asOfDate,
    portfolios: rows,
    total_market_value: totalMarketValue,
    allocation_plan_status: computeAllocationPlanStatus(includedStatuses),
    debug: {
      total_market_value: totalMarketValue,
      included_portfolios: included.map((item) => item.portfolio_id),
      excluded_portfolios: portfolios
        .filter((item) => !(item.active && item.included_in_total_portfolio))
        .map((item) => item.portfolio_id),
      perPortfolio: debugRows,
      has_positions_table: hasPositionsTable,
      signal_completeness: signalCompleteness,
    },
  };
}
