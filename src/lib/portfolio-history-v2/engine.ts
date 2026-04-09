import { query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";
import { listPortfolioConfigs } from "../portfolio-admin/repository.js";
import { normalizeCurrency, resolveNativeCurrency } from "../portfolio-history/currency.js";
import { computeTrendMetricsFromSeries } from "../portfolio-history/metrics.js";

export type V2PositionDayRow = {
  portfolio_id: string;
  position_id: number;
  symbol: string;
  resolved_symbol: string | null;
  selected_history_symbol: string;
  date: string;
  shares: number;
  native_price: number | null;
  native_currency: string | null;
  fx_to_sek: number | null;
  fx_path: string | null;
  price_sek: number | null;
  market_value_sek: number | null;
  inclusion_status: "included" | "excluded";
  exclusion_reason: string | null;
};

export type V2PortfolioDayRow = {
  portfolio_id: string;
  date: string;
  total_market_value_sek: number;
  contributing_positions_count: number;
  excluded_positions_count: number;
  portfolio_completeness: "full" | "partial" | "empty";
  included_position_ids: number[];
  excluded_position_ids: number[];
  exclusion_reasons_summary: Record<string, number>;
};

type Position = {
  id: number;
  symbol: string;
  resolved_symbol: string | null;
  shares: number;
  entry_date: string | null;
  exited_at: string | null;
  active_position: boolean;
  currency: string | null;
};

type PricePoint = { price_date: string; close_price: number; currency: string | null };
type FxPoint = { price_date: string; close_price: number };

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function resolveFxFromSeries(series: FxPoint[], date: string, invert: boolean): number | null {
  let latest: number | null = null;
  for (const row of series) {
    if (row.price_date > date) break;
    latest = row.close_price;
  }
  if (!Number.isFinite(latest) || latest == null || latest <= 0) return null;
  return invert ? 1 / latest : latest;
}

function baseExcluded(portfolioId: string, p: Position, selectedHistorySymbol: string, date: string, reason: string): V2PositionDayRow {
  return {
    portfolio_id: portfolioId,
    position_id: p.id,
    symbol: p.symbol,
    resolved_symbol: p.resolved_symbol,
    selected_history_symbol: selectedHistorySymbol,
    date,
    shares: p.shares,
    native_price: null,
    native_currency: p.currency,
    fx_to_sek: null,
    fx_path: null,
    price_sek: null,
    market_value_sek: null,
    inclusion_status: "excluded",
    exclusion_reason: reason,
  };
}

function selectSeries(position: Position, priceBySymbol: Map<string, PricePoint[]>) {
  const raw = priceBySymbol.get(position.symbol) ?? [];
  const resolved = position.resolved_symbol ? (priceBySymbol.get(position.resolved_symbol) ?? []) : [];
  const rawLast = raw[raw.length - 1]?.price_date ?? null;
  const resolvedLast = resolved[resolved.length - 1]?.price_date ?? null;
  const useResolved = Boolean(position.resolved_symbol && resolved.length > 0 && (!rawLast || (resolvedLast !== null && resolvedLast >= rawLast)));
  return {
    selected_history_symbol: useResolved ? (position.resolved_symbol as string) : position.symbol,
    series: useResolved ? resolved : raw,
  };
}

export async function computePortfolioV2Trace(portfolioId: string, limitDays = 520) {
  const configs = await listPortfolioConfigs();
  const config = configs.find((c) => c.portfolio_id === portfolioId) ?? null;
  if (!config) throw new Error(`Unknown portfolio_id: ${portfolioId}`);

  const positionRows = await query(
    `SELECT id, symbol, resolved_symbol, shares, entry_date, exited_at, active_position, currency
     FROM ${tables.portfolioPositions}
     WHERE portfolio_id = ? AND COALESCE(shares, 0) > 0 AND symbol IS NOT NULL AND TRIM(symbol) <> ''
     ORDER BY id ASC`,
    [portfolioId],
  ) as Array<{ id?: unknown; symbol?: unknown; resolved_symbol?: unknown; shares?: unknown; entry_date?: unknown; exited_at?: unknown; active_position?: unknown; currency?: unknown }>;

  const positions: Position[] = positionRows
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
    .filter((p) => p.symbol && Number.isFinite(p.shares) && p.shares > 0 && p.active_position);

  const priceSymbols = Array.from(new Set(positions.flatMap((p) => p.resolved_symbol ? [p.resolved_symbol, p.symbol] : [p.symbol])));
  const priceRows = priceSymbols.length > 0
    ? await query(
      `SELECT symbol, price_date, COALESCE(adjusted_close, close) AS close_price, currency
       FROM ${tables.dailyPriceHistory}
       WHERE symbol IN (${priceSymbols.map(() => "?").join(",")})
         AND COALESCE(adjusted_close, close) IS NOT NULL
       ORDER BY symbol ASC, price_date ASC`,
      priceSymbols,
    )
    : [];

  const priceBySymbol = new Map<string, PricePoint[]>();
  for (const row of priceRows as any[]) {
    const symbol = String(row.symbol ?? "").trim().toUpperCase();
    const date = String(row.price_date ?? "").trim();
    const close = Number(row.close_price ?? NaN);
    const currency = normalizeCurrency(row.currency);
    if (!symbol || !isValidDate(date) || !Number.isFinite(close) || close <= 0) continue;
    const bucket = priceBySymbol.get(symbol) ?? [];
    bucket.push({ price_date: date, close_price: close, currency });
    priceBySymbol.set(symbol, bucket);
  }

  const companyExchangeRows = priceSymbols.length > 0
    ? await query(`SELECT symbol, exchange FROM ${tables.companies} WHERE symbol IN (${priceSymbols.map(() => "?").join(",")})`, priceSymbols)
    : [];
  const companyExchangeBySymbol = new Map<string, string | null>();
  for (const row of companyExchangeRows as any[]) {
    const symbol = String(row.symbol ?? "").trim().toUpperCase();
    if (!symbol) continue;
    companyExchangeBySymbol.set(symbol, typeof row.exchange === "string" && row.exchange.trim() ? row.exchange.trim() : null);
  }

  const nonSekCurrencies = Array.from(new Set(
    positions.map((p) => {
      const selected = selectSeries(p, priceBySymbol);
      const latest = selected.series[selected.series.length - 1] ?? null;
      return resolveNativeCurrency({
        positionCurrency: p.currency,
        priceCurrency: latest?.currency ?? null,
        historySymbol: selected.selected_history_symbol,
        rawSymbol: p.symbol,
        companyExchangeBySymbol,
      }).currency;
    }).map((c) => normalizeCurrency(c)).filter((c): c is string => Boolean(c) && c !== "SEK"),
  ));

  const fxSymbols = Array.from(new Set(nonSekCurrencies.flatMap((c) => [`${c}SEK`, `SEK${c}`, `USD${c}`, `${c}USD`, "USDSEK", "SEKUSD"])));
  const fxRows = fxSymbols.length > 0
    ? await query(
      `SELECT symbol, price_date, COALESCE(adjusted_close, close) AS close_price
       FROM ${tables.dailyPriceHistory}
       WHERE symbol IN (${fxSymbols.map(() => "?").join(",")})
         AND COALESCE(adjusted_close, close) IS NOT NULL
       ORDER BY symbol ASC, price_date ASC`,
      fxSymbols,
    )
    : [];

  const fxBySymbol = new Map<string, FxPoint[]>();
  for (const row of fxRows as any[]) {
    const symbol = String(row.symbol ?? "").trim().toUpperCase();
    const date = String(row.price_date ?? "").trim();
    const close = Number(row.close_price ?? NaN);
    if (!symbol || !isValidDate(date) || !Number.isFinite(close) || close <= 0) continue;
    const bucket = fxBySymbol.get(symbol) ?? [];
    bucket.push({ price_date: date, close_price: close });
    fxBySymbol.set(symbol, bucket);
  }

  const fxCache = new Map<string, { fx_to_sek: number | null; path: string | null }>();
  function resolveFxToSek(date: string, currency: string | null): { fx_to_sek: number | null; path: string | null } {
    const c = normalizeCurrency(currency);
    if (!c) return { fx_to_sek: null, path: null };
    if (c === "SEK") return { fx_to_sek: 1, path: "identity" };
    const key = `${date}|${c}`;
    const cached = fxCache.get(key);
    if (cached) return cached;

    const direct = resolveFxFromSeries(fxBySymbol.get(`${c}SEK`) ?? [], date, false);
    if (direct && direct > 0) {
      const out = { fx_to_sek: direct, path: `${c}SEK` };
      fxCache.set(key, out);
      return out;
    }
    const inverse = resolveFxFromSeries(fxBySymbol.get(`SEK${c}`) ?? [], date, true);
    if (inverse && inverse > 0) {
      const out = { fx_to_sek: inverse, path: `SEK${c}(inv)` };
      fxCache.set(key, out);
      return out;
    }
    const usdSek = resolveFxFromSeries(fxBySymbol.get("USDSEK") ?? [], date, false)
      ?? resolveFxFromSeries(fxBySymbol.get("SEKUSD") ?? [], date, true);
    const usdC = resolveFxFromSeries(fxBySymbol.get(`USD${c}`) ?? [], date, false)
      ?? resolveFxFromSeries(fxBySymbol.get(`${c}USD`) ?? [], date, true);
    if (usdSek && usdC && usdSek > 0 && usdC > 0) {
      const out = { fx_to_sek: usdSek / usdC, path: `USD-cross(${c})` };
      fxCache.set(key, out);
      return out;
    }
    const out = { fx_to_sek: null, path: null };
    fxCache.set(key, out);
    return out;
  }

  const selectedPerPosition = positions.map((p) => ({ position: p, selected: selectSeries(p, priceBySymbol) }));
  const dateSet = new Set<string>();
  for (const item of selectedPerPosition) {
    for (const point of item.selected.series) {
      if (item.position.entry_date && point.price_date < item.position.entry_date) continue;
      dateSet.add(point.price_date);
    }
  }
  const allDates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));
  const dates = allDates.length > limitDays ? allDates.slice(allDates.length - limitDays) : allDates;

  const layerA: V2PositionDayRow[] = [];
  for (const date of dates) {
    for (const item of selectedPerPosition) {
      const p = item.position;
      if (p.entry_date && date < p.entry_date) {
        layerA.push(baseExcluded(portfolioId, p, item.selected.selected_history_symbol, date, "before_entry_date"));
        continue;
      }
      const exact = item.selected.series.find((row) => row.price_date === date) ?? null;
      if (!exact) {
        layerA.push(baseExcluded(portfolioId, p, item.selected.selected_history_symbol, date, "missing_native_price"));
        continue;
      }
      const native = resolveNativeCurrency({
        positionCurrency: p.currency,
        priceCurrency: exact.currency,
        historySymbol: item.selected.selected_history_symbol,
        rawSymbol: p.symbol,
        companyExchangeBySymbol,
      }).currency;
      const fx = resolveFxToSek(date, native);
      if (!fx.fx_to_sek || fx.fx_to_sek <= 0) {
        layerA.push({
          ...baseExcluded(portfolioId, p, item.selected.selected_history_symbol, date, "missing_fx"),
          native_price: exact.close_price,
          native_currency: native,
          fx_path: fx.path,
        });
        continue;
      }
      const priceSek = exact.close_price * fx.fx_to_sek;
      const market = priceSek * p.shares;
      if (!Number.isFinite(market) || market <= 0) {
        layerA.push({
          ...baseExcluded(portfolioId, p, item.selected.selected_history_symbol, date, "invalid_valuation"),
          native_price: exact.close_price,
          native_currency: native,
          fx_to_sek: fx.fx_to_sek,
          fx_path: fx.path,
          price_sek: priceSek,
        });
        continue;
      }
      layerA.push({
        portfolio_id: portfolioId,
        position_id: p.id,
        symbol: p.symbol,
        resolved_symbol: p.resolved_symbol,
        selected_history_symbol: item.selected.selected_history_symbol,
        date,
        shares: p.shares,
        native_price: exact.close_price,
        native_currency: native,
        fx_to_sek: fx.fx_to_sek,
        fx_path: fx.path,
        price_sek: priceSek,
        market_value_sek: market,
        inclusion_status: "included",
        exclusion_reason: null,
      });
    }
  }

  const byDate = new Map<string, V2PositionDayRow[]>();
  for (const row of layerA) {
    const bucket = byDate.get(row.date) ?? [];
    bucket.push(row);
    byDate.set(row.date, bucket);
  }

  const layerB: V2PortfolioDayRow[] = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, rows]) => {
    const included = rows.filter((r) => r.inclusion_status === "included");
    const excluded = rows.filter((r) => r.inclusion_status === "excluded");
    const exclusionSummary: Record<string, number> = {};
    for (const row of excluded) {
      const key = row.exclusion_reason ?? "unknown";
      exclusionSummary[key] = (exclusionSummary[key] ?? 0) + 1;
    }
    const portfolioCompleteness: V2PortfolioDayRow["portfolio_completeness"] = included.length === 0 ? "empty" : excluded.length === 0 ? "full" : "partial";
    return {
      portfolio_id: portfolioId,
      date,
      total_market_value_sek: included.reduce((sum, r) => sum + (r.market_value_sek ?? 0), 0),
      contributing_positions_count: included.length,
      excluded_positions_count: excluded.length,
      portfolio_completeness: portfolioCompleteness,
      included_position_ids: included.map((r) => r.position_id),
      excluded_position_ids: excluded.map((r) => r.position_id),
      exclusion_reasons_summary: exclusionSummary,
    };
  }).filter((row) => row.total_market_value_sek > 0);

  const layerCSeries = layerB.map((row) => ({ as_of_date: row.date, market_value: row.total_market_value_sek, contributor_count: row.contributing_positions_count, currency_basis: "SEK" }));
  const trend = computeTrendMetricsFromSeries(layerCSeries);

  const dailyReturns = layerB.map((row, idx) => {
    const prev = idx > 0 ? layerB[idx - 1] : null;
    const first = layerB[0] ?? null;
    const peak = layerB.slice(0, idx + 1).reduce((m, r) => Math.max(m, r.total_market_value_sek), Number.NEGATIVE_INFINITY);
    return {
      date: row.date,
      daily_return_pct: prev && prev.total_market_value_sek > 0 ? ((row.total_market_value_sek / prev.total_market_value_sek) - 1) * 100 : null,
      cumulative_return_pct: first && first.total_market_value_sek > 0 ? ((row.total_market_value_sek / first.total_market_value_sek) - 1) * 100 : null,
      drawdown_pct: Number.isFinite(peak) && peak > 0 ? ((row.total_market_value_sek / peak) - 1) * 100 : null,
    };
  });

  return {
    portfolio: config,
    rules: {
      missing_native_price: "exclude position-day with reason=missing_native_price",
      missing_fx: "exclude position-day with reason=missing_fx",
      mixed_completeness: "portfolio_completeness full|partial|empty from included/excluded counts",
      cash_portfolio: "current-value-only and excluded from historical return series when no priced historical rows exist",
      total_aggregation: "aggregate on explicit available dates with contributor counts",
      return_completeness_changes: "returns computed from final Layer B series only",
    },
    layer_a_position_day_rows: layerA,
    layer_b_portfolio_day_rows: layerB,
    layer_c_returns: {
      trend,
      daily_series: dailyReturns,
    },
  };
}
