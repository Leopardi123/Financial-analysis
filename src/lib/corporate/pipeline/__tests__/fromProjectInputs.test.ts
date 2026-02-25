import { computeCorporateFullPipelineFromProjectInputs } from '../fromProjectInputs.ts';
import type { CorporateFullPipelineFromProjectInputsInput } from '../fromProjectInputs.ts';
import type { ProjectEngineFullProductionV1Input } from '../../../project/types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertApproxEqual(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
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

function buildProjectInput(masterN: number): ProjectEngineFullProductionV1Input {
  return {
    masterN,
    streamsByMetal: null,
    payableQtyByMetal: {
      Au: [10],
    },
    spotPriceUSDByMetal: {
      Au: [10],
    },
    takeItems: [],
    phase1: {
      masterN,
      productionStartPeriod: 0,
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

function makeBaseInput(): CorporateFullPipelineFromProjectInputsInput {
  return {
    projects: {
      discountRate: 0.1,
      masterN: 0,
      projects: [{ id: 'P1', input: buildProjectInput(0) }],
    },
    financing: {
      fx_USD_to_TargetCurrency: 10,
      cash_TargetCurrency_t0: 2000,
      debt_TargetCurrency_t0: 500,
      cashUsedForProjectFinancing_TargetCurrency_t0: 0,
    },
    market: {
      price_current_TargetCurrency: 10,
      shares_current: 1000,
    },
    equityFinancing: {
      equityNeeded_TargetCurrency: 100,
      equityRaisePrice_TargetCurrency_perShare: 5,
    },
  };
}

(function runCorporateFullPipelineFromProjectInputsTests() {
  const happy = computeCorporateFullPipelineFromProjectInputs(makeBaseInput());

  assert(
    happy.financing.navToday_TargetCurrency !== null && Number.isFinite(happy.financing.navToday_TargetCurrency),
    'happy path should produce finite NAV in financing output',
  );
  assert(
    happy.marketValue.ev_TargetCurrency !== null && Number.isFinite(happy.marketValue.ev_TargetCurrency),
    'happy path should compute EV in market value output',
  );

  const nav = happy.financing.navToday_TargetCurrency as number;
  assertApproxEqual(
    happy.perShare.navToday_perShare_TargetCurrency as number,
    nav / 1020,
    1e-12,
    'happy path per-share NAV should use shares_post_financing=1020',
  );

  const diagnosed = computeCorporateFullPipelineFromProjectInputs({
    ...makeBaseInput(),
    diagnose: true,
  });

  assert(diagnosed.projectStage.diagnostics !== undefined, 'diagnose=true should include project diagnostics');

  const invalidProjectInput = makeBaseInput();
  invalidProjectInput.projects.projects[0].input.spotPriceUSDByMetal = {
    Ag: [10],
  };

  assertThrows(
    () =>
      computeCorporateFullPipelineFromProjectInputs({
        ...invalidProjectInput,
        validate: true,
      }),
    /spotPriceUSDByMetal missing required metal Au/,
    'validate=true should throw when project input fails validation',
  );

  console.log('Corporate full pipeline from project inputs tests passed');
})();
