import { convertPriceToCanonical } from './units/convert.js';
import { getPriceKeyMeta, getProviderMapping } from './registry/getPriceKeyMeta.js';
import { fetchHistorical, type ProviderPriceRow } from './providers/fmp.js';
import { downsampleDailyToMonthlyEom, findLastMonthlyDate, getMonthlySeries, upsertMonthlySeries } from './store/monthly.js';

export type PriceScenario =
  | { mode: 'spot' }
  | { mode: 'percentile'; lookbackYears: number; percentile: number }
  | { mode: 'fixed'; fixedByKey: Record<string, number> };


type ResolveDeps = {
  findLastMonthlyDateFn: typeof findLastMonthlyDate;
  getPriceKeyMetaFn: typeof getPriceKeyMeta;
  getProviderMappingFn: typeof getProviderMapping;
  fetchHistoricalFn: typeof fetchHistorical;
  upsertMonthlySeriesFn: typeof upsertMonthlySeries;
  getMonthlySeriesFn: typeof getMonthlySeries;
};

function withDefaults(deps: Partial<ResolveDeps>): ResolveDeps {
  return {
    findLastMonthlyDateFn: deps.findLastMonthlyDateFn ?? findLastMonthlyDate,
    getPriceKeyMetaFn: deps.getPriceKeyMetaFn ?? getPriceKeyMeta,
    getProviderMappingFn: deps.getProviderMappingFn ?? getProviderMapping,
    fetchHistoricalFn: deps.fetchHistoricalFn ?? fetchHistorical,
    upsertMonthlySeriesFn: deps.upsertMonthlySeriesFn ?? upsertMonthlySeries,
    getMonthlySeriesFn: deps.getMonthlySeriesFn ?? getMonthlySeries,
  };
}

function subtractUtcYears(dateStr: string, years: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
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
    throw new Error(`Unsupported provider: ${mapping.provider}`);
  }

  const dailyRows: ProviderPriceRow[] = await deps.fetchHistoricalFn(mapping.provider_symbol, mapping.provider_kind, fetchFrom, toUtc);
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

export async function resolvePriceSeries(
  args: {
    price_key: string;
    anchorDatesUtc: string[];
    scenario: PriceScenario;
    allowRefresh: boolean;
  },
  deps: Partial<ResolveDeps> = {},
): Promise<{ values: (number | null)[]; warnings: string[] }> {
  const resolvedDeps = withDefaults(deps);
  const sortedAnchors = [...args.anchorDatesUtc].sort();
  if (sortedAnchors.length === 0) {
    return { values: [], warnings: [] };
  }

  if (args.scenario.mode === 'fixed') {
    const fixedValue = args.scenario.fixedByKey[args.price_key];
    if (!Number.isFinite(fixedValue)) {
      return {
        values: args.anchorDatesUtc.map(() => null),
        warnings: [`Missing fixed price for key ${args.price_key}`],
      };
    }
    return { values: args.anchorDatesUtc.map(() => fixedValue), warnings: [] };
  }

  const maxDate = sortedAnchors[sortedAnchors.length - 1];
  const minDate = sortedAnchors[0];
  const fromUtc = args.scenario.mode === 'percentile'
    ? subtractUtcYears(minDate, args.scenario.lookbackYears)
    : minDate;

  if (args.allowRefresh) {
    await maybeRefreshHistory(args.price_key, fromUtc, maxDate, resolvedDeps);
  }

  const rows = await resolvedDeps.getMonthlySeriesFn(args.price_key, fromUtc, maxDate);
  const warnings: string[] = [];

  if (args.scenario.mode === 'spot') {
    const values = args.anchorDatesUtc.map((anchorDateUtc) => {
      const eligible = rows.filter((row) => row.dateUtc <= anchorDateUtc);
      const latest = eligible[eligible.length - 1];
      if (!latest) {
        warnings.push(`No close on or before ${anchorDateUtc} for ${args.price_key}`);
        return null;
      }
      return latest.value;
    });
    return { values, warnings };
  }

  const percentileScenario = args.scenario as Extract<PriceScenario, { mode: 'percentile' }>;
  const values = args.anchorDatesUtc.map((anchorDateUtc) => {
    const windowStart = subtractUtcYears(anchorDateUtc, percentileScenario.lookbackYears);
    const windowValues = rows
      .filter((row) => row.dateUtc >= windowStart && row.dateUtc <= anchorDateUtc)
      .map((row) => row.value)
      .sort((a, b) => a - b);

    if (windowValues.length === 0) {
      warnings.push(`No closes in trailing ${percentileScenario.lookbackYears}y window for ${args.price_key} <= ${anchorDateUtc}`);
      return null;
    }

    const idx = Math.floor((percentileScenario.percentile / 100) * (windowValues.length - 1));
    return windowValues[idx];
  });

  return { values, warnings };
}
