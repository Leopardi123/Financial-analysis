import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftProjectToTargetProductionYear } from '../companyProjectShift.ts';

test('shiftProjectToTargetProductionYear keeps production chain length when delaying start', () => {
  const project = {
    version: 'project_json_v1',
    time: {
      masterN: 4,
      productionStartPeriod: 1,
      periodEndDatesUtc: ['2026-12-31', '2027-12-31', '2028-12-31', '2029-12-31', '2030-12-31'],
    },
    economics: { taxRate: 0.3 },
    equity: { fdExtraShares: 0 },
    series: {
      capexUSD: [10, 20, 30, 40, 50],
      operatingCostsUSD: [1, 2, 3, 4, 5],
      sustainingCapexUSD: [0, 1, 1, 1, 1],
      siteGandA_USD: [1, 1, 1, 1, 1],
      depreciationUSD: [0, 0, 0, 0, 0],
      workingCapitalDeltaUSD: [0, 0, 0, 0, 0],
      royaltiesUSD: [0, 0, 0, 0, 0],
      reclamationUSD: [0, 0, 0, 0, 0],
      byproductCreditsUSD: [0, 0, 0, 0, 0],
    },
    metals: {
      payableQtyByMetal: { Au: [0, 0, 100, 100, 100] },
      payableQtyUnitByMetal: { Au: 'toz' },
      priceKeyByMetal: { Au: 'XAU_USD_TOZ' },
      auPriceKey: 'XAU_USD_TOZ',
    },
    operations: {
      oreMinedTonnes: [0, 0, 500000, 500000, 500000],
      oreMilledTonnes: [0, 0, 500000, 500000, 500000],
      oreTonnageUnit: 'tonne',
      capacity: { throughputUnit: 'tpd', nameplateThroughput: 1500, utilizationPct: 0.92 },
      gradeByMetal: { Au: [0, 0, 1, 1, 1] },
      gradeUnitByMetal: { Au: 'g/t' },
      recoveryPctByMetal: { Au: [0, 0, 0.9, 0.9, 0.9] },
    },
  } as Record<string, unknown>;

  const result = shiftProjectToTargetProductionYear(project, 2029);
  const shifted = result.shifted;
  const shiftedTime = shifted.time as Record<string, unknown>;

  assert.equal(result.k, 2);
  assert.equal(result.tpBase, 1);
  assert.equal(result.tpEff, 3);
  assert.equal(shiftedTime.masterN, 6);
  assert.deepEqual(shiftedTime.periodEndDatesUtc, [
    '2026-12-31',
    '2027-12-31',
    '2028-12-31',
    '2029-12-31',
    '2030-12-31',
    '2031-12-31',
    '2032-12-31',
  ]);

  const payableAu = ((shifted.metals as Record<string, unknown>).payableQtyByMetal as Record<string, unknown>).Au as Array<number | null>;
  assert.deepEqual(payableAu, [null, null, 0, 0, 100, 100, 100]);

  const oreMilled = ((shifted.operations as Record<string, unknown>).oreMilledTonnes as Array<number | null>);
  assert.deepEqual(oreMilled, [null, null, 0, 0, 500000, 500000, 500000]);
});
