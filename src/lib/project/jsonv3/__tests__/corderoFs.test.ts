import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import { CORDERO_FS_V3, CORDERO_REPORT_PERIODS, CORDERO_REPORT_POST_TAX_FCFF_USD, CORDERO_REPORT_PRE_TAX_FCFF_USD } from './fixtures/corderoFs.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function sum(series: Array<number | null> | readonly number[]): number { return series.reduce<number>((total, value) => total + (finite(value) ? value : 0), 0); }
function maxAbsDiff(actual: Array<number | null>, expected: readonly number[]): number {
  assert(actual.length === expected.length, `Series length mismatch actual=${actual.length} expected=${expected.length}`);
  return actual.reduce<number>((max, value, t) => { assert(finite(value), `Expected finite FCFF at t=${t}`); return Math.max(max, Math.abs(value - expected[t])); }, 0);
}
async function runReportEngine(raw: ProjectJsonV3) {
  const report = raw.verification?.report; assert(report, 'Cordero requires verification.report');
  const parsed = parseProjectJsonV3(raw, { requireRuntimePlacement: false, taxScenario: 'report', fiscalScenario: 'report' });
  const input = await resolveProjectPricesToEngineInput({ parsed, scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey }, allowRefresh: false, projectId: raw.meta?.projectId ?? 'cordero-golden' });
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runCorderoFsGoldenTest(): Promise<void> {
  const raw = CORDERO_FS_V3;
  assert(raw.time.masterN === 21 && raw.time.productionStartPeriod === 2, 'Table 22-2 must map Y-2,Y-1,Y1...Y20 to 22 periods');
  assert(CORDERO_REPORT_PERIODS.join(',') === '-2,-1,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20', 'Report labels must be preserved');
  assert(raw.time.runtimePlacement?.constructionStart?.year === 2028 && raw.time.runtimePlacement?.productionStart?.year === 2030 && raw.time.runtimePlacement?.nameplateCapacity?.year === 2034, 'Full fallback runtime placement must be populated');
  assert(Math.abs(sum(raw.capital.capexUSD) - 913e6) <= 1, 'Rounded annual initial/expansion CAPEX row must sum to US$913m');
  assert(Math.abs(sum(raw.capital.sustainingCapexUSD) - 387e6) <= 1, 'Rounded annual sustaining CAPEX row must sum to US$387m before net closure');
  assert(raw.capital.closureUSD[21] === 137e6 && raw.capital.terminalProceedsUSD?.[21] === 62e6, 'Final-year net closure must decompose to Table 22-1 closure and salvage totals');

  const reconciliation = await reconcileProjectJsonV3ToReport(raw);
  assert(reconciliation.status === 'VERIFIED', `Cordero must reconcile: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every(check => check.status === 'PASS'), `Hard checks must pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= 0.02 && Math.abs(reconciliation.irrRelativeDifference ?? Infinity) <= 0.02, 'Post-tax NPV/IRR must be within 2%');
  assert(Math.abs(reconciliation.npvPreTaxRelativeDifference ?? Infinity) <= 0.02 && Math.abs(reconciliation.irrPreTaxRelativeDifference ?? Infinity) <= 0.02, 'Pre-tax NPV/IRR must be within 2%');

  const out = await runReportEngine(raw);
  const postTaxMaxDiff = maxAbsDiff(out.phase1.fcffUSD, CORDERO_REPORT_POST_TAX_FCFF_USD);
  const preTax = out.phase1.fcffUSD.map((value, t) => finite(value) && finite(out.phase1.taxUSD[t]) ? value + out.phase1.taxUSD[t] : null);
  const preTaxMaxDiff = maxAbsDiff(preTax, CORDERO_REPORT_PRE_TAX_FCFF_USD);
  const annualRoundingToleranceUSD = 4_000_001;
  assert(postTaxMaxDiff <= annualRoundingToleranceUSD && preTaxMaxDiff <= annualRoundingToleranceUSD, `Rounded Table 22-2 FCFF tolerance exceeded post=${postTaxMaxDiff} pre=${preTaxMaxDiff}`);

  const parsedRuntime = parseProjectJsonV3(raw, { taxScenario: 'runtime', fiscalScenario: 'runtime' });
  assert(parsedRuntime.engineInputWithoutPrices.yearsByPeriod[2] === 2030, 'Runtime production must start in fallback year 2030');
  console.log(`Cordero FS V3 VERIFIED | maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff} | NPV post=${reconciliation.npvRelativeDifference} pre=${reconciliation.npvPreTaxRelativeDifference} | IRR post=${reconciliation.irrRelativeDifference} pre=${reconciliation.irrPreTaxRelativeDifference}`);
})();
