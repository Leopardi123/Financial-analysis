import { computeProjectEngineWithTakeAndAisc } from '../engineWithTakeAndAisc.ts';

(function runEngineWithTakeAndAiscTests() {
  const masterN = 2;
  const grossRevenueUSD = [0, 1000, 1000];

  const output = computeProjectEngineWithTakeAndAisc({
    engineWithTake: {
      take: {
        masterN,
        grossRevenueUSD,
        items: [{
          id: 'a', jurisdictionLevel: 'national', metals: ['ALL'],
          baseType: 'REVENUE', rateType: 'FIXED', rateFixed: 0.05,
        }],
      },
      phase1: {
        masterN,
        productionStartPeriod: 1,
        grossRevenueUSD,
        operatingCostsUSD: [0, 100, 100],
        sustainingCapexUSD: [0, 1, 1],
        siteGandA_USD: [0, 0, 0],
        royaltiesUSD: [0, 0, 0],
        reclamationUSD: [0, 0, 0],
        byproductCreditsUSD: [0, 0, 0],
        capexUSD: [0, 0, 0],
      },
      phase2: { discountRate: 0.1 },
    },
    aisc: {
      grossRevenueUSD,
      auPriceUSDPerOz: [2000, 2000, 2000],
    },
  });

  if (output.phase1.sustainingCostUSD[1] !== 151) throw new Error('sustaining cost should include royalties');
  if (output.aisc.lomPeriods !== 2) throw new Error('AISC output expected');
  console.log('Engine with take and AISC wrapper tests passed');
})();
