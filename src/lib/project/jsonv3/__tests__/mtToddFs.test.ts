import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import {
  MT_TODD_FS_V3,
  MT_TODD_REPORT_PERIODS,
  MT_TODD_REPORT_POST_TAX_FCFF_USD,
  MT_TODD_REPORT_PRE_TAX_FCFF_USD,
} from './fixtures/mtToddFs.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function sum(series: Array<number | null> | readonly number[]): number { return series.reduce<number>((total, value) => total + (finite(value) ? value : 0), 0); }
function sumRange(series: Array<number | null> | readonly number[], start: number, endInclusive: number): number {
  return sum(series.slice(start, endInclusive + 1));
}
function maxAbsDiff(actual: Array<number | null>, expected: readonly number[]): number {
  assert(actual.length === expected.length, `Series length mismatch actual=${actual.length} expected=${expected.length}`);
  return actual.reduce<number>((max, value, t) => {
    assert(finite(value), `Expected finite FCFF at t=${t}`);
    return Math.max(max, Math.abs(value - expected[t]));
  }, 0);
}

async function runReportEngine(raw: ProjectJsonV3) {
  const report = raw.verification?.report;
  assert(report, 'Mt Todd requires verification.report');
  const parsed = parseProjectJsonV3(raw, { requireRuntimePlacement: false, taxScenario: 'report', fiscalScenario: 'report' });
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? 'mt-todd-golden',
  });
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runMtToddFsGoldenTest(): Promise<void> {
  const raw = MT_TODD_FS_V3;
  assert(raw.time.masterN === 44 && raw.time.productionStartPeriod === 2 && raw.time.nameplateCapacityPeriod === 3, 'Tables 162-163 must map -2,-1,1...43 to 45 annual V3 periods with production at t=2 and steady-state mill feed at t=3');
  assert(MT_TODD_REPORT_PERIODS.length === 45 && MT_TODD_REPORT_PERIODS.join(',') === raw.time.reportPeriodLabels?.join(','), 'Report/derived period labels must be preserved exactly');
  assert(raw.time.runtimePlacement?.constructionStart?.year === 2026 && raw.time.runtimePlacement?.productionStart?.year === 2028 && raw.time.runtimePlacement?.nameplateCapacity?.year === 2029, 'FS implementation schedule must map to 2026 construction / 2028 first mill feed / 2029 steady state');
  assert(raw.time.phaseByPeriod.slice(35).every(phase => phase === 'closure'), 'Derived Years 34-43 must remain closure/post-production periods');

  assert(Math.abs(sum(raw.capital.capexUSD) - 425e6) <= 1, 'Rounded Table 162 initial-capital periods must sum to US$425m');
  assert(Math.abs(sum(raw.capital.sustainingCapexUSD) - 264e6) <= 1, 'Rounded annual/group sustaining-capital rows must sum to US$264m after source rounding');
  assert(Math.abs(sum(raw.capital.closureUSD) - 177e6) <= 1, 'Rounded annual/group reclamation-and-closure rows must sum to US$177m after source rounding');
  assert(Math.abs(sum(raw.capital.workingCapitalDeltaUSD ?? []) - 0) <= 1, 'Working capital must fully unwind by the end of the Project life');
  assert(raw.capital.terminalProceedsUSD == null, 'FS assumes no salvage / terminal proceeds');

  const mining = raw.economics.costModel.mode === 'COMPONENTS' ? raw.economics.costModel.components.find(component => component.id === 'mining')?.seriesUSD : null;
  assert(mining, 'Mining component is required');
  assert(Math.abs(sumRange(mining, 17, 21) - 513e6) <= 1, 'Years 16-20 mining group must preserve Table 163 US$513m total');
  assert(Math.abs(sumRange(mining, 22, 26) - 506e6) <= 1, 'Years 21-25 mining group must preserve Table 163 US$506m total');
  assert(Math.abs(sumRange(raw.metals.payableQtyByMetal.Au, 17, 21) - 693_000) <= 1e-6, 'Years 16-20 gold production group must preserve 693 koz');
  assert(Math.abs(sumRange(raw.metals.payableQtyByMetal.Au, 32, 34) - 186_000) <= 1e-6, 'Years 31-33 gold production group must preserve 186 koz');

  const reconciliation = await reconcileProjectJsonV3ToReport(raw);
  assert(reconciliation.status === 'VERIFIED', `Mt Todd must reconcile: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every(check => check.status === 'PASS'), `Hard checks must pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= 0.02 && Math.abs(reconciliation.irrRelativeDifference ?? Infinity) <= 0.02, 'Post-tax NPV/IRR must be within 2%');
  assert(Math.abs(reconciliation.npvPreTaxRelativeDifference ?? Infinity) <= 0.02 && Math.abs(reconciliation.irrPreTaxRelativeDifference ?? Infinity) <= 0.02, 'Pre-tax NPV/IRR must be within 2%');

  const out = await runReportEngine(raw);
  const postTaxMaxDiff = maxAbsDiff(out.phase1.fcffUSD, MT_TODD_REPORT_POST_TAX_FCFF_USD);
  const preTax = out.phase1.fcffUSD.map((value, t) => finite(value) && finite(out.phase1.taxUSD[t]) ? value + out.phase1.taxUSD[t] : null);
  const preTaxMaxDiff = maxAbsDiff(preTax, MT_TODD_REPORT_PRE_TAX_FCFF_USD);
  const annualRoundingAndAllocationToleranceUSD = 2_500_001;
  assert(postTaxMaxDiff <= annualRoundingAndAllocationToleranceUSD && preTaxMaxDiff <= annualRoundingAndAllocationToleranceUSD, `Table 162 rounding / Table 163 equal-allocation FCFF tolerance exceeded post=${postTaxMaxDiff} pre=${preTaxMaxDiff}`);

  const parsedRuntime = parseProjectJsonV3(raw, { taxScenario: 'runtime', fiscalScenario: 'runtime' });
  const years = parsedRuntime.engineInputWithoutPrices.yearsByPeriod;
  assert(years[0] === 2026 && years[2] === 2028 && years[3] === 2029 && years[34] === 2060 && years[35] === 2061 && years[44] === 2070, `Runtime year mapping must be 2026-2070 with production 2028 and closure beginning 2061, got ${years.join(',')}`);

  console.log(`Mt Todd FS V3 VERIFIED | maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff} | NPV post=${reconciliation.npvRelativeDifference} pre=${reconciliation.npvPreTaxRelativeDifference} | IRR post=${reconciliation.irrRelativeDifference} pre=${reconciliation.irrPreTaxRelativeDifference}`);
})();
