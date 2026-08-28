import assert from 'node:assert/strict';
import { refreshHistoryRangeToMonthlyBlobs } from '../../prices/refreshHistory.ts';
import type { PriceKey } from '../../prices/keys.ts';

async function verifyFallback(priceKey: PriceKey, providerSymbol: string): Promise<void> {
  const inserted: Array<Array<string | number | null>> = [];
  let legacyCalls = 0;

  const result = await refreshHistoryRangeToMonthlyBlobs(
    { priceKey, from: '2001-08-28', to: '2026-08-28' },
    {
      queryFn: async (sql) => {
        if (sql.includes('FROM price_provider_map')) {
          return [{ provider: 'FMP', provider_symbol: providerSymbol, provider_kind: 'commodity' }];
        }
        if (sql.includes('FROM price_eod_monthly')) return [];
        return [];
      },
      executeFn: async (_sql, params = []) => {
        inserted.push(params);
      },
      fetchHistoricalFn: async () => {
        throw new Error('stable 402');
      },
      fetchLegacyHistoricalFn: async (symbol, range) => {
        legacyCalls += 1;
        assert.equal(symbol, providerSymbol);
        assert.deepEqual(range, { fromUtc: '2001-08-28', toUtc: '2026-08-28' });
        return [
          { date: '2001-09-28', close: 500 },
          { date: '2001-10-29', close: 510 },
        ];
      },
    },
  );

  assert.equal(legacyCalls, 1);
  assert.equal(result.monthsTouched, 2);
  assert.equal(inserted.length, 2);
  assert.ok(inserted.every((params) => params.includes(providerSymbol)));
}

await verifyFallback('XPT_USD_TOZ', 'PLUSD');
await verifyFallback('XPD_USD_TOZ', 'PAUSD');

console.log('legacyHistoryFallback.test.ts passed');
