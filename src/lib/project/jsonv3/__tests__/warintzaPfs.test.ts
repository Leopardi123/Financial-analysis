import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import { WARINTZA_PFS_V3, WARINTZA_REPORT_POST_TAX_FCFF_USD } from './fixtures/warintzaPfs.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function maxAbsDiff(actual: Array<number | null>, expected: readonly number[]): number {
  assert(actual.length === expected.length, `Warintza series length mismatch actual=${actual.length} expected=${expected.length}`);
  let max = 0;
  for (let t = 0; t < actual.length; t += 1) {
    assert(finite(actual[t]), `Warintza expected finite FCFF at t=${t}`);
    max = Math.max(max, Math.abs((actual[t] as number) - expected[t]));
  }
  return max;
}

async function runReportEngine(raw: ProjectJsonV3) {
  const report = raw.verification?.report;
  assert(report, 'Warintza requires verification.report');
  const parsed = parseProjectJsonV3(raw, { requireRuntimePlacement: false, taxScenario: 'report', fiscalScenario: 'report' });
  const seed = { ...report.priceDeckByKey };
  for (const [key, values] of Object.entries(report.priceDeckSeriesByKey ?? {})) {
    const first = values.find(finite);
    assert(first !== undefined, `Warintza report price series ${key} must contain a finite value`);
    if (!(key in seed)) seed[key] = first;
  }
  const input = await resolveProjectPricesToEngineInput({ parsed, scenario: { mode: 'fixed', fixedPriceByKey: seed }, allowRefresh: false, projectId: 'warintza-golden' });
  for (const [key, values] of Object.entries(report.priceDeckSeriesByKey ?? {})) {
    input.priceSeriesByKey = input.priceSeriesByKey ?? {};
    input.priceSeriesByKey[key] = [...values];
    for (const [metal, metalKey] of Object.entries(raw.metals.priceKeyByMetal)) if (metalKey === key) input.spotPriceUSDByMetal[metal] = [...values];
    if (raw.metals.auPriceKey === key) input.aisc.auPriceUSDPerOz = [...values];
  }
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runWarintzaPfsGoldenTest(): Promise<void> {
  assert(WARINTZA_PFS_V3.time.masterN === 25, 'Warintza must map -3,-2,-1, Years 1-23 to 26 periods');
  assert(WARINTZA_PFS_V3.time.productionStartPeriod === 3, 'Warintza Year 1 must be t=3');
  assert(WARINTZA_PFS_V3.time.nameplateCapacityPeriod === 4, 'Warintza first full 60.2 Mt year must be t=4');
  const reportGold = WARINTZA_PFS_V3.verification?.report?.priceDeckSeriesByKey?.XAU_USD_TOZ;
  assert(reportGold?.[3] === 2800 && reportGold?.[5] === 2800 && reportGold?.[6] === 2500, 'Warintza report reconciliation must preserve the PFS stepped Au deck exactly');

  const reconciliation = await reconcileProjectJsonV3ToReport(WARINTZA_PFS_V3);
  assert(reconciliation.status === 'VERIFIED', `Warintza PFS must reconcile: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every((check) => check.status === 'PASS'), `Warintza hard checks must all pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(finite(reconciliation.modelNPVPostTaxUSD), 'Warintza model post-tax NPV must be finite');
  assert(finite(reconciliation.modelIRRPostTax), 'Warintza model post-tax IRR must be finite');
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Warintza post-tax NPV must be within report tolerance');
  assert(Math.abs(reconciliation.irrRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Warintza post-tax IRR must be within report tolerance');
  assert(reconciliation.reportNPVPreTaxUSD === null && reconciliation.reportIRRPreTax === null, 'Warintza pre-tax checkpoint must remain explicitly omitted because VAT recovery is separately disclosed');

  const out = await runReportEngine(WARINTZA_PFS_V3);
  const postTaxMaxDiff = maxAbsDiff(out.phase1.fcffUSD, WARINTZA_REPORT_POST_TAX_FCFF_USD);
  assert(postTaxMaxDiff <= 8_000_000, `Warintza period FCFF differs from rounded Table 22.8 by ${postTaxMaxDiff}, expected <=8m USD`);

  const stream = out.streams;
  assert(stream, 'Warintza Royal Gold stream must be active');
  assert(stream.deliveredQtyByMetal.Au[3] === 9_000, 'Warintza Year 1 direct stream delivery must equal published 9 koz');
  assert(stream.preStreamPayableQtyByMetal.Au[3] === 55_000, 'Warintza Year 1 pre-stream Au must equal 46 koz retained + 9 koz delivered');
  assert(Math.abs((stream.streamPurchaseRevenueUSDByMetal.Au[3] ?? 0) - 5_040_000) < 1, 'Warintza Year 1 streamer purchase cash must use 20% of US$2,800/oz');
  assert(Math.abs((stream.streamPurchaseRevenueUSDByMetal.Au[14] ?? 0) - 7_500_000) < 1, 'Warintza Year 12 streamer purchase cash must use 60% of US$2,500/oz after 90 koz cumulative deliveries');

  const fiscal = out.fiscalTake?.byRuleUSD;
  assert(fiscal, 'Warintza royalties must be computed by the canonical fiscal engine');
  const year1Royalty = (fiscal.ecuador_government_royalty?.[3] ?? 0) + (fiscal.royal_gold_post_stream_nsr?.[3] ?? 0) + (fiscal.south32_nsr?.[3] ?? 0);
  assert(Math.abs(year1Royalty - 153_000_000) <= 1_000_000, `Warintza Year 1 dynamic royalties must reconcile to rounded Table 22.8; got ${year1Royalty}`);

  const runtime = clone(WARINTZA_PFS_V3);
  runtime.time.runtimePlacement = { productionStart: { year: 2032, sourceId: 'golden-test-only', pageOrTable: 'test-only runtime placement', asOfDate: '2026-09-01' } };
  const parsedRuntime = parseProjectJsonV3(runtime, { taxScenario: 'runtime', fiscalScenario: 'runtime' });
  const runtimeInput = await resolveProjectPricesToEngineInput({
    parsed: parsedRuntime,
    scenario: { mode: 'fixed', fixedPriceByKey: { CU_USD_LB: 4.5, XAU_USD_TOZ: 4000, XAG_USD_TOZ: 28, MO_USD_TONNE: 20 * 2204.6226218487757 } },
    allowRefresh: false,
    projectId: 'warintza-runtime',
  });
  const runtimeOut = computeProjectEngineFullProductionV1(runtimeInput);
  assert(runtimeOut.phase1.fcffUSD.every(finite), 'Warintza runtime FCFF must be finite');
  assert(Math.abs((runtimeOut.streams?.streamPurchaseRevenueUSDByMetal.Au[3] ?? 0) - 7_200_000) < 1, 'Warintza stream purchase cash must dynamically follow runtime Au price');
  assert(runtimeOut.phase1.taxUSD.some((value, t) => finite(value) && value !== out.phase1.taxUSD[t]), 'Warintza runtime tax proxy must not reuse report cash tax');

  console.log(`Warintza PFS V3 VERIFIED | NPV8 post report=${reconciliation.reportNPVPostTaxUSD} model=${reconciliation.modelNPVPostTaxUSD} relDiff=${reconciliation.npvRelativeDifference} | IRR post report=${reconciliation.reportIRRPostTax} model=${reconciliation.modelIRRPostTax} relDiff=${reconciliation.irrRelativeDifference} | maxFCFFdiff post=${postTaxMaxDiff}`);
})();
