import { parseProjectJsonV1 } from '../../jsonv1/parse.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { computeIrr } from '../../../metrics/lista3.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
function near(actual: number | null | undefined, expected: number, tolerance = 1e-8): void {
  assert(typeof actual === 'number' && Number.isFinite(actual), `Expected finite value, received ${String(actual)}`);
  assert(Math.abs((actual as number) - expected) <= tolerance, `Expected ${expected}, received ${actual}`);
}
function assertThrows(fn: () => unknown, pattern: RegExp, message: string): void {
  let error: unknown;
  try { fn(); } catch (caught) { error = caught; }
  assert(error instanceof Error && pattern.test(error.message), message);
}

function fixture(): ProjectJsonV3 {
  return {
    version: 'project_json_v3',
    meta: { projectId: 'v3-fixture', projectName: 'V3 fixture', currency: 'USD' },
    time: {
      masterN: 3,
      productionStartPeriod: 1,
      periodEndDatesUtc: ['2028-12-31', '2029-12-31', '2030-12-31', '2031-12-31'],
      phaseByPeriod: ['construction', 'operations', 'operations', 'closure'],
    },
    metals: {
      payableQtyByMetal: { Au: [0, 1000, 1000, 0] },
      payableQtyUnitByMetal: { Au: 'toz' },
      priceKeyByMetal: { Au: 'XAU_USD_TOZ' },
      auPriceKey: 'XAU_USD_TOZ',
    },
    economics: {
      costModel: {
        mode: 'COMPONENTS',
        components: [
          { id: 'mine', category: 'mining', seriesUSD: [0, 300000, 300000, 0] },
          { id: 'plant', category: 'processing', seriesUSD: [0, 300000, 300000, 0] },
          { id: 'ga', category: 'site_ga', seriesUSD: [0, 50000, 50000, 0] },
        ],
      },
      sellingModel: {
        mode: 'COMPONENTS',
        components: [{ id: 'freight', category: 'transport', seriesUSD: [0, 1000, 1000, 0] }],
      },
      royaltyModel: { mode: 'NONE' },
      taxModel: { mode: 'FLAT_RATE', taxRate: 0.25 },
      depreciationUSD: [0, 0, 0, 0],
    },
    capital: {
      capexUSD: [1500000, 0, 0, 0],
      sustainingCapexUSD: [0, 0, 0, 0],
      closureUSD: [0, 0, 0, 10000],
      workingCapitalDeltaUSD: [0, 0, 0, 0],
      terminalProceedsUSD: [0, 0, 0, 0],
    },
    verification: {
      report: {
        sourceId: 'fixture-report',
        npvIrrPageOrTable: 'Table X',
        pricesPageOrTable: 'Table Y',
        discountRate: 0.08,
        discountConvention: 'period_end',
        priceDeckByKey: { XAU_USD_TOZ: 2000 },
        reportNPVPostTaxUSD: 1,
        reportIRRPostTax: 0.1,
        toleranceRelative: 0.000001,
        reportInitialCapexUSD: 1500000,
        reportSustainingCapexUSD: 0,
        reportClosureUSD: 10000,
        reportClosurePeriod: 3,
      },
      reportedCostCheckpoints: [],
    },
  };
}

(async function run(): Promise<void> {
  const raw = fixture();
  const parsed = parseProjectJsonV1(raw);
  assert(parsed.engineInputWithoutPrices.yearsByPeriod.join(',') === '2028,2029,2030,2031', 'V3 report periods must be canonical calendar axis');
  near((parsed.engineInputWithoutPrices.phase1 as any).operatingCostsUSD[1], 600000);
  near((parsed.engineInputWithoutPrices.phase1 as any).siteGandA_USD[1], 50000);
  near((parsed.engineInputWithoutPrices.phase1 as any).sellingCostsUSD[1], 1000);

  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: { XAU_USD_TOZ: 2000 } },
    allowRefresh: false,
    projectId: 'v3-fixture',
  });
  input.phase2.discountRate = 0.08;
  const output = computeProjectEngineFullProductionV1(input);
  near(output.phase1.sellingCostsUSD_effective?.[1], 1000);
  const expectedEbitda = 2_000_000 - 600_000 - 1_000 - 50_000;
  near(output.phase1.ebitdaUSD[1], expectedEbitda);

  const fcff = output.phase1.fcffUSD;
  assert(fcff.every((value) => typeof value === 'number' && Number.isFinite(value)), 'Fixture FCFF must be finite');
  const reportNpv = (fcff as number[]).reduce((sum, value, t) => sum + value / ((1 + 0.08) ** t), 0);
  const reportIrr = computeIrr(fcff, 0.08).selectedRoot;
  assert(typeof reportIrr === 'number' && Number.isFinite(reportIrr), 'Fixture IRR must be finite');
  raw.verification!.report!.reportNPVPostTaxUSD = reportNpv;
  raw.verification!.report!.reportIRRPostTax = reportIrr as number;

  const reconciled = await reconcileProjectJsonV3ToReport(raw);
  assert(reconciled.status === 'VERIFIED', `Expected VERIFIED reconciliation: ${JSON.stringify(reconciled.hardChecks)}`);
  assert(reconciled.hardChecks.every((check) => check.status === 'PASS'), 'Every hard reconciliation check must pass');

  const invalid = fixture() as any;
  invalid.economics.costModel.operatingCostsUSD = [0, 1, 1, 0];
  assertThrows(
    () => parseProjectJsonV1(invalid),
    /forbids parallel source field\(s\): operatingCostsUSD/,
    'COMPONENTS mode must fail closed if an aggregate OPEX source is also supplied',
  );

  const invalidReport = fixture() as any;
  invalidReport.verification.report.reportPostTaxFCF_USD = [0, 1, 1, 0];
  assertThrows(
    () => parseProjectJsonV1(invalidReport),
    /CHECKPOINTS_ONLY forbids parallel source field\(s\): reportPostTaxFCF_USD/,
    'V3 verification must not carry a parallel report FCFF ledger',
  );

  console.log('project_json_v3 foundation tests passed');
})();
