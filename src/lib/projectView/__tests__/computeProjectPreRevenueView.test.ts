import assert from 'node:assert/strict';
import { computeProjectViewMetrics } from '../computeProjectPreRevenueView.ts';

function assertApprox(actual: number | null, expected: number, tolerance = 1e-6): void {
  assert.ok(typeof actual === 'number', `Expected number, got ${actual}`);
  assert.ok(Math.abs((actual as number) - expected) <= tolerance, `Expected ${expected}, got ${actual}`);
}

const out = computeProjectViewMetrics({
  targetCurrency: 'CAD',
  fxUSDToTarget: 2,
  discountRate: 0.1,
  masterN: 11,
  sharesCurrent: 100,
  priceCurrentTarget: 10,
  cashCurrentTarget: 200,
  debtCurrentTarget: 100,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: [-100, -100, 150, 200, 200, 200, 200, 200, 200, 200, 200, 200],
  capexUSD: [-300, -200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  grossRevenueUSD: [0, 0, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  ebitUSD: [0, 0, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
  payableAuEqOz: [0, 0, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
  sustainingCostUSD: [0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
  productionStartPeriod: 2,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 50 },
});

assert.equal(out.marketBox.marketCapCurrent.value, 1000);
assert.equal(out.list5.cash_used_Target.value, 50);
assert.equal(out.list4.InSitu_10Y_USD.value, 1000);
assertApprox(out.list2.DCF_Target.value, 2603.60953, 1e-4);
assertApprox(out.list2.NPV_prodStart.value, 1603.60953, 1e-4);
assertApprox(out.list2.NAV_prodStart.value, 1653.60953, 1e-4);
assertApprox(out.list2.NPV_prodStart_perShare.value, 8.22364, 1e-4);
assertApprox(out.list2.NAV_prodStart_perShare.value, 8.48005, 1e-4);
assert.equal(out.marketBox.marketCapCurrent.reason, null);

assert.ok((out.list3.IRR.value as number) > 0, `Expected positive IRR, got ${out.list3.IRR.value}`);

const multiSignChange = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 4,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashCurrentTarget: 0,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: [0, 0, 400, -50, 200],
  capexUSD: [-500, 0, 0, 0, 0],
  grossRevenueUSD: [1, 1, 1, 1, 1],
  ebitUSD: [1, 1, 1, 1, 1],
  payableAuEqOz: [1, 1, 1, 1, 1],
  sustainingCostUSD: [1, 1, 1, 1, 1],
  productionStartPeriod: 1,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});
assert.equal(multiSignChange.list3.IRR.value, null);
assert.equal(multiSignChange.list3.IRR.reason, 'IRR not bracketed up to 1000%');


const noSignChange = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 3,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashCurrentTarget: 0,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: [0, 0, 0, 0],
  capexUSD: [100, 0, 0, 0],
  grossRevenueUSD: [1, 1, 1, 1],
  ebitUSD: [1, 1, 1, 1],
  payableAuEqOz: [1, 1, 1, 1],
  sustainingCostUSD: [1, 1, 1, 1],
  productionStartPeriod: 1,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});
assert.equal(noSignChange.list3.IRR.value, null);
assert.equal(noSignChange.list3.IRR.reason, 'IRR requires valid sign change');


const notBracketed = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 2,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashCurrentTarget: 0,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: [0, 100, -0.1],
  capexUSD: [-1, 0, 0],
  grossRevenueUSD: [1, 1, 1],
  ebitUSD: [1, 1, 1],
  payableAuEqOz: [1, 1, 1],
  sustainingCostUSD: [1, 1, 1],
  productionStartPeriod: 1,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});
assert.equal(notBracketed.list3.IRR.value, null);
assert.equal(notBracketed.list3.IRR.reason, 'IRR not bracketed up to 1000%');


const consistencyGuard = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 11,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashCurrentTarget: 0,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: [0, 100, -90, 10, 10, 10, 10, 10, 10, 10, 10, 10],
  capexUSD: [-100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  grossRevenueUSD: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ebitUSD: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  payableAuEqOz: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  sustainingCostUSD: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  productionStartPeriod: 1,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});
assert.equal(consistencyGuard.list3.Payback_real.value, null);
assert.equal(consistencyGuard.list3.Payback_real.reason, 'investment_abs <= 0');
assert.ok((consistencyGuard.list3.ROI_10Y.value as number) > 0);
assert.equal(consistencyGuard.list3.IRR.value, null);
assert.equal(consistencyGuard.list3.IRR.reason, 'IRR not bracketed up to 1000%');


const noDiscount = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: null,
  masterN: 2,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashCurrentTarget: 0,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: [1, 2, 3],
  capexUSD: [100, 0, 0],
  grossRevenueUSD: [1, 1, 1],
  ebitUSD: [1, 1, 1],
  payableAuEqOz: [1, 1, 1],
  sustainingCostUSD: [1, 1, 1],
  productionStartPeriod: 1,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});
assert.equal(noDiscount.list2.NPV_Target.value, null);
assert.equal(noDiscount.list2.NPV_Target.reason, 'Missing discountRate r');
assert.equal(noDiscount.list2.CF_LOM_Target.value, 6);
assert.equal(noDiscount.list5.Initial_CAPEX_Target.value, 100);
assert.equal(noDiscount.diagnostics.capexSignConvention, 'positive_spend');



const userProvidedSeries = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 16,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashCurrentTarget: 0,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: [
    -90000000,
    -277000000,
    -161000000,
    329435868.88,
    1086926918.88,
    1199623472.72,
    866146582.32,
    593488657.92,
    706021522.24,
    932016990.48,
    785161954.24,
    379184231.44,
    465211533.2,
    425484712.4,
    373560391.28,
    465688867.36,
    387646959.92,
  ],
  capexUSD: new Array(17).fill(0),
  grossRevenueUSD: new Array(17).fill(1),
  ebitUSD: new Array(17).fill(1),
  payableAuEqOz: new Array(17).fill(1),
  sustainingCostUSD: new Array(17).fill(1),
  productionStartPeriod: 2,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});
assertApprox(userProvidedSeries.list3.Payback_real.value, 2.33, 1e-2);
assertApprox(userProvidedSeries.list3.IRR.value, 0.766, 1e-3);
assert.equal(userProvidedSeries.diagnostics.payback_real_debug.clock_definition, 'from tp');
assert.ok(Array.isArray(userProvidedSeries.diagnostics.payback_real_debug.fcff_used));
assert.ok(Array.isArray(userProvidedSeries.diagnostics.irr_debug.fcff_used));

console.log('ok computeProjectPreRevenueView');
