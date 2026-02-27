import { computeProjectEngineFullProductionV1 } from '../engineFullProductionV1.ts';

(function runEngineFullProductionV1Tests() {
  const out = computeProjectEngineFullProductionV1({
    masterN: 1,
    streamsByMetal: null,
    payableQtyByMetal: { Au: [1, 1] },
    spotPriceUSDByMetal: { Au: [1000, 1000] },
    takeItems: [{
      id: 'nsr', jurisdictionLevel: 'national', metals: ['ALL'],
      baseType: 'REVENUE', rateType: 'FIXED', rateFixed: 0.05,
    }],
    royaltiesDetail: [{ id: 'nsr-detail', label: 'NSR', base: 'revenue', rateType: 'NSR_pct', rate: 5 }],
    phase1: {
      masterN: 1,
      productionStartPeriod: 0,
      taxRate: 0,
      capexUSD: [0, 0],
      operatingCostsUSD: [0, 0],
      sustainingCapexUSD: [0, 0],
      siteGandA_USD: [0, 0],
      reclamationUSD: [0, 0],
    },
    phase2: { discountRate: 0.1 },
    aisc: { auPriceUSDPerOz: [1000, 1000] },
  });

  if (JSON.stringify(out.totalTakeUSD) !== JSON.stringify([50, 50])) throw new Error('totalTakeUSD expected');
  if (JSON.stringify(out.itemTakeUSDById.nsr) !== JSON.stringify([50, 50])) throw new Error('item take expected');

  const override = computeProjectEngineFullProductionV1({
    masterN: 3,
    streamsByMetal: null,
    payableQtyByMetal: { Au: [1, 1, 1, 1] },
    spotPriceUSDByMetal: { Au: [0, 1000, 1000, 0] },
    takeItems: [{
      id: 'nsr', jurisdictionLevel: 'national', metals: ['ALL'],
      baseType: 'REVENUE', rateType: 'FIXED', rateFixed: 0.05,
    }],
    royaltiesDetail: [{ id: 'nsr-detail', label: 'NSR', base: 'revenue', rateType: 'NSR_pct', rate: 5 }],
    phase1: {
      masterN: 3,
      productionStartPeriod: 0,
      taxRate: 0,
      capexUSD: [0, 0, 0, 0],
      operatingCostsUSD: [0, 0, 0, 0],
      sustainingCapexUSD: [0, 0, 0, 0],
      siteGandA_USD: [0, 0, 0, 0],
      reclamationUSD: [0, 0, 0, 0],
      royaltiesUSD: [null, null, 10, null],
    },
    phase2: { discountRate: 0.1 },
    aisc: { auPriceUSDPerOz: [1000, 1000, 1000, 1000] },
  });

  if (override.totalTakeUSD[1] !== 50) throw new Error('derived take expected at t=1');
  if (override.phase1.sustainingCostUSD[2] !== 10) throw new Error('royalties override should feed phase1 at override period');
  if (!override.nationalTake.diagnostics.includes('royaltiesUSD: manual override detected; ignoring royaltiesDetail for calculation')) {
    throw new Error('override diagnostic expected');
  }

  console.log('Engine full production v1 tests passed');
})();
