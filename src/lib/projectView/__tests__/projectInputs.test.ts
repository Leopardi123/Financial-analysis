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


const legacyFcfFallback = getProjectInputs({
  snapshot: {
    targetCurrency: 'USD',
    fx_USD_to_TargetCurrency: 1,
    discountRate: 0.1,
    aggregation: {
      productionStartPeriod: 0,
      corporateMasterN: 1,
      fcfUSD_total: [3, 4],
    },
    series: {
      fcfUSD: [1, 2],
      capexUSD: [1, 1],
      grossRevenueUSD: [10, 20],
    },
  },
  parsedProject: {
    engineInputWithoutPrices: { taxRate: 0.35 },
  },
});

assert.deepEqual(legacyFcfFallback.series.fcfUSD, [1, 2]);
assert.equal(legacyFcfFallback.economicsTaxRate, 0.35);
