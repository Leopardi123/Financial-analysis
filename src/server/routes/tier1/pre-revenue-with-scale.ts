import baseHandler from './pre-revenue.ts';
import { loadProjectsForSymbol } from '../../../lib/api/loadProjectsForSymbol.ts';
import { parseProjectJsonV1 } from '../../../lib/project/jsonv1/parse.ts';
import { convertMass, convertPreciousQuantity } from '../../../lib/prices/units.ts';
import { TIER1_PRODUCTION_THRESHOLDS, isTier1Metal, type Tier1Metal } from '../../../lib/tier1/config.ts';
import { assessCombinedScale, combineTier1GateStatuses, type Tier1PreRevenueAssessment } from '../../../lib/tier1/preRevenue.ts';
import type { QtyUnit } from '../../../lib/project/jsonv1/schema.ts';

type CapturedPayload = {
  ok?: boolean;
  symbol?: string;
  assessment?: Tier1PreRevenueAssessment;
  [key: string]: unknown;
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toThresholdUnit(value: number, from: QtyUnit, metal: Tier1Metal): number | null {
  const target = TIER1_PRODUCTION_THRESHOLDS[metal].unit;
  try {
    if (target === 'toz') {
      if (from === 'toz') return value;
      if (from === 'g' || from === 'kg') return convertPreciousQuantity(value, from, 'toz');
      return null;
    }
    if (target === 'tonne') {
      if (from === 'tonne') return value;
      if (from === 'lb' || from === 'kg' || from === 'short_ton' || from === 'long_ton') {
        return convertMass(value, from, 'tonne');
      }
      return null;
    }
  } catch {
    return null;
  }
  return null;
}

async function computeAverageAnnualPayableByMetal(symbol: string): Promise<Partial<Record<Tier1Metal, number>>> {
  const loaded = await loadProjectsForSymbol(symbol);
  const byMetalYear = new Map<Tier1Metal, Map<number, number>>();

  for (const project of loaded) {
    const parsed = parseProjectJsonV1(project.rawJson);
    const years = parsed.engineInputWithoutPrices.yearsByPeriod;
    for (const [rawMetal, series] of Object.entries(parsed.engineInputWithoutPrices.payableQtyByMetal)) {
      if (!isTier1Metal(rawMetal)) continue;
      const metal = rawMetal as Tier1Metal;
      const unit = parsed.engineInputWithoutPrices.payableQtyUnitByMetal[metal];
      if (!unit) continue;
      const byYear = byMetalYear.get(metal) ?? new Map<number, number>();
      for (let t = 0; t < series.length; t += 1) {
        const raw = series[t];
        const year = years[t];
        if (!finite(raw) || raw <= 0 || !Number.isInteger(year)) continue;
        const converted = toThresholdUnit(raw, unit, metal);
        if (!finite(converted) || converted <= 0) continue;
        byYear.set(year, (byYear.get(year) ?? 0) + converted);
      }
      byMetalYear.set(metal, byYear);
    }
  }

  const result: Partial<Record<Tier1Metal, number>> = {};
  for (const [metal, byYear] of byMetalYear.entries()) {
    const positives = [...byYear.values()].filter((value) => finite(value) && value > 0);
    if (positives.length === 0) continue;
    result[metal] = positives.reduce((sum, value) => sum + value, 0) / positives.length;
  }
  return result;
}

export default async function handler(req: any, res: any): Promise<void> {
  let capturedStatus = 200;
  let capturedPayload: CapturedPayload | null = null;
  const captureRes = {
    status(code: number) {
      capturedStatus = code;
      return this;
    },
    json(payload: CapturedPayload) {
      capturedPayload = payload;
      return this;
    },
  };

  await baseHandler(req, captureRes);

  const payload = capturedPayload as CapturedPayload | null;
  if (capturedStatus !== 200 || !payload?.ok || !payload.assessment) {
    res.status(capturedStatus).json(payload ?? { ok: false, error: 'Tier-1 assessment returned no payload.' });
    return;
  }

  const symbol = String(req.query?.symbol ?? '').trim().toUpperCase();
  if (!symbol) {
    res.status(200).json(payload);
    return;
  }

  try {
    const averageAnnualPayableByMetal = await computeAverageAnnualPayableByMetal(symbol);
    const combined = assessCombinedScale(averageAnnualPayableByMetal);
    payload.assessment.gates.scale = combined.gate;
    payload.assessment.status = combineTier1GateStatuses(payload.assessment.gates);
    payload.assessment.support.averageAnnualPayableByMetal = averageAnnualPayableByMetal;
    payload.assessment.support.scaleEquivalentByMetal = combined.equivalentByMetal;
    payload.assessment.support.combinedScaleEquivalent = combined.combinedEquivalent;
  } catch (error) {
    payload.assessment.diagnostics.push(`Combined scale fallback kunde inte verifieras: ${error instanceof Error ? error.message : String(error)}`);
  }

  res.status(200).json(payload);
}
