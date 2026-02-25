import { computeProjectEngine } from '../engine.ts';
import { computeProjectPhase1 } from '../phase1.ts';
import { computeProjectPhase2 } from '../phase2.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

(function runEngineTests() {
  const phase1Input = {
    masterN: 3,
    productionStartPeriod: 2,
    taxRate: 0.3,
    revenueUSD: [0, 0, 100, 100],
    operatingCostsUSD: [10, 10, 40, 40],
    sustainingCapexUSD: [0, 0, 5, 5],
    siteGandA_USD: [2, 2, 2, 2],
    royaltiesUSD: [0, 0, 3, 3],
    reclamationUSD: [0, 0, 1, 1],
    byproductCreditsUSD: [0, 0, 0, 0],
    capexUSD: [50, 20, 0, 0],
  };

  const discountRate = 0.1;

  const engine = computeProjectEngine({
    phase1: phase1Input,
    phase2: { discountRate },
  });

  const directPhase1 = computeProjectPhase1(phase1Input);
  const directPhase2 = computeProjectPhase2({
    masterN: phase1Input.masterN,
    productionStartPeriod: phase1Input.productionStartPeriod,
    discountRate,
    fcffUSD: directPhase1.fcffUSD,
  });

  assertDeepEqual(engine.phase1.ebitUSD, directPhase1.ebitUSD, 'engine phase1 ebit should match direct phase1 output');
  assertEqual(
    engine.phase2.npvToday_USD,
    directPhase2.npvToday_USD,
    'engine phase2 npv should match direct phase2 output',
  );

  assertDeepEqual(
    engine.phase1.fcffUSD,
    directPhase1.fcffUSD,
    'engine should not mutate phase1 fcff when wiring into phase2',
  );

  const tpBeyondLifeInput = {
    ...phase1Input,
    masterN: 1,
    productionStartPeriod: 5,
    revenueUSD: [100, 100],
    operatingCostsUSD: [10, 10],
    sustainingCapexUSD: [5, 5],
    siteGandA_USD: [2, 2],
    royaltiesUSD: [1, 1],
    reclamationUSD: [0, 0],
    byproductCreditsUSD: [0, 0],
    capexUSD: [10, 10],
  };

  const tpBeyondLife = computeProjectEngine({
    phase1: tpBeyondLifeInput,
    phase2: { discountRate },
  });

  assertEqual(tpBeyondLife.phase2.dcfProdStart_exCapex_USD, null, 'tp>masterN ex-capex DCF should be null');
  assertEqual(tpBeyondLife.phase2.dcfProdStart_present_USD, null, 'tp>masterN present DCF should be null');

  console.log('Engine tests passed');
})();
