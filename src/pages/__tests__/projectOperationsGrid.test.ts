import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationsGridModel } from '../projectOperationsGrid.ts';

test('operations grid headers render year, t, and t-tp', () => {
  const model = buildOperationsGridModel({
    masterN: 2,
    productionStartPeriod: 1,
    periodEndDatesUtc: ['2024-12-31', '2025-12-31', '2026-12-31'],
    operations: null,
    metals: { payableQtyByMetal: {}, payableQtyUnitByMetal: {} },
  });

  assert.deepEqual(model.years, ['2024', '2025', '2026']);
  assert.deepEqual(model.tIndex, ['0', '1', '2']);
  assert.deepEqual(model.tMinusTp, ['-1', '0', '1']);
});

test('metals rows are alphabetical', () => {
  const model = buildOperationsGridModel({
    masterN: 0,
    productionStartPeriod: 0,
    periodEndDatesUtc: ['2024-12-31'],
    operations: null,
    metals: {
      payableQtyByMetal: { Zn: [2], Au: [1], Ag: [3] },
      payableQtyUnitByMetal: { Zn: 't', Au: 'toz', Ag: 'toz' },
    },
  });

  assert.deepEqual(model.rows.map((row) => row.label).slice(0, 3), ['Payable Ag (toz)', 'Payable Au (toz)', 'Payable Zn (t)']);
});

test('totals are strict and return em dash value when null appears in production range', () => {
  const model = buildOperationsGridModel({
    masterN: 2,
    productionStartPeriod: 1,
    periodEndDatesUtc: ['2024-12-31', '2025-12-31', '2026-12-31'],
    operations: {
      oreMilledTonnes: [10, null, 30],
      oreMinedTonnes: [10, 20, 30],
      oreTonnageUnit: 'tonne',
    },
    metals: {
      payableQtyByMetal: { Au: [1, 2, null] },
      payableQtyUnitByMetal: { Au: 'toz' },
    },
  });

  const totals = new Map(model.totals.map((item) => [item.label, item.value]));
  assert.equal(totals.get('Total ore milled (t>=tp) (tonne)'), null);
  assert.equal(totals.get('Total ore mined (t>=tp) (tonne)'), 50);
  assert.equal(totals.get('Total payable Au (t>=tp) (toz)'), null);
});

test('grade/recovery rows precede payable and derived revenue rows include EBITDA when depreciation exists', () => {
  const model = buildOperationsGridModel({
    masterN: 1,
    productionStartPeriod: 0,
    periodEndDatesUtc: ['2026-12-31', '2027-12-31'],
    operations: {
      oreMinedTonnes: [100, 110],
      oreMilledTonnes: [90, 100],
      oreTonnageUnit: 'tonne',
      gradeByMetal: { Au: [1.2, 1.1], Cu: [0.5, 0.45] },
      gradeUnitByMetal: { Au: 'gpt', Cu: 'pct' },
      recoveryPctByMetal: { Au: [0.9, 0.88], Cu: [88, 87] },
    },
    metals: {
      payableQtyByMetal: { Au: [1000, 950], Cu: [2000, 2100] },
      payableQtyUnitByMetal: { Au: 'toz', Cu: 'lb' },
    },
    economics: {
      priceUSDByMetal: { Au: [2000, 2100], Cu: [4, 4.1] },
      operatingCostsUSD: [800000, 810000],
      ebitUSD: [1300000, 1195000],
      depreciationUSD: [100000, 120000],
    },
  });

  const labels = model.rows.map((row) => row.label);
  assert(labels.indexOf('Grade Au (gpt)') < labels.indexOf('Payable Au (toz)'));
  assert(labels.indexOf('Recovery Cu (%)') < labels.indexOf('Payable Cu (lb)'));
  assert(labels.includes('Revenue Au (USD)'));
  assert(labels.includes('Gross revenue (USD)'));
  assert(labels.includes('Gross profit (USD)'));
  assert(labels.includes('EBITDA (USD, includes royalties)'));

  const byLabel = new Map(model.rows.map((row) => [row.label, row.values]));
  assert.deepEqual(byLabel.get('Recovery Au (%)'), [90, 88]);
  assert.deepEqual(byLabel.get('Revenue Au (USD)'), [2000000, 1995000]);
  assert.deepEqual(byLabel.get('Gross revenue (USD)'), [2008000, 2003610]);
  assert.deepEqual(byLabel.get('Gross profit (USD)'), [1208000, 1193610]);
  assert.deepEqual(byLabel.get('EBITDA (USD, includes royalties)'), [1400000, 1315000]);
});
