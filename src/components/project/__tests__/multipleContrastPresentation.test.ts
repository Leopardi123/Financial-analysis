import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeOverlayDomainValues, buildCombinedTargetSeries, buildQualityMultipleContrastSeries, buildStaticMultipleContrastSeries, type MultipleContrastVisibility } from '../multipleContrastPresentation.ts';
import type { CorporateQualityMultipleRow } from '../../../lib/corporate/multipleContrast/types.ts';

const overlay = (low: number | null, mid: number | null, high: number | null) => ({ enterpriseValueLowTarget: low, enterpriseValueMidTarget: mid, enterpriseValueHighTarget: high, equityValueLowTarget: low, equityValueMidTarget: mid, equityValueHighTarget: high, valuePerShareLow: low, valuePerShareMid: mid, valuePerShareHigh: high });
const qualityRow = (overrides: Partial<CorporateQualityMultipleRow> = {}): CorporateQualityMultipleRow => ({
  calendarYear: 2030, annualEbitdaUSD: 100, forwardAverageEbitdaUSD: 80, remainingActiveEconomicYears: 8, economicEndYear: 2037, remainingEconomicSpanYears: 8, economicGapYears: 0,
  frontLoading5Y: 0.625, negativeEbitdaTailShare: 0, ebitdaCv5Y: 0, sustainingIntensity5Y: 0.088, ebitdaMargin5Y: 0.478,
  remainingEconomicYearsAdjustment: 0, frontLoadingAdjustment: 0.25, stabilityAdjustment: 0.5, sustainingIntensityAdjustment: 0.25, marginAdjustment: 0.5,
  rawQualityMultiple: 7.5, qualityLowMultiple: 6.5, qualityMidMultiple: 7.5, qualityHighMultiple: 8.5,
  annualBasis: overlay(6.5, 7.5, 8.5), forwardAverageBasis: overlay(5.2, 6, 6.8), shortWindow: false, windowLength: 5, windowStartYear: 2030, windowEndYear: 2034,
  qualityStatus: 'COMPUTABLE', qualityDiagnostics: ['FULL_WINDOW'], ...overrides,
});
const staticRows = [{ year: 2030, ebitdaTarget: 125, evEbitda5xPerShare: 6.35, evEbitda6xPerShare: 7.6, evEbitda7xPerShare: 8.85, sharesPf: 100 }];
const bridgeRows = [{ year: 2030, netCashTarget: 10, sharesPostFinancing: 100 }];

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

test('quality selector reads Phase-A annual and forward bases without recomputation', () => {
  const annual = buildQualityMultipleContrastSeries({ basis: 'annual', qualityRows: [qualityRow()] })[0];
  const forward = buildQualityMultipleContrastSeries({ basis: 'forwardAverage', qualityRows: [qualityRow()] })[0];
  assert.deepEqual([annual.low, annual.mid, annual.high], [6.5, 7.5, 8.5]);
  assert.deepEqual([forward.low, forward.mid, forward.high], [5.2, 6, 6.8]);
});

test('quality null years remain null with no 6x fallback or interpolation', () => {
  const row = qualityRow({ annualBasis: overlay(null, null, null), qualityMidMultiple: null, qualityLowMultiple: null, qualityHighMultiple: null, qualityStatus: 'NOT_COMPUTABLE' });
  const point = buildQualityMultipleContrastSeries({ basis: 'annual', qualityRows: [row] })[0];
  assert.deepEqual([point.low, point.mid, point.high, point.tooltip], [null, null, null, null]);
});

test('short-window quality point remains visible and tooltip reports short status', () => {
  const point = buildQualityMultipleContrastSeries({ basis: 'annual', qualityRows: [qualityRow({ shortWindow: true, qualityDiagnostics: ['SHORT_WINDOW'] })] })[0];
  assert.equal(point.mid, 7.5);
  assert.match(point.tooltip ?? '', /Kort fönster/);
});

test('combined target uses exact 70/30 and prioritizes visible computable quality', () => {
  const visibility: MultipleContrastVisibility = { showStaticMultipleBand: true, showQualityMultipleBand: true, showCombinedTarget: true };
  const [point] = buildCombinedTargetSeries({ years: [2030], navPerShareByYear: new Map([[2030, 10]]), staticSeries: [{ year: 2030, selectedEbitdaUSD: 1, low: 5, mid: 6, high: 7, tooltip: null }], qualitySeries: [{ year: 2030, selectedEbitdaUSD: 1, low: 6.5, mid: 7.5, high: 8.5, tooltip: null }], visibility });
  assert.equal(point.value, (10 * 0.7) + (7.5 * 0.3));
  assert.equal(point.source, 'quality');
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
});
