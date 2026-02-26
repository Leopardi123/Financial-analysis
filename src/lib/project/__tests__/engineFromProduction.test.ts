import { computeProjectEngineFromProduction } from '../engineFromProduction.ts';

(function runEngineFromProductionTests() {
  const output = computeProjectEngineFromProduction({
    revenue: {
      masterN: 2,
      payableQtyByMetal: { Au: [0, 1, 1] },
      priceUSDByMetal: { Au: [2000, 2000, 2000] },
    },
    take: {
      masterN: 2,
      items: [{
        id: 'nsr', jurisdictionLevel: 'national', metals: ['ALL'],
        baseType: 'REVENUE', rateType: 'FIXED', rateFixed: 0.02,
      }],
    },
    phase1: {
      masterN: 2, productionStartPeriod: 1,
      operatingCostsUSD: [0, 500, 500],
      sustainingCapexUSD: [0, 50, 50],
      siteGandA_USD: [0, 20, 20],
      royaltiesUSD: [0, 0, 0],
      reclamationUSD: [0, 0, 0],
      capexUSD: [100, 0, 0], taxRate: 0.3,
    },
    phase2: { discountRate: 0.1 },
    aisc: { auPriceUSDPerOz: [2000, 2000, 2000] },
  });

  if (output.take.totalTakeUSD[1] !== 40) throw new Error('take should be 2% of revenue');
  if (output.phase1.ebitUSD[1] !== 1410) throw new Error('phase1 should use net revenue after take');
  console.log('Engine from production wrapper tests passed');
})();
