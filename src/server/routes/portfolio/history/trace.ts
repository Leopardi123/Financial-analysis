import { query } from "../../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../../api/_migrate.js";
import { normalizeCurrency, resolveNativeCurrency } from "../../../../lib/portfolio-history/currency.js";
import { computeTrendMetricsFromSeries } from "../../../../lib/portfolio-history/metrics.js";

type PositionRow = {
  id: number;
  symbol: string;
  resolved_symbol: string | null;
  shares: number;
  entry_date: string | null;
  exited_at: string | null;
  active_position: boolean;
  avg_cost: number | null;
  manual_price: number | null;
  currency: string | null;
};

type PricePoint = { price_date: string; close_price: number; currency: string | null };

type FxPoint = { price_date: string; close_price: number };

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function subtractUtcDays(date: string, days: number): string | null {
  if (!isValidDate(date)) return null;
  const dateMs = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(dateMs)) return null;
  return new Date(dateMs - (days * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function findNearestPriorDate(seriesDatesAsc: string[], targetDate: string | null): string | null {
  if (!targetDate) return null;
  let out: string | null = null;
  for (const date of seriesDatesAsc) {
    if (date > targetDate) break;
    out = date;
  }
  return out;
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

function dateSort(a: string, b: string): number {
  return a.localeCompare(b);
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    const portfolioId = String(req.query?.portfolio_id ?? "").trim();
    if (!portfolioId) {
      res.status(400).json({ ok: false, error: "portfolio_id is required" });
      return;
    }

    await ensureSchema();

    const includePositions = String(req.query?.include_positions ?? "1") !== "0";
    const fullMode = String(req.query?.full_mode ?? "0") === "1";
    const compactMode = String(req.query?.compact_mode ?? "0") === "1";
    const limitDaysRaw = Number(req.query?.limit_days ?? (fullMode ? 520 : 260));
    const limitDays = Number.isFinite(limitDaysRaw)
      ? Math.max(30, Math.min(520, Math.floor(limitDaysRaw)))
      : (fullMode ? 520 : 260);

    const [metaRows, positionRowsRaw] = await Promise.all([
      query(
        `SELECT portfolio_id, portfolio_name, portfolio_type
         FROM ${tables.portfolioAdminConfig}
         WHERE portfolio_id = ?
         LIMIT 1`,
        [portfolioId],
      ),
      query(
        `SELECT id, symbol, resolved_symbol, shares, entry_date, exited_at, active_position, avg_cost, manual_price, currency
         FROM ${tables.portfolioPositions}
         WHERE portfolio_id = ?
         ORDER BY active_position DESC, id ASC`,
        [portfolioId],
      ),
    ]);

    const meta = metaRows[0] as any;
    if (!meta) {
      res.status(404).json({ ok: false, error: `Unknown portfolio_id: ${portfolioId}` });
      return;
    }

    const positions: PositionRow[] = (positionRowsRaw as any[])
      .map((row) => ({
        id: Number(row.id ?? NaN),
        symbol: String(row.symbol ?? "").trim().toUpperCase(),
        resolved_symbol: String(row.resolved_symbol ?? "").trim().toUpperCase() || null,
        shares: Number(row.shares ?? NaN),
        entry_date: isValidDate(row.entry_date) ? String(row.entry_date).trim() : null,
        exited_at: isValidDate(row.exited_at) ? String(row.exited_at).trim() : null,
        active_position: Number(row.active_position ?? 0) === 1,
        avg_cost: Number.isFinite(Number(row.avg_cost ?? NaN)) ? Number(row.avg_cost) : null,
        manual_price: Number.isFinite(Number(row.manual_price ?? NaN)) ? Number(row.manual_price) : null,
        currency: normalizeCurrency(row.currency),
      }))
      .filter((row) => row.symbol && Number.isFinite(row.shares) && row.shares > 0);

    const activePositions = positions.filter((row) => row.active_position);
    const priceSymbols = Array.from(new Set(activePositions.flatMap((p) => (p.resolved_symbol ? [p.resolved_symbol, p.symbol] : [p.symbol]))));

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
      const priceDate = String(row.price_date ?? "").trim();
      const closePrice = Number(row.close_price ?? NaN);
      const currency = normalizeCurrency(row.currency);
      if (!symbol || !isValidDate(priceDate) || !Number.isFinite(closePrice) || closePrice <= 0) continue;
      const bucket = priceBySymbol.get(symbol) ?? [];
      bucket.push({ price_date: priceDate, close_price: closePrice, currency });
      priceBySymbol.set(symbol, bucket);
    }

    const companyExchangeRows = priceSymbols.length > 0
      ? await query(
        `SELECT symbol, exchange
         FROM ${tables.companies}
         WHERE symbol IN (${priceSymbols.map(() => "?").join(",")})`,
        priceSymbols,
      )
      : [];
    const companyExchangeBySymbol = new Map<string, string | null>();
    for (const row of companyExchangeRows as any[]) {
      const symbol = String(row.symbol ?? "").trim().toUpperCase();
      const exchange = typeof row.exchange === "string" && row.exchange.trim() ? row.exchange.trim() : null;
      if (!symbol) continue;
      companyExchangeBySymbol.set(symbol, exchange);
    }

    const currencies = Array.from(new Set(
      activePositions
        .flatMap((position) => {
          const historySymbol = position.resolved_symbol ?? position.symbol;
          const series = priceBySymbol.get(historySymbol) ?? priceBySymbol.get(position.symbol) ?? [];
          const fromSeries = Array.from(new Set(series.map((row) => normalizeCurrency(row.currency)).filter((value): value is string => Boolean(value))));
          const inferred = resolveNativeCurrency({
            positionCurrency: position.currency,
            priceCurrency: null,
            historySymbol,
            rawSymbol: position.symbol,
            companyExchangeBySymbol,
          }).currency;
          return [position.currency, inferred, ...fromSeries];
        })
        .map((value) => normalizeCurrency(value))
        .filter((value): value is string => Boolean(value) && value !== "SEK"),
    ));

    const fxSymbols = Array.from(new Set(
      currencies.flatMap((currency) => [
        `${currency}SEK`, `SEK${currency}`,
        `USD${currency}`, `${currency}USD`,
        "USDSEK", "SEKUSD",
      ]),
    ));

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
      const priceDate = String(row.price_date ?? "").trim();
      const closePrice = Number(row.close_price ?? NaN);
      if (!symbol || !isValidDate(priceDate) || !Number.isFinite(closePrice) || closePrice <= 0) continue;
      const bucket = fxBySymbol.get(symbol) ?? [];
      bucket.push({ price_date: priceDate, close_price: closePrice });
      fxBySymbol.set(symbol, bucket);
    }

    const fxCache = new Map<string, { fx_to_sek: number | null; source: string | null; note: string | null }>();
    function resolveFxToSek(date: string, currency: string | null): { fx_to_sek: number | null; source: string | null; note: string | null } {
      const normalized = normalizeCurrency(currency);
      if (!normalized || normalized === "SEK") {
        return normalized === "SEK"
          ? { fx_to_sek: 1, source: "identity", note: "already_in_sek" }
          : { fx_to_sek: null, source: null, note: "missing_native_currency_metadata" };
      }
      const cacheKey = `${date}|${normalized}`;
      const cached = fxCache.get(cacheKey);
      if (cached) return cached;

      const direct = resolveFxFromSeries(fxBySymbol.get(`${normalized}SEK`) ?? [], date, false);
      if (direct && Number.isFinite(direct) && direct > 0) {
        const out = { fx_to_sek: direct, source: `${normalized}SEK`, note: "direct_pair" };
        fxCache.set(cacheKey, out);
        return out;
      }

      const inverseDirect = resolveFxFromSeries(fxBySymbol.get(`SEK${normalized}`) ?? [], date, true);
      if (inverseDirect && Number.isFinite(inverseDirect) && inverseDirect > 0) {
        const out = { fx_to_sek: inverseDirect, source: `SEK${normalized} (inverted)`, note: "inverse_pair" };
        fxCache.set(cacheKey, out);
        return out;
      }

      const usdToSek = resolveFxFromSeries(fxBySymbol.get("USDSEK") ?? [], date, false)
        ?? resolveFxFromSeries(fxBySymbol.get("SEKUSD") ?? [], date, true);
      const usdToNative = resolveFxFromSeries(fxBySymbol.get(`USD${normalized}`) ?? [], date, false)
        ?? resolveFxFromSeries(fxBySymbol.get(`${normalized}USD`) ?? [], date, true);
      if (usdToSek && usdToNative && Number.isFinite(usdToSek) && Number.isFinite(usdToNative) && usdToSek > 0 && usdToNative > 0) {
        const out = { fx_to_sek: usdToSek / usdToNative, source: `cross_via_usd(USDSEK/USD${normalized})`, note: "cross_via_usd" };
        fxCache.set(cacheKey, out);
        return out;
      }

      const out = { fx_to_sek: null, source: null, note: "no_fx_rate" };
      fxCache.set(cacheKey, out);
      return out;
    }

    const snapshotRows = priceSymbols.length > 0
      ? await query(`SELECT symbol FROM ${tables.priceScreenSnapshot} WHERE symbol IN (${priceSymbols.map(() => "?").join(",")})`, priceSymbols)
      : [];
    const snapshotSymbolSet = new Set((snapshotRows as any[]).map((row) => String(row.symbol ?? "").trim().toUpperCase()).filter(Boolean));

    const historyCoverage = activePositions.map((position) => {
      const historySymbol = position.resolved_symbol ?? position.symbol;
      const series = priceBySymbol.get(historySymbol) ?? priceBySymbol.get(position.symbol) ?? [];
      const firstPriceDate = series[0]?.price_date ?? null;
      const lastPriceDate = series[series.length - 1]?.price_date ?? null;
      const effectiveExitedAt = position.active_position ? null : position.exited_at;
      return {
        position_id: position.id,
        raw_symbol: position.symbol,
        resolved_symbol: position.resolved_symbol,
        history_symbol_used: historySymbol,
        first_price_date: firstPriceDate,
        last_price_date: lastPriceDate,
        row_count: series.length,
        has_screen_snapshot: snapshotSymbolSet.has(historySymbol) || snapshotSymbolSet.has(position.symbol),
        effective_start_date_used: position.entry_date ?? firstPriceDate,
        effective_end_date_used: effectiveExitedAt ?? lastPriceDate,
      };
    });

    const tradingDateSet = new Set<string>();
    for (const position of activePositions) {
      const historySymbol = position.resolved_symbol ?? position.symbol;
      const series = priceBySymbol.get(historySymbol) ?? priceBySymbol.get(position.symbol) ?? [];
      const effectiveExitedAt = position.active_position ? null : position.exited_at;
      for (const point of series) {
        if (position.entry_date && point.price_date < position.entry_date) continue;
        if (effectiveExitedAt && point.price_date > effectiveExitedAt) continue;
        tradingDateSet.add(point.price_date);
      }
    }

    const allTradingDates = Array.from(tradingDateSet).sort(dateSort);
    const tracedDates = allTradingDates.length > limitDays
      ? allTradingDates.slice(allTradingDates.length - limitDays)
      : allTradingDates;
    const tracedDateSet = new Set(tracedDates);

    const dailySeries: Array<{
      date: string;
      portfolio_value_total: number;
      contributing_positions_count: number;
      positions: Array<{
        position_id: number;
        symbol: string;
        resolved_symbol: string | null;
        included: boolean;
        exclusion_reason: string | null;
        native_price: number | null;
        native_currency: string | null;
        native_currency_source: string | null;
        company_exchange_used: string | null;
        native_currency_fallback_used: boolean;
        native_currency_warning: string | null;
        fx_to_sek: number | null;
        fx_source: string | null;
        fx_note: string | null;
        value_in_base_currency: number | null;
        running_portfolio_total_after_position: number | null;
      }>;
    }> = [];

    for (const date of tracedDates) {
      let runningTotal = 0;
      let contributors = 0;
      const dayPositions: Array<{
        position_id: number;
        symbol: string;
        resolved_symbol: string | null;
        included: boolean;
        exclusion_reason: string | null;
        native_price: number | null;
        native_currency: string | null;
        native_currency_source: string | null;
        company_exchange_used: string | null;
        native_currency_fallback_used: boolean;
        native_currency_warning: string | null;
        fx_to_sek: number | null;
        fx_source: string | null;
        fx_note: string | null;
        value_in_base_currency: number | null;
        running_portfolio_total_after_position: number | null;
      }> = [];

      for (const position of activePositions) {
        const historySymbol = position.resolved_symbol ?? position.symbol;
        const series = priceBySymbol.get(historySymbol) ?? priceBySymbol.get(position.symbol) ?? [];
        const effectiveExitedAt = position.active_position ? null : position.exited_at;
        const exact = series.find((row) => row.price_date === date) ?? null;

        if (position.entry_date && date < position.entry_date) {
          dayPositions.push({
            position_id: position.id,
            symbol: position.symbol,
            resolved_symbol: position.resolved_symbol,
            included: false,
            exclusion_reason: "before_entry_date",
            native_price: null,
            native_currency: position.currency,
            native_currency_source: position.currency ? "position_currency" : null,
            company_exchange_used: companyExchangeBySymbol.get(historySymbol) ?? companyExchangeBySymbol.get(position.symbol) ?? null,
            native_currency_fallback_used: false,
            native_currency_warning: position.currency ? null : "native_currency_unresolved",
            fx_to_sek: null,
            fx_source: null,
            fx_note: null,
            value_in_base_currency: null,
            running_portfolio_total_after_position: null,
          });
          continue;
        }
        if (effectiveExitedAt && date > effectiveExitedAt) {
          dayPositions.push({
            position_id: position.id,
            symbol: position.symbol,
            resolved_symbol: position.resolved_symbol,
            included: false,
            exclusion_reason: "after_exit_date",
            native_price: null,
            native_currency: position.currency,
            native_currency_source: position.currency ? "position_currency" : null,
            company_exchange_used: companyExchangeBySymbol.get(historySymbol) ?? companyExchangeBySymbol.get(position.symbol) ?? null,
            native_currency_fallback_used: false,
            native_currency_warning: position.currency ? null : "native_currency_unresolved",
            fx_to_sek: null,
            fx_source: null,
            fx_note: null,
            value_in_base_currency: null,
            running_portfolio_total_after_position: null,
          });
          continue;
        }
        if (!exact) {
          dayPositions.push({
            position_id: position.id,
            symbol: position.symbol,
            resolved_symbol: position.resolved_symbol,
            included: false,
            exclusion_reason: (position.resolved_symbol == null && series.length === 0) ? "unresolved_symbol" : "no_price_for_date",
            native_price: null,
            native_currency: position.currency,
            native_currency_source: position.currency ? "position_currency" : null,
            company_exchange_used: companyExchangeBySymbol.get(historySymbol) ?? companyExchangeBySymbol.get(position.symbol) ?? null,
            native_currency_fallback_used: false,
            native_currency_warning: position.currency ? null : "native_currency_unresolved",
            fx_to_sek: null,
            fx_source: null,
            fx_note: null,
            value_in_base_currency: null,
            running_portfolio_total_after_position: null,
          });
          continue;
        }

        const nativeCurrencyResolution = resolveNativeCurrency({
          positionCurrency: position.currency,
          priceCurrency: exact.currency,
          historySymbol,
          rawSymbol: position.symbol,
          companyExchangeBySymbol,
        });
        const nativeCurrency = nativeCurrencyResolution.currency;
        const fx = resolveFxToSek(date, nativeCurrency);
        if (!fx.fx_to_sek || !Number.isFinite(fx.fx_to_sek) || fx.fx_to_sek <= 0) {
          dayPositions.push({
            position_id: position.id,
            symbol: position.symbol,
            resolved_symbol: position.resolved_symbol,
            included: false,
            exclusion_reason: nativeCurrencyResolution.source === "unresolved" ? "unresolved_native_currency" : "no_fx_rate",
            native_price: exact.close_price,
            native_currency: nativeCurrency,
            native_currency_source: nativeCurrencyResolution.source,
            company_exchange_used: nativeCurrencyResolution.company_exchange_used,
            native_currency_fallback_used: nativeCurrencyResolution.fallback_used,
            native_currency_warning: nativeCurrencyResolution.warning,
            fx_to_sek: null,
            fx_source: fx.source,
            fx_note: fx.note,
            value_in_base_currency: null,
            running_portfolio_total_after_position: null,
          });
          continue;
        }

        const valueSek = position.shares * exact.close_price * fx.fx_to_sek;
        if (!Number.isFinite(valueSek) || valueSek <= 0) {
          dayPositions.push({
            position_id: position.id,
            symbol: position.symbol,
            resolved_symbol: position.resolved_symbol,
            included: false,
            exclusion_reason: "invalid_valuation",
            native_price: exact.close_price,
            native_currency: nativeCurrency,
            native_currency_source: nativeCurrencyResolution.source,
            company_exchange_used: nativeCurrencyResolution.company_exchange_used,
            native_currency_fallback_used: nativeCurrencyResolution.fallback_used,
            native_currency_warning: nativeCurrencyResolution.warning,
            fx_to_sek: fx.fx_to_sek,
            fx_source: fx.source,
            fx_note: fx.note,
            value_in_base_currency: null,
            running_portfolio_total_after_position: null,
          });
          continue;
        }

        runningTotal += valueSek;
        contributors += 1;
        dayPositions.push({
          position_id: position.id,
          symbol: position.symbol,
          resolved_symbol: position.resolved_symbol,
          included: true,
          exclusion_reason: null,
          native_price: exact.close_price,
          native_currency: nativeCurrency,
          native_currency_source: nativeCurrencyResolution.source,
          company_exchange_used: nativeCurrencyResolution.company_exchange_used,
          native_currency_fallback_used: nativeCurrencyResolution.fallback_used,
          native_currency_warning: nativeCurrencyResolution.warning,
          fx_to_sek: fx.fx_to_sek,
          fx_source: fx.source,
          fx_note: fx.note,
          value_in_base_currency: valueSek,
          running_portfolio_total_after_position: runningTotal,
        });
      }

      dailySeries.push({
        date,
        portfolio_value_total: runningTotal,
        contributing_positions_count: contributors,
        positions: includePositions
          ? (compactMode
            ? dayPositions.map((row) => ({
                position_id: row.position_id,
                symbol: row.symbol,
                resolved_symbol: row.resolved_symbol,
                included: row.included,
                exclusion_reason: row.exclusion_reason,
                native_currency: row.native_currency,
                native_currency_source: row.native_currency_source,
                company_exchange_used: row.company_exchange_used,
                native_currency_fallback_used: row.native_currency_fallback_used,
                native_currency_warning: row.native_currency_warning,
                fx_to_sek: row.fx_to_sek,
                value_in_base_currency: row.value_in_base_currency,
              })) as any
            : dayPositions)
          : [],
      });
    }

    const metricSeries = dailySeries
      .filter((row) => Number.isFinite(row.portfolio_value_total) && row.portfolio_value_total > 0)
      .map((row) => ({
        as_of_date: row.date,
        market_value: row.portfolio_value_total,
        contributor_count: row.contributing_positions_count,
        currency_basis: "SEK",
      }));
    const trend = computeTrendMetricsFromSeries(metricSeries);

    const metricDates = metricSeries.map((row) => row.as_of_date);
    const metricByDate = new Map(metricSeries.map((row) => [row.as_of_date, row.market_value]));
    const latestDate = trend.last_history_date;
    const latestValue = trend.latest_value;
    const latestPortfolioDateCandidate = tracedDates[tracedDates.length - 1] ?? null;
    const dailyByDate = new Map(dailySeries.map((row) => [row.date, row]));
    const latestRow = latestDate ? dailyByDate.get(latestDate) ?? null : null;
    const candidateRow = latestPortfolioDateCandidate ? dailyByDate.get(latestPortfolioDateCandidate) ?? null : null;
    const referenceDate = "2026-04-02";
    const referenceRow = dailyByDate.get(referenceDate) ?? null;

    const perPositionCutoffDiagnostics = activePositions.map((position) => {
      const historySymbol = position.resolved_symbol ?? position.symbol;
      const series = priceBySymbol.get(historySymbol) ?? priceBySymbol.get(position.symbol) ?? [];
      const latestSeriesPoint = series[series.length - 1] ?? null;
      const nativeCurrencyResolution = resolveNativeCurrency({
        positionCurrency: position.currency,
        priceCurrency: latestSeriesPoint?.currency ?? null,
        historySymbol,
        rawSymbol: position.symbol,
        companyExchangeBySymbol,
      });
      const nativeCurrency = nativeCurrencyResolution.currency;
      const fxCoverageDates = nativeCurrency && nativeCurrency !== "SEK"
        ? series
          .map((point) => point.price_date)
          .filter((date) => {
            const fx = resolveFxToSek(date, nativeCurrency);
            return Number.isFinite(fx.fx_to_sek) && (fx.fx_to_sek ?? 0) > 0;
          })
        : [];
      const includedDates = dailySeries
        .filter((row) => row.positions.some((p) => p.position_id === position.id && p.included))
        .map((row) => row.date);
      const droppedAfterDate = includedDates.length > 0
        ? (includedDates[includedDates.length - 1] ?? null)
        : null;
      const latestExclusion = latestPortfolioDateCandidate
        ? candidateRow?.positions.find((p) => p.position_id === position.id && !p.included)?.exclusion_reason ?? null
        : null;

      return {
        position_id: position.id,
        raw_symbol: position.symbol,
        resolved_symbol: position.resolved_symbol,
        native_currency: nativeCurrency,
        first_date_with_price: series[0]?.price_date ?? null,
        last_date_with_price: series[series.length - 1]?.price_date ?? null,
        first_date_with_fx_if_needed: fxCoverageDates[0] ?? (nativeCurrency === "SEK" ? series[0]?.price_date ?? null : null),
        last_date_with_fx_if_needed: fxCoverageDates[fxCoverageDates.length - 1] ?? (nativeCurrency === "SEK" ? series[series.length - 1]?.price_date ?? null : null),
        included_on_latest_portfolio_date: latestDate
          ? Boolean(latestRow?.positions.find((p) => p.position_id === position.id)?.included)
          : false,
        dropped_after_date: droppedAfterDate,
        latest_exclusion_reason: latestExclusion,
      };
    });

    const windows = [20, 65, 200].map((lookbackDays) => {
      const key = `${lookbackDays}d` as "20d" | "65d" | "200d";
      const anchorDate = lookbackDays === 20 ? trend.anchor_20d_date : lookbackDays === 65 ? trend.anchor_65d_date : trend.anchor_200d_date;
      const anchorValue = lookbackDays === 20 ? trend.value_at_20d_anchor : lookbackDays === 65 ? trend.value_at_65d_anchor : trend.value_at_200d_anchor;
      const returnValue = lookbackDays === 20 ? trend.return_20d : lookbackDays === 65 ? trend.return_65d : trend.return_200d;
      const returnValid = lookbackDays === 20 ? trend.return_20d_valid : lookbackDays === 65 ? trend.return_65d_valid : trend.return_200d_valid;
      const invalidReasons = lookbackDays === 20 ? trend.invalid_reasons_20d : lookbackDays === 65 ? trend.invalid_reasons_65d : trend.invalid_reasons_200d;

      const targetDate = latestDate ? subtractUtcDays(latestDate, lookbackDays) : null;
      const nearestPrior = findNearestPriorDate(metricDates, targetDate);

      return {
        window: key,
        latest_date: latestDate,
        latest_value: latestValue,
        anchor_target_date: targetDate,
        anchor_actual_date_used: anchorDate,
        anchor_nearest_prior_date_from_target: nearestPrior,
        anchor_selection_rule: "lookback_index_trading_days",
        anchor_value: anchorValue,
        computed_return_pct: returnValue,
        return_valid: returnValid,
        invalid_reason: returnValid ? null : (invalidReasons[0] ?? "invalid_window"),
        invalid_reasons: invalidReasons,
        anchor_date_in_traced_range: anchorDate ? tracedDateSet.has(anchorDate) : false,
        anchor_value_from_series_lookup: anchorDate ? (metricByDate.get(anchorDate) ?? null) : null,
      };
    });

    const latestSnapshotRows = await query(
      `SELECT MAX(as_of_date) AS as_of_date FROM ${tables.portfolioSnapshots} WHERE portfolio_id = ?`,
      [portfolioId],
    );

    res.status(200).json({
      ok: true,
      endpoint: "/api/portfolio/history/trace",
      source_mode: "direct_compute" as const,
      db_write_attempted: false,
      materialization_triggered: false,
      parameters: {
        portfolio_id: portfolioId,
        include_positions: includePositions,
        full_mode: fullMode,
        compact_mode: compactMode,
        limit_days: limitDays,
      },
      portfolio_meta: {
        portfolio_id: String(meta.portfolio_id ?? portfolioId),
        portfolio_name: String(meta.portfolio_name ?? ""),
        portfolio_type: String(meta.portfolio_type ?? ""),
        as_of_date_used: trend.last_history_date,
        latest_snapshot_date: String(latestSnapshotRows[0]?.as_of_date ?? "").trim() || null,
        target_currency: "SEK",
        display_currency: "SEK",
      },
      positions: activePositions.map((row) => ({
        position_id: row.id,
        raw_symbol: row.symbol,
        resolved_symbol: row.resolved_symbol,
        shares: row.shares,
        entry_date: row.entry_date,
        exited_at: row.exited_at,
        active_position: row.active_position,
        avg_cost: row.avg_cost,
        manual_price: row.manual_price,
        currency: row.currency,
        company_exchange: companyExchangeBySymbol.get(row.resolved_symbol ?? row.symbol) ?? companyExchangeBySymbol.get(row.symbol) ?? null,
      })),
      position_cutoff_diagnostics: perPositionCutoffDiagnostics,
      history_coverage: historyCoverage,
      daily_portfolio_series: dailySeries,
      return_windows: windows,
      final_trend: {
        return_20d: trend.return_20d,
        return_65d: trend.return_65d,
        return_200d: trend.return_200d,
        short_direction: trend.short_direction,
        medium_direction: trend.medium_direction,
        long_direction: trend.long_direction,
        trend_status: trend.trend_status,
        trend_completeness: trend.trend_completeness,
      },
      notes: {
        read_only: true,
        mutation_performed: false,
        source_mode: "direct_compute",
        db_write_attempted: false,
        materialization_triggered: false,
        latest_portfolio_date_candidate: latestPortfolioDateCandidate,
        final_latest_date_used: latestDate,
        final_latest_date_reason: latestDate === latestPortfolioDateCandidate
          ? "latest_trading_date_has_contributors"
          : "latest_trading_date_has_no_contributors_or_no_valid_valuations",
        contributing_positions_on_final_latest_date: latestRow?.contributing_positions_count ?? 0,
        contributing_positions_on_2026_04_02: referenceRow?.contributing_positions_count ?? 0,
        missing_symbols_or_fx_on_2026_04_02: (referenceRow?.positions ?? [])
          .filter((row) => row.included === false && ["no_price_for_date", "unresolved_symbol", "unresolved_native_currency", "no_fx_rate"].includes(String(row.exclusion_reason ?? "")))
          .map((row) => ({
            position_id: row.position_id,
            symbol: row.symbol,
            resolved_symbol: row.resolved_symbol,
            exclusion_reason: row.exclusion_reason,
            native_currency: row.native_currency,
            fx_source: row.fx_source,
          })),
        trace_date_count: dailySeries.length,
        total_metric_points_used_for_returns: metricSeries.length,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
