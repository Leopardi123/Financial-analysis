import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import {
  WHISTLER_PEA_V3,
  WHISTLER_REPORT_PERIODS,
  WHISTLER_REPORT_POST_TAX_FCFF_USD,
  WHISTLER_REPORT_PRE_TAX_FCFF_USD,
} from './fixtures/whistlerPea.ts';

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

async function runReportEngine(raw: ProjectJsonV3) {
  const report = raw.verification?.report;
  assert(report, 'Whistler requires verification.report');
  const parsed = parseProjectJsonV3(raw, { requireRuntimePlacement: false, taxScenario: 'report', fiscalScenario: 'report' });
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? 'whistler-golden',
  });
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runWhistlerPeaGoldenTest(): Promise<void> {
  const raw = WHISTLER_PEA_V3;
  assert(raw.time.masterN === 16 && raw.time.productionStartPeriod === 2 && raw.time.nameplateCapacityPeriod === 3, 'Table 22-4 must map -2,-1,1...15 to 17 periods with first production at t=2 and first full annual throughput at t=3');
  assert(WHISTLER_REPORT_PERIODS.join(',') === '-2,-1,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15', 'Report period labels must be preserved');
  assert(raw.time.runtimePlacement?.constructionStart?.year === 2032 && raw.time.runtimePlacement?.productionStart?.year === 2034 && raw.time.runtimePlacement?.nameplateCapacity?.year === 2035, 'User-defined 2034 production placement must be populated consistently');
  assert(Math.abs(sum(raw.capital.capexUSD) - 1_278.4e6) <= 1, 'Table 22-4 one-decimal initial-capital components must sum to US$1,278.4m');
  assert(Math.abs(sum(raw.capital.sustainingCapexUSD) - 381.0e6) <= 1, 'Table 22-4 annual sustaining-capital row must sum to US$381.0m after rounding');
  assert(raw.capital.closureUSD[16] === 98.7e6, 'Closure must remain in report Year 15 / relative t=16');
  assert(raw.capital.workingCapitalDeltaUSD == null, 'No unreported working-capital balancing series may be introduced');

  const reconciliation = await reconcileProjectJsonV3ToReport(raw);
  assert(reconciliation.status === 'VERIFIED', `Whistler must reconcile: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every(check => check.status === 'PASS'), `Hard checks must pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= 0.02 && Math.abs(reconciliation.irrRelativeDifference ?? Infinity) <= 0.02, 'Post-tax NPV/IRR must be within 2%');
  assert(Math.abs(reconciliation.npvPreTaxRelativeDifference ?? Infinity) <= 0.02 && Math.abs(reconciliation.irrPreTaxRelativeDifference ?? Infinity) <= 0.02, 'Pre-tax NPV/IRR must be within 2%');

  const out = await runReportEngine(raw);
  const postTaxMaxDiff = maxAbsDiff(out.phase1.fcffUSD, WHISTLER_REPORT_POST_TAX_FCFF_USD);
  const preTax = out.phase1.fcffUSD.map((value, t) => finite(value) && finite(out.phase1.taxUSD[t]) ? value + out.phase1.taxUSD[t] : null);
  const preTaxMaxDiff = maxAbsDiff(preTax, WHISTLER_REPORT_PRE_TAX_FCFF_USD);
  const annualRoundingToleranceUSD = 1_100_001;
  assert(postTaxMaxDiff <= annualRoundingToleranceUSD && preTaxMaxDiff <= annualRoundingToleranceUSD, `Rounded Table 22-4 FCFF tolerance exceeded post=${postTaxMaxDiff} pre=${preTaxMaxDiff}`);

  const parsedRuntime = parseProjectJsonV3(raw, { taxScenario: 'runtime', fiscalScenario: 'runtime' });
  const years = parsedRuntime.engineInputWithoutPrices.yearsByPeriod;
  assert(years[0] === 2032 && years[1] === 2033 && years[2] === 2034 && years[16] === 2048, `Runtime year mapping must be 2032-2048, got ${years.join(',')}`);
  console.log(`Whistler PEA V3 VERIFIED | maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff} | NPV post=${reconciliation.npvRelativeDifference} pre=${reconciliation.npvPreTaxRelativeDifference} | IRR post=${reconciliation.irrRelativeDifference} pre=${reconciliation.irrPreTaxRelativeDifference}`);
})();
