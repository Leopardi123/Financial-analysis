import { resolvePriceSeries } from '../resolve.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

(async function runImfProjectResolverTests() {
  const rows = [
    { dateUtc: '2026-05-31', close: 65640, sourcePeriod: '2026-05' },
    { dateUtc: '2026-06-30', close: 66690, sourcePeriod: '2026-06' },
    { dateUtc: '2026-07-31', close: 66882, sourcePeriod: '2026-07' },
  ];

  const spot = await resolvePriceSeries(
    {
      price_key: 'MO_USD_TONNE',
      anchorDatesUtc: ['2026-08-30'],
      scenario: { mode: 'spot' },
      allowRefresh: false,
    },
    {
      fetchImfCommodityPriceSeriesFn: async (mapping) => {
        assertEqual(mapping.datasetSeriesId, 'PLMMODY', 'verified IMF series id');
        return rows;
      },
    },
  );

  assertEqual(spot.values[0], 66882, 'spot mode uses latest available IMF monthly benchmark');
  assertEqual(spot.meta?.provider, 'IMF', 'resolver exposes IMF provider metadata');
  assertEqual(spot.meta?.sourceIdentifier, 'PLMMODY', 'resolver exposes verified IMF source identifier');
  assert(
    spot.warnings.some((warning) => warning.includes('latest available monthly benchmark')),
    'spot mode explains that IMF value is a monthly benchmark rather than a spot quote',
  );

  const percentile = await resolvePriceSeries(
    {
      price_key: 'MO_USD_TONNE',
      anchorDatesUtc: ['2026-08-30'],
      scenario: { mode: 'percentile', lookbackYears: 1, percentile: 50 },
      allowRefresh: false,
    },
    {
      fetchImfCommodityPriceSeriesFn: async () => rows,
    },
  );

  assertEqual(percentile.values[0], 66690, 'percentile mode uses IMF monthly observations');
  console.log('IMF project resolver tests passed');
})();
