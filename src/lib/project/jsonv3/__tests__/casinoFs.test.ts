import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import {
  CASINO_FS_INFLATION_STRESS_V3,
  CASINO_FS_V3,
  CASINO_REPORT_PERIODS,
  CASINO_REPORT_POST_TAX_FCFF_USD,
  CASINO_REPORT_PRE_TAX_FCFF_USD,
} from './fixtures/casinoFs.ts';

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
function component(raw: ProjectJsonV3, id: string) {
  assert(raw.economics.costModel.mode === 'COMPONENTS', 'Casino cost model must use components');
  const found = raw.economics.costModel.components.find(item => item.id === id);
  assert(found, `Missing cost component ${id}`);
  return found;
}
function sameSeries(actual: Array<number | null> | undefined | null, expected: Array<number | null> | undefined | null, label: string): void {
  assert(Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length, `${label} series shape mismatch`);
  actual.forEach((value, t) => assert(value === expected[t], `${label} differs at t=${t}: ${value} vs ${expected[t]}`));
}
function scaledSeries(actual: Array<number | null>, expected: Array<number | null>, factor: number, label: string): void {
  assert(actual.length === expected.length, `${label} series shape mismatch`);
  actual.forEach((value, t) => {
    const base = expected[t];
    assert(finite(value) && finite(base), `${label} must be finite at t=${t}`);
    assert(Math.abs(value - base * factor) <= 1e-6, `${label} scaling mismatch at t=${t}: ${value} vs ${base * factor}`);
  });
}

async function runReportEngine(raw: ProjectJsonV3) {
  const report = raw.verification?.report;
  assert(report, 'Casino baseline requires verification.report');
  const parsed = parseProjectJsonV3(raw, { requireRuntimePlacement: false, taxScenario: 'report', fiscalScenario: 'report' });
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? 'casino-fs-golden',
  });
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runCasinoFsGoldenTest(): Promise<void> {
  const raw = CASINO_FS_V3;
  assert(raw.time.masterN === 35, 'Table 22-6 must map 36 relative periods to masterN=35');
  assert(raw.time.productionStartPeriod === 2, 'Heap-leach payable metal first appears in Year -2 / t=2');
  assert(raw.time.nameplateCapacityPeriod === 4, 'Commercial concentrator Year 1 must be nameplate period t=4');
  assert(CASINO_REPORT_PERIODS.join(',') === '-4,-3,-2,-1,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32', 'Report period labels must be preserved exactly');
  assert(raw.time.runtimePlacement == null, 'Do not reuse the stale 2022 absolute execution schedule as current 2026 runtime guidance');

  assert(raw.metals.priceKeyByMetal.Cu === 'CU_USD_LB', 'Cu must use verified canonical key');
  assert(raw.metals.priceKeyByMetal.Au === 'XAU_USD_TOZ', 'Au must use verified canonical key');
  assert(raw.metals.priceKeyByMetal.Ag === 'XAG_USD_TOZ', 'Ag must use verified canonical key');
  assert(raw.metals.priceKeyByMetal.Mo === 'MO_USD_TONNE', 'Mo must use verified canonical key');

  assert(Math.abs(sum(raw.capital.capexUSD) - 2_893_972_000) <= 1, 'Table 22-6 initial CAPEX must equal C$3,617.465m converted at 0.80');
  assert(Math.abs(sum(raw.capital.sustainingCapexUSD) - 601_023_200) <= 1, 'Table 22-6 sustaining CAPEX must equal C$751.279m converted at 0.80');
  assert(Math.abs(sum(raw.capital.closureUSD) - 240_000_000) <= 1, 'Table 22-6 reclamation/closure must equal C$300m converted at 0.80');
  assert(raw.capital.closureUSD[35] === 36_000_000, 'Final Year 32 closure spend must remain at t=35');
  assert(raw.capital.workingCapitalDeltaUSD?.[29] === -93_515_200, 'Year 26 working-capital unwind must remain at t=29');
  assert(raw.capital.terminalProceedsUSD?.[28] === 18_245_600, 'Year 25 salvage value must remain at t=28');

  const reconciliation = await reconcileProjectJsonV3ToReport(raw);
  assert(reconciliation.status === 'VERIFIED', `Casino must reconcile: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every(check => check.status === 'PASS'), `Hard checks must pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= 0.02 && Math.abs(reconciliation.irrRelativeDifference ?? Infinity) <= 0.02, 'Post-tax NPV/IRR must be within 2%');
  assert(Math.abs(reconciliation.npvPreTaxRelativeDifference ?? Infinity) <= 0.02 && Math.abs(reconciliation.irrPreTaxRelativeDifference ?? Infinity) <= 0.02, 'Pre-tax NPV/IRR must be within 2%');

  const out = await runReportEngine(raw);
  const postTaxMaxDiff = maxAbsDiff(out.phase1.fcffUSD, CASINO_REPORT_POST_TAX_FCFF_USD);
  const preTax = out.phase1.fcffUSD.map((value, t) => finite(value) && finite(out.phase1.taxUSD[t]) ? value + out.phase1.taxUSD[t] : null);
  const preTaxMaxDiff = maxAbsDiff(preTax, CASINO_REPORT_PRE_TAX_FCFF_USD);
  const annualRoundingToleranceUSD = 1_500_001;
  assert(postTaxMaxDiff <= annualRoundingToleranceUSD && preTaxMaxDiff <= annualRoundingToleranceUSD, `Rounded Table 22-6 FCFF tolerance exceeded post=${postTaxMaxDiff} pre=${preTaxMaxDiff}`);

  const stress = CASINO_FS_INFLATION_STRESS_V3;
  assert(stress.verification == null, 'Inflation stress is user-defined and must not claim report reconciliation');
  assert(stress.time.runtimePlacement == null, 'Stress case must not invent a current calendar placement');
  scaledSeries(stress.capital.capexUSD, raw.capital.capexUSD, 1.5, 'initial CAPEX');
  scaledSeries(stress.capital.sustainingCapexUSD, raw.capital.sustainingCapexUSD, 1.5, 'sustaining CAPEX');
  assert(Array.isArray(stress.economics.depreciationUSD) && Array.isArray(raw.economics.depreciationUSD), 'Stress depreciation must remain source-based');
  scaledSeries(stress.economics.depreciationUSD, raw.economics.depreciationUSD, 1.5, 'depreciation');

  for (const id of ['mining', 'concentrator', 'heap_leach', 'site_ga']) scaledSeries(component(stress, id).seriesUSD, component(raw, id).seriesUSD, 1.4, id);
  for (const id of ['property_tax', 'carbon_tax']) sameSeries(component(stress, id).seriesUSD, component(raw, id).seriesUSD, id);
  assert(stress.economics.sellingModel.mode === 'AGGREGATE' && raw.economics.sellingModel.mode === 'AGGREGATE', 'Casino selling model must stay aggregate');
  sameSeries(stress.economics.sellingModel.sellingCostsUSD, raw.economics.sellingModel.sellingCostsUSD, 'off-site selling');
  sameSeries(stress.capital.closureUSD, raw.capital.closureUSD, 'closure');
  sameSeries(stress.capital.workingCapitalDeltaUSD, raw.capital.workingCapitalDeltaUSD, 'working capital');
  sameSeries(stress.capital.terminalProceedsUSD, raw.capital.terminalProceedsUSD, 'terminal proceeds');

  const parsedStress = parseProjectJsonV3(stress, { requireRuntimePlacement: false, taxScenario: 'runtime', fiscalScenario: 'runtime' });
  assert(parsedStress.engineInputWithoutPrices.phase1.taxRate === 0.27, 'Stress runtime must use 27% flat corporate tax proxy');
  console.log(`Casino FS V3 VERIFIED | maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff} | NPV post=${reconciliation.npvRelativeDifference} pre=${reconciliation.npvPreTaxRelativeDifference} | IRR post=${reconciliation.irrRelativeDifference} pre=${reconciliation.irrPreTaxRelativeDifference}`);
})();
