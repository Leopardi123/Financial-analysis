import test from 'node:test';
import assert from 'node:assert/strict';
import { computeProjectPhase1 } from '../../project/phase1.ts';
import { buildSnapshotSeries, type ProjectSeriesContext } from '../runCorporateSnapshot.ts';

test('single-project Corporate preserves Project EBITDA, operating earnings and FCFF', () => {
  const project = computeProjectPhase1({
    masterN: 0, productionStartPeriod: 0, taxRate: 0.25,
    revenueUSD: [100], operatingCostsUSD: [40], sustainingCapexUSD: [10],
    siteGandA_USD: [5], royaltiesUSD: [3], reclamationUSD: [2],
    byproductCreditsUSD: [4], depreciationUSD: [6], capexUSD: [7],
    workingCapitalDeltaUSD: [0],
  });
  const context: ProjectSeriesContext = {
    projectId: 'one', taxRate: 0.25, taxRateByPeriod: [0.25], yearsByPeriod: [2028],
    payableQtyByMetal: { Au: [1] }, payableQtyUnitByMetal: { Au: 'toz' },
    priceKeyByMetal: { Au: 'XAU_USD_TOZ' }, priceUSDUnitByMetal: { Au: 'USD_toz' },
    spotPriceUSDByMetal: { Au: [100] }, revenueByMetal_USD: { Au: [100] },
    operations: { throughputUnit: null, nameplateThroughput: null, utilizationPct: null },
    economicsBreakdown: null, royaltiesDetail: [], taxesDetail: null,
    economics: {
      operatingCostsUSD: [40], sustainingCapexUSD: [10], siteGandA_USD: [5],
      royaltiesUSD: [3], reclamationUSD: [2], byproductCreditsUSD: [4],
      sustainingCostUSD: project.sustainingCostUSD,
      sustainingAdjustedOperatingEarningsUSD: project.sustainingAdjustedOperatingEarningsUSD,
      ebitdaUSD: project.ebitdaUSD, depreciationUSD: project.depreciationUSD,
      ebitUSD: project.ebitUSD, taxableIncomeUSD: project.taxableIncomeUSD,
      effectiveTaxRate: project.effectiveTaxRate, taxUSD: project.taxUSD,
      workingCapitalDeltaUSD: project.workingCapitalDeltaUSD_effective,
      fcffUSD: project.fcffUSD, capexUSD: [7], totalCapexUSD: project.totalCapexUSD,
    },
  };
  const corporate = buildSnapshotSeries({ masterN: 0, corporateYearsByPeriod: [2028], projectSeriesContexts: [context] });
  assert.deepEqual(corporate.ebitdaUSD, project.ebitdaUSD);
  assert.deepEqual(corporate.sustainingAdjustedOperatingEarningsUSD, project.sustainingAdjustedOperatingEarningsUSD);
  assert.deepEqual(corporate.fcffUSD, project.fcffUSD);
});
