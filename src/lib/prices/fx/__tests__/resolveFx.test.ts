import { resolveFxUSDToTarget } from '../resolveFx.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

(async function runTests() {
  const usd = await resolveFxUSDToTarget({
    targetCurrency: 'USD',
    anchorDateUtc: '2025-01-01',
    scenario: { mode: 'spot' },
    allowRefresh: false,
  });
  assert(usd.fx === 1, 'USD target should resolve to fx=1');

  const spot = await resolveFxUSDToTarget(
    {
      targetCurrency: 'SEK',
      anchorDateUtc: '2024-01-31',
      scenario: { mode: 'spot' },
      allowRefresh: false,
    },
    {
      fetchHistorical: async ({ symbol }) => symbol === 'USDSEK'
        ? [
            { date: '2024-01-01', close: 10.1 },
            { date: '2024-01-15', close: 10.2 },
          ]
        : [],
    },
  );
  assert(spot.fx === 10.2, 'spot should resolve last close <= anchor');

  const percentile = await resolveFxUSDToTarget(
    {
      targetCurrency: 'CAD',
      anchorDateUtc: '2024-12-31',
      scenario: { mode: 'percentile', lookbackYears: 1, percentile: 50 },
      allowRefresh: false,
    },
    {
      fetchHistorical: async ({ symbol }) => symbol === 'USDCAD'
        ? [
            { date: '2024-01-10', close: 1.2 },
            { date: '2024-03-10', close: 1.3 },
            { date: '2024-04-10', close: 1.4 },
            { date: '2024-05-10', close: 1.5 },
          ]
        : [],
    },
  );
  assert(percentile.fx === 1.3, 'percentile should use floor(p*(n-1)) index rule');

  const invertedCad = await resolveFxUSDToTarget(
    {
      targetCurrency: 'CAD',
      anchorDateUtc: '2024-12-31',
      scenario: { mode: 'spot' },
      allowRefresh: false,
    },
    {
      fetchHistorical: async ({ symbol }) => symbol === 'CADUSD' ? [{ date: '2024-12-30', close: 0.75 }] : [],
    },
  );
  assert(Math.abs((invertedCad.fx ?? 0) - (1 / 0.75)) < 1e-9, 'spot should invert CADUSD when USDCAD is unavailable');

  const futureAnchor = await resolveFxUSDToTarget(
    {
      targetCurrency: 'CAD',
      anchorDateUtc: '2099-12-31',
      scenario: { mode: 'spot' },
      allowRefresh: false,
    },
    {
      fetchHistorical: async () => [],
    },
  );
  assert(futureAnchor.warnings.some((w) => w.includes('is in the future; clamped to')), 'future anchor should be clamped with diagnostic');

  const missing = await resolveFxUSDToTarget(
    {
      targetCurrency: 'EUR',
      anchorDateUtc: '2024-12-31',
      scenario: { mode: 'spot' },
      allowRefresh: false,
    },
    {
      fetchHistorical: async () => [],
    },
  );
  assert(missing.fx === null, 'missing history should return null fx');
  assert(missing.warnings.some((w) => w.includes('No price data returned from FMP legacy v3 for symbol')), 'missing history should produce legacy no data warning');
  assert(missing.warnings.some((w) => w.includes('legacyFetch: GET /api/v3/historical-chart/1day')), 'missing history should include failing legacy path');

  console.log('resolveFx tests passed');
})();
