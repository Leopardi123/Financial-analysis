import type { ProducerIntervalEconomics } from './intervalEconomics.ts';
import type { ProducerPeerRow } from './peerTable.ts';

export type ProducerPeerRowIntervals = {
  attributable: ProducerIntervalEconomics;
  financial: ProducerIntervalEconomics;
};

/**
 * Interval completeness is authoritative over the older scalar normalization path.
 * If the interval engine proves that a company metric is incomplete, suppress any
 * partial scalar that may have been produced from the subset of projects that did
 * have exact-year inputs. Reported evidence remains available for display.
 */
export function applyAuthoritativeIntervalCompletenessToPeerRow(
  row: ProducerPeerRow,
  intervals: ProducerPeerRowIntervals,
): void {
  const attributable = intervals.attributable;
  const financial = intervals.financial;
  let suppressed = false;

  if (attributable.auOz.range === null) {
    if (row.auOz !== null || row.marketCapPerAuOzUSD !== null) suppressed = true;
    row.auOz = null;
    row.marketCapPerAuOzUSD = null;
  }

  if (attributable.auEqOz.range === null) {
    if (row.auEqOz !== null || row.marketCapPerAuEqOzUSD !== null) suppressed = true;
    row.auEqOz = null;
    row.marketCapPerAuEqOzUSD = null;
  }

  if (financial.auEqOz.range === null) {
    if (row.canonicalCashOperatingCostPerAuEqUSD !== null) suppressed = true;
    row.canonicalCashOperatingCostPerAuEqUSD = null;
  }

  if (financial.revenueUSD.range === null) {
    if (row.revenueUSD !== null) suppressed = true;
    row.revenueUSD = null;
  }

  if (financial.ebitdaUSD.range === null) {
    if (row.ebitdaUSD !== null || row.evToEbitda !== null || row.nonStandardMultiples.marketCapToEbitda !== null) suppressed = true;
    row.ebitdaUSD = null;
    row.evToEbitda = null;
    row.nonStandardMultiples.marketCapToEbitda = null;
  }

  if (financial.fcffBeforeGrowthUSD.range === null) {
    if (row.fcffBeforeGrowthUSD !== null || row.evToFcffBeforeGrowth !== null || row.nonStandardMultiples.marketCapToFcffBeforeGrowth !== null) suppressed = true;
    row.fcffBeforeGrowthUSD = null;
    row.evToFcffBeforeGrowth = null;
    row.nonStandardMultiples.marketCapToFcffBeforeGrowth = null;
  }

  if (financial.fcffAfterGrowthUSD.range === null) {
    if (row.fcffAfterGrowthUSD !== null || row.evToFcffAfterGrowth !== null || row.nonStandardMultiples.marketCapToFcffAfterGrowth !== null) suppressed = true;
    row.fcffAfterGrowthUSD = null;
    row.evToFcffAfterGrowth = null;
    row.nonStandardMultiples.marketCapToFcffAfterGrowth = null;
  }

  if (financial.growthCapexUSD.range === null) {
    if (row.growthCapexUSD !== null) suppressed = true;
    row.growthCapexUSD = null;
  }

  if (
    attributable.auEqOz.range === null
    && (row.reportedProduction !== null || row.reportedAuEq !== null || row.productionEvidence.length > 0)
  ) {
    row.productionQuality = 'reported_only';
  }

  if (suppressed) {
    row.diagnostics = [...new Set([
      ...row.diagnostics,
      'INTERVAL_COMPLETENESS_AUTHORITY: partial scalar metrics were suppressed because at least one included project lacks the exact-year inputs required for a complete company metric.',
    ])];
  }
}
