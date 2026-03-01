import assert from 'node:assert/strict';
import { getProjectInputs } from '../projectInputs.ts';

const derived = getProjectInputs({
  snapshot: {
    targetCurrency: 'USD',
    fx_USD_to_TargetCurrency: 1,
    discountRate: 0.1,
    aggregation: {
      productionStartPeriod: 0,
      corporateMasterN: 2,
      auPriceUSDPerOz: [2, 2, 2],
    },
    series: {
      grossRevenueUSD: [10, 20, 30],
      fcffUSD: [1, 1, 1],
      capexUSD: [1, 1, 1],
    },
  },
  parsedProject: null,
});

assert.deepEqual(derived.series.grossRevenueUSD, [10, 20, 30]);
assert.deepEqual(derived.series.payableAuEqOz, [5, 10, 15]);

const preferredAggregationPayable = getProjectInputs({
  snapshot: {
    targetCurrency: 'USD',
    fx_USD_to_TargetCurrency: 1,
    discountRate: 0.1,
    aggregation: {
      productionStartPeriod: 0,
      corporateMasterN: 2,
      auPriceUSDPerOz: [2, 2, 2],
      payableAuEqOz_total: [9, 8, 7],
    },
    series: {
      grossRevenueUSD: [10, 20, 30],
      fcffUSD: [1, 1, 1],
      capexUSD: [1, 1, 1],
    },
  },
  parsedProject: null,
});

assert.deepEqual(preferredAggregationPayable.series.payableAuEqOz, [9, 8, 7]);

console.log('ok projectInputs');
