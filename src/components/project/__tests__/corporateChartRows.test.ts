import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCorporateChartRows, buildCorporateYearTicks, clipCorporateChartInput, valueRangeChartHeader } from '../corporateChartRows.ts';
import { buildValueRangeChartOptions } from '../valueRangeChartOptions.ts';
import { buildValueRangeCurve, findFirstHighPeak, formatPeakTooltip } from '../valueRangeCurve.ts';

test('corporate rows use Project chart columns and annotate only today and project starts', () => {
  const rows = buildCorporateChartRows({
    rows: [
      { period: 0, year: 2026, npvPerShare: 4.4, navPerShare: 4.7, dcfPerShare: 5.4, dcfExCapexPerShare: 5.4, sharesPf: 400 },
      { period: 1, year: 2027, npvPerShare: 4.6, navPerShare: 4.9, dcfPerShare: 5.7, dcfExCapexPerShare: 5.7, sharesPf: 400 },
      { period: 2, year: 2028, npvPerShare: 4.8, navPerShare: 5.0, dcfPerShare: 5.9, dcfExCapexPerShare: 5.9, sharesPf: 400 },
      { period: 3, year: 2029, npvPerShare: 5.0, navPerShare: 5.2, dcfPerShare: 6.1, dcfExCapexPerShare: 6.1, sharesPf: 400 },
      { period: 4, year: 2032, npvPerShare: 5.4, navPerShare: 5.6, dcfPerShare: 6.5, dcfExCapexPerShare: 6.5, sharesPf: 400 },
    ],
    projectMarkers: [
      { projectId: 'a', projectName: 'Project A', productionStartYear: 2027 },
      { projectId: 'a2', projectName: 'Project A2', productionStartYear: 2027 },
      { projectId: 'b', projectName: 'Project B', productionStartYear: 2029 },
      { projectId: 'c', projectName: 'Project C', productionStartYear: 2032 },
    ],
  }, { low: 4.5, high: 5.5, price: 2.1 });

  assert.equal(valueRangeChartHeader.length, 21);
  assert.equal(rows.every((row) => row.length === valueRangeChartHeader.length), true);
  assert.equal(rows.every((row) => typeof row[1] === 'number' && typeof row[4] === 'number'), true);
  assert.deepEqual(rows[0].slice(5, 11), [2.1, '      2,1', 4.7, '      4,7', 5.7 / 1.1, '      5,2']);
  assert.deepEqual(rows[2].slice(5, 15), [null, null, null, null, null, null, null, null, null, null]);
  assert.equal(rows[1][12], '      4,9');
  assert.equal(rows[1][14], '      5,7');
  assert.equal(rows.filter((row) => row[5] !== null).length, 1);
  assert.equal(rows.filter((row) => row[11] !== null).length, 3);
  assert.equal(rows.flat().some((value) => typeof value === 'string' && value.includes('Project')), false);
});

test('one production start always has separate low and high point/annotation columns', () => {
  const rows = buildCorporateChartRows({
    rows: [
      { period: 0, year: 2026, npvPerShare: 3, navPerShare: 4, dcfPerShare: 5, dcfExCapexPerShare: 5, sharesPf: 100 },
      { period: 1, year: 2030, npvPerShare: 4, navPerShare: 5.2, dcfPerShare: 6.4, dcfExCapexPerShare: 6.4, sharesPf: 100 },
    ],
    projectMarkers: [{ projectId: 'only', projectName: 'Never rendered', productionStartYear: 2030 }],
  }, { low: 3, high: 5, price: 2 });
  const start = rows[1];
  assert.deepEqual(start.slice(0, 15), [2030, 5.2, 6.4 - 5.2, 5.2, 6.4, null, null, null, null, null, null, 5.2, '      5,2', 6.4, '      6,4']);
  assert.deepEqual(start.slice(15), [5.2, '      5,2', 'År: 2030\nHigh: 6,4\nLow: 5,2', 6.4, '      6,4', 'År: 2030\nHigh: 6,4\nLow: 5,2']);
});

test('peak helper selects the first equal maximum and formats both values with currency', () => {
  const peak = findFirstHighPeak([
    { year: 2028, high: 4, low: 2 },
    { year: 2029, high: 7, low: 3 },
    { year: 2030, high: 7, low: 3.5 },
  ]);
  assert.deepEqual(peak, { index: 1, year: 2029, high: 7, low: 3 });
  assert.equal(formatPeakTooltip(peak!, (value) => value.toFixed(1), 'CAD'), 'År: 2029\nHigh: 7.0 CAD\nLow: 3.0 CAD');
  assert.deepEqual(buildCorporateYearTicks({ rows: timeline(2028, 2031), projectMarkers: [] }, 2030).map((tick) => tick.v), [2028, 2030, 2031]);
});

test('canonical Corporate marker DCF maps to High even when the scalar fallback equals NAV', () => {
  const rows = buildCorporateChartRows({
    rows: [
      { period: 0, year: 2028, npvPerShare: 1.5, navPerShare: 1.5, dcfPerShare: 1.9, dcfExCapexPerShare: 1.9, sharesPf: 100 },
      { period: 1, year: 2029, npvPerShare: 1.7, navPerShare: 1.7, dcfPerShare: 2.0, dcfExCapexPerShare: 2.0, sharesPf: 100 },
      { period: 2, year: 2030, npvPerShare: 1.9, navPerShare: 1.9, dcfPerShare: 1.9, dcfExCapexPerShare: 1.9, sharesPf: 100 },
    ],
    projectMarkers: [{ projectId: 'only', projectName: 'Hidden', productionStartYear: 2030, navPerShare: 1.9, dcfPerShare: 2.3 }],
  }, { low: 1.5, high: 1.9, price: 1, tpLow: 1.9, tpHigh: 1.9 });
  const start = rows.find((row) => row[0] === 2030);
  assert.ok(start);
  assert.equal(start[11], 1.9);
  assert.equal((start[12] as string).trim(), '1,9');
  assert.equal(start[13], 2.3);
  assert.equal((start[14] as string).trim(), '2,3');
});

test('each Corporate production-start year maps its own NAV to Low and DCF to High', () => {
  const input = {
    rows: [2028, 2029, 2030, 2031, 2032].map((year, period) => ({ period, year, npvPerShare: 1, navPerShare: 1.5, dcfPerShare: 1.8, dcfExCapexPerShare: 1.8, sharesPf: 100 })),
    projectMarkers: [
      { projectId: 'a', projectName: 'A', productionStartYear: 2030, navPerShare: 1.9, dcfPerShare: 2.3 },
      { projectId: 'b', projectName: 'B', productionStartYear: 2032, navPerShare: 2.4, dcfPerShare: 3.1 },
    ],
  };
  const rows = buildCorporateChartRows(input, { low: 1.5, high: 1.9, price: 1 });
  assert.deepEqual(rows.filter((row) => row[0] === 2030 || row[0] === 2032).map((row) => [row[0], row[11], row[13]]), [[2030, 1.9, 2.3], [2032, 2.4, 3.1]]);
});

test('two production starts each have separate low and high annotations', () => {
  const rows = buildCorporateChartRows({
    rows: [2026, 2029, 2030].map((year, period) => ({ period, year, npvPerShare: 3, navPerShare: 4 + period, dcfPerShare: 5 + period, dcfExCapexPerShare: 5 + period, sharesPf: 100 })),
    projectMarkers: [
      { projectId: 'a', projectName: 'Never rendered A', productionStartYear: 2029 },
      { projectId: 'b', projectName: 'Never rendered B', productionStartYear: 2030 },
    ],
  }, { low: 3, high: 5, price: 2 });
  assert.equal(rows.filter((row) => row[12] !== null).length, 2);
  assert.equal(rows.filter((row) => row[14] !== null).length, 2);
});

test('equal rounded low and high retain two values, series columns, and annotations', () => {
  const rows = buildCorporateChartRows({
    rows: [{ period: 0, year: 2030, npvPerShare: 5, navPerShare: 5.21, dcfPerShare: 5.24, dcfExCapexPerShare: 5.24, sharesPf: 100 }],
    projectMarkers: [{ projectId: 'a', projectName: 'Never rendered', productionStartYear: 2030 }],
  }, { low: 5.21, high: 5.24, price: 2 });
  const row = rows[0];
  assert.deepEqual([row[11], row[13]], [5.21, 5.24]);
  assert.equal((row[12] as string).trim(), '5,2');
  assert.equal((row[14] as string).trim(), '5,2');
  assert.equal(row[12], row[14]);
  assert.equal(valueRangeChartHeader[11], 'TP Low');
  assert.equal(valueRangeChartHeader[13], 'TP High');
});

test('corporate x-axis ticks contain today, every unique production start, and the final year', () => {
  const input = {
    rows: [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033].map((year, period) => ({ period, year, npvPerShare: 1, navPerShare: 2, dcfPerShare: 3, dcfExCapexPerShare: 3, sharesPf: 100 })),
    projectMarkers: [
      { projectId: 'a', projectName: 'Hidden A', productionStartYear: 2027 },
      { projectId: 'b', projectName: 'Hidden B', productionStartYear: 2029 },
      { projectId: 'c', projectName: 'Hidden C', productionStartYear: 2032 },
      { projectId: 'c2', projectName: 'Hidden C2', productionStartYear: 2032 },
    ],
  };
  assert.deepEqual(buildCorporateYearTicks(input), [
    { v: 2026, f: '2026' }, { v: 2027, f: '2027' }, { v: 2029, f: '2029' }, { v: 2032, f: '2032' }, { v: 2033, f: '2033' },
  ]);
  assert.equal(buildCorporateYearTicks(input).some((tick) => tick.f === '2,029'), false);
});

test('Project and Corporate charts share one visual options builder', () => {
  const args = { currencyCode: 'CAD', ticks: [2026, 2029], yearMin: 2025, yearMax: 2030, valueWindow: { min: 1, max: 8 } };
  assert.deepEqual(buildValueRangeChartOptions(args), buildValueRangeChartOptions(args));
  assert.equal(buildValueRangeChartOptions(args).legend.position, 'none');
  assert.equal(buildValueRangeChartOptions(args).series[2].lineWidth, 0.62);
});

test('single-project Corporate rows use the exact canonical Project curve generator', () => {
  const input = {
    rows: [2026, 2027, 2028, 2029, 2030].map((year, period) => ({ period, year, npvPerShare: 2, navPerShare: 3 + period, dcfPerShare: 4 + period * 0.4, dcfExCapexPerShare: 4 + period * 0.4, sharesPf: 100 })),
    projectMarkers: [{ projectId: 'one', projectName: 'One', productionStartYear: 2028 }],
  };
  const curveInput = { totalLen: 5, tpOffset: 2, discountRate: 0.1, lowTp: 5, highTp: 7, navSeriesRaw: [3, 4, 5, 6, 7], dcfExCapexSeriesRaw: [4, 4.4, 4.8, 5.2, 5.6] };
  const projectCurve = buildValueRangeCurve(curveInput);
  const corporateRows = buildCorporateChartRows(input, { low: 2.5, high: 4, price: 1, tpLow: 5, tpHigh: 7 });
  assert.deepEqual(corporateRows.map((row) => row[1]), projectCurve.low);
  assert.deepEqual(corporateRows.map((row) => row[4]), projectCurve.high);
});

test('canonical period mapping and actual discount rate drive pre-production High', () => {
  const years = [2025, 2026, 2027, 2028];
  const curve = buildValueRangeCurve({
    totalLen: years.length, tpOffset: 2, discountRate: 0.1,
    lowTp: 8, highTp: 121,
    navSeriesRaw: [6, 7, 8, 9], dcfExCapexSeriesRaw: [null, null, 121, 100],
  });
  assert.deepEqual(years.map((year, period) => ({ year, period })), [
    { year: 2025, period: 0 }, { year: 2026, period: 1 }, { year: 2027, period: 2 }, { year: 2028, period: 3 },
  ]);
  assert.ok(Math.abs((curve.high[0] as number) - 100) < 1e-12);
  assert.ok(Math.abs((curve.high[1] as number) - 110) < 1e-12);
  assert.equal(curve.high[2], 121);
  assert.equal(curve.high[3], 100, 'post-TP High must use direct rolling ex-CAPEX DCF without re-accretion');
  assert.deepEqual(curve.low, [6, 7, 8, 9]);
  assert.equal('inferredRate' in curve, false);
});

test('High and Low keep semantic identity when the series cross', () => {
  const row = buildCorporateChartRows({
    rows: [{ period: 0, year: 2027, npvPerShare: 12, navPerShare: 12, dcfPerShare: 10, dcfExCapexPerShare: 10, sharesPf: 100 }],
    projectMarkers: [],
  }, { low: 12, high: 10, price: null }, 0.1)[0];
  assert.equal(row[1], 12);
  assert.equal(row[4], 10);
});

const timeline = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, period) => ({ period, year: first + period, npvPerShare: 1, navPerShare: 2, dcfPerShare: 3, dcfExCapexPerShare: 3, sharesPf: 100 }));

test('one 2030 production start clips rendered rows at 2035 without mutating full LOM rows', () => {
  const input = { rows: timeline(2026, 2045), projectMarkers: [{ projectId: 'a', projectName: 'A', productionStartYear: 2030 }] };
  const window = clipCorporateChartInput(input);
  assert.equal(window.lastProductionStartYear, 2030);
  assert.equal(window.chartEndYear, 2035);
  assert.equal(window.effectiveChartEndYear, 2035);
  assert.equal(window.input.rows[window.input.rows.length - 1]?.year, 2035);
  assert.equal(window.input.rows.some((row) => row.year > 2035), false);
  assert.equal(input.rows.length, 20);
});

test('latest of three production starts controls the five-year chart window and retains all anchors', () => {
  const input = { rows: timeline(2026, 2045), projectMarkers: [2027, 2029, 2032].map((year) => ({ projectId: String(year), projectName: String(year), productionStartYear: year })) };
  const window = clipCorporateChartInput(input);
  assert.equal(window.lastProductionStartYear, 2032);
  assert.equal(window.input.rows[window.input.rows.length - 1]?.year, 2037);
  assert.deepEqual(buildCorporateYearTicks(window.input).filter((tick) => [2027, 2029, 2032].includes(tick.v)).map((tick) => tick.v), [2027, 2029, 2032]);
  const rows = buildCorporateChartRows(window.input, { low: 1, high: 3, price: 1 });
  assert.equal(rows.filter((row) => row[12] !== null).length, 3);
  assert.equal(rows.filter((row) => row[14] !== null).length, 3);
});

test('shorter LOM ends at its last available year and does not synthesize rows', () => {
  const input = { rows: timeline(2026, 2035), projectMarkers: [{ projectId: 'a', projectName: 'A', productionStartYear: 2032 }] };
  const window = clipCorporateChartInput(input);
  assert.equal(window.chartEndYear, 2037);
  assert.equal(window.lastAvailableCorporateYear, 2035);
  assert.equal(window.effectiveChartEndYear, 2035);
  assert.equal(window.input.rows, input.rows);
  assert.equal(window.input.rows.some((row) => row.year > 2035), false);
});

test('missing production starts preserves the complete corporate timeline fallback', () => {
  const input = { rows: timeline(2026, 2045), projectMarkers: [{ projectId: 'a', projectName: 'A', productionStartYear: null }] };
  const window = clipCorporateChartInput(input);
  assert.equal(window.lastProductionStartYear, null);
  assert.equal(window.chartEndYear, null);
  assert.equal(window.effectiveChartEndYear, 2045);
  assert.equal(window.input.rows, input.rows);
});
