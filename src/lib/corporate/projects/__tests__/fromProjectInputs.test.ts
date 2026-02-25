import { computeCorporateFromProjectInputs } from '../fromProjectInputs.ts';
import type { ProjectEngineFullProductionV1Input } from '../../../project/types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
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

function buildProjectInput(masterN: number, productionStartPeriod: number, payableQty: number): ProjectEngineFullProductionV1Input {
  return {
    masterN,
    streamsByMetal: null,
    payableQtyByMetal: {
      Au: [payableQty],
    },
    spotPriceUSDByMetal: {
      Au: [10],
    },
    takeItems: [],
    phase1: {
      masterN,
      productionStartPeriod,
      taxRate: 0,
      capexUSD: [0],
      operatingCostsUSD: [2],
      sustainingCapexUSD: [1],
      siteGandA_USD: [1],
      reclamationUSD: [0],
    },
    phase2: {
      discountRate: 0.1,
    },
    aisc: {
      auPriceUSDPerOz: [1800],
    },
  };
}

(function runCorporateFromProjectInputsTests() {
  const projectA = buildProjectInput(0, 0, 10);
  const projectB = buildProjectInput(0, 0, 5);

  const happy = computeCorporateFromProjectInputs({
    discountRate: 0.1,
    masterN: 0,
    diagnose: true,
    projects: [
      { id: 'A', input: projectA },
      { id: 'B', input: projectB },
    ],
  });

  const expectedFcff = happy.projectOutputs.reduce<number>((sum, project) => sum + ((project.out.phase1.fcffUSD[0] as number) ?? 0), 0);
  assertDeepEqual(happy.corporateProjects.fcffUSD_total, [expectedFcff], 'corporate fcff total should equal sum of project fcff outputs');
  assert(happy.diagnostics !== undefined, 'diagnostics should be present when diagnose is true');
  assert(happy.diagnostics?.length === 2, 'diagnostics should include each project report');
  assert(happy.diagnostics?.every((entry) => entry.report.ok), 'diagnostics should include ok reports for valid projects');

  const mismatchMetalInput = buildProjectInput(0, 0, 10);
  mismatchMetalInput.spotPriceUSDByMetal = {
    Ag: [10],
  };

  assertThrows(
    () =>
      computeCorporateFromProjectInputs({
        discountRate: 0.1,
        masterN: 0,
        validate: true,
        projects: [{ id: 'metal-mismatch', input: mismatchMetalInput }],
      }),
    /spotPriceUSDByMetal missing required metal Au/,
    'validate=true should throw when project validation fails',
  );

  const masterNMismatchInput = buildProjectInput(1, 0, 10);

  assertThrows(
    () =>
      computeCorporateFromProjectInputs({
        discountRate: 0.1,
        masterN: 0,
        projects: [{ id: 'masterN-mismatch', input: masterNMismatchInput }],
      }),
    /masterN mismatch/,
    'corporate and project masterN mismatch should throw',
  );

  console.log('Corporate from project inputs adapter tests passed');
})();
