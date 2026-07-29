import assert from 'node:assert/strict';
import { computeProjectViewMetrics } from '../computeProjectPreRevenueView.ts';
import { computeLista3 } from '../../metrics/lista3.ts';

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
  cashForNavTarget: 200, cashForEvTarget: 200, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 100,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: [-100, -100, 150, 200, 200, 200, 200, 200, 200, 200, 200, 200],
  capexUSD: [-300, -200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  grossRevenueUSD: [0, 0, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  ebitUSD: [0, 0, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
  economicsTaxRate: 0.25,
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
assertApprox(out.list2.NAV_prodStart.value, 1703.60953, 1e-4);
assertApprox(out.list2.NPV_prodStart_perShare.value, 8.22364, 1e-4);
assertApprox(out.list2.NAV_prodStart_perShare.value, 8.73646, 1e-4);
assert.equal(out.marketBox.marketCapCurrent.reason, null);

const cashFirstBase = {
  targetCurrency: 'CAD', fxUSDToTarget: 1, discountRate: .1, masterN: 2,
  sharesCurrent: 300_000_000, priceCurrentTarget: 3, cashForNavTarget: 100_000_000, cashForEvTarget: 100_000_000, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0, enterpriseAdjustmentsTarget: 0,
  fcfUSD: [-300_000_000, 0, 400_000_000], capexUSD: [300_000_000, 0, 0],
  grossRevenueUSD: [0, 0, 500_000_000], ebitUSD: [0, 0, 400_000_000],
  payableAuEqOz: [0, 0, 1], sustainingCostUSD: [0, 0, 1], productionStartPeriod: 1,
};
const cashDisabled = computeProjectViewMetrics({ ...cashFirstBase, financing: { equityPct: 100, debtPct: 0, latestQuarterlyCashTarget: 100_000_000, useCashFirst: false, cashUsePercent: 1 } });
const cashEnabled = computeProjectViewMetrics({ ...cashFirstBase, financing: { equityPct: 100, debtPct: 0, latestQuarterlyCashTarget: 100_000_000, useCashFirst: true, cashUsePercent: 1 } });
const cashHalf = computeProjectViewMetrics({ ...cashFirstBase, financing: { equityPct: 100, debtPct: 0, latestQuarterlyCashTarget: 100_000_000, useCashFirst: true, cashUsePercent: 0.5 } });
const excessCash = computeProjectViewMetrics({ ...cashFirstBase, cashForNavTarget: 400_000_000, cashForEvTarget: 400_000_000, cashForEvIsPostFinancing: false, financing: { equityPct: 100, debtPct: 0, latestQuarterlyCashTarget: 400_000_000, useCashFirst: true, cashUsePercent: 1 } });
assert.equal(cashDisabled.list5.cash_used_Target.value, 0);
assert.equal(cashDisabled.list5.Equity_Raise_Target.value, 300_000_000);
assert.equal(cashDisabled.list5.New_Shares.value, 100_000_000);
assert.equal(cashDisabled.marketBox.sharesPf.value, 400_000_000);
assert.equal(cashEnabled.list5.cash_used_Target.value, 100_000_000);
assert.equal(cashEnabled.list5.Equity_Raise_Target.value, 200_000_000);
assertApprox(cashEnabled.list5.New_Shares.value, 66_666_666.66666667);
assertApprox(cashEnabled.marketBox.sharesPf.value, 366_666_666.6666667);
assert.equal(cashHalf.list5.cash_used_Target.value, 50_000_000);
assert.equal(cashHalf.list5.Equity_Raise_Target.value, 250_000_000);
assert.equal(excessCash.list5.cash_used_Target.value, 300_000_000, 'cash use must be capped at the funding need');
assert.equal(excessCash.list5.Equity_Raise_Target.value, 0);
assert.equal(excessCash.list2.NAV_Target.value, (cashDisabled.list2.NPV_Target.value as number) + 400_000_000, 'reported cash remains the NAV basis under the no-double-count convention');
for (const key of ['NPV_Target','NPV_prodStart','CF_LOM_Target','DCF_Target','DCF_Target_discounted'] as const) assert.equal(cashEnabled.list2[key].value, cashDisabled.list2[key].value, `${key} absolute must ignore financing`);
for (const key of ['NPV_perShare','NPV_prodStart_perShare','CF_LOM_Target_perShare','DCF_perShare','DCF_Target_discounted_perShare'] as const) assert.notEqual(cashEnabled.list2[key].value, cashDisabled.list2[key].value, `${key} must use changed sharesPF`);
assert.equal(cashEnabled.list2.NAV_Target.value, cashDisabled.list2.NAV_Target.value, 'NAV must not deduct cash used for CAPEX already included in FCFF');
assert.equal(cashEnabled.list2.NAV_prodStart.value, cashDisabled.list2.NAV_prodStart.value, 'production-start NAV must use the same no-double-count rule');
assert.notEqual(cashEnabled.list2.NAV_perShare.value, cashDisabled.list2.NAV_perShare.value);
assert.ok(cashEnabled.diagnostics.valuation_metric_audit.every((row) => row.metric.endsWith('/share') ? row.sharesUsed !== null : true));
assert.equal(cashEnabled.marketBox.evCurrent.value, 900_000_000, 'Project EV must still subtract reported cash less cash used');

const separatedCashBase = {
  ...cashFirstBase,
  cashForNavTarget: 200_000_000,
  cashForEvTarget: 150_000_000,
  cashForEvIsPostFinancing: true,
  debtCurrentTarget: 100_000_000,
  financing: { equityPct: 100, debtPct: 0, usePrecomputedFinancing: true },
};
const separatedCash = computeProjectViewMetrics(separatedCashBase);
const changedNavCash = computeProjectViewMetrics({ ...separatedCashBase, cashForNavTarget: 250_000_000 });
const changedEvCash = computeProjectViewMetrics({ ...separatedCashBase, cashForEvTarget: 125_000_000 });
assert.equal(changedNavCash.list2.NAV_Target.value! - separatedCash.list2.NAV_Target.value!, 50_000_000, 'cashForNav must affect NAV');
assert.equal(changedNavCash.marketBox.evCurrent.value, separatedCash.marketBox.evCurrent.value, 'cashForNav must not affect EV');
assert.equal(changedEvCash.list2.NAV_Target.value, separatedCash.list2.NAV_Target.value, 'cashForEv must not affect NAV');
assert.equal(changedEvCash.marketBox.evCurrent.value! - separatedCash.marketBox.evCurrent.value!, 25_000_000, 'cashForEv must affect EV');

const corporateEvRegression = computeProjectViewMetrics({
  ...cashFirstBase,
  sharesCurrent: 300_000_000,
  priceCurrentTarget: 3,
  cashForNavTarget: 1_406_900_000,
  cashForEvTarget: 293_046_254,
  cashForEvIsPostFinancing: true,
  debtCurrentTarget: 2_099_593_384,
  financing: { equityPct: 100, debtPct: 0, usePrecomputedFinancing: true },
});
const marketCapRegression = 300_000_000 * 3;
const correctedCorporateEv = marketCapRegression + 2_099_593_384 - 293_046_254;
const formerCorporateEv = marketCapRegression + 2_099_593_384 - 1_406_900_000;
assert.equal(corporateEvRegression.marketBox.evCurrent.value, correctedCorporateEv, 'Corporate EV must subtract post-financing cash');
assert.equal(correctedCorporateEv - formerCorporateEv, 1_113_853_746, 'Corporate EV regression delta must equal initial cash used');
assert.equal(corporateEvRegression.list2.NAV_Target.value! - corporateEvRegression.list2.NPV_Target.value!, 1_406_900_000 - 2_099_593_384, 'Corporate NAV must retain reported cash');

assert.ok((out.list3.IRR.value as number) > 0, `Expected positive IRR, got ${out.list3.IRR.value}`);
assert.ok((out.list3.LOM_discounted_EBIT_ROCE.value as number) > 0, 'Expected finite discounted EBIT ROCE');
assert.ok((out.list3.LOM_avg_NOPAT_ROIC.value as number) > 0, 'Expected finite avg NOPAT ROIC');
assert.ok((out.list3.Kapitalavkastning_LOM.value as number) > 0, 'Expected finite Kapitalavkastning_LOM');
assert.ok((out.list3.Kapitalavkastning_per_Year.value as number) > 0, 'Expected finite Kapitalavkastning_per_Year');
assert.equal(out.diagnostics.lista3_inputs_debug.failure_reasons.LOM_avg_NOPAT_ROIC, null);
assertApprox(out.list3.LOM_avg_EBIT_ROCE.value, 0.04, 1e-6);
assert.equal(out.diagnostics.metrics_debug.LOM_avg_EBIT_ROCE.displayValue, '4.0%');
assert.equal(out.diagnostics.metrics_debug.ROI_10Y.displayValue, '3.9x');
assert.equal(out.diagnostics.metrics_debug.Kapitalavkastning_LOM.displayValue, '3.5x');
assert.equal(out.diagnostics.metrics_debug.Kapitalavkastning_per_Year.displayValue, '0.3x/år');
assert.equal(out.diagnostics.ui_unit_meta.LOM_avg_EBIT_ROCE.unitType, 'percent');
assert.equal(out.diagnostics.ui_unit_meta.Kapitalavkastning_per_Year.renderSuffix, 'x/år');

const lista3MissingInputs = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: null,
  masterN: 2,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: [-10, 0, 5],
  capexUSD: [-10, 0, 0],
  grossRevenueUSD: [1, 1, 1],
  ebitUSD: [null, null, null],
  nopatUSD: [null, null, null],
  df_now: [null, null, null],
  payableAuEqOz: [1, 1, 1],
  sustainingCostUSD: [1, 1, 1],
  productionStartPeriod: 1,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});

assert.equal(lista3MissingInputs.list3.LOM_discounted_EBIT_ROCE.value, null);
assert.equal(lista3MissingInputs.list3.LOM_avg_NOPAT_ROIC.value, null);
assert.equal(lista3MissingInputs.diagnostics.lista3_inputs_debug.failure_reasons.LOM_discounted_EBIT_ROCE, 'Missing discountRate and df_now series');
assert.equal(lista3MissingInputs.diagnostics.lista3_inputs_debug.failure_reasons.LOM_avg_NOPAT_ROIC, 'Missing nopatUSD and tax inputs (taxUSD, federalIncomeTaxUSD or economics.taxRate)');
const zeroCapexDenominator = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 2,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: [10, 10, 10],
  capexUSD: [0, 0, 0],
  grossRevenueUSD: [1, 1, 1],
  ebitUSD: [100, 100, 100],
  nopatUSD: [50, 50, 50],
  payableAuEqOz: [1, 1, 1],
  sustainingCostUSD: [1, 1, 1],
  productionStartPeriod: 0,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});
assert.equal(zeroCapexDenominator.list3.LOM_avg_EBIT_ROCE.value, null);
assert.equal(zeroCapexDenominator.list3.LOM_avg_EBIT_ROCE.reason, 'Denominator is 0');
assert.equal(zeroCapexDenominator.diagnostics.metrics_debug.LOM_avg_EBIT_ROCE.failure_reason, 'Denominator is 0');
assert.equal(zeroCapexDenominator.diagnostics.metrics_debug.LOM_avg_EBIT_ROCE.ratio, null);

const multiSignChange = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 4,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
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
assert.equal(multiSignChange.list3.IRR.reason, 'no economically relevant non-negative root found');

const actualMultipleRootCashflows = [-90.144, -90.144, 125.414, 299.793, 299.793, 299.793, 299.793, 299.793, 299.793, -34.065, -29.520];
const actualMultipleRootProject = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 10,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: actualMultipleRootCashflows,
  capexUSD: [90.144, 90.144, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  grossRevenueUSD: new Array(11).fill(1),
  ebitUSD: new Array(11).fill(1),
  payableAuEqOz: new Array(11).fill(1),
  sustainingCostUSD: new Array(11).fill(1),
  productionStartPeriod: 2,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});
const actualMultipleRootCorporate = computeLista3({
  masterN: 10,
  tp: 2,
  fcfUSD: actualMultipleRootCashflows,
  initialCapexUSD: 180.288,
  discountRate: 0.1,
  strictRoi10Y: false,
});
assertApprox(actualMultipleRootProject.list3.IRR.value, 0.84169, 1e-5);
assertApprox(actualMultipleRootCorporate.IRR, 0.84169, 1e-5);
assertApprox(actualMultipleRootProject.list3.IRR.value, actualMultipleRootCorporate.IRR as number, 1e-12);
assert.equal(actualMultipleRootProject.diagnostics.irr_debug.roots.length, 2);
assert.equal(actualMultipleRootProject.diagnostics.irr_debug.selection_reason, 'positive root above project discount rate');
assert.ok((actualMultipleRootProject.diagnostics.irr_debug.residual as number) < 1e-6);


const noSignChange = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 3,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
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
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
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
assert.equal(notBracketed.list3.IRR.reason, 'no economically relevant non-negative root found');


const consistencyGuard = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 11,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
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
assert.equal(consistencyGuard.list3.IRR.reason, 'no economically relevant non-negative root found');


const noDiscount = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: null,
  masterN: 2,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
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
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
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

const strict10yInsufficientPeriods = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 8,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: new Array(9).fill(1),
  capexUSD: new Array(9).fill(-1),
  grossRevenueUSD: new Array(9).fill(1),
  ebitUSD: new Array(9).fill(1),
  payableAuEqOz: new Array(9).fill(1),
  sustainingCostUSD: new Array(9).fill(1),
  productionStartPeriod: 0,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});
assert.equal(strict10yInsufficientPeriods.list4.InSitu_10Y_USD.value, null);
assert.equal(strict10yInsufficientPeriods.list4.InSitu_10Y_USD.reason, '10Y requires 10 periods; have 9');
assert.equal(strict10yInsufficientPeriods.list4.AuEq_10Y.reason, '10Y requires 10 periods; have 9');

const strict10yMissingWindowValue = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 11,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: new Array(12).fill(1),
  capexUSD: new Array(12).fill(-1),
  grossRevenueUSD: [1, 1, 1, 1, 1, null, 1, 1, 1, 1, 1, 1],
  ebitUSD: new Array(12).fill(1),
  payableAuEqOz: [1, 1, 1, 1, 1, null, 1, 1, 1, 1, 1, 1],
  sustainingCostUSD: new Array(12).fill(1),
  productionStartPeriod: 0,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});
assert.equal(strict10yMissingWindowValue.list4.InSitu_10Y_USD.reason, 'Missing value(s) in 10Y window (t=0..9)');
assert.equal(strict10yMissingWindowValue.list4.AuEq_10Y.reason, 'Missing value(s) in 10Y window (t=0..9)');

const delayedStartStillHasTenYearWindow = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 13,
  sharesCurrent: 10,
  priceCurrentTarget: 5,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: new Array(14).fill(1),
  capexUSD: new Array(14).fill(-1),
  grossRevenueUSD: [null, null, null, null, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
  ebitUSD: new Array(14).fill(1),
  payableAuEqOz: [null, null, null, null, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  sustainingCostUSD: new Array(14).fill(1),
  productionStartPeriod: 6,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});
assert.equal(delayedStartStillHasTenYearWindow.list4.InSitu_10Y_USD.value, 100);
assert.equal(delayedStartStillHasTenYearWindow.list4.InSitu_10Y_USD.reason, null);
assert.equal(delayedStartStillHasTenYearWindow.list4.AuEq_10Y.value, 20);
assert.equal(delayedStartStillHasTenYearWindow.list4.AuEq_10Y.reason, null);

const perShareUpstreamMissingShares = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 11,
  sharesCurrent: null,
  priceCurrentTarget: 5,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: new Array(12).fill(1),
  capexUSD: new Array(12).fill(-1),
  grossRevenueUSD: new Array(12).fill(1),
  ebitUSD: new Array(12).fill(1),
  payableAuEqOz: new Array(12).fill(1),
  sustainingCostUSD: new Array(12).fill(1),
  productionStartPeriod: 0,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});
assert.equal(perShareUpstreamMissingShares.list4.InSitu_10Y_perShare_USD.reason, 'Missing or invalid shares_post_financing');
assert.equal(perShareUpstreamMissingShares.list4.AuEq_10Y_perShare.reason, 'Missing or invalid shares_post_financing');

const auEqPerShareSmallNonZero = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 11,
  sharesCurrent: 150000000,
  priceCurrentTarget: 5,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: new Array(12).fill(1),
  capexUSD: new Array(12).fill(-1),
  grossRevenueUSD: new Array(12).fill(1),
  ebitUSD: new Array(12).fill(1),
  payableAuEqOz: [58400, 58400, 58400, 58400, 58400, 58400, 58400, 58400, 58400, 58400, 1, 1],
  sustainingCostUSD: new Array(12).fill(1),
  productionStartPeriod: 0,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});
assert.ok(auEqPerShareSmallNonZero.list4.AuEq_10Y_perShare.value !== null);
assertApprox(auEqPerShareSmallNonZero.list4.AuEq_10Y_perShare.value, 584000 / 150000000, 1e-12);

const auEqPerShareInvalidShares = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 11,
  sharesCurrent: 0,
  priceCurrentTarget: 5,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: new Array(12).fill(1),
  capexUSD: new Array(12).fill(-1),
  grossRevenueUSD: new Array(12).fill(1),
  ebitUSD: new Array(12).fill(1),
  payableAuEqOz: new Array(12).fill(1),
  sustainingCostUSD: new Array(12).fill(1),
  productionStartPeriod: 0,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});
assert.equal(auEqPerShareInvalidShares.list4.AuEq_10Y_perShare.value, null);
assert.equal(auEqPerShareInvalidShares.list4.AuEq_10Y_perShare.reason, 'Missing or invalid shares_post_financing');

console.log('ok computeProjectPreRevenueView');

const financingSharesOverride = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 2,
  sharesCurrent: 100,
  sharesPostFinancingInput: 250,
  priceCurrentTarget: 10,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: [-100, 100, 100],
  capexUSD: [-100, 0, 0],
  grossRevenueUSD: [1, 1, 1],
  ebitUSD: [1, 1, 1],
  payableAuEqOz: [1, 1, 1],
  sustainingCostUSD: [1, 1, 1],
  productionStartPeriod: 1,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});
assertApprox(financingSharesOverride.marketBox.sharesPf.value, 110, 1e-9);

const financingSharesAllDebt = computeProjectViewMetrics({
  targetCurrency: 'USD',
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 2,
  sharesCurrent: 100,
  sharesPostFinancingInput: 250,
  priceCurrentTarget: 10,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: [-100, 100, 100],
  capexUSD: [-100, 0, 0],
  grossRevenueUSD: [1, 1, 1],
  ebitUSD: [1, 1, 1],
  payableAuEqOz: [1, 1, 1],
  sustainingCostUSD: [1, 1, 1],
  productionStartPeriod: 1,
  financing: { equityPct: 0, debtPct: 100, cashUsedInput: 0 },
});
assertApprox(financingSharesAllDebt.marketBox.sharesPf.value, 100, 1e-9);

const precomputedDebtFinancingBase = {
  targetCurrency: 'USD' as const,
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 2,
  sharesCurrent: 300_000_000,
  sharesPostFinancingInput: 300_000_000,
  priceCurrentTarget: 2,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 139_000_000,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: [-139_000_000, 100_000_000, 100_000_000],
  capexUSD: [139_000_000, 0, 0],
  grossRevenueUSD: [0, 100_000_000, 100_000_000],
  ebitUSD: [0, 100_000_000, 100_000_000],
  payableAuEqOz: [0, 1, 1],
  sustainingCostUSD: [0, 0, 0],
  productionStartPeriod: 1,
};
const recomputedDebtFinancing = computeProjectViewMetrics({
  ...precomputedDebtFinancingBase,
  financing: { equityPct: 0, debtPct: 100 },
});
const precomputedDebtFinancing = computeProjectViewMetrics({
  ...precomputedDebtFinancingBase,
  financing: { equityPct: 0, debtPct: 100, usePrecomputedFinancing: true },
});

const calendarRebasedNorth = computeProjectViewMetrics({
  ...precomputedDebtFinancingBase,
  fcfUSD: [-61_540_000, -169_400_000, 70_518_076.2],
  capexUSD: [61_540_000, 159_110_000, 0],
  grossRevenueUSD: [0, 0, 70_518_076.2],
  ebitUSD: [0, 0, 70_518_076.2],
  payableAuEqOz: [0, 0, 1],
  sustainingCostUSD: [0, 0, 0],
  masterN: 2,
  productionStartPeriod: 2,
  valuationPeriodOffset: 4,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0,
  sharesCurrent: 1,
  sharesPostFinancingInput: 1,
  financing: { equityPct: 100, debtPct: 0, usePrecomputedFinancing: true },
});
const northNpvFrom2026 = -61_540_000 / 1.1 ** 4 - 169_400_000 / 1.1 ** 5 + 70_518_076.2 / 1.1 ** 6;
assertApprox(calendarRebasedNorth.list2.NPV_Target.value, northNpvFrom2026, Math.abs(northNpvFrom2026) * 1e-12);
assertApprox(calendarRebasedNorth.list2.NAV_Target.value, northNpvFrom2026, Math.abs(northNpvFrom2026) * 1e-12);
assertApprox(calendarRebasedNorth.list2.DCF_Target_discounted.value, 70_518_076.2 / 1.1 ** 6, 1e-6);
assert.equal(calendarRebasedNorth.list2.DCF_Target.value, 70_518_076.2);

const calendarRebasedSouth = computeProjectViewMetrics({
  ...precomputedDebtFinancingBase,
  fcfUSD: [0, 0, -89_700_000, -137_000_000, 37_538_840],
  capexUSD: [0, 0, 89_700_000, 137_000_000, 11_200_000],
  grossRevenueUSD: [0, 0, 0, 0, 37_538_840],
  ebitUSD: [0, 0, 0, 0, 37_538_840],
  payableAuEqOz: [0, 0, 0, 0, 1],
  sustainingCostUSD: [0, 0, 0, 0, 0],
  masterN: 4,
  productionStartPeriod: 4,
  valuationPeriodOffset: -1,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0,
  sharesCurrent: 1,
  sharesPostFinancingInput: 1,
  financing: { equityPct: 100, debtPct: 0, usePrecomputedFinancing: true },
});
const southNpvFrom2026 = -89_700_000 / 1.1 - 137_000_000 / 1.1 ** 2 + 37_538_840 / 1.1 ** 3;
assertApprox(calendarRebasedSouth.list2.NPV_Target.value, southNpvFrom2026, Math.abs(southNpvFrom2026) * 1e-12);
assertApprox(calendarRebasedSouth.list2.NAV_Target.value, southNpvFrom2026, Math.abs(southNpvFrom2026) * 1e-12);
assertApprox(calendarRebasedSouth.list2.DCF_Target_discounted.value, 37_538_840 / 1.1 ** 3, 1e-6);
assert.equal(calendarRebasedSouth.list2.DCF_Target.value, 37_538_840);
assert.deepEqual(calendarRebasedSouth.diagnostics.payback_real_debug.fcff_used, [0, 0, -89_700_000, -137_000_000, 37_538_840]);
assert.equal(recomputedDebtFinancing.list5.Debt_Added_Target.value, 139_000_000);
assert.equal(precomputedDebtFinancing.list5.Debt_Added_Target.value, 0);
assert.equal(precomputedDebtFinancing.list5.debt_t0.value, 139_000_000);
assert.equal(precomputedDebtFinancing.marketBox.sharesPf.value, 300_000_000);
assert.equal(precomputedDebtFinancing.list2.DCF_Target.value, recomputedDebtFinancing.list2.DCF_Target.value);
assert.equal(precomputedDebtFinancing.list2.DCF_Target_discounted.value, recomputedDebtFinancing.list2.DCF_Target_discounted.value);
assertApprox(
  precomputedDebtFinancing.list2.NAV_perShare.value,
  ((precomputedDebtFinancing.list2.NPV_Target.value as number) - 139_000_000) / 300_000_000,
  1e-9,
);


const financingScenarioBase = {
  targetCurrency: 'USD' as const,
  fxUSDToTarget: 1,
  discountRate: 0.1,
  masterN: 4,
  sharesCurrent: 100,
  sharesPostFinancingInput: 250,
  priceCurrentTarget: 10,
  cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0,
  enterpriseAdjustmentsTarget: 0,
  fcfUSD: [-100, 50, 60, 70, 80],
  capexUSD: [-100, 0, 0, 0, 0],
  grossRevenueUSD: [1, 1, 1, 1, 1],
  ebitUSD: [1, 1, 1, 1, 1],
  payableAuEqOz: [1, 1, 1, 1, 1],
  sustainingCostUSD: [1, 1, 1, 1, 1],
  productionStartPeriod: 1,
};

const scenarioA_allEquity = computeProjectViewMetrics({
  ...financingScenarioBase,
  financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
});

const scenarioB_allDebt = computeProjectViewMetrics({
  ...financingScenarioBase,
  financing: { equityPct: 0, debtPct: 100, cashUsedInput: 0 },
});

assertApprox(scenarioA_allEquity.list2.NPV_Target.value, scenarioB_allDebt.list2.NPV_Target.value as number, 1e-9);
assertApprox(scenarioA_allEquity.list2.CF_LOM_Target.value, scenarioB_allDebt.list2.CF_LOM_Target.value as number, 1e-9);
assertApprox(scenarioA_allEquity.list2.DCF_Target.value, scenarioB_allDebt.list2.DCF_Target.value as number, 1e-9);
assert.notEqual(scenarioA_allEquity.marketBox.sharesPf.value, scenarioB_allDebt.marketBox.sharesPf.value);

// Canonical Project financing regression matrix (P1-P6).
const canonicalFinancingBase = {
  ...precomputedDebtFinancingBase,
  capexUSD: [3_200_000_000, 0, 0],
  fcfUSD: [-3_200_000_000, 1, 1],
  sharesCurrent: 300_000_000,
  sharesPostFinancingInput: 999_999_999,
  priceCurrentTarget: 4,
  cashForNavTarget: 1_406_900_000, cashForEvTarget: 1_406_900_000, cashForEvIsPostFinancing: false,
  debtCurrentTarget: 0,
  extraShares: 10,
  financing: { equityPct: 100, debtPct: 0, latestQuarterlyCashTarget: 1_406_900_000, useCashFirst: false, cashUsePercent: 1 },
};
const p1 = computeProjectViewMetrics(canonicalFinancingBase);
assert.equal(p1.list5.cash_used_Target.value, 0);
assert.equal(p1.list5.remaining_need_Target.value, 3_200_000_000);
assert.equal(p1.list5.Equity_Raise_Target.value, 3_200_000_000);
assert.equal(p1.list5.Debt_Added_Target.value, 0);
assert.equal(p1.list5.New_Shares.value, 800_000_000);
assert.equal(p1.marketBox.sharesPf.value, 1_100_000_010);
const p2 = computeProjectViewMetrics({...canonicalFinancingBase, financing:{...canonicalFinancingBase.financing,useCashFirst:true}});
assert.equal(p2.list5.cash_used_Target.value,1_406_900_000);
assert.equal(p2.list5.remaining_need_Target.value,1_793_100_000);
assert.equal(p2.list5.Equity_Raise_Target.value,1_793_100_000);
assert.equal(p2.list5.New_Shares.value,448_275_000);
const p3a=computeProjectViewMetrics({...canonicalFinancingBase,financing:{...canonicalFinancingBase.financing,cashUsePercent:0}});
const p3b=computeProjectViewMetrics({...canonicalFinancingBase,financing:{...canonicalFinancingBase.financing,cashUsePercent:1}});
for(const key of ['cash_used_Target','remaining_need_Target','Debt_Added_Target','Equity_Raise_Target','New_Shares']) assert.equal(p3a.list5[key].value,p3b.list5[key].value);
assert.equal(p3a.marketBox.sharesPf.value,p3b.marketBox.sharesPf.value);
let prior=p1;
for(const cashUsePercent of [0,.25,.5,.75,1]) { const next=computeProjectViewMetrics({...canonicalFinancingBase,financing:{...canonicalFinancingBase.financing,useCashFirst:true,cashUsePercent}});assert.ok((next.list5.cash_used_Target.value??0)>=(prior.list5.cash_used_Target.value??0));assert.ok((next.list5.remaining_need_Target.value??0)<=(prior.list5.remaining_need_Target.value??0));assert.ok((next.list5.New_Shares.value??0)<=(prior.list5.New_Shares.value??0));assert.ok((next.marketBox.sharesPf.value??0)<=(prior.marketBox.sharesPf.value??0));prior=next;}
assert.equal(p2.marketBox.sharesPf.value,(canonicalFinancingBase.sharesCurrent??0)+(p2.list5.New_Shares.value??0)+(canonicalFinancingBase.extraShares??0));
assert.equal((p2.list5.Debt_Added_Target.value??0)+(p2.list5.Equity_Raise_Target.value??0),p2.list5.remaining_need_Target.value);
