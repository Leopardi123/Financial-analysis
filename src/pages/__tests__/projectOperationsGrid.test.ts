import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationsGridModel } from '../projectOperationsGrid.ts';

test('operations grid headers render year, t, and t-tp', () => {
  const model = buildOperationsGridModel({
    masterN: 2,
    productionStartPeriod: 1,
    yearsByPeriod: [2024, 2025, 2026],
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
    yearsByPeriod: [2024],
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
    yearsByPeriod: [2024, 2025, 2026],
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
    yearsByPeriod: [2026, 2027],
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
  assert(!labels.includes('Royalties (USD)'));
  assert(labels.includes('EBITDA (USD)'));

  const byLabel = new Map(model.rows.map((row) => [row.label, row.values]));
  assert.deepEqual(byLabel.get('Recovery Au (%)'), [90, 88]);
  assert.deepEqual(byLabel.get('Revenue Au (USD)'), [2000000, 1995000]);
  assert.deepEqual(byLabel.get('Gross revenue (USD)'), [2008000, 2003610]);
  assert.deepEqual(byLabel.get('Gross profit (USD)'), [1208000, 1193610]);
  assert.deepEqual(byLabel.get('EBITDA (USD)'), [1208000, 1193610]);
});

test('rows are shown only when at least one cell has a real value', () => {
  const model = buildOperationsGridModel({
    masterN: 3,
    productionStartPeriod: 0,
    yearsByPeriod: [2024, 2025, 2026, 2027],
    operations: {
      oreMinedTonnes: [0, 0, 0, 0],
      oreMilledTonnes: [0, 0, 125000, 0],
      oreTonnageUnit: 'tonne',
    },
    metals: {
      payableQtyByMetal: { Au: [0, -5, 0, 0] },
      payableQtyUnitByMetal: { Au: 'toz' },
    },
  });

  const labels = model.rows.map((row) => row.label);
  assert(!labels.includes('Ore mined (tonne)'));
  assert(labels.includes('Ore milled (tonne)'));
  assert(labels.includes('Payable Au (toz)'));
});

test('royalties detail drives royalties row and EBITDA consistently', () => {
  const model = buildOperationsGridModel({
    masterN: 0,
    productionStartPeriod: 0,
    yearsByPeriod: [2026],
    operations: null,
    metals: {
      payableQtyByMetal: { Au: [100] },
      payableQtyUnitByMetal: { Au: 'toz' },
    },
    economics: {
      priceUSDByMetal: { Au: [2000] },
      operatingCostsUSD: [100000],
      royaltiesUSD: [1],
      royaltiesDetail: [
        { id: 'emx', base: 'revenue', rateType: 'NSR_pct', rate: 1 },
        { id: 'prov', base: 'revenue', rateType: 'NSR_pct', rate: 3 },
      ],
      ebitUSD: [0],
      depreciationUSD: [10000],
    },
  });

  const byLabel = new Map(model.rows.map((row) => [row.label, row.values]));
  assert.deepEqual(byLabel.get('Gross revenue (USD)'), [200000]);
  assert.deepEqual(byLabel.get('Gross profit (USD)'), [100000]);
  assert.deepEqual(byLabel.get('Royalty rate (%)'), [4]);
  assert.deepEqual(byLabel.get('Royalties (USD)'), [8000]);
  assert.deepEqual(byLabel.get('EBITDA (USD)'), [92000]);
  assert.deepEqual(byLabel.get('EBIT (USD)'), [82000]);
});

test('grade/recovery are masked before production start and when ore milled is zero', () => {
  const model = buildOperationsGridModel({
    masterN: 4,
    productionStartPeriod: 2,
    yearsByPeriod: [2024, 2025, 2026, 2027, 2028],
    operations: {
      oreMilledTonnes: [0, 0, 100, 0, 200],
      gradeByMetal: { Au: [1, 1.1, 1.2, 1.3, 1.4] },
      gradeUnitByMetal: { Au: 'gpt' },
      recoveryPctByMetal: { Au: [0.8, 0.81, 0.82, 0.83, 0.84] },
    },
    metals: {
      payableQtyByMetal: { Au: [10, 11, 12, 13, 14] },
      payableQtyUnitByMetal: { Au: 'toz' },
    },
  });

  const byLabel = new Map(model.rows.map((row) => [row.label, row.values]));
  assert.deepEqual(byLabel.get('Grade Au (gpt)'), [null, null, 1.2, null, 1.4]);
  assert.deepEqual(byLabel.get('Recovery Au (%)'), [null, null, 82, null, 84]);
});
