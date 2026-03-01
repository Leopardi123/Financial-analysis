import { buildProjectJsonV1Template } from '../lib/project/jsonv1/template.ts';

export type ShiftForwardResult = {
  shifted: Record<string, unknown>;
  shiftedSeriesCount: number;
  k: number;
  tpBase: number;
  tpEff: number;
};

function addYearsToIsoDate(isoDate: string, yearsToAdd: number): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Kan inte förskjuta: ogiltigt datum i time.periodEndDatesUtc: ${isoDate}`);
  }
  const shifted = new Date(parsed.getTime());
  shifted.setUTCFullYear(shifted.getUTCFullYear() + yearsToAdd);
  return shifted.toISOString().slice(0, 10);
}

function extendPeriodEndDatesUtc(periodEndDatesUtc: string[], periodsToAppend: number): string[] {
  if (periodsToAppend <= 0) return [...periodEndDatesUtc];
  const out = [...periodEndDatesUtc];
  let last = out[out.length - 1];
  for (let i = 0; i < periodsToAppend; i += 1) {
    last = addYearsToIsoDate(last, 1);
    out.push(last);
  }
  return out;
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
  const normalizedProjectRaw = buildProjectJsonV1Template(projectRaw as never) as Record<string, unknown>;
  const time = normalizedProjectRaw.time;
  if (typeof time !== 'object' || time === null || Array.isArray(time)) {
    throw new Error('Kan inte förskjuta: time saknas i JSON.');
  }

  const periodEndDatesUtc = (time as Record<string, unknown>).periodEndDatesUtc;
  if (!Array.isArray(periodEndDatesUtc) || periodEndDatesUtc.length === 0 || !periodEndDatesUtc.every((entry) => typeof entry === 'string')) {
    throw new Error('Kan inte förskjuta: time.periodEndDatesUtc måste vara en array av datumsträngar.');
  }

  const productionStartPeriodRaw = (time as Record<string, unknown>).productionStartPeriod;
  if (!Number.isInteger(productionStartPeriodRaw) || Number(productionStartPeriodRaw) < 0 || Number(productionStartPeriodRaw) >= periodEndDatesUtc.length) {
    throw new Error('Kan inte förskjuta: time.productionStartPeriod är ogiltig.');
  }

  const tpBase = Number(productionStartPeriodRaw);
  const baseDate = periodEndDatesUtc[tpBase] as string;
  const baseYear = Number.parseInt(baseDate.slice(0, 4), 10);
  if (!Number.isInteger(baseYear)) {
    throw new Error('Kan inte förskjuta: hittade inget årtal i production start-datumet.');
  }

  if (!Number.isInteger(targetYear)) {
    throw new Error('Målår måste vara ett heltal.');
  }

  const k = targetYear - baseYear;
  if (k < 0) {
    throw new Error(`Målår (${targetYear}) är tidigare än nuvarande produktionsstart (${baseYear}).`);
  }

  const tpEff = tpBase + k;
  const shiftedDeep = shiftPerPeriodArraysDeep(normalizedProjectRaw, periodEndDatesUtc.length, k);
  const shifted = shiftedDeep.value as Record<string, unknown>;
  const periodEndDatesUtcExtended = extendPeriodEndDatesUtc(periodEndDatesUtc as string[], k);
  const shiftedTime = {
    ...(shifted.time as Record<string, unknown>),
    productionStartPeriod: tpEff,
    periodEndDatesUtc: periodEndDatesUtcExtended,
    masterN: (periodEndDatesUtc.length - 1) + k,
  };
  shifted.time = shiftedTime;

  return {
    shifted,
    shiftedSeriesCount: shiftedDeep.shiftedSeriesCount,
    k,
    tpBase,
    tpEff,
  };
}

