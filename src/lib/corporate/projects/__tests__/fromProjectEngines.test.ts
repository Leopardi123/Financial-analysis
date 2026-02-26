import { computeCorporateFromProjectEngines } from '../fromProjectEngines.ts';
import type { ProjectEngineFullProductionV1Output } from '../../../project/types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertApproxEqual(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn: () => void, pattern: RegExp, message: string): void {
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof Error, `${message}. Expected function to throw`);
  assert(pattern.test((thrown as Error).message), `${message}. Error message did not match pattern`);
}

function makeOutputStub(input: {
  grossRevenueUSD: (number | null)[];
  capexUSD_used: (number | null)[];
  fcffUSD: (number | null)[];
  sustainingCostUSD: (number | null)[];
  payableAuEqOz: (number | null)[];
  phase1ProductionStartPeriod?: number;
}): ProjectEngineFullProductionV1Output {
  return {
    streams: null,
    revenue: {
      grossRevenueUSD: input.grossRevenueUSD,
      byMetalRevenueUSD: {},
    },
    nationalTake: {
      totalTakeUSD: [],
      totalRoyaltiesUSD: [],
      phase1: {
        sustainingCostUSD: input.sustainingCostUSD,
        ebitUSD: [],
        taxUSD: [],
        nopatUSD: [],
        fcffUSD: input.fcffUSD,
        ...(input.phase1ProductionStartPeriod !== undefined
          ? { productionStartPeriod: input.phase1ProductionStartPeriod }
          : {}),
      },
      itemTakeUSDById: {},
    },
    totalTakeUSD: [],
    itemTakeUSDById: {},
    phase1: {
      sustainingCostUSD: input.sustainingCostUSD,
      ebitUSD: [],
      taxUSD: [],
      nopatUSD: [],
      fcffUSD: input.fcffUSD,
      ...(input.phase1ProductionStartPeriod !== undefined
        ? { productionStartPeriod: input.phase1ProductionStartPeriod }
        : {}),
    },
    phase2: {
      dfToToday: [],
      cfLOM_USD: null,
      npvToday_USD: null,
      dcfProdStart_exCapex_USD: null,
      dcfProdStart_present_USD: null,
      irr: null,
      npv_over_etlv: null,
      dcf_present_over_etlv: null,
    },
    aisc: {
      payableAuEqOz: input.payableAuEqOz,
      lomPeriods: 0,
      aiscAuEqUSDPerOz_LOM: null,
    },
    capexUSD_used: input.capexUSD_used,
  } as ProjectEngineFullProductionV1Output;
}

(function runCorporateFromProjectEnginesTests() {
  const outA = makeOutputStub({
    grossRevenueUSD: [100, 110],
    capexUSD_used: [10, 0],
    fcffUSD: [10, 20],
    sustainingCostUSD: [4, 6],
    payableAuEqOz: [2, 3],
  });
  const outB = makeOutputStub({
    grossRevenueUSD: [200, 220],
    capexUSD_used: [5, 0],
    fcffUSD: [5, 10],
    sustainingCostUSD: [1, 2],
    payableAuEqOz: [1, 1],
  });

  const happy = computeCorporateFromProjectEngines({
    discountRate: 0.1,
    masterN: 1,
    projects: [
      { id: 'A', productionStartPeriod: 0, out: outA },
      { id: 'B', productionStartPeriod: 0, out: outB },
    ],
  });

  assertDeepEqual(happy.fcffUSD_total, [15, 30], 'happy path should aggregate fcff series');

  const expectedNpv = 15 + 30 / 1.1;
  assert(happy.npvToday_USD_total !== null, 'happy path npv should not be null');
  assertApproxEqual(happy.npvToday_USD_total as number, expectedNpv, 1e-9, 'npv should match discounted fcff total');

  const expectedAisc = (4 + 6 + 1 + 2) / (2 + 3 + 1 + 1);
  assert(happy.aiscAuEqUSDPerOz_LOM_corp !== null, 'happy path aisc should not be null');
  assertApproxEqual(happy.aiscAuEqUSDPerOz_LOM_corp as number, expectedAisc, 1e-9, 'corporate aisc should match summed ratio');

  const badLengthOutput = makeOutputStub({
    grossRevenueUSD: [10, 10],
    capexUSD_used: [2],
    fcffUSD: [1, 1],
    sustainingCostUSD: [1, 1],
    payableAuEqOz: [1, 1],
  });

  assertThrows(
    () =>
      computeCorporateFromProjectEngines({
        discountRate: 0.1,
        masterN: 1,
        projects: [{ id: 'bad-length', productionStartPeriod: 0, out: badLengthOutput }],
      }),
    /Project bad-length field capexUSD length must be 2/,
    'length mismatch should throw',
  );

  const tpMismatchOutput = makeOutputStub({
    grossRevenueUSD: [1, 1],
    capexUSD_used: [1, 1],
    fcffUSD: [1, 1],
    sustainingCostUSD: [1, 1],
    payableAuEqOz: [1, 1],
    phase1ProductionStartPeriod: 0,
  });

  assertThrows(
    () =>
      computeCorporateFromProjectEngines({
        discountRate: 0.1,
        masterN: 1,
        projects: [{ id: 'tp', productionStartPeriod: 1, out: tpMismatchOutput }],
      }),
    /Project tp productionStartPeriod mismatch/,
    'tp mismatch should throw',
  );

  assertEqual(true, true, 'sanity assertion');

  console.log('Corporate from project engines adapter tests passed');
})();
