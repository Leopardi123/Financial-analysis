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
      readHistoryRows: async () => ({
        rows: [
          { date: '2024-01-01', close: 10.1 },
          { date: '2024-01-15', close: 10.2 },
        ],
        missing: false,
      }),
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
      readHistoryRows: async () => ({
        rows: [
          { date: '2024-01-10', close: 1.2 },
          { date: '2024-03-10', close: 1.3 },
          { date: '2024-04-10', close: 1.4 },
          { date: '2024-05-10', close: 1.5 },
        ],
        missing: false,
      }),
    },
  );
  assert(percentile.fx === 1.3, 'percentile should use floor(p*(n-1)) index rule');


  const directCad = await resolveFxUSDToTarget(
    {
      targetCurrency: 'CAD',
      anchorDateUtc: '2024-12-31',
      scenario: { mode: 'spot' },
      allowRefresh: false,
    },
    {
      readHistoryRows: async ({ priceKey }) => ({
        rows: priceKey === 'USD_CAD' ? [{ date: '2024-12-30', close: 1.36 }] : [],
        missing: false,
      }),
    },
  );
  assert(directCad.fx === 1.36, 'spot should resolve USD_CAD directly when available');

  const invertedCad = await resolveFxUSDToTarget(
    {
      targetCurrency: 'CAD',
      anchorDateUtc: '2024-12-31',
      scenario: { mode: 'spot' },
      allowRefresh: false,
    },
    {
      readHistoryRows: async ({ priceKey }) => ({
        rows: priceKey === 'CAD_USD' ? [{ date: '2024-12-30', close: 0.75 }] : [],
        missing: false,
      }),
    },
  );
  assert(Math.abs((invertedCad.fx ?? 0) - (1 / 0.75)) < 1e-9, 'spot should invert CAD_USD when USD_CAD is unavailable');

  const missing = await resolveFxUSDToTarget(
    {
      targetCurrency: 'EUR',
      anchorDateUtc: '2024-12-31',
      scenario: { mode: 'spot' },
      allowRefresh: false,
    },
    {
      readHistoryRows: async () => ({ rows: [], missing: true }),
    },
  );
  assert(missing.fx === null, 'missing history with allowRefresh=false should return null fx');
  assert(missing.warnings.length > 0, 'missing history should produce warnings');

  console.log('resolveFx tests passed');
})();
