import assert from 'node:assert/strict';
import { UNIT_CONSTANTS } from '../../prices/units/types.ts';
import {
  deriveCorporatePreRevenueMetrics,
  type CorporateSnapshotWithValuationSeries,
} from '../preRevenueMetrics.ts';

const metalPrices: Record<string, { key: string; price: number; unit: string; expectedLomEq: number; expectedUnit: 'oz' | 't' }> = {
  Au: { key: 'XAU_USD_TOZ', price: 100, unit: 'USD_toz', expectedLomEq: 30, expectedUnit: 'oz' },
  Ag: { key: 'XAG_USD_TOZ', price: 20, unit: 'USD_toz', expectedLomEq: 150, expectedUnit: 'oz' },
  Pt: { key: 'XPT_USD_TOZ', price: 25, unit: 'USD_toz', expectedLomEq: 120, expectedUnit: 'oz' },
  Pd: { key: 'XPD_USD_TOZ', price: 50, unit: 'USD_toz', expectedLomEq: 60, expectedUnit: 'oz' },
  Cu: { key: 'CU_USD_LB', price: 2, unit: 'USD_lb', expectedLomEq: 1500 / UNIT_CONSTANTS.LB_PER_TONNE, expectedUnit: 't' },
  Zn: { key: 'ZN_USD_LB', price: 1, unit: 'USD_lb', expectedLomEq: 3000 / UNIT_CONSTANTS.LB_PER_TONNE, expectedUnit: 't' },
  Pb: { key: 'PB_USD_LB', price: 1.5, unit: 'USD_lb', expectedLomEq: 2000 / UNIT_CONSTANTS.LB_PER_TONNE, expectedUnit: 't' },
  Ni: { key: 'NI_USD_LB', price: 5, unit: 'USD_lb', expectedLomEq: 600 / UNIT_CONSTANTS.LB_PER_TONNE, expectedUnit: 't' },
  Sn: { key: 'SN_USD_LB', price: 10, unit: 'USD_lb', expectedLomEq: 300 / UNIT_CONSTANTS.LB_PER_TONNE, expectedUnit: 't' },
  Mo: { key: 'MO_USD_TONNE', price: 20000, unit: 'USD_tonne', expectedLomEq: 0.15, expectedUnit: 't' },
  Fe: { key: 'IRON_ORE_USD_TONNE', price: 100, unit: 'USD_tonne', expectedLomEq: 30, expectedUnit: 't' },
  Al: { key: 'AL_USD_TONNE', price: 2000, unit: 'USD_tonne', expectedLomEq: 1.5, expectedUnit: 't' },
  U: { key: 'URANIUM_USD_LB', price: 50, unit: 'USD_lb', expectedLomEq: 60 / UNIT_CONSTANTS.LB_PER_TONNE, expectedUnit: 't' },
};

const priceKeyByMetal = Object.fromEntries(Object.entries(metalPrices).map(([metal, spec]) => [metal, spec.key]));
const priceUSDByMetal = Object.fromEntries(Object.entries(metalPrices).map(([metal, spec]) => [metal, [spec.price, spec.price, spec.price]]));
const payableQtyByMetal = Object.fromEntries(Object.keys(metalPrices).map((metal) => [metal, [0, 1, 1]]));
const priceUsedByMetal_USD = priceUSDByMetal;
const unitAuditMetals = Object.fromEntries(Object.entries(metalPrices).map(([metal, spec]) => [metal, {
  qtyUnit: spec.expectedUnit === 'oz' ? 'toz' : 'tonne',
  canonicalQtyUnit: spec.expectedUnit === 'oz' ? 'toz' : (metal === 'Fe' ? 'tonne' : 'lb'),
  priceUnit: spec.unit,
  canonicalPriceUnit: spec.expectedUnit === 'oz' ? 'toz' : (metal === 'Fe' ? 'tonne' : 'lb'),
  warnings: [],
}]));

const snapshot = {
  targetCurrency: 'USD',
  fx_USD_to_TargetCurrency: 1,
  aggregation: {
    payableAuEqOz_total: [0, 1, 1],
    grossRevenueUSD_total: [0, 1000, 2000],
    priceKeyByMetal,
    priceUSDByMetal,
    auPriceUSDPerOz: [100, 100, 100],
  },
  financing: { shares_post_financing: 100 },
  MarketCap_TargetCurrency: 100,
  EV_TargetCurrency: 120,
  NAV_today_TargetCurrency: 200,
  Payback_real_years: 3,
  Payback_approx_years: 4,
  corporate: { lista3Metrics: { IRR: 0.2 } },
  series: {
    totalRevenue_USD: [0, 1000, 2000],
    payableQtyByMetal,
    priceUsedByMetal_USD,
    unitAudit: { metals: unitAuditMetals },
  },
  modeledValuationTimeline: { markers: [] },
} as unknown as CorporateSnapshotWithValuationSeries;

const result = deriveCorporatePreRevenueMetrics({
  snapshot,
  currentPriceTargetCurrency: 1,
  valuationYear: 2026,
  referenceMetals: Object.keys(metalPrices),
});

for (const [metal, expected] of Object.entries(metalPrices)) {
  const actual = result.equivalentByMetal[metal];
  assert.ok(actual, `${metal}Eq should be present`);
  assert.equal(actual.status, 'OK', `${metal}Eq should resolve from the canonical Corporate price series`);
  assert.equal(actual.unit, expected.expectedUnit, `${metal}Eq display unit should match Compare semantics`);
  assert.ok(Math.abs((actual.lomEq ?? 0) - expected.expectedLomEq) < 1e-9, `${metal}Eq LOM mismatch`);
  assert.ok(result.byReferenceMetal[metal], `${metal} relative valuation metrics should be present`);
}

const missingPrice = deriveCorporatePreRevenueMetrics({
  snapshot,
  currentPriceTargetCurrency: 1,
  valuationYear: 2026,
  referenceMetals: ['Co'],
});
assert.equal(missingPrice.equivalentByMetal.Co.status, 'MISSING_PRICE');
assert.equal(missingPrice.byReferenceMetal.Co.evPerLomEqUSD, null);

console.log('preRevenueMetricsMetals.test.ts passed');
