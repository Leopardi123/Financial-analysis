import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { computeProjectPhase1 } from '../../phase1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import type { ProjectJsonV3 } from '../schema.ts';

function assert(condition: unknown, message: string): void { if (!condition) throw new Error(message); }
function near(actual: number | null | undefined, expected: number, tolerance = 1e-8): void {
  assert(typeof actual === 'number' && Number.isFinite(actual), `Expected finite value, received ${String(actual)}`);
  assert(Math.abs((actual as number) - expected) <= tolerance, `Expected ${expected}, received ${actual}`);
}
function assertThrows(fn: () => unknown, pattern: RegExp, message: string): void {
  let error: unknown;
  try { fn(); } catch (caught) { error = caught; }
  assert(error instanceof Error && pattern.test(error.message), message);
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function fixture(): ProjectJsonV3 {
  return {
    version: 'project_json_v3',
    meta: { projectId: 'capitalized-development-fixture', projectName: 'Capitalized development fixture', currency: 'USD' },
    time: {
      masterN: 3,
      productionStartPeriod: 1,
      nameplateCapacityPeriod: null,
      reportPeriodLabels: ['-2', '-1', '1', '2'],
      phaseByPeriod: ['construction', 'ramp_up', 'operations', 'closure'],
      runtimePlacement: {
        constructionStart: { year: 2028, sourceId: 'fixture-schedule' },
        productionStart: { year: 2029, sourceId: 'fixture-schedule' },
      },
    },
    metals: {
      payableQtyByMetal: { Au: [0, 100, 100, 0] },
      metalInProductQtyByMetal: {},
      revenueBasisByMetal: { Au: 'PAYABLE_DIRECT' },
      payableQtyUnitByMetal: { Au: 'toz' },
      priceKeyByMetal: { Au: 'XAU_USD_TOZ' },
      auPriceKey: 'XAU_USD_TOZ',
    },
    economics: {
      costModel: { mode: 'AGGREGATE', operatingCostsUSD: [0, 0, 0, 0], siteGandA_USD: [0, 0, 0, 0] },
      sellingModel: { mode: 'NONE' },
      developmentModel: {
        mode: 'REPORT_LOCKED_WITH_RUNTIME_PROXY',
        reportCapitalizedRevenueUSD: [0, 40, 20, 0],
        reportCapitalizedCostsUSD: [0, 10, 5, 0],
        runtime: {
          method: 'REVENUE_SHARE',
          capitalizedRevenueShareByPeriod: [0, 0.4, 0.2, 0],
          capitalizedCostsUSD: [0, 10, 5, 0],
          sourceId: 'fixture-report',
          pageOrTable: 'Runtime split evidence',
        },
        sourceId: 'fixture-report',
        pageOrTable: 'Report development cash flows',
      },
      fiscalTakeModel: {
        mode: 'RULES',
        items: [{
          id: 'operating-royalty',
          placement: 'OPERATING_EXPENSE',
          base: { line: 'GROSS_METAL_VALUE' },
          rate: { type: 'FIXED', rate: 0.1 },
          sourceId: 'fixture-report',
          pageOrTable: 'Royalty terms',
        }],
      },
      taxModel: { mode: 'FLAT_RATE', taxRate: 0.25 },
      depreciationUSD: [0, 0, 0, 0],
    },
    capital: {
      capexUSD: [0, 0, 0, 0],
      sustainingCapexUSD: [0, 0, 0, 0],
      closureUSD: [0, 0, 0, 0],
      workingCapitalDeltaUSD: [0, 0, 0, 0],
      terminalProceedsUSD: [0, 0, 0, 0],
    },
    verification: null,
  };
}

async function engineAtPrice(raw: ProjectJsonV3, price: number, leg: 'runtime' | 'report') {
  const parsed = parseProjectJsonV3(raw, { requireRuntimePlacement: false, taxScenario: leg, fiscalScenario: leg });
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: { XAU_USD_TOZ: price } },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? 'capitalized-development-fixture',
  });
  return computeProjectEngineFullProductionV1(input);
}

(async function run(): Promise<void> {
  const direct = computeProjectPhase1({
    masterN: 0,
    productionStartPeriod: 0,
    taxRate: 0.25,
    capexUSD: [0],
    revenueUSD: [100],
    capitalizedDevelopmentRevenueUSD: [40],
    capitalizedDevelopmentCostsUSD: [10],
    operatingCostsUSD: [0],
    sellingCostsUSD: [0],
    sustainingCapexUSD: [0],
    royaltiesUSD: [0],
    siteGandA_USD: [0],
    reclamationUSD: [0],
    depreciationUSD: [0],
    workingCapitalDeltaUSD: [0],
  });
  near(direct.operatingRevenueUSD_effective?.[0], 60);
  near(direct.ebitdaUSD[0], 60);
  near(direct.taxUSD[0], 15);
  near(direct.fcffUSD[0], 75);

  const share = computeProjectPhase1({
    masterN: 0,
    productionStartPeriod: 0,
    taxRate: 0.25,
    capexUSD: [0],
    revenueUSD: [100],
    capitalizedDevelopmentRevenueShareByPeriod: [0.4],
    capitalizedDevelopmentCostsUSD: [10],
    operatingCostsUSD: [0],
    sellingCostsUSD: [0],
    sustainingCapexUSD: [0],
    royaltiesUSD: [0],
    siteGandA_USD: [0],
    reclamationUSD: [0],
    depreciationUSD: [0],
    workingCapitalDeltaUSD: [0],
  });
  near(share.capitalizedDevelopmentRevenueUSD_effective?.[0], 40);
  near(share.fcffUSD[0], 75);

  assertThrows(() => computeProjectPhase1({
    masterN: 0,
    productionStartPeriod: 0,
    taxRate: 0.25,
    capexUSD: [0], revenueUSD: [100], operatingCostsUSD: [0], sustainingCapexUSD: [0], royaltiesUSD: [0], siteGandA_USD: [0], reclamationUSD: [0],
    capitalizedDevelopmentRevenueUSD: [40], capitalizedDevelopmentRevenueShareByPeriod: [0.4],
  }), /mutually exclusive/, 'Locked development revenue and runtime share must be mutually exclusive');

  const raw = fixture();
  const reportAtDeck = await engineAtPrice(raw, 1, 'report');
  const runtimeAtDeck = await engineAtPrice(raw, 1, 'runtime');
  near(reportAtDeck.phase1.capitalizedDevelopmentRevenueUSD_effective?.[1], 40);
  near(runtimeAtDeck.phase1.capitalizedDevelopmentRevenueUSD_effective?.[1], 40);
  near(reportAtDeck.phase1.operatingRevenueUSD_effective?.[1], 60);
  near(runtimeAtDeck.phase1.operatingRevenueUSD_effective?.[1], 60);
  near(reportAtDeck.fiscalTake?.operatingExpenseUSD[1], 6);
  near(runtimeAtDeck.fiscalTake?.operatingExpenseUSD[1], 6);

  // Period 2 is deliberately mixed: it contains commercial operating revenue and
  // a report-defined precommercial carve-out within the same annual period.
  near(reportAtDeck.phase1.capitalizedDevelopmentRevenueUSD_effective?.[2], 20);
  near(reportAtDeck.phase1.operatingRevenueUSD_effective?.[2], 80);

  const reportAtDoublePrice = await engineAtPrice(raw, 2, 'report');
  const runtimeAtDoublePrice = await engineAtPrice(raw, 2, 'runtime');
  near(reportAtDoublePrice.phase1.capitalizedDevelopmentRevenueUSD_effective?.[1], 40);
  near(reportAtDoublePrice.phase1.operatingRevenueUSD_effective?.[1], 160);
  near(runtimeAtDoublePrice.phase1.capitalizedDevelopmentRevenueUSD_effective?.[1], 80);
  near(runtimeAtDoublePrice.phase1.operatingRevenueUSD_effective?.[1], 120);
  near(runtimeAtDoublePrice.fiscalTake?.operatingExpenseUSD[1], 12);

  const lockedOnly = clone(raw);
  lockedOnly.economics.developmentModel = {
    mode: 'LOCKED_SERIES',
    capitalizedRevenueUSD: [0, 40, 20, 0],
    capitalizedCostsUSD: [0, 10, 5, 0],
    sourceId: 'fixture-report',
    pageOrTable: 'Report development cash flows',
  };
  assertThrows(
    () => parseProjectJsonV3(lockedOnly, { requireRuntimePlacement: false }),
    /cannot be reused for normal runtime/,
    'Report-locked development cash flows without a runtime proxy must fail closed in normal runtime',
  );

  console.log('project_json_v3 capitalized development tests passed');
})();
