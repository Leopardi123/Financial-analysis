import { execute, query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";
import { listPortfolioConfigs } from "../portfolio-admin/repository.js";
import { normalizeCurrency, resolveNativeCurrency } from "./currency.js";
import { computeTrendMetricsFromSeries } from "./metrics.js";

type DataQuality = "full" | "partial" | "estimated";
type Direction = "positive" | "neutral" | "negative" | "unavailable";
type TrendStatus = "strong_uptrend" | "improving" | "neutral" | "weakening" | "downtrend" | "unavailable";
type TrendCompleteness = "full" | "partial" | "unavailable";

type CanonicalDailyPoint = {
  date: string;
  market_value_sek: number;
  included_position_count: number;
  excluded_position_count: number;
  composition_hash: string;
};

export type CanonicalPortfolioHistoryResult = {
  portfolio_id: string;
  portfolio_name: string;
  as_of_date: string | null;
  first_history_date: string | null;
  last_history_date: string | null;
  latest_value_sek: number | null;
  daily_series: CanonicalDailyPoint[];
  return_20d: number | null;
  return_65d: number | null;
  return_200d: number | null;
  anchor_20d_date: string | null;
  anchor_65d_date: string | null;
  anchor_200d_date: string | null;
  anchor_20d_value_sek: number | null;
  anchor_65d_value_sek: number | null;
  anchor_200d_value_sek: number | null;
  return_20d_valid: boolean;
  return_65d_valid: boolean;
  return_200d_valid: boolean;
  invalid_reason_20d: string | null;
  invalid_reason_65d: string | null;
  invalid_reason_200d: string | null;
  short_direction: Direction;
  medium_direction: Direction;
  long_direction: Direction;
  trend_status: TrendStatus;
  trend_completeness: TrendCompleteness;
  canonical_contract_error: boolean;
  canonical_contract_reason: string | null;
  cumulative_return_pct: number | null;
  drawdown_pct: number | null;
  data_quality: DataQuality;
  inclusion_debug: {
    positions_included: string[];
    positions_excluded: string[];
    exclusion_reasons: Record<string, number>;
  };
  db_evidence: {
    positions_found_in_db: number;
    price_rows_found_in_db: number;
    fx_rows_found_in_db: number;
    first_db_price_date: string | null;
    last_db_price_date: string | null;
    first_db_fx_date: string | null;
    last_db_fx_date: string | null;
    dates_with_zero_included_positions: string[];
    dates_with_partial_positions: string[];
    dates_with_full_positions: string[];
    composition_break_dates: string[];
    excluded_positions_by_reason_count: Record<string, number>;
  };
  consistency_hash: string;
};

export type CanonicalTotalHistoryResult = {
  as_of_date: string | null;
  total_market_value_sek: number | null;
  included_portfolio_ids: string[];
  excluded_portfolio_ids: string[];
  total_series: Array<{ date: string; total_market_value_sek: number; included_portfolio_count: number }>;
  daily_return_pct: number | null;
  cumulative_return_pct: number | null;
  drawdown_pct: number | null;
  history_days_available: number;
  data_quality: DataQuality;
  date_rule_used: "observation_union_no_carry_forward_include_if_present";
  consistency_hash: string;
  db_evidence: {
    portfolio_rows_found_by_portfolio_id: Record<string, number>;
    total_dates_considered: number;
    included_portfolio_count_by_date: Record<string, number>;
    excluded_portfolio_count_by_date: Record<string, number>;
    common_date_coverage_summary: { min: number; max: number; avg: number };
    total_date_used: string | null;
    total_date_why: string;
  };
};

export type CanonicalBundle = {
  canonical_source_version: "portfolio-history-canonical-v2";
  date_rule: "observation_count_lookback";
  continuity_rule: "strict_composition_hash_match";
  total_aggregation_rule: "include_portfolio_if_value_present_on_date_no_carry_forward";
  portfolios: CanonicalPortfolioHistoryResult[];
  total: CanonicalTotalHistoryResult;
};

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function summarizeReturns(series: Array<{ as_of_date: string; market_value: number; contributor_count: number }>) {
  const metrics = computeTrendMetricsFromSeries(series);
  const first = series[0]?.market_value ?? null;
  const last = series[series.length - 1]?.market_value ?? null;
  let runningPeak = Number.NEGATIVE_INFINITY;
  let minDrawdown = 0;
  for (const row of series) {
    runningPeak = Math.max(runningPeak, row.market_value);
    if (runningPeak > 0) {
      minDrawdown = Math.min(minDrawdown, ((row.market_value / runningPeak) - 1) * 100);
    }
  }
  return {
    metrics,
    cumulative_return_pct: first && last ? ((last / first) - 1) * 100 : null,
    drawdown_pct: Number.isFinite(minDrawdown) ? minDrawdown : null,
  };
}

function resolveFxFromSeries(series: Array<{ price_date: string; close_price: number }>, date: string, invert: boolean): number | null {
  let latest: number | null = null;
  for (const row of series) {
    if (row.price_date > date) break;
    latest = row.close_price;
  }
  if (!Number.isFinite(latest) || latest == null || latest <= 0) return null;
  return invert ? 1 / latest : latest;
}

function isFiniteReturn(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function computeDirectionFromReturn(value: number | null): Direction {
  if (!isFiniteReturn(value)) return "unavailable";
  if (value > 2.0) return "positive";
  if (value < -2.0) return "negative";
  return "neutral";
}

function computeTrendStatusFromDirections(shortDirection: Direction, mediumDirection: Direction, longDirection: Direction, completeness: TrendCompleteness): TrendStatus {
  if (completeness === "unavailable") return "unavailable";
  if (shortDirection === "unavailable" && mediumDirection === "unavailable" && longDirection === "unavailable") return "unavailable";
  if (longDirection === "positive" && mediumDirection === "positive" && (shortDirection === "positive" || shortDirection === "neutral")) return "strong_uptrend";
  if (longDirection === "negative" && mediumDirection === "negative" && (shortDirection === "negative" || shortDirection === "neutral")) return "downtrend";
  if (shortDirection === "positive" && (mediumDirection === "positive" || mediumDirection === "neutral")) return "improving";
  if (shortDirection === "negative" && (mediumDirection === "negative" || mediumDirection === "neutral")) return "weakening";
  return "neutral";
}

function computeCompletenessFromReturns(returns: { return_20d: number | null; return_65d: number | null; return_200d: number | null }): TrendCompleteness {
  const has20 = isFiniteReturn(returns.return_20d);
  const has65 = isFiniteReturn(returns.return_65d);
  const has200 = isFiniteReturn(returns.return_200d);
  if (has20 && has65 && has200) return "full";
  if (has20 || has65 || has200) return "partial";
  return "unavailable";
}

function resolveTrendContract(raw: {
  return_20d: number | null;
  return_65d: number | null;
  return_200d: number | null;
  trend_completeness: TrendCompleteness;
}) {
  const reasons: string[] = [];
  if (raw.trend_completeness === "full") {
    if (!isFiniteReturn(raw.return_20d)) reasons.push("full_requires_finite_return_20d");
    if (!isFiniteReturn(raw.return_65d)) reasons.push("full_requires_finite_return_65d");
    if (!isFiniteReturn(raw.return_200d)) reasons.push("full_requires_finite_return_200d");
  }
  const resolvedCompleteness = computeCompletenessFromReturns(raw);
  if (resolvedCompleteness !== raw.trend_completeness) reasons.push(`completeness_downgraded:${raw.trend_completeness}->${resolvedCompleteness}`);
  const shortDirection = computeDirectionFromReturn(raw.return_20d);
  const mediumDirection = computeDirectionFromReturn(raw.return_65d);
  const longDirection = computeDirectionFromReturn(raw.return_200d);
  const trendStatus = computeTrendStatusFromDirections(shortDirection, mediumDirection, longDirection, resolvedCompleteness);
  return {
    return_20d: raw.return_20d,
    return_65d: raw.return_65d,
    return_200d: raw.return_200d,
    short_direction: shortDirection,
    medium_direction: mediumDirection,
    long_direction: longDirection,
    trend_status: trendStatus,
    trend_completeness: resolvedCompleteness,
    canonical_contract_error: reasons.length > 0,
    canonical_contract_reason: reasons.length > 0 ? reasons.join("|") : null,
  };
}

export async function buildPortfolioHistoryCanonical(): Promise<CanonicalBundle> {
  const configs = await listPortfolioConfigs();
  const active = configs.filter((c) => c.active);
  const portfolios: CanonicalPortfolioHistoryResult[] = [];

  for (const config of active) {
    const positionsRows = await query(
      `SELECT id, symbol, resolved_symbol, shares, entry_date, exited_at, active_position, currency FROM ${tables.portfolioPositions} WHERE portfolio_id = ? AND COALESCE(shares,0) > 0`,
      [config.portfolio_id],
    ) as Array<any>;

    const positions = positionsRows
      .map((row) => ({
        id: Number(row.id ?? NaN),
        symbol: String(row.symbol ?? "").trim().toUpperCase(),
        resolved_symbol: String(row.resolved_symbol ?? "").trim().toUpperCase() || null,
        shares: Number(row.shares ?? NaN),
        entry_date: isValidDate(row.entry_date) ? String(row.entry_date).trim() : null,
        exited_at: isValidDate(row.exited_at) ? String(row.exited_at).trim() : null,
        active_position: Number(row.active_position ?? 0) === 1,
        currency: normalizeCurrency(row.currency),
      }))
      .filter((p) => p.symbol && Number.isFinite(p.shares) && p.shares > 0);

    const symbols = Array.from(new Set(positions.flatMap((p) => p.resolved_symbol ? [p.symbol, p.resolved_symbol] : [p.symbol])));
    const priceRows = symbols.length > 0
      ? await query(`SELECT symbol, price_date, COALESCE(adjusted_close, close) AS close_price, currency FROM ${tables.dailyPriceHistory} WHERE symbol IN (${symbols.map(() => "?").join(",")}) ORDER BY symbol ASC, price_date ASC`, symbols)
      : [];
    const pricesBySymbol = new Map<string, Array<{ price_date: string; close_price: number; currency: string | null }>>();
    let firstDbPriceDate: string | null = null;
    let lastDbPriceDate: string | null = null;
    for (const row of priceRows as any[]) {
      const symbol = String(row.symbol ?? "").trim().toUpperCase();
      const priceDate = String(row.price_date ?? "").trim();
      const closePrice = Number(row.close_price ?? NaN);
      const currency = normalizeCurrency(row.currency);
      if (!symbol || !isValidDate(priceDate) || !Number.isFinite(closePrice) || closePrice <= 0) continue;
      if (firstDbPriceDate === null || priceDate < firstDbPriceDate) firstDbPriceDate = priceDate;
      if (lastDbPriceDate === null || priceDate > lastDbPriceDate) lastDbPriceDate = priceDate;
      const bucket = pricesBySymbol.get(symbol) ?? [];
      bucket.push({ price_date: priceDate, close_price: closePrice, currency });
      pricesBySymbol.set(symbol, bucket);
    }

    const exchanges = symbols.length > 0
      ? await query(`SELECT symbol, exchange FROM ${tables.companies} WHERE symbol IN (${symbols.map(() => "?").join(",")})`, symbols)
      : [];
    const exchangeBySymbol = new Map<string, string | null>();
    for (const row of exchanges as any[]) {
      const symbol = String(row.symbol ?? "").trim().toUpperCase();
      if (!symbol) continue;
      exchangeBySymbol.set(symbol, typeof row.exchange === "string" ? row.exchange : null);
    }

    const currencies = Array.from(new Set(positions
      .flatMap((p) => {
        const historySymbol = p.resolved_symbol ?? p.symbol;
        const inferred = resolveNativeCurrency({
          positionCurrency: p.currency,
          priceCurrency: null,
          historySymbol,
          rawSymbol: p.symbol,
          companyExchangeBySymbol: exchangeBySymbol,
        }).currency;
        return [p.currency, inferred];
      })
      .map((c) => normalizeCurrency(c))
      .filter((c): c is string => Boolean(c) && c !== "SEK")));

    const fxSymbols = Array.from(new Set(currencies.flatMap((c) => [`${c}SEK`, `SEK${c}`, `USD${c}`, `${c}USD`, "USDSEK", "SEKUSD"])));
    const fxRows = fxSymbols.length > 0
      ? await query(`SELECT symbol, price_date, COALESCE(adjusted_close, close) AS close_price FROM ${tables.dailyPriceHistory} WHERE symbol IN (${fxSymbols.map(() => "?").join(",")}) ORDER BY symbol ASC, price_date ASC`, fxSymbols)
      : [];
    const fxBySymbol = new Map<string, Array<{ price_date: string; close_price: number }>>();
    let firstDbFxDate: string | null = null;
    let lastDbFxDate: string | null = null;
    for (const row of fxRows as any[]) {
      const symbol = String(row.symbol ?? "").trim().toUpperCase();
      const priceDate = String(row.price_date ?? "").trim();
      const closePrice = Number(row.close_price ?? NaN);
      if (!symbol || !isValidDate(priceDate) || !Number.isFinite(closePrice) || closePrice <= 0) continue;
      if (firstDbFxDate === null || priceDate < firstDbFxDate) firstDbFxDate = priceDate;
      if (lastDbFxDate === null || priceDate > lastDbFxDate) lastDbFxDate = priceDate;
      const bucket = fxBySymbol.get(symbol) ?? [];
      bucket.push({ price_date: priceDate, close_price: closePrice });
      fxBySymbol.set(symbol, bucket);
    }

    const dateSet = new Set<string>();
    const selectedSeriesByPosition = new Map<number, Array<{ price_date: string; close_price: number; currency: string | null }>>();
    const selectedSymbolByPosition = new Map<number, string>();

    for (const p of positions) {
      const rawSeries = pricesBySymbol.get(p.symbol) ?? [];
      const resolvedSeries = p.resolved_symbol ? (pricesBySymbol.get(p.resolved_symbol) ?? []) : [];
      const selected = resolvedSeries.length >= rawSeries.length ? resolvedSeries : rawSeries;
      const selectedSymbol = selected === resolvedSeries && p.resolved_symbol ? p.resolved_symbol : p.symbol;
      selectedSeriesByPosition.set(p.id, selected);
      selectedSymbolByPosition.set(p.id, selectedSymbol);
      for (const pt of selected) {
        if (p.entry_date && pt.price_date < p.entry_date) continue;
        if (!p.active_position && p.exited_at && pt.price_date > p.exited_at) continue;
        dateSet.add(pt.price_date);
      }
    }

    const sortedDates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));
    const dailySeries: CanonicalDailyPoint[] = [];
    const excludedByReason: Record<string, number> = {};
    const includedSymbols = new Set<string>();
    const excludedSymbols = new Set<string>();
    const zeroIncludedDates: string[] = [];
    const partialDates: string[] = [];
    const fullDates: string[] = [];

    const fxCache = new Map<string, number | null>();
    const resolveFxToSek = (date: string, currency: string | null): number | null => {
      const c = normalizeCurrency(currency);
      if (!c) return null;
      if (c === "SEK") return 1;
      const key = `${date}|${c}`;
      if (fxCache.has(key)) return fxCache.get(key) ?? null;
      const direct = resolveFxFromSeries(fxBySymbol.get(`${c}SEK`) ?? [], date, false);
      const inverse = resolveFxFromSeries(fxBySymbol.get(`SEK${c}`) ?? [], date, true);
      const usdToSek = resolveFxFromSeries(fxBySymbol.get("USDSEK") ?? [], date, false) ?? resolveFxFromSeries(fxBySymbol.get("SEKUSD") ?? [], date, true);
      const usdToC = resolveFxFromSeries(fxBySymbol.get(`USD${c}`) ?? [], date, false) ?? resolveFxFromSeries(fxBySymbol.get(`${c}USD`) ?? [], date, true);
      const cross = usdToSek && usdToC ? usdToSek / usdToC : null;
      const out = direct ?? inverse ?? cross ?? null;
      fxCache.set(key, out && out > 0 ? out : null);
      return fxCache.get(key) ?? null;
    };

    for (const date of sortedDates) {
      let value = 0;
      const includedOnDate: string[] = [];
      let excludedCount = 0;
      for (const p of positions) {
        const series = selectedSeriesByPosition.get(p.id) ?? [];
        const historySymbol = selectedSymbolByPosition.get(p.id) ?? p.symbol;
        const px = series.find((row) => row.price_date === date);
        if (!px) {
          excludedCount += 1;
          excludedSymbols.add(historySymbol);
          excludedByReason.missing_price = (excludedByReason.missing_price ?? 0) + 1;
          continue;
        }
        const nativeCurrency = resolveNativeCurrency({
          positionCurrency: p.currency,
          priceCurrency: px.currency,
          historySymbol,
          rawSymbol: p.symbol,
          companyExchangeBySymbol: exchangeBySymbol,
        }).currency;
        const fx = resolveFxToSek(date, nativeCurrency);
        if (!fx || !Number.isFinite(fx) || fx <= 0) {
          excludedCount += 1;
          excludedSymbols.add(historySymbol);
          excludedByReason.missing_fx = (excludedByReason.missing_fx ?? 0) + 1;
          continue;
        }
        const posValue = p.shares * px.close_price * fx;
        if (!Number.isFinite(posValue) || posValue <= 0) {
          excludedCount += 1;
          excludedSymbols.add(historySymbol);
          excludedByReason.invalid_value = (excludedByReason.invalid_value ?? 0) + 1;
          continue;
        }
        value += posValue;
        includedOnDate.push(historySymbol);
        includedSymbols.add(historySymbol);
      }
      const compositionHash = hashString(includedOnDate.sort().join("|"));
      dailySeries.push({ date, market_value_sek: value, included_position_count: includedOnDate.length, excluded_position_count: excludedCount, composition_hash: compositionHash });
      if (includedOnDate.length === 0) zeroIncludedDates.push(date);
      else if (includedOnDate.length < positions.length) partialDates.push(date);
      else fullDates.push(date);
    }

    const filteredSeries = dailySeries.filter((d) => Number.isFinite(d.market_value_sek) && d.market_value_sek > 0);
    const trendInput = filteredSeries.map((d) => ({ as_of_date: d.date, market_value: d.market_value_sek, contributor_count: d.included_position_count }));
    const { metrics, cumulative_return_pct, drawdown_pct } = summarizeReturns(trendInput);
    const latest = filteredSeries[filteredSeries.length - 1] ?? null;
    const anchor20Hash = metrics.anchor_20d_date ? (filteredSeries.find((d) => d.date === metrics.anchor_20d_date)?.composition_hash ?? null) : null;
    const anchor65Hash = metrics.anchor_65d_date ? (filteredSeries.find((d) => d.date === metrics.anchor_65d_date)?.composition_hash ?? null) : null;
    const anchor200Hash = metrics.anchor_200d_date ? (filteredSeries.find((d) => d.date === metrics.anchor_200d_date)?.composition_hash ?? null) : null;
    const latestHash = latest?.composition_hash ?? null;

    const invalid65 = [...metrics.invalid_reasons_65d];
    const invalid20 = [...metrics.invalid_reasons_20d];
    const invalid200 = [...metrics.invalid_reasons_200d];
    if (latestHash && anchor20Hash && latestHash !== anchor20Hash) invalid20.push("composition_hash_mismatch");
    if (latestHash && anchor65Hash && latestHash !== anchor65Hash) invalid65.push("composition_hash_mismatch");
    if (latestHash && anchor200Hash && latestHash !== anchor200Hash) invalid200.push("composition_hash_mismatch");

    const compositionBreakDates: string[] = [];
    for (let i = 1; i < filteredSeries.length; i += 1) {
      if (filteredSeries[i - 1].composition_hash !== filteredSeries[i].composition_hash) compositionBreakDates.push(filteredSeries[i].date);
    }

    const resolvedReturns = {
      return_20d: invalid20.length ? null : metrics.return_20d,
      return_65d: invalid65.length ? null : metrics.return_65d,
      return_200d: invalid200.length ? null : metrics.return_200d,
      trend_completeness: metrics.trend_completeness,
    };
    const trendContract = resolveTrendContract(resolvedReturns);
    if (trendContract.canonical_contract_error && process.env.PORTFOLIO_CONTRACT_STRICT_DEBUG === "1") {
      throw new Error(`canonical_contract_violation:${config.portfolio_id}:${trendContract.canonical_contract_reason ?? "unknown"}`);
    }

    const portfolioResult: CanonicalPortfolioHistoryResult = {
      portfolio_id: config.portfolio_id,
      portfolio_name: config.portfolio_name,
      as_of_date: latest?.date ?? null,
      first_history_date: filteredSeries[0]?.date ?? null,
      last_history_date: latest?.date ?? null,
      latest_value_sek: latest?.market_value_sek ?? null,
      daily_series: filteredSeries,
      return_20d: trendContract.return_20d,
      return_65d: trendContract.return_65d,
      return_200d: trendContract.return_200d,
      anchor_20d_date: metrics.anchor_20d_date,
      anchor_65d_date: metrics.anchor_65d_date,
      anchor_200d_date: metrics.anchor_200d_date,
      anchor_20d_value_sek: metrics.value_at_20d_anchor,
      anchor_65d_value_sek: metrics.value_at_65d_anchor,
      anchor_200d_value_sek: metrics.value_at_200d_anchor,
      return_20d_valid: invalid20.length === 0 && metrics.return_20d_valid,
      return_65d_valid: invalid65.length === 0 && metrics.return_65d_valid,
      return_200d_valid: invalid200.length === 0 && metrics.return_200d_valid,
      invalid_reason_20d: invalid20[0] ?? null,
      invalid_reason_65d: invalid65[0] ?? null,
      invalid_reason_200d: invalid200[0] ?? null,
      short_direction: trendContract.short_direction,
      medium_direction: trendContract.medium_direction,
      long_direction: trendContract.long_direction,
      trend_status: trendContract.trend_status,
      trend_completeness: trendContract.trend_completeness,
      canonical_contract_error: trendContract.canonical_contract_error,
      canonical_contract_reason: trendContract.canonical_contract_reason,
      cumulative_return_pct,
      drawdown_pct,
      data_quality: filteredSeries.every((d) => d.excluded_position_count === 0) ? "full" : (filteredSeries.some((d) => d.included_position_count === 0) ? "estimated" : "partial"),
      inclusion_debug: {
        positions_included: Array.from(includedSymbols).sort((a, b) => a.localeCompare(b)),
        positions_excluded: Array.from(excludedSymbols).sort((a, b) => a.localeCompare(b)),
        exclusion_reasons: excludedByReason,
      },
      db_evidence: {
        positions_found_in_db: positions.length,
        price_rows_found_in_db: priceRows.length,
        fx_rows_found_in_db: fxRows.length,
        first_db_price_date: firstDbPriceDate,
        last_db_price_date: lastDbPriceDate,
        first_db_fx_date: firstDbFxDate,
        last_db_fx_date: lastDbFxDate,
        dates_with_zero_included_positions: zeroIncludedDates,
        dates_with_partial_positions: partialDates,
        dates_with_full_positions: fullDates,
        composition_break_dates: compositionBreakDates,
        excluded_positions_by_reason_count: excludedByReason,
      },
      consistency_hash: hashString(`${config.portfolio_id}|${latest?.date ?? "null"}|${latest?.market_value_sek ?? 0}|${latestHash ?? "none"}`),
    };

    portfolios.push(portfolioResult);
  }

  const includedPortfolios = active.filter((c) => c.included_in_total_portfolio).map((c) => c.portfolio_id);
  const byId = new Map(portfolios.map((p) => [p.portfolio_id, p]));
  const totalDateSet = new Set<string>();
  const rowsById: Record<string, number> = {};
  for (const id of includedPortfolios) {
    const s = byId.get(id)?.daily_series ?? [];
    rowsById[id] = s.length;
    for (const row of s) totalDateSet.add(row.date);
  }
  const totalDates = Array.from(totalDateSet).sort((a, b) => a.localeCompare(b));
  const totalSeries: Array<{ date: string; total_market_value_sek: number; included_portfolio_count: number }> = [];
  const includedByDate: Record<string, number> = {};
  const excludedByDate: Record<string, number> = {};
  for (const date of totalDates) {
    let sum = 0;
    let inc = 0;
    for (const id of includedPortfolios) {
      const row = byId.get(id)?.daily_series.find((r) => r.date === date);
      if (!row) continue;
      sum += row.market_value_sek;
      inc += 1;
    }
    if (inc > 0) totalSeries.push({ date, total_market_value_sek: sum, included_portfolio_count: inc });
    includedByDate[date] = inc;
    excludedByDate[date] = Math.max(includedPortfolios.length - inc, 0);
  }

  const tLatest = totalSeries[totalSeries.length - 1] ?? null;
  const tPrev = totalSeries.length > 1 ? totalSeries[totalSeries.length - 2] : null;
  const tFirst = totalSeries[0] ?? null;
  let peak = Number.NEGATIVE_INFINITY;
  let minDrawdown = 0;
  for (const row of totalSeries) {
    peak = Math.max(peak, row.total_market_value_sek);
    if (peak > 0) minDrawdown = Math.min(minDrawdown, ((row.total_market_value_sek / peak) - 1) * 100);
  }

  const total: CanonicalTotalHistoryResult = {
    as_of_date: tLatest?.date ?? null,
    total_market_value_sek: tLatest?.total_market_value_sek ?? null,
    included_portfolio_ids: includedPortfolios,
    excluded_portfolio_ids: active.map((c) => c.portfolio_id).filter((id) => !includedPortfolios.includes(id)),
    total_series: totalSeries,
    daily_return_pct: tLatest && tPrev && tPrev.total_market_value_sek !== 0 ? ((tLatest.total_market_value_sek / tPrev.total_market_value_sek) - 1) * 100 : null,
    cumulative_return_pct: tLatest && tFirst && tFirst.total_market_value_sek !== 0 ? ((tLatest.total_market_value_sek / tFirst.total_market_value_sek) - 1) * 100 : null,
    drawdown_pct: Number.isFinite(minDrawdown) ? minDrawdown : null,
    history_days_available: totalSeries.length,
    data_quality: totalSeries.every((r) => r.included_portfolio_count === includedPortfolios.length) ? "full" : "partial",
    date_rule_used: "observation_union_no_carry_forward_include_if_present",
    consistency_hash: hashString(`${tLatest?.date ?? "none"}|${tLatest?.total_market_value_sek ?? 0}|${includedPortfolios.join(",")}`),
    db_evidence: {
      portfolio_rows_found_by_portfolio_id: rowsById,
      total_dates_considered: totalDates.length,
      included_portfolio_count_by_date: includedByDate,
      excluded_portfolio_count_by_date: excludedByDate,
      common_date_coverage_summary: {
        min: totalSeries.length > 0 ? Math.min(...totalSeries.map((r) => r.included_portfolio_count)) : 0,
        max: totalSeries.length > 0 ? Math.max(...totalSeries.map((r) => r.included_portfolio_count)) : 0,
        avg: totalSeries.length > 0 ? totalSeries.reduce((s, r) => s + r.included_portfolio_count, 0) / totalSeries.length : 0,
      },
      total_date_used: tLatest?.date ?? null,
      total_date_why: "latest canonical total series date",
    },
  };

  return {
    canonical_source_version: "portfolio-history-canonical-v2",
    date_rule: "observation_count_lookback",
    continuity_rule: "strict_composition_hash_match",
    total_aggregation_rule: "include_portfolio_if_value_present_on_date_no_carry_forward",
    portfolios,
    total,
  };
}

export async function materializePortfolioHistoryCanonical(bundle?: CanonicalBundle): Promise<CanonicalBundle> {
  const result = bundle ?? await buildPortfolioHistoryCanonical();
  await execute(`DELETE FROM ${tables.portfolioHistoryDaily}`);
  for (const portfolio of result.portfolios) {
    let prev: number | null = null;
    let first: number | null = null;
    let peak = Number.NEGATIVE_INFINITY;
    for (const row of portfolio.daily_series) {
      first = first ?? row.market_value_sek;
      peak = Math.max(peak, row.market_value_sek);
      const daily = prev && prev !== 0 ? ((row.market_value_sek / prev) - 1) * 100 : null;
      const cumulative = first && first !== 0 ? ((row.market_value_sek / first) - 1) * 100 : null;
      const drawdown = peak > 0 ? ((row.market_value_sek / peak) - 1) * 100 : null;
      await execute(
        `INSERT INTO ${tables.portfolioHistoryDaily} (portfolio_id, as_of_date, total_return_index, market_value, daily_return_pct, cumulative_return_pct, drawdown_pct, cash_weight_pct, data_source, data_quality) VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?)`,
        [portfolio.portfolio_id, row.date, row.market_value_sek, daily, cumulative, drawdown, "positions_price_history", portfolio.data_quality],
      );
      prev = row.market_value_sek;
    }
  }

  await execute(`DELETE FROM ${tables.totalPortfolioHistoryDaily}`);
  let tPrev: number | null = null;
  let tFirst: number | null = null;
  let tPeak = Number.NEGATIVE_INFINITY;
  for (const row of result.total.total_series) {
    tFirst = tFirst ?? row.total_market_value_sek;
    tPeak = Math.max(tPeak, row.total_market_value_sek);
    const daily = tPrev && tPrev !== 0 ? ((row.total_market_value_sek / tPrev) - 1) * 100 : null;
    const cumulative = tFirst && tFirst !== 0 ? ((row.total_market_value_sek / tFirst) - 1) * 100 : null;
    const drawdown = tPeak > 0 ? ((row.total_market_value_sek / tPeak) - 1) * 100 : null;
    await execute(
      `INSERT INTO ${tables.totalPortfolioHistoryDaily} (as_of_date, total_return_index, market_value, daily_return_pct, cumulative_return_pct, drawdown_pct, total_cash_value, total_cash_weight_pct, included_portfolio_count, data_quality) VALUES (?, NULL, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      [row.date, row.total_market_value_sek, daily, cumulative, drawdown, row.included_portfolio_count, result.total.data_quality],
    );
    tPrev = row.total_market_value_sek;
  }

  await execute(
    `INSERT INTO ${tables.portfolioBuildMeta} (pipeline_name, last_success_at)
     VALUES ('history', ?)
     ON CONFLICT(pipeline_name) DO UPDATE SET last_success_at = excluded.last_success_at`,
    [new Date().toISOString()],
  );

  return result;
}

export async function readPortfolioHistoryCanonicalLatest() {
  return buildPortfolioHistoryCanonical();
}

export async function readPortfolioHistoryCanonicalTrace(portfolioId: string) {
  const bundle = await buildPortfolioHistoryCanonical();
  const portfolio = bundle.portfolios.find((p) => p.portfolio_id === portfolioId) ?? null;
  return { bundle, portfolio };
}

export async function readPortfolioHistoryCanonicalTotal() {
  const bundle = await buildPortfolioHistoryCanonical();
  return bundle.total;
}
