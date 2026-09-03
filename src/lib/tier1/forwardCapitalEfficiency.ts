import type { Tier1Gate } from './preRevenueLegacySnapshot.ts';

export const FORWARD_CAPITAL_EFFICIENCY_POLICY = Object.freeze({
  tier1: 0.70,
  tier2: 0.50,
  minimumQualified: 0.25,
});

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function presentValueStrict(series: Array<number | null>, discountRate: number): number | null {
  if (!finite(discountRate) || discountRate < 0 || series.some((value) => !finite(value))) return null;
  return (series as number[]).reduce((sum, value, t) => sum + value / ((1 + discountRate) ** t), 0);
}

export function computeForwardCapitalEfficiency(args: {
  fcffUSD: Array<number | null>;
  futureCapitalUSD: Array<number | null>;
  discountRate: number;
}): { value: number | null; npvUSD: number | null; futureCapitalPvUSD: number | null; reason: string | null } {
  if (args.fcffUSD.length === 0 || args.fcffUSD.length !== args.futureCapitalUSD.length) {
    return { value: null, npvUSD: null, futureCapitalPvUSD: null, reason: 'FCFF och framtida kapital måste ha samma icke-tomma tidsaxel.' };
  }
  if (args.futureCapitalUSD.some((value) => finite(value) && value < 0)) {
    return { value: null, npvUSD: null, futureCapitalPvUSD: null, reason: 'Framtida kapital får inte innehålla negativa balansposter.' };
  }
  const npvUSD = presentValueStrict(args.fcffUSD, args.discountRate);
  const futureCapitalPvUSD = presentValueStrict(args.futureCapitalUSD, args.discountRate);
  if (npvUSD === null || futureCapitalPvUSD === null) {
    return { value: null, npvUSD, futureCapitalPvUSD, reason: 'FCE kräver fullständiga finita FCFF- och kapitalserier.' };
  }
  if (!(futureCapitalPvUSD > 0)) {
    return { value: null, npvUSD, futureCapitalPvUSD, reason: 'Diskonterat framtida kapital måste vara större än noll.' };
  }
  return { value: npvUSD / futureCapitalPvUSD, npvUSD, futureCapitalPvUSD, reason: null };
}

export function assessForwardCapitalEfficiency(value: number | null): Tier1Gate {
  const p = FORWARD_CAPITAL_EFFICIENCY_POLICY;
  if (!finite(value)) return { status: 'NOT_VERIFIED', tier: null, value: null, threshold: p.tier1, unit: 'FCE', reason: 'Forward Capital Efficiency kunde inte verifieras på gemensamt spot-deck.' };
  if (value < p.minimumQualified) return { status: 'FAIL', tier: null, value, threshold: p.minimumQualified, unit: 'FCE', reason: `FCE ${(value * 100).toFixed(1)} % vid spot · under miniminivån ${(p.minimumQualified * 100).toFixed(0)} % och därför Ej kvalificerad.` };
  const tier = value >= p.tier1 ? 1 : value >= p.tier2 ? 2 : 3;
  const reason = tier === 1
    ? `FCE ${(value * 100).toFixed(1)} % vid spot · Tier 1 kräver ≥${(p.tier1 * 100).toFixed(0)} %.`
    : tier === 2
      ? `FCE ${(value * 100).toFixed(1)} % vid spot · Tier 2 (${(p.tier2 * 100).toFixed(0)}–${(p.tier1 * 100).toFixed(0)} %).`
      : `FCE ${(value * 100).toFixed(1)} % vid spot · Tier 3; miniminivå ${(p.minimumQualified * 100).toFixed(0)} %.`;
  return { status: tier === 1 ? 'PASS' : 'FAIL', tier, value, threshold: p.tier1, unit: 'FCE', reason };
}
