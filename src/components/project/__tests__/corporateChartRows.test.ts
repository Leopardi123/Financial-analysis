import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCorporateChartRows, valueRangeChartHeader } from '../corporateChartRows.ts';
import { buildValueRangeChartOptions } from '../valueRangeChartOptions.ts';

test('corporate rows use Project chart columns and annotate only today and project starts', () => {
  const rows = buildCorporateChartRows({
    rows: [
      { period: 0, year: 2026, npvPerShare: 4.4, navPerShare: 4.7, dcfPerShare: 5.4, sharesPf: 400 },
      { period: 1, year: 2027, npvPerShare: 4.6, navPerShare: 4.9, dcfPerShare: 5.7, sharesPf: 400 },
      { period: 2, year: 2028, npvPerShare: 4.8, navPerShare: 5.0, dcfPerShare: 5.9, sharesPf: 400 },
      { period: 3, year: 2029, npvPerShare: 5.0, navPerShare: 5.2, dcfPerShare: 6.1, sharesPf: 400 },
      { period: 4, year: 2032, npvPerShare: 5.4, navPerShare: 5.6, dcfPerShare: 6.5, sharesPf: 400 },
    ],
    projectMarkers: [
      { projectId: 'a', projectName: 'Project A', productionStartYear: 2027 },
      { projectId: 'a2', projectName: 'Project A2', productionStartYear: 2027 },
      { projectId: 'b', projectName: 'Project B', productionStartYear: 2029 },
      { projectId: 'c', projectName: 'Project C', productionStartYear: 2032 },
    ],
  }, { low: 4.5, high: 5.5, price: 2.1 });

  assert.equal(valueRangeChartHeader.length, 15);
  assert.equal(rows.every((row) => row.length === valueRangeChartHeader.length), true);
  assert.equal(rows.every((row) => typeof row[1] === 'number' && typeof row[4] === 'number'), true);
  assert.deepEqual(rows[0].slice(5, 11), [2.1, '      2,1', 4.5, '      4,5', 5.5, '      5,5']);
  assert.deepEqual(rows[2].slice(5), [null, null, null, null, null, null, null, null, null, null]);
  assert.match(rows[1][14] as string, /Project A \/ Project A2/);
  assert.equal(rows[1][12], '      4,9');
  assert.match(rows[1][14] as string, /5,7/);
  assert.equal(rows.filter((row) => row[5] !== null).length, 1);
  assert.equal(rows.filter((row) => row[11] !== null).length, 3);
});

test('Project and Corporate charts share one visual options builder', () => {
  const args = { currencyCode: 'CAD', ticks: [2026, 2029], yearMin: 2025, yearMax: 2030, valueWindow: { min: 1, max: 8 } };
  assert.deepEqual(buildValueRangeChartOptions(args), buildValueRangeChartOptions(args));
  assert.equal(buildValueRangeChartOptions(args).legend.position, 'none');
  assert.equal(buildValueRangeChartOptions(args).series[2].lineWidth, 0.62);
});
