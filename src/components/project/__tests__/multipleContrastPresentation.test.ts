import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeOverlayDomainValues, buildCombinedTargetSeries, buildQualityMultipleContrastSeries, buildStaticMultipleContrastSeries, type MultipleContrastVisibility } from '../multipleContrastPresentation.ts';
import type { CorporateQualityMultipleRow } from '../../../lib/corporate/multipleContrast/types.ts';
import { buildValueRangeChartOptions, VALUE_RANGE_CHART_COLORS } from '../valueRangeChartOptions.ts';

const overlay = (low: number | null, mid: number | null, high: number | null) => ({ enterpriseValueLowTarget: low, enterpriseValueMidTarget: mid, enterpriseValueHighTarget: high, equityValueLowTarget: low, equityValueMidTarget: mid, equityValueHighTarget: high, valuePerShareLow: low, valuePerShareMid: mid, valuePerShareHigh: high });
const qualityRow = (overrides: Partial<CorporateQualityMultipleRow> = {}): CorporateQualityMultipleRow => ({
  calendarYear: 2030, annualEbitdaUSD: 100, forwardAverageEbitdaUSD: 80, remainingActiveEconomicYears: 8, economicEndYear: 2037, remainingEconomicSpanYears: 8, economicGapYears: 0,
  actualFiveYearEbitdaShare: 0.625, expectedFiveYearEbitdaShare: 0.625, fiveYearEbitdaConcentrationDeviation: 0,
  positiveRemainingEbitda: 800, positiveEbitdaFirstFiveYears: 500, negativeEbitdaTailShare: 0, ebitdaCv5Y: 0, sustainingIntensity5Y: 0.088, ebitdaMargin5Y: 0.478,
  remainingEconomicYearsAdjustment: 0, fiveYearEbitdaConcentrationAdjustment: 0, stabilityAdjustment: 0.5, sustainingIntensityAdjustment: 0.25, marginAdjustment: 0.5,
  rawQualityMultiple: 7.5, qualityLowMultiple: 6.5, qualityMidMultiple: 7.5, qualityHighMultiple: 8.5,
  annualBasis: overlay(6.5, 7.5, 8.5), forwardAverageBasis: overlay(5.2, 6, 6.8), shortWindow: false, fullWindow: true, windowLength: 5, windowStartYear: 2030, windowEndYear: 2034,
  qualityStatus: 'COMPUTABLE', qualityDiagnostics: ['FULL_WINDOW'], ...overrides,
});
const staticRows = [{ year: 2030, ebitdaTarget: 125, evEbitda5xPerShare: 6.35, evEbitda6xPerShare: 7.6, evEbitda7xPerShare: 8.85, sharesPf: 100 }];
const bridgeRows = [{ year: 2030, netCashTarget: 10, sharesPostFinancing: 100 }];
const canonicalShares = (shares: number | null = 1) => new Map<number, number | null>([[2030, shares]]);

test('annual natural band has exact parity with existing Corporate static per-share rows', () => {
  const [row] = buildStaticMultipleContrastSeries({ basis: 'annual', staticRows, qualityRows: [qualityRow()], bridgeRows, fxUSDToTarget: 1.25 });
  assert.deepEqual([row.low, row.mid, row.high], [6.35, 7.6, 8.85]);
});

test('forward natural band uses forward EBITDA and the same FX/net-cash/share bridge', () => {
  const [row] = buildStaticMultipleContrastSeries({ basis: 'forwardAverage', staticRows, qualityRows: [qualityRow()], bridgeRows, fxUSDToTarget: 1.25 });
  assert.equal(row.selectedEbitdaUSD, 80);
  assert.equal(row.low, ((80 * 1.25 * 5) + 10) / 100);
  assert.equal(row.mid, ((80 * 1.25 * 6) + 10) / 100);
  assert.equal(row.high, ((80 * 1.25 * 7) + 10) / 100);
  assert.notEqual(row.mid, staticRows[0].evEbitda6xPerShare);
});

test('quality selector divides Phase-A absolute equity values by canonical shares for both bases', () => {
  const annual = buildQualityMultipleContrastSeries({ basis: 'annual', qualityRows: [qualityRow()], canonicalSharesForPerShareByYear: canonicalShares() })[0];
  const forward = buildQualityMultipleContrastSeries({ basis: 'forwardAverage', qualityRows: [qualityRow()], canonicalSharesForPerShareByYear: canonicalShares() })[0];
  assert.deepEqual([annual.low, annual.mid, annual.high], [6.5, 7.5, 8.5]);
  assert.deepEqual([forward.low, forward.mid, forward.high], [5.2, 6, 6.8]);
});

test('quality null years remain null with no 6x fallback or interpolation', () => {
  const row = qualityRow({ annualBasis: overlay(null, null, null), qualityMidMultiple: null, qualityLowMultiple: null, qualityHighMultiple: null, qualityStatus: 'NOT_COMPUTABLE' });
  const point = buildQualityMultipleContrastSeries({ basis: 'annual', qualityRows: [row], canonicalSharesForPerShareByYear: canonicalShares() })[0];
  assert.deepEqual([point.low, point.mid, point.high, point.tooltip], [null, null, null, null]);
});

test('quality visibility requires computable policy, finite multiples, equity values, positive basis, and canonical shares', () => {
  const cases: CorporateQualityMultipleRow[] = [
    qualityRow({ annualEbitdaUSD: 0 }),
    qualityRow({ annualEbitdaUSD: -1 }),
    qualityRow({ annualEbitdaUSD: null }),
    qualityRow({ qualityStatus: 'NOT_COMPUTABLE' }),
    qualityRow({ qualityMidMultiple: null }),
    qualityRow({ annualBasis: { ...overlay(1, 2, 3), equityValueHighTarget: null } }),
  ];
  for (const row of cases) {
    const point = buildQualityMultipleContrastSeries({ basis: 'annual', qualityRows: [row], canonicalSharesForPerShareByYear: canonicalShares(100) })[0];
    assert.deepEqual([point.low, point.mid, point.high], [null, null, null]);
  }
});

test('quality and natural overlays share positive-EBITDA start and preserve later gaps without interpolation', () => {
  const years = [2028, 2029, 2030, 2031, 2032];
  const ebitda = [0, -10, 100, 0, 80];
  const qualityRows = years.map((year, index) => qualityRow({
    calendarYear: year,
    annualEbitdaUSD: ebitda[index],
    qualityStatus: index === 4 ? 'NOT_COMPUTABLE' : 'COMPUTABLE',
  }));
  const natural = buildStaticMultipleContrastSeries({
    basis: 'annual', qualityRows, fxUSDToTarget: 1,
    staticRows: years.map((year, index) => ({ year, ebitdaTarget: ebitda[index], evEbitda5xPerShare: 5, evEbitda6xPerShare: 6, evEbitda7xPerShare: 7, sharesPf: 100 })),
    bridgeRows: years.map((year) => ({ year, netCashTarget: 0, sharesPostFinancing: 100 })),
  });
  const shares = new Map(years.map((year) => [year, 100]));
  const quality = buildQualityMultipleContrastSeries({ basis: 'annual', qualityRows, canonicalSharesForPerShareByYear: shares });
  assert.equal(natural.find((row) => row.mid !== null)?.year, 2030);
  assert.equal(quality.find((row) => row.mid !== null)?.year, 2030);
  assert.deepEqual(quality.map((row) => row.mid !== null), [false, false, true, false, false]);
});

test('forward-average quality clipping uses the selected basis and stops at non-computable tails', () => {
  const rows = [
    qualityRow({ calendarYear: 2030, annualEbitdaUSD: 0, forwardAverageEbitdaUSD: 80 }),
    qualityRow({ calendarYear: 2031, forwardAverageEbitdaUSD: 80 }),
    qualityRow({ calendarYear: 2032, forwardAverageEbitdaUSD: 70, qualityStatus: 'NOT_COMPUTABLE' }),
  ];
  const shares = new Map(rows.map((row) => [row.calendarYear, 100]));
  const quality = buildQualityMultipleContrastSeries({ basis: 'forwardAverage', qualityRows: rows, canonicalSharesForPerShareByYear: shares });
  assert.deepEqual(quality.map((row) => row.mid !== null), [false, true, false]);
});

test('short-window quality point remains visible and tooltip reports short status', () => {
  const point = buildQualityMultipleContrastSeries({ basis: 'annual', qualityRows: [qualityRow({ shortWindow: true, qualityDiagnostics: ['SHORT_WINDOW'] })], canonicalSharesForPerShareByYear: canonicalShares() })[0];
  assert.equal(point.mid, 7.5);
  assert.match(point.tooltip ?? '', /Kort fönster/);
});

test('annual quality uses canonical fully diluted shares instead of frozen snapshot per-share values', () => {
  const annualBasis = overlay(400, 800, 1_200);
  annualBasis.valuePerShareLow = 4;
  annualBasis.valuePerShareMid = 8;
  annualBasis.valuePerShareHigh = 12;
  const point = buildQualityMultipleContrastSeries({
    basis: 'annual', qualityRows: [qualityRow({ annualBasis })], canonicalSharesForPerShareByYear: canonicalShares(400), currencyCode: 'SEK',
  })[0];
  assert.deepEqual([point.low, point.mid, point.high], [1, 2, 3]);
  assert.equal((point.low as number) * 400, annualBasis.equityValueLowTarget);
  assert.equal((point.mid as number) * 400, annualBasis.equityValueMidTarget);
  assert.equal((point.high as number) * 400, annualBasis.equityValueHighTarget);
  assert.match(point.tooltip ?? '', /Värde\/aktie: 2,00 SEK/);
  assert.doesNotMatch(point.tooltip ?? '', /8,00 SEK/);
});

test('forward quality uses canonical fully diluted shares and preserves equity-value parity', () => {
  const forwardAverageBasis = overlay(600, 900, 1_200);
  const point = buildQualityMultipleContrastSeries({
    basis: 'forwardAverage', qualityRows: [qualityRow({ forwardAverageBasis })], canonicalSharesForPerShareByYear: canonicalShares(300),
  })[0];
  assert.deepEqual([point.low, point.mid, point.high], [2, 3, 4]);
  assert.equal((point.low as number) * 300, forwardAverageBasis.equityValueLowTarget);
  assert.equal((point.mid as number) * 300, forwardAverageBasis.equityValueMidTarget);
  assert.equal((point.high as number) * 300, forwardAverageBasis.equityValueHighTarget);
});

test('unchanged canonical shares preserve Phase-A per-share parity', () => {
  const annualBasis = overlay(650, 750, 850);
  annualBasis.valuePerShareLow = 6.5;
  annualBasis.valuePerShareMid = 7.5;
  annualBasis.valuePerShareHigh = 8.5;
  const point = buildQualityMultipleContrastSeries({
    basis: 'annual', qualityRows: [qualityRow({ annualBasis })], canonicalSharesForPerShareByYear: canonicalShares(100),
  })[0];
  assert.deepEqual([point.low, point.mid, point.high], [annualBasis.valuePerShareLow, annualBasis.valuePerShareMid, annualBasis.valuePerShareHigh]);
});

test('invalid canonical denominators null the entire quality band without fallback', () => {
  for (const shares of [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const point = buildQualityMultipleContrastSeries({
      basis: 'annual', qualityRows: [qualityRow()], canonicalSharesForPerShareByYear: canonicalShares(shares),
    })[0];
    assert.deepEqual([point.low, point.mid, point.high, point.tooltip], [null, null, null, null]);
  }
  const missing = buildQualityMultipleContrastSeries({
    basis: 'annual', qualityRows: [qualityRow()], canonicalSharesForPerShareByYear: new Map(),
  })[0];
  assert.deepEqual([missing.low, missing.mid, missing.high], [null, null, null]);
});

test('Viscaria-like manual-share correction rebases 185 per share to about 63 without changing equity value', () => {
  const snapshotShares = 130_900_000;
  const canonicalFullyDilutedShares = 384_000_000;
  const unchangedEquityValue = 185 * snapshotShares;
  const annualBasis = overlay(unchangedEquityValue * 0.9, unchangedEquityValue, unchangedEquityValue * 1.1);
  annualBasis.valuePerShareMid = 185;
  const point = buildQualityMultipleContrastSeries({
    basis: 'annual', qualityRows: [qualityRow({ annualBasis })], canonicalSharesForPerShareByYear: canonicalShares(canonicalFullyDilutedShares),
  })[0];
  assert.ok(Math.abs((point.mid as number) - (185 * snapshotShares / canonicalFullyDilutedShares)) < 1e-12);
  assert.ok(Math.abs((point.mid as number) - 63.06) < 0.02);
  assert.ok(Math.abs((point.mid as number) * canonicalFullyDilutedShares - unchangedEquityValue) < 1e-6);
});

test('combined target uses exact 70/30 and prioritizes visible computable quality', () => {
  const visibility: MultipleContrastVisibility = { showStaticMultipleBand: true, showQualityMultipleBand: true, showCombinedTarget: true };
  const [point] = buildCombinedTargetSeries({ years: [2030], navPerShareByYear: new Map([[2030, 10]]), staticSeries: [{ year: 2030, selectedEbitdaUSD: 1, low: 5, mid: 6, high: 7, tooltip: null }], qualitySeries: [{ year: 2030, selectedEbitdaUSD: 1, low: 6.5, mid: 7.5, high: 8.5, tooltip: null }], visibility });
  assert.equal(point.value, (10 * 0.7) + (7.5 * 0.3));
  assert.equal(point.source, 'quality');
});

test('combined target consumes the corrected quality midpoint', () => {
  const annualBasis = overlay(6_000, 8_000, 10_000);
  annualBasis.valuePerShareMid = 80;
  const qualitySeries = buildQualityMultipleContrastSeries({
    basis: 'annual', qualityRows: [qualityRow({ annualBasis })], canonicalSharesForPerShareByYear: canonicalShares(400),
  });
  const point = buildCombinedTargetSeries({
    years: [2030], navPerShareByYear: new Map([[2030, 10]]), staticSeries: [], qualitySeries,
    visibility: { showStaticMultipleBand: false, showQualityMultipleBand: true, showCombinedTarget: true }, currencyCode: 'SEK',
  })[0];
  assert.equal(qualitySeries[0].mid, 20);
  assert.equal(point.value, 13);
  assert.equal(point.multipleContribution, 6);
  assert.match(point.tooltip ?? '', /Totalt: 13,00 SEK/);
});

test('combined target falls back only to a visible natural 6x point', () => {
  const staticSeries = [{ year: 2030, selectedEbitdaUSD: 1, low: 5, mid: 6, high: 7, tooltip: null }];
  const qualitySeries = [{ year: 2030, selectedEbitdaUSD: 1, low: null, mid: null, high: null, tooltip: null }];
  const natural = buildCombinedTargetSeries({ years: [2030], navPerShareByYear: new Map([[2030, 10]]), staticSeries, qualitySeries, visibility: { showStaticMultipleBand: true, showQualityMultipleBand: true, showCombinedTarget: true } })[0];
  assert.equal(natural.value, (10 * 0.7) + (6 * 0.3));
  assert.equal(natural.source, 'static');
  const hidden = buildCombinedTargetSeries({ years: [2030], navPerShareByYear: new Map([[2030, 10]]), staticSeries, qualitySeries, visibility: { showStaticMultipleBand: false, showQualityMultipleBand: false, showCombinedTarget: true } })[0];
  assert.equal(hidden.value, null);
});

test('axis domain contains only active overlays', () => {
  const band = [{ year: 2030, selectedEbitdaUSD: 1, low: 5, mid: 6, high: 7, tooltip: null }];
  const quality = [{ year: 2030, selectedEbitdaUSD: 1, low: 15, mid: 16, high: 17, tooltip: null }];
  const combined = [{ year: 2030, value: 25, navContribution: 10, multipleContribution: 15, source: 'quality' as const, tooltip: null }];
  assert.deepEqual(activeOverlayDomainValues({ staticSeries: band, qualitySeries: quality, combinedSeries: combined, visibility: { showStaticMultipleBand: true, showQualityMultipleBand: false, showCombinedTarget: false } }), [5, 6, 7]);
  assert.deepEqual(activeOverlayDomainValues({ staticSeries: band, qualitySeries: quality, combinedSeries: combined, visibility: { showStaticMultipleBand: false, showQualityMultipleBand: true, showCombinedTarget: true } }), [15, 16, 17, 25]);
});

test('panel source contract provides accessible disclosure and required local controls', () => {
  const source = readFileSync(new URL('../MultipleContrastPanel.tsx', import.meta.url), 'utf8');
  assert.match(source, /<button[^>]+type=\"button\"/);
  assert.match(source, /aria-expanded=/);
  assert.match(source, /aria-controls=/);
  assert.match(source, /EBITDA-underlag/);
  assert.match(source, /Årlig EBITDA/);
  assert.match(source, /5Y framåtblickande genomsnitt/);
  assert.match(source, /Naturligt 5x–7x/);
  assert.match(source, /Kvalitetsjusterat spann/);
  assert.match(source, /Kombinerad riktkurs/);
  assert.match(source, /Kvalitetsjusterad multipel kan inte beräknas/);
  assert.match(source, /5-årig EBITDA-koncentration/);
  assert.match(source, /jämnt fördelad EBITDA-profil/);
});

test('quality overlay uses purple while existing static and DCF/NAV colors remain unchanged', () => {
  assert.equal(VALUE_RANGE_CHART_COLORS.qualityMultiple, '#7C3AED');
  assert.equal(VALUE_RANGE_CHART_COLORS.staticMultiple, '#dfb9a4');
  assert.equal(VALUE_RANGE_CHART_COLORS.dcf, '#2C3E50');
  assert.equal(VALUE_RANGE_CHART_COLORS.nav, '#A8C686');
  const options = buildValueRangeChartOptions({ ticks: [], yearMin: 2030, yearMax: 2035, valueWindow: { min: 0, max: 10 } });
  assert.equal(options.colors[1], VALUE_RANGE_CHART_COLORS.nav);
  assert.equal(options.colors[2], VALUE_RANGE_CHART_COLORS.dcf);
  assert.equal(options.series[11].color, VALUE_RANGE_CHART_COLORS.staticMultiple);
  assert.equal(options.interval.staticLow.color, VALUE_RANGE_CHART_COLORS.staticMultiple);
  assert.equal(options.interval.qualityLow.color, VALUE_RANGE_CHART_COLORS.qualityMultiple);
  assert.equal(options.interval.qualityLow.fillOpacity, options.interval.staticLow.fillOpacity);
});

test('quality line, boundaries, peak marker, annotation, and legend share the purple presentation token', () => {
  const cardSource = readFileSync(new URL('../ValueRangeSnapshotCard.tsx', import.meta.url), 'utf8');
  const cssSource = readFileSync(new URL('../../../styles/dashboard.css', import.meta.url), 'utf8');
  assert.match(cardSource, /color: VALUE_RANGE_CHART_COLORS\.qualityMultiple, lineWidth: 0\.8/);
  assert.equal((cardSource.match(/color: VALUE_RANGE_CHART_COLORS\.qualityMultiple/g) ?? []).length, 5);
  assert.match(cardSource, /pointSize: 7[^\n]+annotations: \{ textStyle: \{ color: VALUE_RANGE_CHART_COLORS\.qualityMultiple/);
  assert.match(cssSource, /\.legend-quality-multiple \{ background: #7C3AED; \}/);
});
