export type FredCommodityProviderUnit = 'USD_PER_LB' | 'USD_PER_TONNE';

export type FredCommodityPriceMapping = {
  priceKey: string;
  fredSeriesId: string;
  providerUnit: FredCommodityProviderUnit;
  frequency: 'monthly';
  description: string;
};

/**
 * Verified IMF Primary Commodity Prices series distributed by FRED.
 * These are monthly period-average benchmarks, not spot quotes.
 * Entries here may be used by the normal price resolver where FRED is the
 * canonical live/most-recent source for that key.
 */
export const FRED_COMMODITY_PRICE_MAPPINGS: readonly FredCommodityPriceMapping[] = [
  {
    priceKey: 'ZN_USD_LB',
    fredSeriesId: 'PZINCUSDM',
    providerUnit: 'USD_PER_TONNE',
    frequency: 'monthly',
    description: 'IMF/FRED global zinc benchmark, monthly period average',
  },
  {
    priceKey: 'PB_USD_LB',
    fredSeriesId: 'PLEADUSDM',
    providerUnit: 'USD_PER_TONNE',
    frequency: 'monthly',
    description: 'IMF/FRED global lead benchmark, monthly period average',
  },
  {
    priceKey: 'NI_USD_LB',
    fredSeriesId: 'PNICKUSDM',
    providerUnit: 'USD_PER_TONNE',
    frequency: 'monthly',
    description: 'IMF/FRED global nickel benchmark, monthly period average',
  },
  {
    priceKey: 'SN_USD_LB',
    fredSeriesId: 'PTINUSDM',
    providerUnit: 'USD_PER_TONNE',
    frequency: 'monthly',
    description: 'IMF/FRED global tin benchmark, monthly period average',
  },
  {
    priceKey: 'IRON_ORE_USD_TONNE',
    fredSeriesId: 'PIORECRUSDM',
    providerUnit: 'USD_PER_TONNE',
    frequency: 'monthly',
    description: 'IMF/FRED global iron ore benchmark, monthly period average',
  },
  {
    priceKey: 'URANIUM_USD_LB',
    fredSeriesId: 'PURANUSDM',
    providerUnit: 'USD_PER_LB',
    frequency: 'monthly',
    description: 'IMF/FRED global uranium benchmark, monthly period average',
  },
] as const;

/**
 * Verified long-history mappings that are intentionally NOT eligible as the
 * normal current-price source. Copper current pricing stays on the existing
 * FMP/COMEX path; cycle calibration uses the IMF/FRED global copper benchmark
 * PCOPPUSDM as a history-only relative-cycle proxy. The multiplier is
 * dimensionless, while the source basis remains explicitly distinct from
 * current COMEX spot.
 */
export const FRED_HISTORY_ONLY_COMMODITY_PRICE_MAPPINGS: readonly FredCommodityPriceMapping[] = [
  {
    priceKey: 'CU_USD_LB',
    fredSeriesId: 'PCOPPUSDM',
    providerUnit: 'USD_PER_TONNE',
    frequency: 'monthly',
    description: 'IMF/FRED global copper benchmark, monthly period average; history-only relative-cycle proxy for current COMEX-derived USD/lb copper',
  },
  {
    priceKey: 'CU_USD_TONNE',
    fredSeriesId: 'PCOPPUSDM',
    providerUnit: 'USD_PER_TONNE',
    frequency: 'monthly',
    description: 'IMF/FRED global copper benchmark, monthly period average; history-only for cycle calibration',
  },
] as const;

const FRED_COMMODITY_PRICE_MAP = new Map(
  FRED_COMMODITY_PRICE_MAPPINGS.map((mapping) => [mapping.priceKey, mapping]),
);
const FRED_HISTORY_ONLY_COMMODITY_PRICE_MAP = new Map(
  FRED_HISTORY_ONLY_COMMODITY_PRICE_MAPPINGS.map((mapping) => [mapping.priceKey, mapping]),
);

export function getFredCommodityPriceMapping(priceKey: string): FredCommodityPriceMapping | null {
  return FRED_COMMODITY_PRICE_MAP.get(priceKey) ?? null;
}

export function getFredHistoryCommodityPriceMapping(priceKey: string): FredCommodityPriceMapping | null {
  return FRED_COMMODITY_PRICE_MAP.get(priceKey) ?? FRED_HISTORY_ONLY_COMMODITY_PRICE_MAP.get(priceKey) ?? null;
}

export function isFredHistoryOnlyCommodityPriceKey(priceKey: string): boolean {
  return FRED_HISTORY_ONLY_COMMODITY_PRICE_MAP.has(priceKey);
}

export function isFredCommodityPriceKey(priceKey: string): boolean {
  return FRED_COMMODITY_PRICE_MAP.has(priceKey);
}

type FredObservation = {
  date?: string;
  value?: string;
};

type FredObservationsResponse = {
  observations?: FredObservation[];
};

export type FredCommodityPriceRow = {
  dateUtc: string;
  close: number;
  sourcePeriod: string;
};

type FetchFn = typeof fetch;

function requireFredApiKey(): string {
  const key = String(process.env.FRED_API_KEY ?? '').trim();
  if (!key) {
    throw new Error('FRED_API_KEY is not set');
  }
  return key;
}

function monthEndUtc(dateUtc: string): string {
  const source = new Date(`${dateUtc.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(source.getTime())) {
    throw new Error(`Invalid FRED observation date: ${dateUtc}`);
  }
  source.setUTCMonth(source.getUTCMonth() + 1, 0);
  return source.toISOString().slice(0, 10);
}

function safeFredUrl(url: URL): string {
  const copy = new URL(url.toString());
  if (copy.searchParams.has('api_key')) {
    copy.searchParams.set('api_key', '***');
  }
  return copy.toString();
}

export async function fetchFredCommodityPriceSeries(
  mapping: FredCommodityPriceMapping,
  args: { fromUtc: string; toUtc: string },
  deps: { fetchFn?: FetchFn; apiKey?: string } = {},
): Promise<FredCommodityPriceRow[]> {
  const apiKey = deps.apiKey ?? requireFredApiKey();
  const url = new URL('https://api.stlouisfed.org/fred/series/observations');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('series_id', mapping.fredSeriesId);
  url.searchParams.set('observation_start', args.fromUtc);
  url.searchParams.set('observation_end', args.toUtc);
  url.searchParams.set('sort_order', 'asc');

  const response = await (deps.fetchFn ?? fetch)(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `FRED commodity request failed (${mapping.fredSeriesId}): ${response.status} ${body.slice(0, 300)} request=${safeFredUrl(url)}`,
    );
  }

  const payload = (await response.json()) as FredObservationsResponse;
  const observations = Array.isArray(payload.observations) ? payload.observations : [];

  return observations
    .map((observation): FredCommodityPriceRow | null => {
      const date = typeof observation.date === 'string' ? observation.date.slice(0, 10) : '';
      const raw = typeof observation.value === 'string' ? observation.value.trim() : '';
      const close = raw === '.' ? Number.NaN : Number(raw);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close)) {
        return null;
      }
      return {
        dateUtc: monthEndUtc(date),
        close,
        sourcePeriod: date.slice(0, 7),
      };
    })
    .filter((row): row is FredCommodityPriceRow => row !== null)
    .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
}
