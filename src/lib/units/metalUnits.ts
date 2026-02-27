export type CanonicalUnit =
  | 'toz'
  | 'lb'
  | 'tonne';

export const CANONICAL_UNIT_BY_METAL: Record<string, CanonicalUnit> = {
  Au: 'toz',
  Ag: 'toz',
  Pt: 'toz',
  Pd: 'toz',
  Cu: 'lb',
  Zn: 'lb',
  Ni: 'lb',
  Fe: 'tonne',
};

const PRECIOUS_METALS = new Set(['Au', 'Ag', 'Pt', 'Pd']);

export function canonicalUnitForMetal(metal: string): CanonicalUnit {
  const direct = CANONICAL_UNIT_BY_METAL[metal];
  if (direct) {
    return direct;
  }

  return PRECIOUS_METALS.has(metal) ? 'toz' : 'lb';
}
