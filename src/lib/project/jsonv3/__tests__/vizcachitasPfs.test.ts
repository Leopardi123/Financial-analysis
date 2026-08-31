import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import {
  VIZCACHITAS_PFS_V3,
  VIZCACHITAS_REPORT_POST_TAX_FCFF_USD,
  VIZCACHITAS_REPORT_PRE_TAX_FCFF_USD,
} from './fixtures/vizcachitasPfs.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function maxAbsDiff(actual: Array<number | null>, expected: readonly number[]): number {
  assert(actual.length === expected.length, `Series length mismatch: actual=${actual.length}, expected=${expected.length}`);
  let max = 0;
  for (let t = 0; t < actual.length; t += 1) {
    assert(finite(actual[t]), `Expected finite actual cash flow at t=${t}, received ${String(actual[t])}`);
    max = Math.max(max, Math.abs((actual[t] as number) - expected[t]));
  }
  return max;
}

async function runReportEngine(raw: ProjectJsonV3) {
  const report = raw.verification?.report;
  assert(report, 'Vizcachitas golden fixture requires verification.report');
  const parsed = parseProjectJsonV3(raw, {
    requireRuntimePlacement: false,
    taxScenario: 'report',
    fiscalScenario: 'report',
  });
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? 'vizcachitas-golden',
  });
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runVizcachitasPfsGoldenTest(): Promise<void> {
  const reconciliation = await reconcileProjectJsonV3ToReport(VIZCACHITAS_PFS_V3);
  assert(reconciliation.status === 'VERIFIED', `Vizcachitas PFS must reconcile: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every((check) => check.status === 'PASS'), `Vizcachitas hard checks must all pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(finite(reconciliation.modelNPVPostTaxUSD), 'Vizcachitas model post-tax NPV must be finite');
  assert(finite(reconciliation.modelIRRPostTax), 'Vizcachitas model post-tax IRR must be finite');
  assert(finite(reconciliation.modelNPVPreTaxUSD), 'Vizcachitas model pre-tax NPV must be finite');
  assert(finite(reconciliation.modelIRRPreTax), 'Vizcachitas model pre-tax IRR must be finite');
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Vizcachitas post-tax NPV must be within report tolerance');
  assert(Math.abs(reconciliation.irrRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Vizcachitas post-tax IRR must be within report tolerance');
  assert(Math.abs(reconciliation.npvPreTaxRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Vizcachitas pre-tax NPV must be within report tolerance');
  assert(Math.abs(reconciliation.irrPreTaxRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Vizcachitas pre-tax IRR must be within report tolerance');

  const reportOutput = await runReportEngine(VIZCACHITAS_PFS_V3);
  const postTaxMaxDiff = maxAbsDiff(reportOutput.phase1.fcffUSD, VIZCACHITAS_REPORT_POST_TAX_FCFF_USD);
  assert(postTaxMaxDiff <= 250_000, `Vizcachitas period-by-period post-tax FCFF differs from Table 22.7 by up to ${postTaxMaxDiff}, expected <=250000 USD rounding tolerance`);
  const preTaxFcff = reportOutput.phase1.fcffUSD.map((value, t) => finite(value) && finite(reportOutput.phase1.taxUSD[t])
    ? (value as number) + (reportOutput.phase1.taxUSD[t] as number)
    : null);
  const preTaxMaxDiff = maxAbsDiff(preTaxFcff, VIZCACHITAS_REPORT_PRE_TAX_FCFF_USD);
  assert(preTaxMaxDiff <= 250_000, `Vizcachitas period-by-period pre-tax FCFF differs from Table 22.7 by up to ${preTaxMaxDiff}, expected <=250000 USD rounding tolerance`);

  const nsr = reportOutput.fiscalTake?.byRuleUSD.project_nsr_2pct;
  assert(nsr && nsr.some((value) => finite(value) && value > 0), 'Vizcachitas 2% Project NSR must be dynamically reconstructed by the fiscal engine');
  assert(reportOutput.phase1.preTaxChargesUSD_effective?.[3] === 17_480_000, 'Report reconciliation must use the published Year 1 Mining Royalty Tax as a pre-tax fiscal charge');

  const runtimeFixture = clone(VIZCACHITAS_PFS_V3);
  runtimeFixture.time.runtimePlacement = {
    productionStart: {
      year: 2032,
      sourceId: 'golden-test-company-guidance',
      pageOrTable: 'test-only schedule placement',
      asOfDate: '2026-08-31',
    },
  };
  const report = runtimeFixture.verification?.report;
  assert(report, 'Runtime fixture requires report fixed deck for deterministic golden test');
  const runtimeParsed = parseProjectJsonV3(runtimeFixture, { taxScenario: 'runtime', fiscalScenario: 'runtime' });
  const runtimeInput = await resolveProjectPricesToEngineInput({
    parsed: runtimeParsed,
    scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey },
    allowRefresh: false,
    projectId: 'vizcachitas-golden-runtime',
  });
  runtimeInput.phase2.discountRate = report.discountRate;
  const runtimeOutput = computeProjectEngineFullProductionV1(runtimeInput);
  const runtimeProxy = runtimeOutput.fiscalTake?.byRuleUSD.chile_mining_royalty_tax_runtime_proxy;
  assert(runtimeProxy && runtimeProxy.some((value) => finite(value) && value > 0), 'Normal runtime must use the source-backed simplified Mining Royalty Tax proxy');
  assert(runtimeOutput.phase1.fcffUSD.every(finite), 'Vizcachitas runtime FCFF must remain finite with dynamic fiscal/tax proxies');
  assert(runtimeOutput.phase1.preTaxChargesUSD_effective?.some((value, t) => finite(value) && value !== reportOutput.phase1.preTaxChargesUSD_effective?.[t]), 'Runtime mining royalty proxy must not silently reuse the report-locked royalty series');
  assert(runtimeOutput.phase1.taxUSD.some((value, t) => finite(value) && value !== reportOutput.phase1.taxUSD[t]), 'Runtime tax proxy must not silently reuse the PFS report tax series');

  console.log(
    `Vizcachitas PFS V3 VERIFIED | NPV8 post report=${reconciliation.reportNPVPostTaxUSD} model=${reconciliation.modelNPVPostTaxUSD} relDiff=${reconciliation.npvRelativeDifference} | IRR post report=${reconciliation.reportIRRPostTax} model=${reconciliation.modelIRRPostTax} relDiff=${reconciliation.irrRelativeDifference} | NPV8 pre report=${reconciliation.reportNPVPreTaxUSD} model=${reconciliation.modelNPVPreTaxUSD} relDiff=${reconciliation.npvPreTaxRelativeDifference} | IRR pre report=${reconciliation.reportIRRPreTax} model=${reconciliation.modelIRRPreTax} relDiff=${reconciliation.irrPreTaxRelativeDifference} | maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff}`,
  );
})();
