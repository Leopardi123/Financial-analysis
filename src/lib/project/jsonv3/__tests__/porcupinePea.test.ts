import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { isAlreadyProducingProjectJsonV3 } from '../productionStatus.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import { PORCUPINE_PEA_V3, PORCUPINE_REPORT_PERIODS, PORCUPINE_REPORT_POST_TAX_FCFF_USD, PORCUPINE_REPORT_PRE_TAX_FCFF_USD } from './fixtures/porcupinePea.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function sum(series: Array<number | null> | readonly number[]): number { return series.reduce<number>((total, value) => total + (finite(value) ? value : 0), 0); }
function maxAbsDiff(actual: Array<number | null>, expected: readonly number[]): number {
  assert(actual.length === expected.length, `Series length mismatch actual=${actual.length} expected=${expected.length}`);
  return actual.reduce<number>((max, value, t) => { assert(finite(value), `Expected finite FCFF at t=${t}`); return Math.max(max, Math.abs(value - expected[t])); }, 0);
}
async function runReportEngine(raw: ProjectJsonV3) {
  const report = raw.verification?.report; assert(report, 'Porcupine requires verification.report');
  const parsed = parseProjectJsonV3(raw, { requireRuntimePlacement: false, taxScenario: 'report', fiscalScenario: 'report' });
  const series = report.priceDeckSeriesByKey ?? {};
  const fixedPriceByKey: Record<string, number> = {};
  for (const [key, values] of Object.entries(series)) {
    const first = values.find(finite); assert(first !== undefined, `Missing finite report price for ${key}`); fixedPriceByKey[key] = first;
  }
  const input = await resolveProjectPricesToEngineInput({ parsed, scenario: { mode: 'fixed', fixedPriceByKey }, allowRefresh: false, projectId: raw.meta?.projectId ?? 'porcupine-golden' });
  for (const [key, values] of Object.entries(series)) {
    input.priceSeriesByKey = input.priceSeriesByKey ?? {}; input.priceSeriesByKey[key] = [...values];
    for (const [metal, priceKey] of Object.entries(raw.metals.priceKeyByMetal)) if (priceKey === key) input.spotPriceUSDByMetal[metal] = [...values];
    if (raw.metals.auPriceKey === key) input.aisc.auPriceUSDPerOz = [...values];
  }
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runPorcupinePeaGoldenTest(): Promise<void> {
  const raw = PORCUPINE_PEA_V3;
  assert(raw.time.masterN === 23 && raw.time.productionStartPeriod === 0, 'Report calendar must map 2025-2047 plus closure aggregate to 24 periods');
  assert(PORCUPINE_REPORT_PERIODS.join(',') === raw.time.reportPeriodLabels?.join(','), 'Report labels must be preserved exactly');
  assert(isAlreadyProducingProjectJsonV3(raw), 'productionStartPeriod=0 must derive already-producing status');
  assert(raw.time.runtimePlacement?.productionStart?.year === 2025 && raw.time.runtimePlacement?.nameplateCapacity?.year === 2028, 'Full report calendar placement must be populated');
  assert(Math.abs(sum(raw.capital.capexUSD) - 311e6) <= 1_000_000, 'Rounded development plus exploration CAPEX must reconcile to the US$311m report total');
  assert(Math.abs(sum(raw.capital.sustainingCapexUSD) - 1352e6) <= 1, 'Sustaining CAPEX must sum to US$1,352m');
  assert(Math.abs(sum(raw.capital.closureUSD) - 722e6) <= 1_000_000, 'Rounded cash-reclamation years must reconcile to the US$722m report total');

  const reconciliation = await reconcileProjectJsonV3ToReport(raw);
  assert(reconciliation.status === 'VERIFIED', `Porcupine must reconcile: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every(check => check.status === 'PASS'), `Hard checks must pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= 0.02 && Math.abs(reconciliation.npvPreTaxRelativeDifference ?? Infinity) <= 0.02, 'Pre/post-tax NPV must be within 2%');
  assert(reconciliation.reportIRRPostTax === null && reconciliation.modelIRRPostTax === null && reconciliation.irrRelativeDifference === null, 'IRR must remain explicitly not applicable');
  assert(reconciliation.hardChecks.some(check => check.check === 'irr_not_applicable_evidence' && check.status === 'PASS'), 'Source-backed N/A IRR evidence must pass');

  const out = await runReportEngine(raw);
  const postTaxMaxDiff = maxAbsDiff(out.phase1.fcffUSD, PORCUPINE_REPORT_POST_TAX_FCFF_USD);
  const preTax = out.phase1.fcffUSD.map((value, t) => finite(value) && finite(out.phase1.taxUSD[t]) ? value + out.phase1.taxUSD[t] : null);
  const preTaxMaxDiff = maxAbsDiff(preTax, PORCUPINE_REPORT_PRE_TAX_FCFF_USD);
  const annualRoundingToleranceUSD = 4_000_001;
  assert(postTaxMaxDiff <= annualRoundingToleranceUSD && preTaxMaxDiff <= annualRoundingToleranceUSD, `Rounded Table 22-3 FCFF tolerance exceeded post=${postTaxMaxDiff} pre=${preTaxMaxDiff}`);

  const runtime = parseProjectJsonV3(raw, { taxScenario: 'runtime', fiscalScenario: 'runtime' });
  assert(runtime.engineInputWithoutPrices.yearsByPeriod[0] === 2025, 'Runtime must retain the first report year for an already-producing project');
  console.log(`Porcupine PEA V3 VERIFIED | maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff} | NPV post=${reconciliation.npvRelativeDifference} pre=${reconciliation.npvPreTaxRelativeDifference} | IRR=N/A`);
})();
