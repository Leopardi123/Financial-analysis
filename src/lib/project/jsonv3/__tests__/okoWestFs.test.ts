import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import {
  OKO_WEST_FS_V3,
  OKO_WEST_REPORT_PERIODS,
  OKO_WEST_REPORT_POST_TAX_FCFF_USD,
  OKO_WEST_REPORT_PRE_TAX_FCFF_USD,
} from './fixtures/okoWestFs.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function sum(series: Array<number | null> | readonly number[]): number { return series.reduce<number>((total, value) => total + (finite(value) ? value : 0), 0); }
function maxAbsDiff(actual: Array<number | null>, expected: readonly number[]): number {
  assert(actual.length === expected.length, `Series length mismatch actual=${actual.length} expected=${expected.length}`);
  return actual.reduce<number>((max, value, t) => {
    assert(finite(value), `Expected finite FCFF at t=${t}`);
    return Math.max(max, Math.abs(value - expected[t]));
  }, 0);
}
function npv(series: readonly number[], rate: number): number {
  return series.reduce((total, value, t) => total + value / ((1 + rate) ** t), 0);
}
function irr(series: readonly number[]): number {
  let low = -0.99;
  let high = 2;
  for (let iteration = 0; iteration < 240; iteration += 1) {
    const midpoint = (low + high) / 2;
    const value = series.reduce((total, cashFlow, t) => total + cashFlow / ((1 + midpoint) ** t), 0);
    if (value > 0) low = midpoint;
    else high = midpoint;
  }
  return (low + high) / 2;
}
async function runReportEngine(raw: ProjectJsonV3) {
  const report = raw.verification?.report;
  assert(report, 'Oko West requires verification.report');
  const parsed = parseProjectJsonV3(raw, { requireRuntimePlacement: false, taxScenario: 'report', fiscalScenario: 'report' });
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? 'oko-west-golden',
  });
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runOkoWestFsGoldenTest(): Promise<void> {
  const raw = OKO_WEST_FS_V3;
  assert(raw.time.masterN === 18 && raw.time.productionStartPeriod === 2 && raw.time.nameplateCapacityPeriod === 3, 'Table 22.6 must map Y-3,Y-2,Y-1,Y1...Y16 to 19 periods with commissioning production in Y-1');
  assert(OKO_WEST_REPORT_PERIODS.join(',') === raw.time.reportPeriodLabels?.join(','), 'Table 22.6 labels must be preserved exactly');
  assert(raw.time.runtimePlacement?.constructionStart?.year === 2025 && raw.time.runtimePlacement?.productionStart?.year === 2027 && raw.time.runtimePlacement?.nameplateCapacity?.year === 2028, 'Report schedule must map early works / commissioning / commercial production to 2025 / 2027 / 2028');
  assert(raw.time.phaseByPeriod.slice(16).every(phase => phase === 'closure'), 'Y14-Y16 carry the published closure periods');

  assert(Math.abs(sum(raw.capital.capexUSD) - 1_041.4e6) <= 1, 'Initial CAPEX must equal Table 22.6 US$1,041.4M');
  assert(Math.abs(sum(raw.capital.sustainingCapexUSD) - 650.0e6) <= 1, 'Sustaining CAPEX must equal Table 22.6 US$650.0M');
  assert(Math.abs(sum(raw.capital.closureUSD) - 38.7e6) <= 1, 'Closure must equal Table 22.6 US$38.7M');
  assert(raw.capital.workingCapitalDeltaUSD?.[16] === -50.1e6, 'Y14 must carry the published US$50.1M working-capital unwind');
  assert(Math.abs(sum(raw.capital.workingCapitalDeltaUSD ?? [])) <= 100_001, 'Rounded annual working-capital series must unwind within the explicit US$0.1M table-rounding tolerance');
  assert(raw.capital.terminalProceedsUSD == null, 'Table 22.6 reports no salvage value or terminal proceeds');

  const manualPreTaxNPV = npv(OKO_WEST_REPORT_PRE_TAX_FCFF_USD, 0.05);
  const manualPostTaxNPV = npv(OKO_WEST_REPORT_POST_TAX_FCFF_USD, 0.05);
  const manualPreTaxIRR = irr(OKO_WEST_REPORT_PRE_TAX_FCFF_USD);
  const manualPostTaxIRR = irr(OKO_WEST_REPORT_POST_TAX_FCFF_USD);
  assert(Math.abs(manualPreTaxNPV - 2_901e6) / 2_901e6 <= 0.001, `Independent pre-tax NPV check failed: ${manualPreTaxNPV}`);
  assert(Math.abs(manualPostTaxNPV - 2_163e6) / 2_163e6 <= 0.001, `Independent post-tax NPV check failed: ${manualPostTaxNPV}`);
  assert(Math.abs(manualPreTaxIRR - 0.311) / 0.311 <= 0.01, `Independent pre-tax IRR check failed: ${manualPreTaxIRR}`);
  assert(Math.abs(manualPostTaxIRR - 0.271) / 0.271 <= 0.01, `Independent post-tax IRR check failed: ${manualPostTaxIRR}`);

  const reconciliation = await reconcileProjectJsonV3ToReport(raw);
  assert(reconciliation.status === 'VERIFIED', `Oko West must reconcile: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every(check => check.status === 'PASS'), `Hard checks must pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= 0.02 && Math.abs(reconciliation.irrRelativeDifference ?? Infinity) <= 0.02, 'Post-tax NPV/IRR must be within 2%');
  assert(Math.abs(reconciliation.npvPreTaxRelativeDifference ?? Infinity) <= 0.02 && Math.abs(reconciliation.irrPreTaxRelativeDifference ?? Infinity) <= 0.02, 'Pre-tax NPV/IRR must be within 2%');

  const out = await runReportEngine(raw);
  const postTaxMaxDiff = maxAbsDiff(out.phase1.fcffUSD, OKO_WEST_REPORT_POST_TAX_FCFF_USD);
  const preTax = out.phase1.fcffUSD.map((value, t) => finite(value) && finite(out.phase1.taxUSD[t]) ? value + out.phase1.taxUSD[t] : null);
  const preTaxMaxDiff = maxAbsDiff(preTax, OKO_WEST_REPORT_PRE_TAX_FCFF_USD);
  const annualTableRoundingToleranceUSD = 700_001;
  assert(postTaxMaxDiff <= annualTableRoundingToleranceUSD && preTaxMaxDiff <= annualTableRoundingToleranceUSD, `Table 22.6 rounding tolerance exceeded post=${postTaxMaxDiff} pre=${preTaxMaxDiff}`);

  const parsedRuntime = parseProjectJsonV3(raw, { taxScenario: 'runtime', fiscalScenario: 'runtime' });
  const years = parsedRuntime.engineInputWithoutPrices.yearsByPeriod;
  assert(years[0] === 2025 && years[2] === 2027 && years[3] === 2028 && years[18] === 2043, `Runtime placement must preserve 2025-2043 mapping, got ${years.join(',')}`);

  console.log(`Oko West FS V3 VERIFIED | maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff} | NPV report/json post=2163000000/${reconciliation.modelNPVPostTaxUSD} pre=2901000000/${reconciliation.modelNPVPreTaxUSD} | IRR report/json post=0.271/${reconciliation.modelIRRPostTax} pre=0.311/${reconciliation.modelIRRPreTax}`);
})();
