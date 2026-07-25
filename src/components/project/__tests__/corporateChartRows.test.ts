import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCorporateChartRows } from '../corporateChartRows.ts';

test('corporate chart keeps economic series and project annotations in separate columns', () => {
  const rows = buildCorporateChartRows({
    rows: [
      { period: 0, year: 2026, npvPerShare: 4.4, navPerShare: 4.7, dcfPerShare: 5.4, sharesPf: 400 },
      { period: 1, year: 2027, npvPerShare: 4.6, navPerShare: 4.9, dcfPerShare: 5.7, sharesPf: 400 },
      { period: 2, year: 2029, npvPerShare: 5.0, navPerShare: 5.2, dcfPerShare: 6.1, sharesPf: 400 },
      { period: 3, year: 2032, npvPerShare: 5.4, navPerShare: 5.6, dcfPerShare: 6.5, sharesPf: 400 },
    ],
    projectMarkers: [
      { projectId: 'a', projectName: 'Project A', productionStartYear: 2027 },
      { projectId: 'b', projectName: 'Project B', productionStartYear: 2029 },
      { projectId: 'c', projectName: 'Project C', productionStartYear: 2032 },
    ],
  }, { npv: 4.5, nav: 4.8, dcf: 5.5 });

  assert.equal(rows.every((row) => row.length === 11), true);
  assert.deepEqual(rows[0].slice(3, 9), [4.5, 'NPV 4.5', 4.8, 'NAV 4.8', 5.5, 'DCF 5.5']);
  assert.equal(rows.every((row) => [row[3], row[5], row[7]].every((value) => typeof value === 'number')), true);
  assert.deepEqual(rows.slice(1).map((row) => row[10]), ['Project A', 'Project B', 'Project C']);
  assert.equal(rows.slice(1).every((row) => row[9] === Math.max(row[3] as number, row[5] as number, row[7] as number)), true);
  assert.equal(rows.slice(1).every((row) => row[4] !== null && row[6] !== null && row[8] !== null), true);
});
