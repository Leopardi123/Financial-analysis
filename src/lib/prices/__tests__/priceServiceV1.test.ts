import { convertPriceToCanonical } from '../units/convert.ts';
import { UNIT_CONSTANTS } from '../units/types.ts';
import { downsampleDailyToMonthlyEom } from '../store/monthly.ts';
import { resolvePriceSeries } from '../resolve.ts';
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
      getMonthlySeriesFn: async () => [
        { dateUtc: '2024-12-31', value: 3.95 },
        { dateUtc: '2025-01-31', value: 4.1 },
      ],
    },
  );
  assert(spot.values[0] === 3.95, `Expected carry-forward 3.95, got ${String(spot.values[0])}`);

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
