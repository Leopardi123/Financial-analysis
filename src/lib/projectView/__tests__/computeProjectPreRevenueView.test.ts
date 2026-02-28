import assert from 'node:assert/strict';
import { computeProjectViewMetrics } from '../computeProjectPreRevenueView.ts';

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
assert.equal(out.list2.TP.value, 2);
assert.equal(out.list2.LOM.value, 10);
assert.equal(out.marketBox.marketCapCurrent.reason, null);


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

console.log('ok computeProjectPreRevenueView');
