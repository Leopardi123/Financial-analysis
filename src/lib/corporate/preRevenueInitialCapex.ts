export type CorporateInitialCapexMilestone = {
  markerYear: number | null;
  initialCapexTargetCurrency: number | null;
  basis: 'NEXT_PRODUCTION_MILESTONE_INCREMENTAL';
  status: 'OK' | 'NO_FUTURE_MILESTONE' | 'MISSING_CAPEX';
  diagnostic: string | null;
};

type Marker = {
  yearLabelUsed?: string | number | null;
  lista2Metrics?: {
    InitialCAPEX_incremental_TargetCurrency?: number | null;
  } | null;
};

type SnapshotLike = {
  modeledValuationTimeline?: {
    markers?: Marker[] | null;
  } | null;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function markerYear(marker: Marker): number | null {
  const raw = marker.yearLabelUsed;
  if (finite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Select the next chronological Corporate production milestone independently of
 * whether its valuation low/high is available. The CAPEX value is the existing
 * canonical `InitialCAPEX_incremental` for that milestone, i.e. Corporate
 * construction/growth CAPEX from the previous production milestone (or t0 for
 * the first milestone) up to, but not including, the selected production-start
 * period. Sustaining and closure are separate series and are not part of this
 * value.
 */
export function deriveNextInitialCapexMilestone(
  snapshot: SnapshotLike,
  valuationYear: number,
): CorporateInitialCapexMilestone {
  const markers = Array.isArray(snapshot.modeledValuationTimeline?.markers)
    ? snapshot.modeledValuationTimeline?.markers ?? []
    : [];
  const future = markers
    .map((marker) => ({ marker, year: markerYear(marker) }))
    .filter((entry): entry is { marker: Marker; year: number } => entry.year !== null && entry.year > valuationYear)
    .sort((a, b) => a.year - b.year);

  const next = future[0];
  if (!next) {
    return {
      markerYear: null,
      initialCapexTargetCurrency: null,
      basis: 'NEXT_PRODUCTION_MILESTONE_INCREMENTAL',
      status: 'NO_FUTURE_MILESTONE',
      diagnostic: 'No future Corporate production milestone is available.',
    };
  }

  const value = next.marker.lista2Metrics?.InitialCAPEX_incremental_TargetCurrency;
  if (!finite(value)) {
    return {
      markerYear: next.year,
      initialCapexTargetCurrency: null,
      basis: 'NEXT_PRODUCTION_MILESTONE_INCREMENTAL',
      status: 'MISSING_CAPEX',
      diagnostic: `Initial CAPEX is unavailable for the next Corporate production milestone (${next.year}).`,
    };
  }

  return {
    markerYear: next.year,
    initialCapexTargetCurrency: value,
    basis: 'NEXT_PRODUCTION_MILESTONE_INCREMENTAL',
    status: 'OK',
    diagnostic: null,
  };
}
