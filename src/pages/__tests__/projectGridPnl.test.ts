import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectGridPnl } from '../projectGridPnl.ts';

test('buildProjectGridPnl keeps P&L internally consistent and does not reuse stale EBIT/FCFF', () => {
  const pnl = buildProjectGridPnl({
    revenueByMetal_USD: {
      Au: [90],
      Ag: [510],
    },
    operatingCostsUSD: [58.95],
    siteGandA_USD: [2.8],
    royaltiesUSD: [0.86],
    taxUSD: [10],
    sustainingCapexUSD: [5],
    reclamationUSD: [1],
    workingCapitalDeltaUSD: [2],
    capexUSD: [3],
  }, 1);

  assert.deepEqual(pnl.grossRevenue, [600]);
  assert.equal(Math.abs((pnl.ebitda[0] ?? 0) - 540.19) < 1e-9, true);
  assert.deepEqual(pnl.ebit, [537.39]);
  assert.deepEqual(pnl.fcff, [516.39]);
  assert.equal((pnl.ebit[0] ?? 0) > 0, true);

  // Guard: if stale snapshot EBIT/FCFF had been used, these values would not match.
  assert.notDeepEqual(pnl.ebit, [-61_750_000]);
  assert.notDeepEqual(pnl.fcff, [-61_750_000]);
});
