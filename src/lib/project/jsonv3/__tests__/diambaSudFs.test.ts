import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import { DIAMBA_SUD_FS_V3, DIAMBA_SUD_REPORT_PERIODS, DIAMBA_SUD_REPORT_POST_TAX_FCFF_USD, DIAMBA_SUD_REPORT_PRE_TAX_FCFF_USD } from './fixtures/diambaSudFs.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function sum(series: Array<number | null> | readonly number[]): number { return series.reduce<number>((total, value) => total + (finite(value) ? value : 0), 0); }
function maxAbsDiff(actual: Array<number | null>, expected: readonly number[]): number {
  assert(actual.length === expected.length, `Series length mismatch actual=${actual.length} expected=${expected.length}`);
  return actual.reduce<number>((max, value, t) => { assert(finite(value), `Expected finite FCFF at t=${t}`); return Math.max(max, Math.abs(value - expected[t])); }, 0);
}
async function runReportEngine(raw: ProjectJsonV3) {
  const report = raw.verification?.report; assert(report, 'Diamba Sud requires verification.report');
  const parsed = parseProjectJsonV3(raw, { requireRuntimePlacement: false, taxScenario: 'report', fiscalScenario: 'report' });
  const input = await resolveProjectPricesToEngineInput({ parsed, scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey }, allowRefresh: false, projectId: raw.meta?.projectId ?? 'diamba-sud-golden' });
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runDiambaSudFsGoldenTest(): Promise<void> {
  const raw = DIAMBA_SUD_FS_V3;
  assert(raw.time.masterN === 11 && raw.time.productionStartPeriod === 2 && raw.time.nameplateCapacityPeriod === 3, 'Table 22.5 must map calendar years 2026-2037 exactly');
  assert(DIAMBA_SUD_REPORT_PERIODS.join(',') === raw.time.reportPeriodLabels?.join(','), 'Report calendar labels must be preserved');
  assert(raw.time.runtimePlacement?.constructionStart?.year === 2026 && raw.time.runtimePlacement?.productionStart?.year === 2028 && raw.time.runtimePlacement?.nameplateCapacity?.year === 2029, 'Company-guided runtime placement must be complete');
  assert(Math.abs(sum(raw.capital.capexUSD) - 397e6) <= 1, 'Rounded annual development CAPEX row must sum to US$397m');
  assert(Math.abs(sum(raw.capital.sustainingCapexUSD) - 63e6) <= 1, 'Rounded annual sustaining CAPEX row must sum to US$63m');
  assert(Math.abs(sum(raw.capital.closureUSD) - 16e6) <= 1, 'Rounded annual closure-fund row must sum to US$16m');
  assert(raw.capital.workingCapitalDeltaUSD?.every(value => value === 0), 'No undisclosed working-capital balancing series may be introduced');
  assert(raw.capital.terminalProceedsUSD?.every(value => value === 0), 'Section 22.5.2 explicitly includes no salvage value');

  const reconciliation = await reconcileProjectJsonV3ToReport(raw);
  assert(reconciliation.status === 'VERIFIED', `Diamba Sud must reconcile: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every(check => check.status === 'PASS'), `Hard checks must pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= 0.02 && Math.abs(reconciliation.irrRelativeDifference ?? Infinity) <= 0.02, 'Post-tax NPV/IRR must be within 2%');
  assert(Math.abs(reconciliation.npvPreTaxRelativeDifference ?? Infinity) <= 0.02 && Math.abs(reconciliation.irrPreTaxRelativeDifference ?? Infinity) <= 0.02, 'Pre-tax NPV/IRR must be within 2%');

  const out = await runReportEngine(raw);
  const postTaxMaxDiff = maxAbsDiff(out.phase1.fcffUSD, DIAMBA_SUD_REPORT_POST_TAX_FCFF_USD);
  const preTax = out.phase1.fcffUSD.map((value, t) => finite(value) && finite(out.phase1.taxUSD[t]) ? value + out.phase1.taxUSD[t] : null);
  const preTaxMaxDiff = maxAbsDiff(preTax, DIAMBA_SUD_REPORT_PRE_TAX_FCFF_USD);
  const annualTableRoundingToleranceUSD = 2_000_001;
  assert(postTaxMaxDiff <= annualTableRoundingToleranceUSD && preTaxMaxDiff <= annualTableRoundingToleranceUSD, `Rounded Table 22.5 FCFF tolerance exceeded post=${postTaxMaxDiff} pre=${preTaxMaxDiff}`);

  const parsedRuntime = parseProjectJsonV3(raw, { taxScenario: 'runtime', fiscalScenario: 'runtime' });
  assert(parsedRuntime.engineInputWithoutPrices.yearsByPeriod.join(',') === DIAMBA_SUD_REPORT_PERIODS.join(','), 'Runtime calendar must remain the report calendar');
  console.log(`Diamba Sud FS V3 VERIFIED | maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff} | NPV post=${reconciliation.modelNPVPostTaxUSD} pre=${reconciliation.modelNPVPreTaxUSD} | IRR post=${reconciliation.modelIRRPostTax} pre=${reconciliation.modelIRRPreTax}`);
})();
