import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateProjectsToCorporateTotals } from '../aggregateProjectsToCorporateTotals.ts';

test('aggregates FCF with trailing zero padding to masterN', () => {
  const totals = aggregateProjectsToCorporateTotals(
    [
      { fcfUSD: [-100, 50, 50, 0, 0], capexUSD: [100, 0, 0, 0, 0] },
      { fcfUSD: [-50, 20, 20], capexUSD: [50, 0, 0] },
    ],
    4,
  );

  assert.deepEqual(totals.fcfUSD_total, [-150, 70, 70, 0, 0]);
  assert.deepEqual(totals.capexUSD_total, [150, 0, 0, 0, 0]);
});

test('uses strict null propagation for required FCF and capex fields', () => {
  const totals = aggregateProjectsToCorporateTotals(
    [
      { fcfUSD: [-100, 50, 50], capexUSD: [100, 0, 0] },
      { fcfUSD: [-50, null, 20], capexUSD: [50, null, 0] },
    ],
    2,
  );

  assert.deepEqual(totals.fcfUSD_total, [-150, null, 70]);
  assert.deepEqual(totals.capexUSD_total, [150, null, 0]);
});

test('builds sustainingCostUSD_total from components when direct series is unavailable', () => {
  const totals = aggregateProjectsToCorporateTotals(
    [
      {
        fcfUSD: [0, 0],
        capexUSD: [0, 0],
        operatingCostsUSD: [10, 10],
        sustainingCapexUSD: [1, 1],
        siteGandA_USD: [2, 2],
        royaltiesUSD: [3, 3],
        reclamationAccrualUSD: [4, 4],
      },
      {
        fcfUSD: [0, 0],
        capexUSD: [0, 0],
        operatingCostsUSD: [20, 20],
        sustainingCapexUSD: [2, 2],
        siteGandA_USD: [3, 3],
        royaltiesUSD: [4, 4],
        reclamationAccrualUSD: [5, 5],
      },
    ],
    1,
  );

  assert.deepEqual(totals.sustainingCostUSD_total, [54, 54]);
});
