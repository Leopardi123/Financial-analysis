import { computeProjectEngineWithTake } from '../engineWithTake.ts';

(function runEngineWithTakeTests() {
  const output = computeProjectEngineWithTake({
    take: {
      masterN: 2,
      grossRevenueUSD: [0, 1000, 1000],
      items: [{
        id: 'a', jurisdictionLevel: 'national', metals: ['ALL'],
        baseType: 'REVENUE', rateType: 'FIXED', rateFixed: 0.05,
      }],
    },
    phase1: {
      masterN: 2, productionStartPeriod: 1,
      grossRevenueUSD: [0, 1000, 1000],
      operatingCostsUSD: [0, 100, 100],
      sustainingCapexUSD: [0, 0, 0],
      siteGandA_USD: [0, 0, 0],
      royaltiesUSD: [0, 0, 0],
      reclamationUSD: [0, 0, 0],
      capexUSD: [0, 0, 0],
    },
    phase2: { discountRate: 0.1 },
  });

  if (output.take.totalTakeUSD[1] !== 50) throw new Error('expected take at t=1');
  if (output.phase1.ebitUSD[1] !== 850) throw new Error('phase1 uses net revenue');
  console.log('Engine with take wrapper tests passed');
})();
