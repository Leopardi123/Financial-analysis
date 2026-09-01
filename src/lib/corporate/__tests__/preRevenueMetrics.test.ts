import assert from 'node:assert/strict';
import { UNIT_CONSTANTS } from '../../prices/units/types.ts';
import {
  deriveCorporatePreRevenueMetrics,
  type CorporateSnapshotWithValuationSeries,
} from '../preRevenueMetrics.ts';

const snapshot = {
  targetCurrency: 'CAD',
  fx_USD_to_TargetCurrency: 2,
  aggregation: {
    payableAuEqOz_total: [0, 10, 20],
    grossRevenueUSD_total: [0, 1000, 2000],
    priceKeyByMetal: { Au: 'XAU_USD_TOZ', Cu: 'CU_USD_LB' },
    priceUSDByMetal: { Au: [100, 100, 100], Cu: [2, 2, 2] },
    auPriceUSDPerOz: [100, 100, 100],
  },
  financing: { shares_post_financing: 100 },
  MarketCap_TargetCurrency: 200,
  EV_TargetCurrency: 300,
  NAV_today_TargetCurrency: 240,
  Payback_real_years: 3,
  Payback_approx_years: 4,
  corporate: { lista3Metrics: { IRR: 0.25 } },
  series: {
    totalRevenue_USD: [0, 1000, 2000],
    payableQtyByMetal: { Au: [0, 10, 20], Cu: [0, 1, 2] },
    priceUsedByMetal_USD: { Au: [100, 100, 100], Cu: [2, 2, 2] },
    unitAudit: {
      metals: {
        Au: { qtyUnit: 'toz', canonicalQtyUnit: 'toz', priceUnit: 'USD_toz', canonicalPriceUnit: 'toz', warnings: [] },
        Cu: { qtyUnit: 'lb', canonicalQtyUnit: 'lb', priceUnit: 'USD_lb', canonicalPriceUnit: 'lb', warnings: [] },
      },
    },
  },
  modeledValuationTimeline: {
    markers: [{
      tp: 1,
      yearLabelUsed: '2030',
      corporateTpIndexUsed: 1,
      fcfTailSumUSD: 0,
      value_low: 12,
      value_high: 18,
      value_mid_if_any: 15,
      nullReasonIfAny: null,
      lista2Metrics: {
        DCF_prodStart_exCapex_TargetCurrency: null,
        DCF_prodStart_exCapex_perShare_TargetCurrency: null,
        DCF_prodStart_present_TargetCurrency: null,
        DCF_prodStart_present_perShare_TargetCurrency: null,
        NPV_prodStart_TargetCurrency: null,
        NPV_prodStart_perShare_TargetCurrency: null,
        NAV_prodStart_TargetCurrency: null,
        NAV_prodStart_perShare_TargetCurrency: null,
        InitialCAPEX_incremental_TargetCurrency: 120,
      },
    }],
  },
  corporateValuationTimeSeries: { rows: [{ year: 2029, evEbitda6xPerShare: 10 }, { year: 2030, evEbitda6xPerShare: 20 }] },
} as unknown as CorporateSnapshotWithValuationSeries;

const result = deriveCorporatePreRevenueMetrics({
  snapshot,
  currentPriceTargetCurrency: 2,
  valuationYear: 2026,
  manualExtraShares: 20,
  referenceMetals: ['Au', 'Cu'],
});

assert.equal(result.irr, 0.25);
assert.equal(result.paybackYears, 3);
assert.equal(result.lomYears, 2);
assert.equal(result.sharesPostFinancing, 120);
assert.equal(result.initialCapexUSD, 60);
assert.equal(result.marketCapUSD, 100);
assert.equal(result.enterpriseValueUSD, 150);
assert.equal(result.pNavPostFinancing, 1);
assert.equal(result.nextProjectMarkerYear, 2030);
assert.ok(Math.abs((result.targetPrice ?? 0) - 12.5) < 1e-12);
assert.ok(Math.abs((result.targetOverCurrentPrice ?? 0) - 6.25) < 1e-12);
assert.ok(Math.abs((result.peak6xValuePerShare ?? 0) - (20 * 100 / 120)) < 1e-12);
assert.ok(Math.abs((result.peak6xOverCurrentPrice ?? 0) - (20 * 100 / 120 / 2)) < 1e-12);

assert.equal(result.equivalentByMetal.Au.status, 'OK');
assert.equal(result.equivalentByMetal.Au.unit, 'oz');
assert.equal(result.equivalentByMetal.Au.lomEq, 30);
assert.equal(result.equivalentByMetal.Au.annualEq, 15);
assert.equal(result.equivalentByMetal.Au.tenYearEq, 30);
assert.equal(result.byReferenceMetal.Au.capexPerAnnualEqUSD, 4);
assert.equal(result.byReferenceMetal.Au.lomEqPerShare, 0.25);

assert.equal(result.equivalentByMetal.Cu.status, 'OK');
assert.equal(result.equivalentByMetal.Cu.unit, 't');
const expectedCuLomTonnes = ((1000 / 2) + (2000 / 2)) / UNIT_CONSTANTS.LB_PER_TONNE;
assert.ok(Math.abs((result.equivalentByMetal.Cu.lomEq ?? 0) - expectedCuLomTonnes) < 1e-12);
assert.ok(Math.abs((result.equivalentByMetal.Cu.annualEq ?? 0) - expectedCuLomTonnes / 2) < 1e-12);

const noCorporateIrr = {
  ...snapshot,
  corporate: undefined,
  project: { modeled: { npvSpotRange: { base: { irr: 0.99 } } } },
} as unknown as CorporateSnapshotWithValuationSeries;
const noFallback = deriveCorporatePreRevenueMetrics({ snapshot: noCorporateIrr, currentPriceTargetCurrency: 2, valuationYear: 2026 });
assert.equal(noFallback.irr, null, 'Corporate derivation must not fall back to Project IRR');
assert.ok(noFallback.diagnostics.some((message) => message.includes('no Project-engine fallback')));

console.log('preRevenueMetrics.test.ts passed');
