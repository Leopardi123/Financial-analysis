import type { NumericClaim, OwnershipPeriod, ProductionDisclosure } from './types.ts';

export type OwnershipResolution =
  | { status: 'exact'; ownershipPct: number }
  | { status: 'not_computable'; ownershipPct: null; reason: string };

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function scaleClaim(claim: NumericClaim, factor: number): NumericClaim {
  switch (claim.kind) {
    case 'point':
    case 'approximate':
    case 'upper_bound':
    case 'lower_bound':
      return { ...claim, value: claim.value * factor };
    case 'range':
      return { ...claim, low: claim.low * factor, high: claim.high * factor };
  }
}

export function resolveOwnershipForYear(periods: readonly OwnershipPeriod[], year: number): OwnershipResolution {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  for (const period of periods) {
    if (!isValidIsoDate(period.effectiveFrom)) {
      return { status: 'not_computable', ownershipPct: null, reason: `Invalid ownership effectiveFrom ${period.effectiveFrom}` };
    }
    if (period.effectiveTo && !isValidIsoDate(period.effectiveTo)) {
      return { status: 'not_computable', ownershipPct: null, reason: `Invalid ownership effectiveTo ${period.effectiveTo}` };
    }
    if (period.effectiveTo && period.effectiveTo < period.effectiveFrom) {
      return { status: 'not_computable', ownershipPct: null, reason: 'Ownership period ends before it starts' };
    }
    if (!Number.isFinite(period.ownershipPct) || period.ownershipPct < 0 || period.ownershipPct > 1) {
      return { status: 'not_computable', ownershipPct: null, reason: `Invalid ownershipPct ${String(period.ownershipPct)}` };
    }
  }

  const overlapping = periods.filter((period) =>
    period.effectiveFrom <= yearEnd && (period.effectiveTo === undefined || period.effectiveTo >= yearStart),
  );

  if (overlapping.length === 0) {
    return { status: 'not_computable', ownershipPct: null, reason: `No ownership period covers ${year}` };
  }
  if (overlapping.length > 1) {
    return {
      status: 'not_computable',
      ownershipPct: null,
      reason: `Ownership changes or overlaps during ${year}; annual production cannot be silently prorated`,
    };
  }

  const period = overlapping[0];
  const coversWholeYear = period.effectiveFrom <= yearStart && (period.effectiveTo === undefined || period.effectiveTo >= yearEnd);
  if (!coversWholeYear) {
    return {
      status: 'not_computable',
      ownershipPct: null,
      reason: `Ownership period covers only part of ${year}; annual production cannot be silently prorated`,
    };
  }

  return { status: 'exact', ownershipPct: period.ownershipPct };
}

export function applyOwnershipToProductionClaim(
  disclosure: ProductionDisclosure,
  ownership: OwnershipResolution,
): { claim: NumericClaim | null; status: 'exact' | 'not_computable'; reason?: string } {
  if (disclosure.basis === 'attributable') {
    return { claim: disclosure.quantity, status: 'exact' };
  }
  if (ownership.status !== 'exact') {
    return { claim: null, status: 'not_computable', reason: ownership.reason };
  }
  return { claim: scaleClaim(disclosure.quantity, ownership.ownershipPct), status: 'exact' };
}
