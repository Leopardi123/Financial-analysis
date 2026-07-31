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
  if (output.phase1.ebitdaUSD[1] !== 1440) throw new Error('informational EBITDA should exclude sustaining CAPEX');
  if (output.phase1.sustainingAdjustedOperatingEarningsUSD[1] !== 1390) throw new Error('operating earnings should use net revenue after take and deduct sustaining CAPEX');
  if (output.phase1.ebitUSD[1] !== 1390) throw new Error('EBIT should continue from sustaining-adjusted operating earnings');
  console.log('Engine from production wrapper tests passed');
})();
