import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCorporateChartRows, buildCorporateYearTicks, clipCorporateChartInput, valueRangeChartHeader } from '../corporateChartRows.ts';
import { buildValueRangeChartOptions } from '../valueRangeChartOptions.ts';
import { buildValueRangeCurve, findFirstHighPeak, formatPeakTooltip } from '../valueRangeCurve.ts';

const TP_LOW = 11;
const CURRENT_LOW = 7;
const CURRENT_HIGH = 9;
const TP_LOW_ANNOTATION = 12;
const TP_LOW_TOOLTIP = 13;
const TP_HIGH = 14;
const TP_HIGH_ANNOTATION = 15;
const TP_HIGH_TOOLTIP = 16;
const PEAK_LOW = 17;
const PEAK_HIGH = 20;

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

  assert.equal(valueRangeChartHeader.length, 23);
  assert.equal(JSON.stringify(valueRangeChartHeader).includes('"style"'), false);
  assert.equal(rows.every((row) => row.length === valueRangeChartHeader.length), true);
  assert.equal(rows.every((row) => typeof row[1] === 'number' && typeof row[4] === 'number'), true);
  assert.deepEqual(rows[0].slice(5, 11), [2.1, '      2,1', 4.5, '      4,5', 5.5, '      5,5']);
  assert.deepEqual(rows[2].slice(5, 17), new Array(12).fill(null));
  assert.equal(rows[1][TP_LOW_ANNOTATION], '      4,9');
  assert.equal(rows[1][TP_HIGH_ANNOTATION], '      5,7');
  assert.equal(rows.flat().includes('PS'), false);
  assert.match(rows[1][TP_HIGH_TOOLTIP] as string, /Project A.*Project A2/s);
  assert.equal(rows.filter((row) => row[5] !== null).length, 1);
  assert.equal(rows.filter((row) => row[11] !== null).length, 3);
  assert.equal(rows.some((row) => [row[6], row[8], row[10], row[12], row[15], row[18], row[21]].some((value) => typeof value === 'string' && value.includes('Project'))), false);
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
  assert.deepEqual(start.slice(0, 11), [2030, 5.2, 6.4 - 5.2, 5.2, 6.4, null, null, null, null, null, null]);
  assert.equal(start[TP_LOW], 5.2);
  assert.equal(start[TP_HIGH], 6.4);
  assert.match(start[TP_LOW_TOOLTIP] as string, /Produktionsstart: Never rendered/);
  assert.equal(start[PEAK_LOW], 5.2);
  assert.equal(start[PEAK_HIGH], 6.4);
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

test('marker-specific valuation cannot replace the ordinary Corporate curve', () => {
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
  assert.equal(start[TP_LOW], 1.9);
  assert.equal(start[TP_HIGH], 2.3);
  assert.match(start[TP_HIGH_TOOLTIP] as string, /High: 2,3/);
});

test('Corporate table today props cannot replace the ordinary rolling Corporate row', () => {
  const rows = buildCorporateChartRows({
    valuationYear: 2026,
    rows: [
      { period: 0, year: 2026, npvPerShare: 4.4, navPerShare: 6.4, dcfPerShare: 6.0, dcfExCapexPerShare: 6.7, sharesPf: 430 },
      { period: 1, year: 2027, npvPerShare: 4.8, navPerShare: 6.6, dcfPerShare: 6.2, dcfExCapexPerShare: 6.9, sharesPf: 430 },
    ],
    projectMarkers: [{ projectId: 'producing', projectName: 'Producing', productionStartYear: 2026 }],
  }, { low: 4.7, high: 6.0, price: 3.0 });

  assert.equal(rows[0][1], 6.4);
  assert.equal(rows[0][4], 6.7);
  assert.notEqual(rows[0][1], 4.7);
  assert.notEqual(rows[0][4], 6.0);
  assert.equal(rows[0][CURRENT_LOW], 4.7);
  assert.equal(rows[0][CURRENT_HIGH], 6.0);
});

test('each Corporate production-start year marks its table milestone without replacing the ordinary lines', () => {
  const input = {
    rows: [2028, 2029, 2030, 2031, 2032].map((year, period) => ({ period, year, npvPerShare: 1, navPerShare: 1.5, dcfPerShare: 1.8, dcfExCapexPerShare: 1.8, sharesPf: 100 })),
    projectMarkers: [
      { projectId: 'a', projectName: 'A', productionStartYear: 2029, navPerShare: 1.9, dcfPerShare: 2.3 },
      { projectId: 'b', projectName: 'B', productionStartYear: 2032, navPerShare: 2.4, dcfPerShare: 3.1 },
    ],
  };
  const rows = buildCorporateChartRows(input, { low: 1.5, high: 1.9, price: 1 });
  assert.deepEqual(rows.filter((row) => row[0] === 2029 || row[0] === 2032).map((row) => [row[0], row[TP_LOW], row[TP_HIGH]]), [[2029, 1.9, 2.3], [2032, 2.4, 3.1]]);
  assert.deepEqual(rows.filter((row) => row[0] === 2029 || row[0] === 2032).map((row) => [row[0], row[1], row[4]]), [[2029, 1.5, 1.8], [2032, 1.5, 1.8]]);
});

test('two production starts each have separate low and high annotations', () => {
  const rows = buildCorporateChartRows({
    rows: [2026, 2029, 2030].map((year, period) => ({ period, year, npvPerShare: 3, navPerShare: 4 + period, dcfPerShare: 5 + period, dcfExCapexPerShare: 5 + period, sharesPf: 100 })),
    projectMarkers: [
      { projectId: 'a', projectName: 'Never rendered A', productionStartYear: 2029 },
      { projectId: 'b', projectName: 'Never rendered B', productionStartYear: 2030 },
    ],
  }, { low: 3, high: 5, price: 2 });
  assert.equal(rows.filter((row) => row[TP_LOW_ANNOTATION] !== null).length, 1);
  assert.equal(rows.filter((row) => row[TP_HIGH_ANNOTATION] !== null).length, 1);
  assert.equal(rows[2][TP_HIGH_ANNOTATION], null, 'the peak already displays the production-start value');
  assert.equal(typeof rows[2][PEAK_HIGH + 1], 'string');
});

test('equal rounded low and high retain two values, series columns, and annotations', () => {
  const rows = buildCorporateChartRows({
    rows: [{ period: 0, year: 2030, npvPerShare: 5, navPerShare: 5.21, dcfPerShare: 5.24, dcfExCapexPerShare: 5.24, sharesPf: 100 }],
    projectMarkers: [{ projectId: 'a', projectName: 'Never rendered', productionStartYear: 2030 }],
  }, { low: 5.21, high: 5.24, price: 2 });
  const row = rows[0];
  assert.deepEqual([row[TP_LOW], row[TP_HIGH]], [5.21, 5.24]);
  assert.equal(row[TP_LOW_ANNOTATION], null);
  assert.equal(row[TP_HIGH_ANNOTATION], null);
  assert.equal((row[8] as string).trim(), '5,2', 'current Low keeps the visible value');
  assert.equal((row[10] as string).trim(), '5,2', 'current High keeps the visible value');
  assert.equal(valueRangeChartHeader[11], 'TP Low');
  assert.equal(valueRangeChartHeader[14], 'TP High');
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

test('valuationYear clips historical rows and marks the valuation-year row as current', () => {
  const input = {
    valuationYear: 2026,
    rows: [2025, 2026, 2027, 2028].map((year, period) => ({ period, year, npvPerShare: 1, navPerShare: 2, dcfPerShare: 3, dcfExCapexPerShare: 3, sharesPf: 100 })),
    projectMarkers: [{ projectId: 'future', projectName: 'Future', productionStartYear: 2028 }],
  };
  const window = clipCorporateChartInput(input);
  assert.deepEqual(window.input.rows.map((row) => row.year), [2026, 2027, 2028]);
  const rows = buildCorporateChartRows(window.input, { low: 2, high: 3, price: 1 }, 0.1);
  assert.equal(rows[0][0], 2026);
  assert.equal(rows[0][5], 1);
  assert.equal(rows.some((row) => row[0] === 2025), false);
});

test('production start at valuationYear without marker values keeps rolling High and Low', () => {
  const input = {
    valuationYear: 2026,
    rows: [
      { period: 0, year: 2026, npvPerShare: 1, navPerShare: 1.436098354, dcfPerShare: 1.106524312, dcfExCapexPerShare: 1.106524312, sharesPf: 100 },
      { period: 1, year: 2029, npvPerShare: 1, navPerShare: 1.8, dcfPerShare: 2.1, dcfExCapexPerShare: 2.1, sharesPf: 100 },
    ],
    projectMarkers: [{ projectId: 'current', projectName: 'Current', productionStartYear: 2026, navPerShare: null, dcfPerShare: null }],
  };
  const row = buildCorporateChartRows(input, { low: 9, high: 9, price: 3, tpLow: 1.442408197, tpHigh: 2.109618604 }, 0.1)[0];
  assert.equal(row[1], 1.436098354);
  assert.equal(row[4], 1.106524312);
  assert.equal(row[7], 9);
  assert.equal(row[9], 9);
  assert.equal(row[TP_LOW], 1.436098354);
  assert.equal(row[TP_HIGH], 1.106524312);
  assert.equal(row[TP_LOW_ANNOTATION], null, 'current already prints the Low value');
  assert.equal(row[TP_HIGH_ANNOTATION], null, 'current already prints the High value');
  assert.match(row[TP_HIGH_TOOLTIP] as string, /High: 1,1/);
  assert.match(row[TP_HIGH_TOOLTIP] as string, /Low: 1,4/);
});

test('historical production start cannot overwrite the valuation-year rolling row', () => {
  const input = {
    valuationYear: 2026,
    rows: [{ period: 0, year: 2026, npvPerShare: 1, navPerShare: 2, dcfPerShare: 3, dcfExCapexPerShare: 3, sharesPf: 100 }],
    projectMarkers: [{ projectId: 'historic', projectName: 'Historic', productionStartYear: 2025, navPerShare: null, dcfPerShare: null }],
  };
  const row = buildCorporateChartRows(input, { low: 8, high: 9, price: null, tpLow: 8, tpHigh: 9 }, 0.1)[0];
  assert.equal(row[1], 2);
  assert.equal(row[4], 3);
});

test('future marker maps to its calendar year but cannot replace the ordinary curve', () => {
  const input = {
    valuationYear: 2026,
    rows: [2026, 2027, 2028, 2029].map((year, period) => ({ period, year, npvPerShare: 1, navPerShare: 2 + period, dcfPerShare: 4 + period, dcfExCapexPerShare: 4 + period, sharesPf: 100 })),
    projectMarkers: [{ projectId: 'future', projectName: 'Future', productionStartYear: 2029, navPerShare: 8, dcfPerShare: 9 }],
  };
  const rows = buildCorporateChartRows(input, { low: 99, high: 99, price: null, tpLow: 99, tpHigh: 99 }, 0.1);
  assert.ok(Math.abs((rows[0][4] as number) - 7 / 1.1 ** 3) < 1e-12);
  assert.equal(rows[0][1], 2);
  assert.equal(rows[3][1], 5);
  assert.equal(rows[3][4], 7);
  assert.equal(rows[3][TP_LOW], 8);
  assert.equal(rows[3][TP_HIGH], 9);
});

test('multiple project starts never inject a future marker value into valuationYear', () => {
  const input = {
    valuationYear: 2026,
    rows: [2026, 2029, 2032].map((year, period) => ({ period, year, npvPerShare: 1, navPerShare: 2 + period, dcfPerShare: 4 + period, dcfExCapexPerShare: 4 + period, sharesPf: 100 })),
    projectMarkers: [
      { projectId: 'current', projectName: 'Current', productionStartYear: 2026, navPerShare: null, dcfPerShare: null },
      { projectId: 'future-a', projectName: 'Future A', productionStartYear: 2029, navPerShare: 8, dcfPerShare: 9 },
      { projectId: 'future-b', projectName: 'Future B', productionStartYear: 2032, navPerShare: 11, dcfPerShare: 12 },
    ],
  };
  const rows = buildCorporateChartRows(input, { low: 99, high: 99, price: null, tpLow: 98, tpHigh: 99 }, 0.1);
  assert.deepEqual(rows.map((row) => row[4]), [4, 5, 6]);
  assert.deepEqual(rows.map((row) => row[1]), [2, 3, 4]);
  assert.deepEqual(rows.map((row) => row[TP_HIGH]), [4, 9, 12]);
});

test('a missing marker side preserves that side of the existing curve', () => {
  const input = {
    valuationYear: 2026,
    rows: [
      { period: 0, year: 2026, npvPerShare: 1, navPerShare: 2, dcfPerShare: 3, dcfExCapexPerShare: 3, sharesPf: 100 },
      { period: 1, year: 2029, npvPerShare: 1, navPerShare: 5, dcfPerShare: 6, dcfExCapexPerShare: 6, sharesPf: 100 },
    ],
    projectMarkers: [{ projectId: 'partial', projectName: 'Partial', productionStartYear: 2029, navPerShare: 8, dcfPerShare: null }],
  };
  const rows = buildCorporateChartRows(input, { low: 99, high: 99, price: null, tpLow: 98, tpHigh: 99 }, 0.1);
  assert.equal(rows[1][1], 5);
  assert.equal(rows[1][4], 6);
});

test('production layer leaves ordinary High and Low unchanged without collisions', () => {
  const rowsInput = [2026, 2027, 2028].map((year, period) => ({ period, year, npvPerShare: 1, navPerShare: 2 + period, dcfPerShare: 4 + period, dcfExCapexPerShare: 4 + period, sharesPf: 100 }));
  const marked = buildCorporateChartRows({ valuationYear: 2026, rows: rowsInput, projectMarkers: [{ projectId: 'p', projectName: 'Project', productionStartYear: 2027 }] }, { low: 1, high: 1, price: null }, 0.1);
  const ordinary = buildValueRangeCurve({
    totalLen: rowsInput.length,
    tpOffset: 1,
    discountRate: 0.1,
    lowTp: rowsInput[1].navPerShare,
    highTp: rowsInput[1].dcfExCapexPerShare,
    navSeriesRaw: rowsInput.map((row) => row.navPerShare),
    dcfExCapexSeriesRaw: rowsInput.map((row) => row.dcfExCapexPerShare),
  });
  assert.deepEqual(marked.map((row) => [row[1], row[4]]), ordinary.low.map((low, index) => [low, ordinary.high[index]]));
  assert.deepEqual([marked[1][TP_LOW], marked[1][TP_HIGH]], [marked[1][1], marked[1][4]]);
});

test('peak and production start coexist in separate series at the same coordinate', () => {
  const rows = buildCorporateChartRows({
    valuationYear: 2026,
    rows: [2026, 2027].map((year, period) => ({ period, year, npvPerShare: 1, navPerShare: 2 + period, dcfPerShare: 4 + period, dcfExCapexPerShare: 4 + period, sharesPf: 100 })),
    projectMarkers: [{ projectId: 'peak', projectName: 'Peak Project', productionStartYear: 2027 }],
  }, { low: 1, high: 1, price: null }, 0.1, 'CAD');
  const row = rows[1];
  assert.equal(row[TP_LOW], row[PEAK_LOW]);
  assert.equal(row[TP_HIGH], row[PEAK_HIGH]);
  assert.match(row[TP_HIGH_TOOLTIP] as string, /Peak High/);
  assert.match(row[TP_HIGH_TOOLTIP] as string, /Peak Project/);
});

test('current peak and production start reuse existing value labels without PS text', () => {
  const row = buildCorporateChartRows({
    valuationYear: 2026,
    rows: [{ period: 0, year: 2026, npvPerShare: 1, navPerShare: 2, dcfPerShare: 4, dcfExCapexPerShare: 4, sharesPf: 100 }],
    projectMarkers: [{ projectId: 'all', projectName: 'All States', productionStartYear: 2026 }],
  }, { low: 1, high: 1, price: 3 }, 0.1, 'CAD')[0];
  assert.equal(row[5], 3);
  assert.equal(row[7], 1);
  assert.equal(row[9], 1);
  assert.equal(row[PEAK_LOW], row[TP_LOW]);
  assert.equal(row[PEAK_HIGH], row[TP_HIGH]);
  assert.equal(row[TP_LOW_ANNOTATION], null);
  assert.equal(row[TP_HIGH_ANNOTATION], null);
  assert.match(row[TP_HIGH_TOOLTIP] as string, /Peak High/);
  assert.match(row[TP_HIGH_TOOLTIP] as string, /All States/);
});

test('projects sharing a production year use one visual point and retain every project in its tooltip', () => {
  const rows = buildCorporateChartRows({
    valuationYear: 2026,
    rows: [2026, 2029].map((year, period) => ({ period, year, npvPerShare: 1, navPerShare: 2 + period, dcfPerShare: 4 + period, dcfExCapexPerShare: 4 + period, sharesPf: 100 })),
    projectMarkers: [
      { projectId: 'a', projectName: 'Project A', productionStartYear: 2029 },
      { projectId: 'b', projectName: 'Project B', productionStartYear: 2029 },
    ],
  }, { low: 1, high: 1, price: null }, 0.1);
  assert.equal(rows.filter((row) => row[TP_HIGH] !== null).length, 1);
  assert.match(rows[1][TP_HIGH_TOOLTIP] as string, /Project A.*Project B/s);
});

test('High peak remains independent when the maximum Low occurs in another production-start year', () => {
  const rows = buildCorporateChartRows({
    valuationYear: 2026,
    rows: [
      { period: 0, year: 2026, npvPerShare: 1, navPerShare: 9, dcfPerShare: 4, dcfExCapexPerShare: 4, sharesPf: 100 },
      { period: 1, year: 2027, npvPerShare: 1, navPerShare: 2, dcfPerShare: 8, dcfExCapexPerShare: 8, sharesPf: 100 },
    ],
    projectMarkers: [
      { projectId: 'low', projectName: 'Low Maximum Year', productionStartYear: 2026 },
      { projectId: 'high', projectName: 'High Peak Year', productionStartYear: 2027 },
    ],
  }, { low: 1, high: 1, price: null }, 0.1);
  assert.equal(rows[0][TP_LOW], 9);
  assert.equal(rows[1][PEAK_HIGH], 8);
  assert.equal(rows[1][TP_HIGH], 8);
});

test('production starts at first and last visible years retain true coordinates and separate labels', () => {
  const rows = buildCorporateChartRows({
    valuationYear: 2026,
    rows: [2026, 2027, 2028].map((year, period) => ({ period, year, npvPerShare: 1, navPerShare: 2 + period, dcfPerShare: 4 + period, dcfExCapexPerShare: 4 + period, sharesPf: 100 })),
    projectMarkers: [
      { projectId: 'first', projectName: 'First', productionStartYear: 2026 },
      { projectId: 'last', projectName: 'Last', productionStartYear: 2028 },
    ],
  }, { low: 1, high: 1, price: 3 }, 0.1);
  assert.deepEqual([rows[0][0], rows[0][TP_LOW], rows[0][TP_HIGH]], [2026, rows[0][1], rows[0][4]]);
  assert.deepEqual([rows[2][0], rows[2][TP_LOW], rows[2][TP_HIGH]], [2028, rows[2][1], rows[2][4]]);
  assert.equal(rows[0][TP_HIGH_ANNOTATION], null, 'current annotation already shows the first-year value');
  assert.equal(rows[2][TP_HIGH_ANNOTATION], null, 'peak annotation already shows the peak value');
  assert.ok(typeof rows[0][TP_HIGH_TOOLTIP] === 'string' && typeof rows[2][TP_HIGH_TOOLTIP] === 'string');
});

test('Project and Corporate charts share one visual options builder', () => {
  const args = { currencyCode: 'CAD', ticks: [2026, 2029], yearMin: 2025, yearMax: 2030, valueWindow: { min: 1, max: 8 } };
  assert.deepEqual(buildValueRangeChartOptions(args), buildValueRangeChartOptions(args));
  assert.equal(buildValueRangeChartOptions(args).legend.position, 'none');
  assert.equal(buildValueRangeChartOptions(args).series[2].lineWidth, 0.62);
});

test('missing marker values preserve the rolling Corporate curve instead of using global TP fallbacks', () => {
  const input = {
    rows: [2026, 2027, 2028, 2029, 2030].map((year, period) => ({ period, year, npvPerShare: 2, navPerShare: 3 + period, dcfPerShare: 4 + period * 0.4, dcfExCapexPerShare: 4 + period * 0.4, sharesPf: 100 })),
    projectMarkers: [{ projectId: 'one', projectName: 'One', productionStartYear: 2028 }],
  };
  const curveInput = { totalLen: 5, tpOffset: 2, discountRate: 0.1, lowTp: 5, highTp: 4.8, navSeriesRaw: [3, 4, 5, 6, 7], dcfExCapexSeriesRaw: [4, 4.4, 4.8, 5.2, 5.6] };
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
  assert.equal(rows.filter((row) => row[TP_LOW] !== null).length, 3);
  assert.equal(rows.filter((row) => row[TP_HIGH_ANNOTATION] !== null).length, 2);
  assert.equal(rows.find((row) => row[0] === 2027)?.[TP_HIGH_ANNOTATION], null, 'the peak annotation already displays this start value');
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
