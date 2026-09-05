import assert from 'node:assert/strict';
import { resolvePriceSeries } from '../resolve.ts';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

(async function run() {
  let calls = 0;
  const deps = {
    resolveLegacyCommodityCloseOnOrBeforeFn: async (_symbol: string, targetDateUtc: string) => {
      calls += 1;
      await delay(25);
      return { close: 2500, dateUtc: targetDateUtc, warnings: [] };
    },
  };
  const args = {
    price_key: 'XAU_USD_TOZ',
    anchorDatesUtc: ['2026-09-05'],
    scenario: { mode: 'spot' as const },
    allowRefresh: false,
  };

  const [a, b, c] = await Promise.all([
    resolvePriceSeries(args, deps),
    resolvePriceSeries(args, deps),
    resolvePriceSeries(args, deps),
  ]);

  assert.equal(calls, 1, 'concurrent spot resolutions for the same key must share one provider promise');
  assert.deepEqual(a.values, [2500]);
  assert.deepEqual(b.values, [2500]);
  assert.deepEqual(c.values, [2500]);

  const next = await resolvePriceSeries(args, deps);
  assert.equal(calls, 2, 'completed spot resolutions must not become a stale long-lived cache');
  assert.deepEqual(next.values, [2500]);

  console.log('spotResolutionInflight tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
