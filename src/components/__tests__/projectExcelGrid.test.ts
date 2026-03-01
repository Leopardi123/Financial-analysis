import test from 'node:test';
import assert from 'node:assert/strict';
import { harmonizeProjectExcelGrid } from '../projectExcelGrid.ts';

test('harmonizeProjectExcelGrid expands headers to longest row length', () => {
  const result = harmonizeProjectExcelGrid({
    base: {
      columnCount: 5,
      years: ['2032', '2033', '2034', '2035', '2036'],
      tIndex: ['0', '1', '2', '3', '4'],
      tMinusTp: ['0', '1', '2', '3', '4'],
      rows: [],
      totals: [],
      capacity: { throughputUnit: 'tpd', nameplateThroughput: 1500, utilizationPct: 0.92, effectiveThroughput: 1380 },
      warnings: [],
      notes: [],
    },
    productionStartPeriod: 0,
    rows: [
      { type: 'divider', label: 'PRODUCTION' },
      { type: 'data', label: 'Ore milled (tonne)', values: [0, 0, 500000, 500000, 500000, 500000, 500000] },
    ],
  });

  assert.equal(result.columnCount, 7);
  assert.deepEqual(result.years, ['2032', '2033', '2034', '2035', '2036', '2037', '2038']);
  assert.deepEqual(result.tIndex, ['0', '1', '2', '3', '4', '5', '6']);
  assert.deepEqual(result.tMinusTp, ['0', '1', '2', '3', '4', '5', '6']);
  assert.equal(result.warnings.length, 1);
});

test('harmonizeProjectExcelGrid keeps base grid when no row requires expansion', () => {
  const result = harmonizeProjectExcelGrid({
    base: {
      columnCount: 3,
      years: ['2028', '2029', '2030'],
      tIndex: ['0', '1', '2'],
      tMinusTp: ['-1', '0', '1'],
      rows: [],
      totals: [],
      capacity: { throughputUnit: null, nameplateThroughput: null, utilizationPct: null, effectiveThroughput: null },
      warnings: ['base warning'],
      notes: [],
    },
    productionStartPeriod: 1,
    rows: [{ type: 'data', label: 'Payable Au (toz)', values: [null, 1, 2] }],
  });

  assert.equal(result.columnCount, 3);
  assert.deepEqual(result.years, ['2028', '2029', '2030']);
  assert.deepEqual(result.warnings, ['base warning']);
});
