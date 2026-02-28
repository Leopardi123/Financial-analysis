import assert from 'node:assert/strict';
import { computeProjectViewMetrics } from '../computeProjectPreRevenueView.ts';

const out = computeProjectViewMetrics({
  targetCurrency: 'CAD',
  fxUSDToTarget: 2,
  sharesCurrent: 100,
  priceCurrentTarget: 10,
  cashCurrentTarget: 200,
  debtCurrentTarget: 100,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: [-100, -100, 150, 200, 200, 200, 200, 200, 200, 200, 200, 200],
  capexUSD: [-300, -200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  grossRevenueUSD: [0,0,100,100,100,100,100,100,100,100,100,100],
  ebitUSD: [0,0,20,20,20,20,20,20,20,20,20,20],
  payableAuEqOz: [0,0,10,10,10,10,10,10,10,10,10,10],
  sustainingCostUSD: [0,0,50,50,50,50,50,50,50,50,50,50],
  productionStartPeriod: 2,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 50 },
});

assert.equal(out.marketBox.marketCapCurrent.value, 1000);
assert.equal(out.list5.cash_used_Target.value, 50);
assert.equal(out.list4.InSitu_10Y_USD.value, 1000);
assert.equal(out.list2.TP.value, 2);
assert.equal(out.list2.LOM.value, 10);

console.log('ok computeProjectPreRevenueView');
