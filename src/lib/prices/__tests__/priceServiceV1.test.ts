import { convertPriceToCanonical } from '../units/convert.ts';
import { UNIT_CONSTANTS } from '../units/types.ts';
import { downsampleDailyToMonthlyEom } from '../store/monthly.ts';
import { resolvePriceSeries } from '../resolve.ts';
import { buildHistoricalWindowUtc, fetchLegacyCommodityQuotes, getLegacyQuote } from '../providers/fmp.ts';
import { getLegacySymbolForPriceKey } from '../providers/legacyCommoditySymbolMap.ts';
import { getProviderMapping } from '../registry/getPriceKeyMeta.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertApprox(actual: number, expected: number, tolerance: number, label: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

(async function runPriceServiceV1Tests() {
  const usdPerLb = 4.25;
  const usdPerTonne = convertPriceToCanonical({
    value: usdPerLb,
    fromUnit: 'USD_PER_LB',
    canonicalUnit: 'USD_PER_TONNE',
  });
  const roundTrip = convertPriceToCanonical({
    value: usdPerTonne,
    fromUnit: 'USD_PER_TONNE',
    canonicalUnit: 'USD_PER_LB',
  });
  assertApprox(usdPerTonne, usdPerLb * UNIT_CONSTANTS.LB_PER_TONNE, 1e-9, 'lb->tonne');
  assertApprox(roundTrip, usdPerLb, 1e-9, 'tonne->lb round trip');

  const monthly = downsampleDailyToMonthlyEom([
    { dateUtc: '2025-01-02', value: 100 },
    { dateUtc: '2025-01-31', value: 111 },
    { dateUtc: '2025-01-15', value: 105 },
    { dateUtc: '2025-02-14', value: 120 },
  ]);
  assert(JSON.stringify(monthly) === JSON.stringify([
    { dateUtc: '2025-01-31', value: 111 },
    { dateUtc: '2025-02-28', value: 120 },
  ]), `Unexpected monthly EOM rows: ${JSON.stringify(monthly)}`);

  const spot = await resolvePriceSeries(
    {
      price_key: 'CU_USD_LB',
      anchorDatesUtc: ['2025-01-15'],
      scenario: { mode: 'spot' },
      allowRefresh: false,
    },
    {
      resolveLegacyCommodityCloseOnOrBeforeFn: async () => ({
        close: 3.95,
        dateUtc: '2025-01-14',
        warnings: [],
      }),
      getLegacyQuoteFn: async () => ({ symbol: 'HGUSD', price: 4.1 }),
      getMonthlySeriesFn: async () => [],
    },
  );
  assert(spot.values[0] === 3.95, `Expected close-on-or-before 3.95, got ${String(spot.values[0])}`);

  const percentile = await resolvePriceSeries(
    {
      price_key: 'CU_USD_LB',
      anchorDatesUtc: ['2025-01-31'],
      scenario: { mode: 'percentile', lookbackYears: 2, percentile: 50 },
      allowRefresh: false,
    },
    {
      getMonthlySeriesFn: async () => [
        { dateUtc: '2024-10-31', value: 1 },
        { dateUtc: '2024-11-30', value: 100 },
        { dateUtc: '2024-12-31', value: 2 },
        { dateUtc: '2025-01-31', value: 3 },
      ],
    },
  );
  assert(percentile.values[0] === 2, `Expected floor quantile=2, got ${String(percentile.values[0])}`);

  const fredZinc = await resolvePriceSeries(
    {
      price_key: 'ZN_USD_LB',
      anchorDatesUtc: ['2026-08-24'],
      scenario: { mode: 'spot' },
      allowRefresh: false,
    },
    {
      fetchFredCommodityPriceSeriesFn: async (mapping) => {
        assert(mapping.fredSeriesId === 'PZINCUSDM', `Expected PZINCUSDM, got ${mapping.fredSeriesId}`);
        return [
          { dateUtc: '2026-06-30', close: 3300, sourcePeriod: '2026-06' },
          { dateUtc: '2026-07-31', close: 3600, sourcePeriod: '2026-07' },
        ];
      },
    },
  );
  assertApprox(fredZinc.values[0] ?? Number.NaN, 3600 / UNIT_CONSTANTS.LB_PER_TONNE, 1e-9, 'FRED zinc tonne->lb');
  assert(fredZinc.warnings.some((warning) => warning.includes('PZINCUSDM')), 'FRED zinc warning should identify exact series');
  assert(fredZinc.warnings.some((warning) => warning.includes('as-of 2026-07')), 'FRED zinc warning should identify source month');
  assert(fredZinc.warnings.some((warning) => warning.includes('not a spot quote')), 'FRED zinc must not be labelled as spot');

  assert(getLegacySymbolForPriceKey('XPT_USD_TOZ') === 'PLUSD', 'platinum should use verified FMP Legacy PLUSD');
  assert(getLegacySymbolForPriceKey('XPD_USD_TOZ') === 'PAUSD', 'palladium should use verified FMP Legacy PAUSD');
  assert(getLegacySymbolForPriceKey('AL_USD_TONNE') === 'ALIUSD', 'aluminium should use verified FMP Legacy ALIUSD');
  assert(getLegacySymbolForPriceKey('ZN_USD_LB') === null, 'ZNUSD must never be treated as zinc');

  const legacyCommodityQuotes = await fetchLegacyCommodityQuotes({
    fetchApiV3JsonFn: (async (path) => {
      assert(path === 'quotes/commodity', `Expected quotes/commodity path, got ${path}`);
      return [
        { symbol: 'GCUSD', name: 'Gold Futures', price: 5190 },
        { symbol: 'HGUSD', name: 'Copper', price: 4.25 },
      ];
    }) as typeof import('../../../../api/_fmp.ts').fetchApiV3Json,
  });
  assert(legacyCommodityQuotes.some((row) => row.symbol === 'GCUSD'), 'legacy commodity quotes should include GCUSD');

  const legacyGc = await getLegacyQuote('GCUSD', {
    fetchLegacyCommodityQuotesFn: async () => legacyCommodityQuotes,
  });
  assert(legacyGc?.symbol === 'GCUSD', 'getLegacyQuote should match exact legacy symbol');

  const commoditySpotFromHistory = await resolvePriceSeries(
    {
      price_key: 'XAU_USD_TOZ',
      anchorDatesUtc: ['2026-02-27'],
      scenario: { mode: 'spot' },
      allowRefresh: false,
    },
    {
      resolveLegacyCommodityCloseOnOrBeforeFn: async () => ({
        close: 5190,
        dateUtc: '2026-02-27',
        warnings: ['commodity history resolved via historical-price-full: GCUSD close=5190 date=2026-02-27'],
      }),
      getLegacyQuoteFn: async () => ({ symbol: 'GCUSD', price: 5000 }),
      getMonthlySeriesFn: async () => [],
    },
  );
  assert(commoditySpotFromHistory.values[0] === 5190, `Expected commodity history close 5190, got ${String(commoditySpotFromHistory.values[0])}`);
  assert(
    !(commoditySpotFromHistory.warnings.some((w) => w.includes('fell back to quotes/commodity spot'))),
    'should not fall back to quotes when historical-price-full has valid close',
  );

  const commoditySpotFallbackQuote = await resolvePriceSeries(
    {
      price_key: 'XAU_USD_TOZ',
      anchorDatesUtc: ['2026-02-27'],
      scenario: { mode: 'spot' },
      allowRefresh: false,
    },
    {
      resolveLegacyCommodityCloseOnOrBeforeFn: async () => ({
        close: null,
        dateUtc: null,
        warnings: ['legacyFetch: GET /api/v3/historical-price-full/GCUSD?from=2026-01-28&to=2026-02-27'],
      }),
      getLegacyQuoteFn: async () => ({ symbol: 'GCUSD', price: 5222 }),
      getMonthlySeriesFn: async () => [],
    },
  );
  assert(commoditySpotFallbackQuote.values[0] === 5222, `Expected quotes fallback close 5222, got ${String(commoditySpotFallbackQuote.values[0])}`);
  assert(
    commoditySpotFallbackQuote.warnings.some((w) => w.includes('commodity history missing; fell back to quotes/commodity spot: GCUSD')),
    'should emit quotes fallback diagnostic when commodity history is empty',
  );

  const window = buildHistoricalWindowUtc({ toUtc: '2026-02-27', lookbackDays: 30, maxLookbackDays: 60 });
  assert(window.toUtc === '2026-02-27', `window to should remain exact UTC date, got ${window.toUtc}`);
  assert(window.fromUtc === '2026-01-28', `window from should be 30 days lookback, got ${window.fromUtc}`);
  assert(window.fromUtc !== '2006-02-27', 'window from must never drift 20 years back in spot mode');

  let threw = false;
  try {
    await getProviderMapping('CU_USD_LB', {
      queryFn: async () => [
        { provider: 'FMP', provider_symbol: 'COPPERX', provider_kind: 'commodity', notes: null },
      ],
    });
  } catch {
    threw = true;
  }
  assert(threw, 'Commodity mapping without unit notes or recognized symbol should throw');

  console.log('Price service v1 tests passed');
})();
