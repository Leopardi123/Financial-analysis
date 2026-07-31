import { bridgeCorporateMultipleToEquity } from '../../lib/corporate/multipleContrast/engine.ts';
import type { CorporateQualityMultipleRow } from '../../lib/corporate/multipleContrast/types.ts';

export type MultipleContrastBasis = 'annual' | 'forwardAverage';

export type StaticCorporateMultipleRow = {
  year: number;
  ebitdaTarget?: number | null;
  evEbitda5xPerShare?: number | null;
  evEbitda6xPerShare?: number | null;
  evEbitda7xPerShare?: number | null;
  sharesPf: number | null;
};

export type MultipleBridgeRow = {
  year: number;
  netCashTarget: number | null;
  sharesPostFinancing: number | null;
};

export type MultipleBandPoint = {
  year: number;
  selectedEbitdaUSD: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
  tooltip: string | null;
};

export type CombinedTargetPoint = {
  year: number;
  value: number | null;
  navContribution: number | null;
  multipleContribution: number | null;
  source: 'quality' | 'static' | null;
  tooltip: string | null;
};

export type MultipleContrastVisibility = {
  showStaticMultipleBand: boolean;
  showQualityMultipleBand: boolean;
  showCombinedTarget: boolean;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const format = (value: number, digits = 2) => value.toLocaleString('sv-SE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const basisLabel = (basis: MultipleContrastBasis) => basis === 'annual' ? 'Årlig EBITDA' : '5Y framåtblickande genomsnitt';

function emptyBand(year: number, selectedEbitdaUSD: number | null): MultipleBandPoint {
  return { year, selectedEbitdaUSD, low: null, mid: null, high: null, tooltip: null };
}

/** Presentation-only 5x/6x/7x selector. Annual reuses snapshot values; forward uses the shared bridge. */
export function buildStaticMultipleContrastSeries(args: {
  basis: MultipleContrastBasis;
  staticRows: StaticCorporateMultipleRow[];
  qualityRows: CorporateQualityMultipleRow[];
  bridgeRows: MultipleBridgeRow[];
  fxUSDToTarget: number | null;
  currencyCode?: string;
}): MultipleBandPoint[] {
  const qualityByYear = new Map(args.qualityRows.map((row) => [row.calendarYear, row]));
  const bridgeByYear = new Map(args.bridgeRows.map((row) => [row.year, row]));
  return args.staticRows.map((staticRow) => {
    const quality = qualityByYear.get(staticRow.year);
    const selectedEbitdaUSD = args.basis === 'annual'
      ? quality?.annualEbitdaUSD ?? (finite(staticRow.ebitdaTarget) ? staticRow.ebitdaTarget : null)
      : quality?.forwardAverageEbitdaUSD ?? null;
    if (!finite(selectedEbitdaUSD) || selectedEbitdaUSD <= 0) return emptyBand(staticRow.year, selectedEbitdaUSD);
    let low: number | null;
    let mid: number | null;
    let high: number | null;
    if (args.basis === 'annual') {
      low = finite(staticRow.evEbitda5xPerShare) ? staticRow.evEbitda5xPerShare : null;
      mid = finite(staticRow.evEbitda6xPerShare) ? staticRow.evEbitda6xPerShare : null;
      high = finite(staticRow.evEbitda7xPerShare) ? staticRow.evEbitda7xPerShare : null;
    } else {
      const bridge = bridgeByYear.get(staticRow.year);
      const values = bridgeCorporateMultipleToEquity({
        selectedEbitdaUSD,
        fxUSDToTarget: args.fxUSDToTarget,
        lowMultiple: 5,
        midMultiple: 6,
        highMultiple: 7,
        netCashTarget: bridge?.netCashTarget ?? null,
        sharesPostFinancing: bridge?.sharesPostFinancing ?? null,
      });
      low = values.valuePerShareLow;
      mid = values.valuePerShareMid;
      high = values.valuePerShareHigh;
    }
    const unit = args.currencyCode ? ` ${args.currencyCode}` : '';
    const tooltip = finite(mid) ? [
      'Naturligt EV/EBITDA 5x–7x',
      `År: ${staticRow.year}`,
      `Underlag: ${basisLabel(args.basis)}`,
      `5x: ${finite(low) ? format(low) : 'n/a'}${unit}`,
      `6x: ${format(mid)}${unit}`,
      `7x: ${finite(high) ? format(high) : 'n/a'}${unit}`,
    ].join('\n') : null;
    return { year: staticRow.year, selectedEbitdaUSD, low, mid, high, tooltip };
  });
}

/**
 * Converts Phase-A absolute equity values to the Corporate View's canonical per-share
 * denominator. Phase-A snapshot per-share fields remain audit-only values before the
 * UI manual-share adjustment and must not drive visible Corporate overlays.
 */
export function buildQualityMultipleContrastSeries(args: {
  basis: MultipleContrastBasis;
  qualityRows: CorporateQualityMultipleRow[];
  canonicalSharesForPerShareByYear: ReadonlyMap<number, number | null>;
  currencyCode?: string;
}): MultipleBandPoint[] {
  return args.qualityRows.map((row) => {
    const selectedEbitdaUSD = args.basis === 'annual' ? row.annualEbitdaUSD : row.forwardAverageEbitdaUSD;
    const selected = args.basis === 'annual' ? row.annualBasis : row.forwardAverageBasis;
    if (!finite(selectedEbitdaUSD) || selectedEbitdaUSD <= 0) return emptyBand(row.calendarYear, selectedEbitdaUSD);
    const canonicalShares = args.canonicalSharesForPerShareByYear.get(row.calendarYear);
    const perShare = (equityValue: number | null): number | null =>
      finite(equityValue) && finite(canonicalShares) && canonicalShares > 0
        ? equityValue / canonicalShares
        : null;
    const low = perShare(selected.equityValueLowTarget);
    const mid = perShare(selected.equityValueMidTarget);
    const high = perShare(selected.equityValueHighTarget);
    const status = row.shortWindow ? 'Kort fönster' : 'Fullt femårsfönster';
    const unit = args.currencyCode ? ` ${args.currencyCode}` : '';
    const tooltip = finite(mid) ? [
      'Kvalitetsjusterad EV/EBITDA',
      `År: ${row.calendarYear}`,
      `Mitt: ${finite(row.qualityMidMultiple) ? format(row.qualityMidMultiple) : 'n/a'}x`,
      `Spann: ${finite(row.qualityLowMultiple) ? format(row.qualityLowMultiple) : 'n/a'}x–${finite(row.qualityHighMultiple) ? format(row.qualityHighMultiple) : 'n/a'}x`,
      `Värde/aktie: ${format(mid)}${unit}`,
      `Underlag: ${basisLabel(args.basis)}`,
      `Status: ${status} (${row.qualityStatus})`,
    ].join('\n') : null;
    return { year: row.calendarYear, selectedEbitdaUSD, low, mid, high, tooltip };
  });
}

/** Applies the fixed 70% NAV / 30% visible EV/EBITDA-mid policy per share. */
export function buildCombinedTargetSeries(args: {
  years: number[];
  navPerShareByYear: Map<number, number | null>;
  staticSeries: MultipleBandPoint[];
  qualitySeries: MultipleBandPoint[];
  visibility: MultipleContrastVisibility;
  currencyCode?: string;
}): CombinedTargetPoint[] {
  const staticByYear = new Map(args.staticSeries.map((row) => [row.year, row]));
  const qualityByYear = new Map(args.qualitySeries.map((row) => [row.year, row]));
  return args.years.map((year) => {
    const nav = args.navPerShareByYear.get(year) ?? null;
    const qualityMid = args.visibility.showQualityMultipleBand ? qualityByYear.get(year)?.mid ?? null : null;
    const staticMid = args.visibility.showStaticMultipleBand ? staticByYear.get(year)?.mid ?? null : null;
    const source = finite(qualityMid) ? 'quality' as const : finite(staticMid) ? 'static' as const : null;
    const multipleMid = source === 'quality' ? qualityMid : source === 'static' ? staticMid : null;
    if (!args.visibility.showCombinedTarget || !finite(nav) || !finite(multipleMid)) {
      return { year, value: null, navContribution: null, multipleContribution: null, source: null, tooltip: null };
    }
    const navContribution = nav * 0.70;
    const multipleContribution = multipleMid * 0.30;
    const value = navContribution + multipleContribution;
    const unit = args.currencyCode ? ` ${args.currencyCode}` : '';
    return {
      year, value, navContribution, multipleContribution, source,
      tooltip: [
        'Kombinerad riktkurs',
        `70 % NAV: ${format(navContribution)}${unit}`,
        `30 % EV/EBITDA: ${format(multipleContribution)}${unit}`,
        `Totalt: ${format(value)}${unit}`,
        `EV/EBITDA-källa: ${source === 'quality' ? 'Kvalitetsjusterad' : 'Naturlig 6x'}`,
      ].join('\n'),
    };
  });
}

export function activeOverlayDomainValues(args: {
  staticSeries: MultipleBandPoint[];
  qualitySeries: MultipleBandPoint[];
  combinedSeries: CombinedTargetPoint[];
  visibility: MultipleContrastVisibility;
}): number[] {
  const values: Array<number | null> = [];
  if (args.visibility.showStaticMultipleBand) values.push(...args.staticSeries.flatMap((row) => [row.low, row.mid, row.high]));
  if (args.visibility.showQualityMultipleBand) values.push(...args.qualitySeries.flatMap((row) => [row.low, row.mid, row.high]));
  if (args.visibility.showCombinedTarget) values.push(...args.combinedSeries.map((row) => row.value));
  return values.filter(finite);
}
