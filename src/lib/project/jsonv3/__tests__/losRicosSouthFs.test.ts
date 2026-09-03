import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import { LOS_RICOS_SOUTH_FS_V3, LOS_RICOS_SOUTH_REPORT_PERIODS, LOS_RICOS_SOUTH_REPORT_POST_TAX_FCFF_USD, LOS_RICOS_SOUTH_REPORT_PRE_TAX_FCFF_USD } from './fixtures/losRicosSouthFs.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function sum(series: Array<number | null> | readonly number[]): number { return series.reduce<number>((total, value) => total + (finite(value) ? value : 0), 0); }
function maxAbsDiff(actual: Array<number | null>, expected: readonly number[]): number {
  assert(actual.length === expected.length, `Series length mismatch actual=${actual.length} expected=${expected.length}`);
  return actual.reduce<number>((max, value, t) => { assert(finite(value), `Expected finite FCFF at t=${t}`); return Math.max(max, Math.abs(value - expected[t])); }, 0);
}
async function runReportEngine(raw: ProjectJsonV3) {
  const report = raw.verification?.report; assert(report, 'Los Ricos South requires verification.report');
  const parsed = parseProjectJsonV3(raw, { requireRuntimePlacement: false, taxScenario: 'report', fiscalScenario: 'report' });
  const input = await resolveProjectPricesToEngineInput({ parsed, scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey }, allowRefresh: false, projectId: raw.meta?.projectId ?? 'los-ricos-south-golden' });
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runLosRicosSouthFsGoldenTest(): Promise<void> {
  const raw = LOS_RICOS_SOUTH_FS_V3;
  assert(raw.time.masterN === 16 && raw.time.productionStartPeriod === 2, 'Table 22.5 must map -2,-1,Years 1-15 to 17 periods');
  assert(LOS_RICOS_SOUTH_REPORT_PERIODS.join(',') === '-2,-1,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15', 'Report labels must be preserved');
  assert(raw.time.runtimePlacement?.constructionStart?.year === 2028 && raw.time.runtimePlacement?.productionStart?.year === 2030 && raw.time.runtimePlacement?.nameplateCapacity?.year === 2031, 'Full fallback runtime placement must be populated');
  assert(Math.abs(sum(raw.capital.capexUSD) - 226.7e6) <= 1, 'Initial CAPEX must equal Table 22.5');
  assert(Math.abs(sum(raw.capital.sustainingCapexUSD) - 99.8e6) <= 1, 'Rounded annual sustaining CAPEX must equal Table 22.5 annual row');
  assert(raw.capital.workingCapitalDeltaUSD?.[1] === 9.6e6 && raw.capital.workingCapitalDeltaUSD?.[16] === -9.7e6, 'Report-implied working-capital funding and unwind must be explicit');

  const reconciliation = await reconcileProjectJsonV3ToReport(raw);
  assert(reconciliation.status === 'VERIFIED', `Los Ricos South must reconcile: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every(check => check.status === 'PASS'), `Hard checks must pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= 0.02 && Math.abs(reconciliation.irrRelativeDifference ?? Infinity) <= 0.02, 'Post-tax NPV/IRR must be within 2%');
  assert(Math.abs(reconciliation.npvPreTaxRelativeDifference ?? Infinity) <= 0.02 && Math.abs(reconciliation.irrPreTaxRelativeDifference ?? Infinity) <= 0.02, 'Pre-tax NPV/IRR must be within 2%');

  const out = await runReportEngine(raw);
  const postTaxMaxDiff = maxAbsDiff(out.phase1.fcffUSD, LOS_RICOS_SOUTH_REPORT_POST_TAX_FCFF_USD);
  const preTax = out.phase1.fcffUSD.map((value, t) => finite(value) && finite(out.phase1.taxUSD[t]) ? value + out.phase1.taxUSD[t] : null);
  const preTaxMaxDiff = maxAbsDiff(preTax, LOS_RICOS_SOUTH_REPORT_PRE_TAX_FCFF_USD);
  assert(postTaxMaxDiff <= 100_001 && preTaxMaxDiff <= 100_001, `Rounded Table 22.5 FCFF tolerance exceeded post=${postTaxMaxDiff} pre=${preTaxMaxDiff}`);

  const parsedRuntime = parseProjectJsonV3(raw, { taxScenario: 'runtime', fiscalScenario: 'runtime' });
  assert(parsedRuntime.engineInputWithoutPrices.yearsByPeriod[2] === 2030, 'Runtime production must start in fallback year 2030');
  console.log(`Los Ricos South FS V3 VERIFIED | maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff}`);
})();
