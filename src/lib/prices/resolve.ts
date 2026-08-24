import { getPriceKeyDefinition } from './keys.ts';
import { convertPriceToCanonical } from './units/convert.ts';
import { getPriceKeyMeta, getProviderMapping } from './registry/getPriceKeyMeta.ts';
import { buildHistoricalWindowUtc, fetchHistorical, getLegacyQuote, resolveLegacyCommodityCloseOnOrBefore, type ProviderPriceRow } from './providers/fmp.ts';
import { fetchFredCommodityPriceSeries, getFredCommodityPriceMapping } from './providers/fred.ts';
import { downsampleDailyToMonthlyEom, findLastMonthlyDate, getMonthlySeries, upsertMonthlySeries } from './store/monthly.ts';
import { getLegacySymbolForPriceKey } from './providers/legacyCommoditySymbolMap.ts';

export type PriceScenario =
  | { mode: 'spot' }
  | { mode: 'percentile'; lookbackYears: number; percentile: number }
  | { mode: 'fixed'; fixedByKey: Record<string, number> };

export type ResolvedPriceSeriesMeta = {
  provider: 'FMP_LEGACY' | 'FRED_IMF' | 'FIXED' | 'STORED_MONTHLY';
  sourceIdentifier: string | null;
  priceType: 'market_close' | 'monthly_period_average' | 'fixed' | 'stored_monthly';
  asOfDateUtc: string | null;
  asOfPeriod: string | null;
};

export type ResolvedPriceSeries = {
  values: (number | null)[];
  warnings: string[];
  meta?: ResolvedPriceSeriesMeta;
};

type ResolveDeps = {
  findLastMonthlyDateFn: typeof findLastMonthlyDate;
  getPriceKeyMetaFn: typeof getPriceKeyMeta;
  getProviderMappingFn: typeof getProviderMapping;
  fetchHistoricalFn: typeof fetchHistorical;
  fetchFredCommodityPriceSeriesFn: typeof fetchFredCommodityPriceSeries;
  upsertMonthlySeriesFn: typeof upsertMonthlySeries;
  getMonthlySeriesFn: typeof getMonthlySeries;
  getLegacyQuoteFn: typeof getLegacyQuote;
  resolveLegacyCommodityCloseOnOrBeforeFn: typeof resolveLegacyCommodityCloseOnOrBefore;
};

function withDefaults(deps: Partial<ResolveDeps>): ResolveDeps {
  return {
    findLastMonthlyDateFn: deps.findLastMonthlyDateFn ?? findLastMonthlyDate,
    getPriceKeyMetaFn: deps.getPriceKeyMetaFn ?? getPriceKeyMeta,
    getProviderMappingFn: deps.getProviderMappingFn ?? getProviderMapping,
    fetchHistoricalFn: deps.fetchHistoricalFn ?? fetchHistorical,
    fetchFredCommodityPriceSeriesFn: deps.fetchFredCommodityPriceSeriesFn ?? fetchFredCommodityPriceSeries,
    upsertMonthlySeriesFn: deps.upsertMonthlySeriesFn ?? upsertMonthlySeries,
    getMonthlySeriesFn: deps.getMonthlySeriesFn ?? getMonthlySeries,
    getLegacyQuoteFn: deps.getLegacyQuoteFn ?? getLegacyQuote,
    resolveLegacyCommodityCloseOnOrBeforeFn: deps.resolveLegacyCommodityCloseOnOrBeforeFn ?? resolveLegacyCommodityCloseOnOrBefore,
  };
}

function subtractUtcYears(dateStr: string, years: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function subtractUtcMonths(dateStr: string, months: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayAfter(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function maybeRefreshHistory(price_key: string, fromUtc: string, toUtc: string, deps: ResolveDeps): Promise<void> {
  const lastDate = await deps.findLastMonthlyDateFn(price_key);
  const fetchFrom = lastDate ? dayAfter(lastDate) : fromUtc;
  if (fetchFrom > toUtc) {
    return;
  }

  const meta = await deps.getPriceKeyMetaFn(price_key);
  const mapping = await deps.getProviderMappingFn(price_key);
  if (mapping.provider.toUpperCase() !== 'FMP') {
    throw new Error(`Unsupported stored-history refresh provider: ${mapping.provider}`);
  }

  const dailyRows: ProviderPriceRow[] = await deps.fetchHistoricalFn(mapping.provider_symbol, mapping.provider_kind, fetchFrom, toUtc, price_key);
  const monthlyCanonicalRows = downsampleDailyToMonthlyEom(
    dailyRows.map((row) => ({
      dateUtc: row.dateUtc,
      value: convertPriceToCanonical({
        value: row.close,
        fromUnit: mapping.provider_unit,
        canonicalUnit: meta.canonical_unit,
      }),
    })),
  );

  await deps.upsertMonthlySeriesFn(price_key, monthlyCanonicalRows);
}

async function resolveFredCommoditySeries(
  priceKey: string,
  anchorDatesUtc: string[],
  scenario: Exclude<PriceScenario, { mode: 'fixed' }>,
  deps: ResolveDeps,
): Promise<ResolvedPriceSeries> {
  const mapping = getFredCommodityPriceMapping(priceKey);
  if (!mapping) {
    throw new Error(`No FRED commodity mapping for ${priceKey}`);
  }

  const sortedAnchors = [...anchorDatesUtc].sort();
  const minAnchor = sortedAnchors[0];
  const maxAnchor = sortedAnchors[sortedAnchors.length - 1];
  const today = todayUtcDateString();
  const providerTo = maxAnchor > today ? today : maxAnchor;
  const providerFrom = scenario.mode === 'percentile'
    ? subtractUtcYears(minAnchor > today ? today : minAnchor, scenario.lookbackYears)
    : subtractUtcMonths(providerTo, 18);
  const definition = getPriceKeyDefinition(priceKey);
  const providerRows = await deps.fetchFredCommodityPriceSeriesFn(mapping, { fromUtc: providerFrom, toUtc: providerTo });
  const rows = providerRows.map((row) => ({
    ...row,
    value: convertPriceToCanonical({
      value: row.close,
      fromUnit: mapping.providerUnit,
      canonicalUnit: definition.canonicalUnit,
    }),
  }));
  const warnings: string[] = [];
  const latestSource = rows.filter((row) => row.dateUtc <= providerTo).at(-1) ?? null;
  const meta: ResolvedPriceSeriesMeta = {
    provider: 'FRED_IMF',
    sourceIdentifier: mapping.fredSeriesId,
    priceType: 'monthly_period_average',
    asOfDateUtc: latestSource?.dateUtc ?? null,
    asOfPeriod: latestSource?.sourcePeriod ?? null,
  };

  if (scenario.mode === 'spot') {
    const values = anchorDatesUtc.map((anchorDateUtc) => {
      const effectiveAnchor = anchorDateUtc > today ? today : anchorDateUtc;
      const eligible = rows.filter((row) => row.dateUtc <= effectiveAnchor);
      return eligible[eligible.length - 1]?.value ?? null;
    });

    if (latestSource) {
      warnings.push(`FRED/IMF monthly benchmark ${mapping.fredSeriesId}: period-average as-of ${latestSource.sourcePeriod}; scenario=spot uses the latest available monthly benchmark, not a spot quote.`);
    } else {
      warnings.push(`No FRED/IMF monthly benchmark available for ${mapping.fredSeriesId} on or before ${providerTo}`);
    }
    return { values, warnings, meta };
  }

  const values = anchorDatesUtc.map((anchorDateUtc) => {
    const effectiveAnchor = anchorDateUtc > today ? today : anchorDateUtc;
    const windowStart = subtractUtcYears(effectiveAnchor, scenario.lookbackYears);
    const windowValues = rows
      .filter((row) => row.dateUtc >= windowStart && row.dateUtc <= effectiveAnchor)
      .map((row) => row.value)
      .sort((a, b) => a - b);

    if (windowValues.length === 0) {
      warnings.push(`No FRED/IMF monthly observations in trailing ${scenario.lookbackYears}y window for ${mapping.fredSeriesId} <= ${effectiveAnchor}`);
      return null;
    }

    const idx = Math.floor((scenario.percentile / 100) * (windowValues.length - 1));
    return windowValues[idx];
  });

  return { values, warnings: [...new Set(warnings)], meta };
}

export async function resolvePriceSeries(
  args: {
    price_key: string;
    anchorDatesUtc: string[];
    scenario: PriceScenario;
    allowRefresh: boolean;
  },
  deps: Partial<ResolveDeps> = {},
): Promise<ResolvedPriceSeries> {
  const resolvedDeps = withDefaults(deps);
  const sortedAnchors = [...args.anchorDatesUtc].sort();
  if (sortedAnchors.length === 0) {
    return { values: [], warnings: [] };
  }

  if (args.scenario.mode === 'fixed') {
    const fixedValue = args.scenario.fixedByKey[args.price_key];
    const meta: ResolvedPriceSeriesMeta = {
      provider: 'FIXED',
      sourceIdentifier: args.price_key,
      priceType: 'fixed',
      asOfDateUtc: null,
      asOfPeriod: null,
    };
    if (!Number.isFinite(fixedValue)) {
      return {
        values: args.anchorDatesUtc.map(() => null),
        warnings: [`Missing fixed price for key ${args.price_key}`],
        meta,
      };
    }
    return { values: args.anchorDatesUtc.map(() => fixedValue), warnings: [], meta };
  }

  if (getFredCommodityPriceMapping(args.price_key)) {
    return resolveFredCommoditySeries(args.price_key, args.anchorDatesUtc, args.scenario, resolvedDeps);
  }

  const warnings: string[] = [];
  const seenWarnings = new Set<string>();
  const pushWarning = (message: string) => {
    if (!seenWarnings.has(message)) {
      seenWarnings.add(message);
      warnings.push(message);
    }
  };
  const legacySymbol = getLegacySymbolForPriceKey(args.price_key);
  if (!legacySymbol) {
    pushWarning(`Unknown commodity priceKey ${args.price_key}; provide legacy symbol`);
  }

  const maxDate = sortedAnchors[sortedAnchors.length - 1];
  const minDate = sortedAnchors[0];
  const spotWindow = args.scenario.mode === 'spot'
    ? buildHistoricalWindowUtc({ toUtc: maxDate, lookbackDays: 30, maxLookbackDays: 60 })
    : null;
  if (spotWindow?.wasClamped) {
    pushWarning(`historicalWindow: from clamped to ${spotWindow.fromUtc} (maxLookbackDays=${spotWindow.maxLookbackDays})`);
  }

  const fromUtc = args.scenario.mode === 'percentile'
    ? subtractUtcYears(minDate, args.scenario.lookbackYears)
    : args.scenario.mode === 'spot'
      ? spotWindow?.fromUtc ?? minDate
      : minDate;

  if (args.scenario.mode === 'spot' && legacySymbol) {
    const resolvedCommodity = await resolvedDeps.resolveLegacyCommodityCloseOnOrBeforeFn(legacySymbol, maxDate);
    resolvedCommodity.warnings.forEach((warning) => pushWarning(warning));

    if (resolvedCommodity.close !== null) {
      return {
        values: args.anchorDatesUtc.map(() => resolvedCommodity.close),
        warnings,
        meta: {
          provider: 'FMP_LEGACY',
          sourceIdentifier: legacySymbol,
          priceType: 'market_close',
          asOfDateUtc: resolvedCommodity.dateUtc,
          asOfPeriod: resolvedCommodity.dateUtc?.slice(0, 7) ?? null,
        },
      };
    }

    const quote = await resolvedDeps.getLegacyQuoteFn(legacySymbol);
    if (quote) {
      pushWarning(`commodity history missing; fell back to quotes/commodity spot: ${legacySymbol}`);
      return {
        values: args.anchorDatesUtc.map(() => quote.price),
        warnings,
        meta: {
          provider: 'FMP_LEGACY',
          sourceIdentifier: legacySymbol,
          priceType: 'market_close',
          asOfDateUtc: maxDate,
          asOfPeriod: maxDate.slice(0, 7),
        },
      };
    }

    pushWarning(`commodity price missing: ${legacySymbol} (history+spot empty)`);
    return {
      values: args.anchorDatesUtc.map(() => null),
      warnings,
      meta: {
        provider: 'FMP_LEGACY',
        sourceIdentifier: legacySymbol,
        priceType: 'market_close',
        asOfDateUtc: null,
        asOfPeriod: null,
      },
    };
  }

  if (args.allowRefresh) {
    await maybeRefreshHistory(args.price_key, fromUtc, maxDate, resolvedDeps);
  }

  const rows = await resolvedDeps.getMonthlySeriesFn(args.price_key, fromUtc, maxDate);
  if (rows.length === 0 && legacySymbol) {
    pushWarning(`No price data returned from FMP legacy v3 for symbol ${legacySymbol}`);
  }
  const latestStored = rows.at(-1) ?? null;
  const storedMeta: ResolvedPriceSeriesMeta = {
    provider: 'STORED_MONTHLY',
    sourceIdentifier: legacySymbol ?? args.price_key,
    priceType: 'stored_monthly',
    asOfDateUtc: latestStored?.dateUtc ?? null,
    asOfPeriod: latestStored?.dateUtc.slice(0, 7) ?? null,
  };

  if (args.scenario.mode === 'spot') {
    const values = args.anchorDatesUtc.map((anchorDateUtc) => {
      const eligible = rows.filter((row) => row.dateUtc <= anchorDateUtc);
      const latest = eligible[eligible.length - 1];
      if (!latest) {
        pushWarning(`No close on or before ${anchorDateUtc} for ${args.price_key}`);
        return null;
      }
      return latest.value;
    });
    return { values, warnings, meta: storedMeta };
  }

  const percentileScenario = args.scenario as Extract<PriceScenario, { mode: 'percentile' }>;
  const values = args.anchorDatesUtc.map((anchorDateUtc) => {
    const windowStart = subtractUtcYears(anchorDateUtc, percentileScenario.lookbackYears);
    const windowValues = rows
      .filter((row) => row.dateUtc >= windowStart && row.dateUtc <= anchorDateUtc)
      .map((row) => row.value)
      .sort((a, b) => a - b);

    if (windowValues.length === 0) {
      pushWarning(`No closes in trailing ${percentileScenario.lookbackYears}y window for ${args.price_key} <= ${anchorDateUtc}`);
      return null;
    }

    const idx = Math.floor((percentileScenario.percentile / 100) * (windowValues.length - 1));
    return windowValues[idx];
  });

  return { values, warnings, meta: storedMeta };
}
