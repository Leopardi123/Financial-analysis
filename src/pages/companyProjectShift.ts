import { buildProjectJsonV1Template } from '../lib/project/jsonv1/template.ts';
import { resolveV2TimeAxis } from '../lib/time/resolveV2TimeAxis.ts';

export type ShiftForwardResult = {
  shifted: Record<string, unknown>;
  shiftedSeriesCount: number;
  k: number;
  tpBase: number;
  tpEff: number;
};

function readCostBaseYear(projectRaw: Record<string, unknown>): number | null {
  const breakdown = projectRaw.economicsBreakdown;
  if (typeof breakdown !== 'object' || breakdown === null || Array.isArray(breakdown)) return null;
  const meta = (breakdown as Record<string, unknown>).meta;
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>).costBaseYear;
  return Number.isInteger(value) && (value as number) >= 1900 && (value as number) <= 2100
    ? value as number
    : null;
}

function restoreCostBaseYear(projectRaw: Record<string, unknown>, costBaseYear: number | null): void {
  if (costBaseYear === null) return;
  const breakdown = typeof projectRaw.economicsBreakdown === 'object'
    && projectRaw.economicsBreakdown !== null
    && !Array.isArray(projectRaw.economicsBreakdown)
    ? projectRaw.economicsBreakdown as Record<string, unknown>
    : {};
  const meta = typeof breakdown.meta === 'object' && breakdown.meta !== null && !Array.isArray(breakdown.meta)
    ? breakdown.meta as Record<string, unknown>
    : {};
  meta.costBaseYear = costBaseYear;
  breakdown.meta = meta;
  projectRaw.economicsBreakdown = breakdown;
}

function shiftPerPeriodArraysDeep(value: unknown, expectedLength: number, k: number): { value: unknown; shiftedSeriesCount: number } {
  if (Array.isArray(value)) {
    const isPerPeriodSeries = value.length === expectedLength && value.every((entry) => entry === null || entry === undefined || typeof entry === 'number');
    if (isPerPeriodSeries) {
      const newLength = expectedLength + k;
      const shifted = new Array<number | null>(newLength).fill(null);
      for (let src = 0; src < expectedLength; src += 1) {
        const destinationIndex = src + k;
        const sourceValue = value[src];
        shifted[destinationIndex] = typeof sourceValue === 'number' && Number.isFinite(sourceValue) ? sourceValue : null;
      }
      return { value: shifted, shiftedSeriesCount: 1 };
    }

    let shiftedSeriesCount = 0;
    const mapped = value.map((entry) => {
      const shiftedEntry = shiftPerPeriodArraysDeep(entry, expectedLength, k);
      shiftedSeriesCount += shiftedEntry.shiftedSeriesCount;
      return shiftedEntry.value;
    });
    return { value: mapped, shiftedSeriesCount };
  }

  if (typeof value === 'object' && value !== null) {
    let shiftedSeriesCount = 0;
    const output = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
        const shiftedEntry = shiftPerPeriodArraysDeep(entry, expectedLength, k);
        shiftedSeriesCount += shiftedEntry.shiftedSeriesCount;
        return [key, shiftedEntry.value] as const;
      }),
    );
    return { value: output, shiftedSeriesCount };
  }

  return { value, shiftedSeriesCount: 0 };
}

export function shiftProjectToTargetProductionYear(projectRaw: Record<string, unknown>, targetYear: number): ShiftForwardResult {
  const costBaseYear = readCostBaseYear(projectRaw);
  const normalizedProjectRaw = buildProjectJsonV1Template(projectRaw as never) as Record<string, unknown>;
  // buildProjectJsonV1Template predates costBaseYear and currently strips unknown
  // economicsBreakdown.meta keys. Preserve this non-time-series cost provenance
  // explicitly so delaying a project cannot silently erase its cost vintage.
  restoreCostBaseYear(normalizedProjectRaw, costBaseYear);

  const time = normalizedProjectRaw.time;
  if (typeof time !== 'object' || time === null || Array.isArray(time)) {
    throw new Error('Kan inte förskjuta: time saknas i JSON.');
  }

  let resolvedTime;
  try {
    resolvedTime = resolveV2TimeAxis({
      masterN: (time as Record<string, unknown>).masterN as number,
      productionStartPeriod: (time as Record<string, unknown>).productionStartPeriod as number,
      productionStartYear: (time as Record<string, unknown>).productionStartYear as number,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const projectId = typeof normalizedProjectRaw?.meta === 'object' && normalizedProjectRaw.meta !== null
      ? String((normalizedProjectRaw.meta as Record<string, unknown>).projectId ?? 'unknown')
      : 'unknown';
    throw new Error(
      `Kan inte förskjuta: ogiltig v2-tid för projectId=${projectId}; masterN=${String((time as Record<string, unknown>).masterN)}, productionStartPeriod=${String((time as Record<string, unknown>).productionStartPeriod)}, productionStartYear=${String((time as Record<string, unknown>).productionStartYear)}. Detalj: ${message}`,
    );
  }

  const tpBase = resolvedTime.productionStartPeriod;
  const baseYear = resolvedTime.productionStartYear;

  if (!Number.isInteger(targetYear)) {
    throw new Error('Målår måste vara ett heltal.');
  }

  const k = targetYear - baseYear;
  if (k < 0) {
    throw new Error(`Målår (${targetYear}) är tidigare än nuvarande produktionsstart (${baseYear}).`);
  }

  const tpEff = tpBase + k;
  const shiftedDeep = shiftPerPeriodArraysDeep(normalizedProjectRaw, resolvedTime.yearsByPeriod.length, k);
  const shifted = shiftedDeep.value as Record<string, unknown>;
  const shiftedTime: Record<string, unknown> = {
    ...(shifted.time as Record<string, unknown>),
    productionStartPeriod: tpEff,
    productionStartYear: targetYear,
    masterN: resolvedTime.masterN + k,
  };
  const legacyPeriodDatesKey = `periodEnd${'DatesUtc'}`;
  delete shiftedTime[legacyPeriodDatesKey];
  shifted.time = shiftedTime;

  return {
    shifted,
    shiftedSeriesCount: shiftedDeep.shiftedSeriesCount,
    k,
    tpBase,
    tpEff,
  };
}
