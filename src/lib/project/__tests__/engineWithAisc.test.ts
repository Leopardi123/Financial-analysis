import { computeProjectEngineWithAisc } from '../engineWithAisc.ts';
import { computeProjectPhase2 } from '../phase2.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

(function runEngineWithAiscTests() {
  const masterN = 3;
  const productionStartPeriod = 1;
  const discountRate = 0.1;

  const output = computeProjectEngineWithAisc({
    engine: {
      phase1: {
        masterN,
        productionStartPeriod,
        taxRate: 0.3,
        revenueUSD: [0, 100, 100, 50],
        operatingCostsUSD: [0, 40, 40, 20],
        sustainingCapexUSD: [0, 5, 5, 3],
        siteGandA_USD: [0, 2, 2, 1],
        royaltiesUSD: [0, 3, 3, 1],
        reclamationUSD: [0, 1, 1, 1],
        byproductCreditsUSD: [0, 0, 0, 0],
        capexUSD: [10, 0, 0, 0],
      },
      phase2: { discountRate },
    },
    aisc: {
      grossRevenueUSD: [0, 2_000_000, 2_000_000, 1_000_000],
      auPriceUSDPerOz: [2000, 2000, 2000, 2000],
    },
  });

  assertEqual(output.aisc.aiscAuEqUSDPerOz_LOM, 0.0512, 'wrapper AISC should match expected value');

  const phase2Direct = computeProjectPhase2({
    masterN,
    productionStartPeriod,
    discountRate,
    fcffUSD: output.phase1.fcffUSD,
  });
  assertEqual(
    output.phase2.npvToday_USD,
    phase2Direct.npvToday_USD,
    'phase2 npvToday_USD should match direct computeProjectPhase2 output',
  );

  console.log('Engine with AISC wrapper tests passed');
})();
