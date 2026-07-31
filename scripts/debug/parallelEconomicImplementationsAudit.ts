import assert from 'node:assert/strict';
import { computeProjectPhase1 } from '../../src/lib/project/phase1.ts';
import { computeProjectPhase2 } from '../../src/lib/project/phase2.ts';
import { computeProjectRevenue } from '../../src/lib/project/revenue/engine.ts';
import { computeProjectAisc } from '../../src/lib/project/aisc/engine.ts';
import { computeIrr, computeLista3 } from '../../src/lib/metrics/lista3.ts';
import { computeLista2CfDcfMetrics } from '../../src/lib/snapshot/lista2CfDcf.ts';
import { computeLista3aProjectEfficiencyMetrics } from '../../src/lib/snapshot/lista3aProjectEfficiency.ts';
import { buildValuationTimeline } from '../../src/lib/valuation/canonicalValuationTimeline.ts';

const close = (actual: number | null, expected: number | null, label: string) => {
  if (actual === null || expected === null) assert.equal(actual, expected, label);
  else assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${label}: ${actual} != ${expected}`);
};

const phase1 = computeProjectPhase1({
  masterN: 2, productionStartPeriod: 1, taxRate: 0.25,
  revenueUSD: [0, 100, 100], operatingCostsUSD: [0, 40, 40],
  sustainingCapexUSD: [0, 10, 10], siteGandA_USD: [0, 5, 5],
  royaltiesUSD: [0, 3, 3], reclamationUSD: [0, 2, 7],
  byproductCreditsUSD: [0, 4, 4], depreciationUSD: [0, 6, 6],
  capexUSD: [50, 0, 0], workingCapitalDeltaUSD: [0, 5, -5],
});
assert.deepEqual(phase1.ebitdaUSD, [0, 54, 49]);
assert.deepEqual(phase1.sustainingAdjustedOperatingEarningsUSD, [0, 44, 39]);
assert.deepEqual(phase1.ebitUSD, [0, 38, 33]);
assert.deepEqual(phase1.taxUSD, [0, 9.5, 8.25]);
assert.deepEqual(phase1.fcffUSD, [-50, 29.5, 35.75]);

const revenue = computeProjectRevenue({
  masterN: 1,
  payableQtyByMetal: { Au: [2, 0], Cu: [3, 4] },
  priceUSDByMetal: { Au: [10, 10], Cu: [5, 5] },
});
assert.deepEqual(revenue.byMetalRevenueUSD, { Au: [20, 0], Cu: [15, 20] });
assert.deepEqual(revenue.grossRevenueUSD, [35, 20]);

const fcf = [-100, -50, 60, 70, 80];
const rate = 0.1;
const tp = 2;
const phase2 = computeProjectPhase2({ masterN: 4, productionStartPeriod: tp, discountRate: rate, fcffUSD: fcf });
const lista2 = computeLista2CfDcfMetrics({
  fcfUSD_total: fcf, masterN: 4, productionStartPeriod: tp, discountRate: rate,
  shares_post_financing: 10, fx_USD_to_TargetCurrency: 2, npvToday_USD: phase2.npvToday_USD,
  capexUSD_total: [100, 50, 0, 0, 0], netCash_t0_post_TargetCurrency: 20,
}).metrics;
const timeline = buildValuationTimeline({
  scope: 'project', fcfUSD: fcf, capexUSD: [100, 50, 0, 0, 0],
  yearsByPeriod: [2026, 2027, 2028, 2029, 2030], discountRate: rate, fxUSDToTarget: 2,
  valuationYear: 2026, productionStartPeriod: tp, cashTarget: 30, debtTarget: 10,
  sharesCurrent: 10, sharesPf: 10,
});
close(phase2.dcfProdStart_exCapex_USD, lista2.DCF_prodStart_exCapex_USD, 'phase2/lista2 DCF at production start');
close(phase2.dcfProdStart_exCapex_USD, timeline.periods[tp].dcfAtPeriodUSD, 'phase2/timeline DCF at production start');
close(phase2.npvToday_USD, timeline.periods[0].npvAtPeriodUSD, 'phase2/timeline NPV today');

const irrCore = computeIrr(fcf, rate);
const lista3 = computeLista3({ masterN: 4, tp, fcfUSD: fcf, initialCapexUSD: 150, discountRate: rate, paybackRealUseInitialCapex: true, paybackApproxAsRatio: true });
close(phase2.irr, irrCore.selectedRoot, 'phase2/core IRR');
close(lista3.IRR, irrCore.selectedRoot, 'lista3/core IRR');
const multipleRoot = computeIrr([-100, 230, -132], 0.05);
assert.equal(multipleRoot.roots.length, 2);
close(multipleRoot.roots[0], 0.1, 'multiple IRR root 1');
close(multipleRoot.roots[1], 0.2, 'multiple IRR root 2');
close(multipleRoot.selectedRoot, 0.1, 'multiple IRR selected root');

const lista3a = computeLista3aProjectEfficiencyMetrics({
  masterN: 4, productionStartPeriod: tp, discountRate: rate,
  fcffUSD_total: fcf, ebitUSD_total: [0, 0, 60, 70, 80],
  capexUSD_total: [100, 50, 0, 0, 0],
});

const aisc = computeProjectAisc({
  masterN: 2, productionStartPeriod: 1,
  grossRevenueUSD: [0, 200, 300], auPriceUSDPerOz: [10, 10, 10],
  sustainingCostUSD: [0, 50, 75],
});
assert.deepEqual(aisc.payableAuEqOz, [0, 20, 30]);
close(aisc.aiscAuEqUSDPerOz_LOM, 2.5, 'AISC formula');

console.log(JSON.stringify({
  phase1: {
    ebitda: phase1.ebitdaUSD,
    sustainingAdjustedOperatingEarnings: phase1.sustainingAdjustedOperatingEarningsUSD,
    ebit: phase1.ebitUSD, tax: phase1.taxUSD, fcff: phase1.fcffUSD,
  },
  revenue: revenue.grossRevenueUSD,
  dcf: {
    phase2: phase2.dcfProdStart_exCapex_USD,
    lista2: lista2.DCF_prodStart_exCapex_USD,
    timeline: timeline.periods[tp].dcfAtPeriodUSD,
    npvPhase2: phase2.npvToday_USD,
    npvTimeline: timeline.periods[0].npvAtPeriodUSD,
  },
  irr: { phase2: phase2.irr, lista3: lista3.IRR, roots: multipleRoot.roots, selected: multipleRoot.selectedRoot },
  payback: { lista3: lista3.Payback_real_years, lista3a: lista3a.metrics.Payback_real_years },
  aisc: aisc.aiscAuEqUSDPerOz_LOM,
}, null, 2));
