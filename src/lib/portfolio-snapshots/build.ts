import { execute, query } from "../../../api/_db.js";
import { fetchApiV3Json } from "../../../api/_fmp.js";
import { tables } from "../../../api/_migrate.js";
import { listPortfolioConfigs } from "../portfolio-admin/repository.js";
import type { PortfolioAdminConfig } from "../portfolio-admin/types.js";
import { resolveFxUSDToTarget } from "../prices/fx/resolveFx.ts";
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

function asNullableFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
  included_market_value_sek: number;
  positions_excluded_due_to_currency_or_fx: Array<{ position_id: number; symbol: string; reason: string }>;
  positions: Array<{
    position_id: number;
    symbol: string;
    display_name: string | null;
    instrument_type: string | null;
    shares: number | null;
    manual_price: number | null;
    resolved_live_price: number | null;
    resolved_live_price_date: string | null;
    native_price: number | null;
    native_currency: string | null;
    native_market_value: number | null;
    fx_to_sek: number | null;
    market_value_sek: number | null;
    price_source: "explicit_market_value" | "manual_price" | "live_price" | "unresolved";
    fx_source: string | null;
    valuation_method_used: "explicit_market_value" | "manual_price" | "live_price" | "unresolved";
    market_value_contribution: number | null;
    valuation_state: "included" | "excluded" | "unvalued";
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
            p.manual_price,
            p.currency
     FROM ${tables.portfolioPositions} p`
  );
  const latestPrices = await query(
    `SELECT d.symbol, COALESCE(d.adjusted_close, d.close) AS live_price, d.currency, d.price_date
     FROM ${tables.dailyPriceHistory} d
     INNER JOIN (
       SELECT symbol, MAX(price_date) AS latest_price_date
       FROM ${tables.dailyPriceHistory}
       GROUP BY symbol
     ) latest ON latest.symbol = d.symbol AND latest.latest_price_date = d.price_date`
  );
  const livePriceBySymbol = new Map<string, { live_price: number; currency: string | null; price_date: string | null }>();
  for (const row of latestPrices as Array<{ symbol?: unknown; live_price?: unknown; currency?: unknown; price_date?: unknown }>) {
    const symbol = String(row.symbol ?? "").trim().toUpperCase();
    const livePrice = Number(row.live_price ?? NaN);
    const liveCurrency = typeof row.currency === "string" && row.currency.trim()
      ? row.currency.trim().toUpperCase()
      : null;
    const livePriceDate = typeof row.price_date === "string" && row.price_date.trim() ? row.price_date.trim() : null;
    if (symbol && Number.isFinite(livePrice) && livePrice > 0) {
      livePriceBySymbol.set(symbol, { live_price: livePrice, currency: liveCurrency, price_date: livePriceDate });
    }
  }

  function normalizeCurrency(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (!normalized || normalized.length !== 3) return null;
    return normalized;
  }

  const profileCurrencyBySymbol = new Map<string, string | null>();
  async function resolveProfileCurrency(symbol: string): Promise<string | null> {
    if (profileCurrencyBySymbol.has(symbol)) return profileCurrencyBySymbol.get(symbol) ?? null;
    try {
      const payload = await fetchApiV3Json<Array<Record<string, unknown>>>(`profile/${encodeURIComponent(symbol)}`);
      const profile = Array.isArray(payload) ? payload[0] ?? null : null;
      const currency = normalizeCurrency(profile?.currency);
      profileCurrencyBySymbol.set(symbol, currency);
      return currency;
    } catch {
      profileCurrencyBySymbol.set(symbol, null);
      return null;
    }
  }

  const fxToSekByCurrency = new Map<string, { fx_to_sek: number | null; fx_source: string | null; fx_warning: string | null }>();
  async function resolveFxToSek(currency: string, anchorDateUtc: string): Promise<{ fx_to_sek: number | null; fx_source: string | null; fx_warning: string | null }> {
    if (currency === "SEK") {
      return { fx_to_sek: 1, fx_source: "identity:SEK", fx_warning: null };
    }
    const cacheKey = `${currency}|${anchorDateUtc}`;
    const cached = fxToSekByCurrency.get(cacheKey);
    if (cached) return cached;

    if (currency === "USD") {
      const usdToSek = await resolveFxUSDToTarget({
        targetCurrency: "SEK",
        anchorDateUtc,
        scenario: { mode: "spot" },
        allowRefresh: false,
      });
      const out = {
        fx_to_sek: usdToSek.fx,
        fx_source: usdToSek.fx === null ? null : "resolveFxUSDToTarget(USD→SEK, spot)",
        fx_warning: usdToSek.warnings[0] ?? null,
      };
      fxToSekByCurrency.set(cacheKey, out);
      return out;
    }

    const [usdToNative, usdToSek] = await Promise.all([
      resolveFxUSDToTarget({
        targetCurrency: currency,
        anchorDateUtc,
        scenario: { mode: "spot" },
        allowRefresh: false,
      }),
      resolveFxUSDToTarget({
        targetCurrency: "SEK",
        anchorDateUtc,
        scenario: { mode: "spot" },
        allowRefresh: false,
      }),
    ]);
    const fx = usdToNative.fx && usdToSek.fx ? usdToSek.fx / usdToNative.fx : null;
    const warning = [usdToNative.warnings[0], usdToSek.warnings[0]].filter(Boolean).join(" | ") || null;
    const out = {
      fx_to_sek: fx,
      fx_source: fx === null ? null : `cross_via_usd: (USD→SEK)/(USD→${currency})`,
      fx_warning: warning,
    };
    fxToSekByCurrency.set(cacheKey, out);
    return out;
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
    const positionCurrency = normalizeCurrency(row.currency);
    const normalizedSymbol = symbol.toUpperCase();
    const livePriceRow = livePriceBySymbol.get(normalizedSymbol) ?? null;
    const livePrice = livePriceRow?.live_price ?? null;
    const livePriceCurrency = normalizeCurrency(livePriceRow?.currency);
    const livePriceDate = livePriceRow?.price_date ?? null;

    const bucket = valuationDebugByPortfolio.get(portfolioId) ?? {
      portfolio_id: portfolioId,
      positions_found_count: 0,
      positions_active_count: 0,
      positions_valued_count: 0,
      positions_unvalued_count: 0,
      included_market_value_sek: 0,
      positions_excluded_due_to_currency_or_fx: [],
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
        resolved_live_price_date: livePriceDate,
        native_price: null,
        native_currency: null,
        native_market_value: null,
        fx_to_sek: null,
        market_value_sek: null,
        price_source: "unresolved",
        fx_source: null,
        valuation_method_used: "unresolved",
        market_value_contribution: null,
        valuation_state: "excluded",
        inclusion_status: "excluded",
        exclusion_reason: "Position inactive",
        unvalued_reason: null,
      });
      valuationDebugByPortfolio.set(portfolioId, bucket);
      continue;
    }

    bucket.positions_active_count += 1;
    const hasShares = Number.isFinite(shares) && shares > 0;
    const hasExplicitMarketValue = Number.isFinite(directMarketValue) && directMarketValue > 0;
    const hasManualPrice = Number.isFinite(manualPrice) && manualPrice > 0;
    const hasLivePrice = typeof livePrice === "number" && Number.isFinite(livePrice) && livePrice > 0;

    let valuationMethod: "explicit_market_value" | "manual_price" | "live_price" | "unresolved" = "unresolved";
    let nativePrice: number | null = null;
    let nativeMarketValue: number | null = null;
    let marketValueContribution: number | null = null;
    let priceSource: "explicit_market_value" | "manual_price" | "live_price" | "unresolved" = "unresolved";
    let unvaluedReason: string | null = null;

    if (hasExplicitMarketValue) {
      valuationMethod = "explicit_market_value";
      priceSource = "explicit_market_value";
      nativeMarketValue = directMarketValue;
    } else if (hasManualPrice && hasShares) {
      valuationMethod = "manual_price";
      priceSource = "manual_price";
      nativePrice = manualPrice;
      nativeMarketValue = shares * manualPrice;
    } else if (hasLivePrice && hasShares) {
      valuationMethod = "live_price";
      priceSource = "live_price";
      nativePrice = livePrice;
      nativeMarketValue = shares * livePrice;
    } else {
      if (!hasShares) {
        unvaluedReason = "Missing or invalid shares";
      } else if (Number.isFinite(manualPrice) && manualPrice === 0) {
        unvaluedReason = "manual_price is 0 and treated as missing pricing input";
      } else if (Number.isFinite(directMarketValue) && directMarketValue === 0) {
        unvaluedReason = "explicit market_value is 0 and treated as missing pricing input";
      } else if (!hasLivePrice) {
        unvaluedReason = "No live price available for symbol";
      } else {
        unvaluedReason = "Position saved but valuation method could not be resolved";
      }
    }

    const profileCurrency = (!positionCurrency && !livePriceCurrency) ? await resolveProfileCurrency(normalizedSymbol) : null;
    const currencyFallbackForCash = (normalizedSymbol === "CASH" || instrumentType === "cash_proxy") ? "SEK" : null;
    const nativeCurrency = positionCurrency ?? livePriceCurrency ?? profileCurrency ?? currencyFallbackForCash;

    let fxToSek: number | null = null;
    let fxSource: string | null = null;
    let fxWarning: string | null = null;
    if (nativeMarketValue !== null) {
      if (!nativeCurrency) {
        unvaluedReason = unvaluedReason ?? "Missing native trading currency (no position currency, price metadata currency, or profile currency)";
      } else {
        const fxResolution = await resolveFxToSek(nativeCurrency, utcDateString());
        fxToSek = fxResolution.fx_to_sek;
        fxSource = fxResolution.fx_source;
        fxWarning = fxResolution.fx_warning;
        if (fxToSek === null) {
          unvaluedReason = unvaluedReason ?? `Missing FX conversion path ${nativeCurrency}→SEK`;
        } else {
          marketValueContribution = nativeMarketValue * fxToSek;
        }
      }
    }

    if (marketValueContribution !== null && Number.isFinite(marketValueContribution)) {
      bucket.positions_valued_count += 1;
      bucket.included_market_value_sek += marketValueContribution;
      bucket.positions.push({
        position_id: Number.isFinite(positionId) ? positionId : -1,
        symbol,
        display_name: displayName,
        instrument_type: instrumentType,
        shares: Number.isFinite(shares) ? shares : null,
        manual_price: Number.isFinite(manualPrice) ? manualPrice : null,
        resolved_live_price: livePrice,
        resolved_live_price_date: livePriceDate,
        native_price: nativePrice,
        native_currency: nativeCurrency,
        native_market_value: nativeMarketValue,
        fx_to_sek: fxToSek,
        market_value_sek: marketValueContribution,
        price_source: priceSource,
        fx_source: fxSource,
        valuation_method_used: valuationMethod,
        market_value_contribution: marketValueContribution,
        valuation_state: "included",
        inclusion_status: "included",
        exclusion_reason: null,
        unvalued_reason: null,
      });
    } else {
      bucket.positions_unvalued_count += 1;
      if (unvaluedReason && (unvaluedReason.includes("currency") || unvaluedReason.includes("FX"))) {
        bucket.positions_excluded_due_to_currency_or_fx.push({
          position_id: Number.isFinite(positionId) ? positionId : -1,
          symbol,
          reason: unvaluedReason,
        });
      }
      bucket.positions.push({
        position_id: Number.isFinite(positionId) ? positionId : -1,
        symbol,
        display_name: displayName,
        instrument_type: instrumentType,
        shares: Number.isFinite(shares) ? shares : null,
        manual_price: Number.isFinite(manualPrice) ? manualPrice : null,
        resolved_live_price: livePrice,
        resolved_live_price_date: livePriceDate,
        native_price: nativePrice,
        native_currency: nativeCurrency,
        native_market_value: nativeMarketValue,
        fx_to_sek: fxToSek,
        market_value_sek: null,
        price_source: priceSource,
        fx_source: fxSource,
        valuation_method_used: valuationMethod,
        market_value_contribution: null,
        valuation_state: "unvalued",
        inclusion_status: "unvalued",
        exclusion_reason: null,
        unvalued_reason: fxWarning ? `${unvaluedReason}${unvaluedReason ? " | " : ""}${fxWarning}` : unvaluedReason,
      });
    }

    valuationDebugByPortfolio.set(portfolioId, bucket);
  }

  for (const [portfolioId, debug] of valuationDebugByPortfolio.entries()) {
    if (debug.positions_valued_count > 0 && Number.isFinite(debug.included_market_value_sek)) {
      marketValueByPortfolio.set(portfolioId, debug.included_market_value_sek);
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
    const includedPositions = (valuationDebug?.positions ?? []).filter((p) => p.inclusion_status === "included");
    const excludedOrUnvaluedPositions = (valuationDebug?.positions ?? []).filter((p) => p.inclusion_status !== "included");
    const computedIncludedSum = includedPositions
      .map((p) => Number(p.market_value_contribution ?? NaN))
      .filter((value) => Number.isFinite(value))
      .reduce((sum, value) => sum + value, 0);
    const storedSnapshotSum = asNullableFiniteNumber(marketValue);
    const reconciliationDiff = storedSnapshotSum === null ? null : computedIncludedSum - storedSnapshotSum;
    const debugPayload = {
      portfolio_id: portfolio.portfolio_id,
      snapshot_market_value_sek: marketValue,
      market_value_sek: marketValue,
      market_value: marketValue,
      snapshot_row_exists: marketValue !== null,
      snapshot_as_of_date: asOfDate,
      actual_weight_pct: actualWeightPct,
      bandWidth: weightEval.bandWidth,
      distanceToEdge: weightEval.distanceToEdge,
      weight_status: weightEval.weightStatus,
      rebalance_status: rebalanceStatus,
      positions_found_count: valuationDebug?.positions_found_count ?? 0,
      positions_active_count: valuationDebug?.positions_active_count ?? 0,
      positions_valued_count: valuationDebug?.positions_valued_count ?? 0,
      positions_unvalued_count: valuationDebug?.positions_unvalued_count ?? 0,
      holdings_count_expected: valuationDebug?.positions_active_count ?? 0,
      holdings_count_included: includedPositions.length,
      holdings_count_excluded: excludedOrUnvaluedPositions.length,
      db_evidence: {
        snapshot_row_count_for_portfolio_as_of_date: 1,
        latest_snapshot_timestamp_used: asOfDate,
        latest_holdings_rows_used: valuationDebug?.positions_active_count ?? 0,
        latest_price_rows_used: Array.from(new Set((valuationDebug?.positions ?? [])
          .map((p) => p.resolved_live_price_date)
          .filter((value): value is string => typeof value === "string" && value.length > 0))).length,
        latest_fx_rows_used: (valuationDebug?.positions ?? []).filter((p) => typeof p.fx_source === "string" && p.fx_source.length > 0).length,
      },
      portfolio_market_value_sek: valuationDebug?.included_market_value_sek ?? marketValue ?? null,
      excluded_due_to_currency_or_fx: valuationDebug?.positions_excluded_due_to_currency_or_fx ?? [],
      excluded_positions: excludedOrUnvaluedPositions.map((p) => ({
        symbol: p.symbol,
        reason: p.exclusion_reason ?? p.unvalued_reason ?? "unvalued_unknown",
        inclusion_status: p.inclusion_status,
      })),
      position_valuation_details: valuationDebug?.positions ?? [],
      valuation_reconciliation: {
        formula: "market_value_portfolio = sum(included_position_values) + sum(zero_or_missing_positions_as_0)",
        computed_sum: computedIncludedSum,
        stored_snapshot_sum: storedSnapshotSum,
        diff: reconciliationDiff,
        diff_reason: reconciliationDiff === null
          ? "snapshot_market_value_missing"
          : Math.abs(reconciliationDiff) < 1e-6
            ? null
            : "snapshot_sum_mismatch_requires_investigation",
      },
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
      total_market_value_sek: totalMarketValue,
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
