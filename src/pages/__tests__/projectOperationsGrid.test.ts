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

  assert.deepEqual(model.rows.map((row) => row.label), ['Payable Ag (toz)', 'Payable Au (toz)', 'Payable Zn (t)']);
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
