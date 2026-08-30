import assert from 'node:assert/strict';
import { getPriceKeyDefinition } from '../keys.js';
import { getLatestCanonicalPrice, getPriceProviderDescriptor } from '../providerService.js';
import { refreshHistoryRangeToMonthlyBlobs } from '../refreshHistory.js';
import { getImfCommodityPriceMapping } from '../providers/imfCommodity.js';

const definition = getPriceKeyDefinition('MO_USD_TONNE');
assert.equal(definition.canonicalUnit, 'USD_per_tonne');

const imfMapping = getImfCommodityPriceMapping('MO_USD_TONNE');
assert.ok(imfMapping);
assert.equal(imfMapping.datasetSeriesId, 'PLMMODY');

const providerMapping = {
  provider: 'IMF',
  provider_symbol: 'PLMMODY',
  provider_kind: 'commodity',
  provider_unit: 'USD_PER_TONNE',
  notes: 'unit=USD_PER_TONNE',
};

const descriptor = await getPriceProviderDescriptor('MO_USD_TONNE', {
  getProviderMappingFn: async () => providerMapping,
});
assert.deepEqual(descriptor, {
  provider: 'IMF',
  source_symbol: 'PLMMODY',
  price_type: 'monthly_period_average',
});

const latest = await getLatestCanonicalPrice(
  'MO_USD_TONNE',
  { anchorDateUtc: '2026-08-30' },
  {
    getProviderMappingFn: async () => providerMapping,
    fetchImfCommodityPriceSeriesFn: async () => [
      { dateUtc: '2026-06-30', close: 42_000, sourcePeriod: '2026-06' },
      { dateUtc: '2026-07-31', close: 44_000, sourcePeriod: '2026-07' },
    ],
  },
);
assert.equal(latest.provider, 'IMF');
assert.equal(latest.source_symbol, 'PLMMODY');
assert.equal(latest.price, 44_000);
assert.equal(latest.asof_utc, '2026-07-31');
assert.equal(latest.asof_period, '2026-07');

const writes: Array<{ sql: string; params: Array<string | number | null> }> = [];
const refreshed = await refreshHistoryRangeToMonthlyBlobs(
  { priceKey: 'MO_USD_TONNE', from: '2026-06-01', to: '2026-08-30' },
  {
    queryFn: async (sql, params = []) => {
      if (sql.includes('FROM price_provider_map')) {
        return [{ provider: 'IMF', provider_symbol: 'PLMMODY', provider_kind: 'commodity' }];
      }
      if (sql.includes('FROM price_eod_monthly')) {
        return [];
      }
      throw new Error(`Unexpected query: ${sql} ${JSON.stringify(params)}`);
    },
    executeFn: async (sql, params = []) => {
      writes.push({ sql, params });
    },
    fetchImfCommodityPriceSeriesFn: async () => [
      { dateUtc: '2026-06-30', close: 42_000, sourcePeriod: '2026-06' },
      { dateUtc: '2026-07-31', close: 44_000, sourcePeriod: '2026-07' },
    ],
  },
);
assert.equal(refreshed.monthsTouched, 2);
assert.equal(writes.length, 2);
for (const write of writes) {
  assert.equal(write.params[0], 'MO_USD_TONNE');
  assert.equal(write.params[3], 'IMF');
  assert.equal(write.params[4], 'PLMMODY');
}

console.log('IMF molybdenum price integration tests passed');
