import { loadProjectsForSymbol } from '../../../lib/api/loadProjectsForSymbol.ts';
import { parseProjectJsonV1 } from '../../../lib/project/jsonv1/parse.ts';
import { resolveProjectPricesToEngineInput } from '../../../lib/project/jsonv1/resolvePrices.ts';
import { getPriceKeyDefinition } from '../../../lib/prices/keys.ts';

export type TierCyclePriceDisplayRow = {
  metal: string;
  priceKey: string;
  unit: 'USD/toz' | 'USD/lb' | 'USD/tonne';
  spotPrice: number;
  bearPrice: number;
  multiplier: number;
  projectIds: string[];
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function scalarPositivePrice(series: Array<number | null> | undefined): number | null {
  if (!Array.isArray(series)) return null;
  const values = series.filter((value): value is number => finite(value) && value > 0);
  if (values.length === 0) return null;
  const first = values[0];
  const tolerance = Math.max(1e-9, Math.abs(first) * 1e-9);
  return values.every((value) => Math.abs(value - first) <= tolerance) ? first : null;
}

function displayUnit(priceKey: string): TierCyclePriceDisplayRow['unit'] | null {
  const canonical = getPriceKeyDefinition(priceKey).canonicalUnit;
  if (canonical === 'USD_per_toz') return 'USD/toz';
  if (canonical === 'USD_per_lb') return 'USD/lb';
  if (canonical === 'USD_per_tonne') return 'USD/tonne';
  return null;
}

export async function buildTierCyclePriceDisplay(
  symbol: string,
  multipliersByMetal: Record<string, number>,
): Promise<{ rows: TierCyclePriceDisplayRow[]; diagnostics: string[] }> {
  const loaded = await loadProjectsForSymbol(symbol);
  const rowsByKey = new Map<string, TierCyclePriceDisplayRow>();
  const diagnostics: string[] = [];
  const priceKeysByMetal = new Map<string, Set<string>>();

  for (const project of loaded) {
    const parsed = parseProjectJsonV1(project.rawJson);
    const input = await resolveProjectPricesToEngineInput({
      parsed,
      scenario: { mode: 'spot' },
      allowRefresh: true,
      projectId: project.projectId,
    });

    for (const [metal, priceKey] of Object.entries(parsed.engineInputWithoutPrices.priceKeyByMetal)) {
      const keys = priceKeysByMetal.get(metal) ?? new Set<string>();
      keys.add(priceKey);
      priceKeysByMetal.set(metal, keys);

      const multiplier = multipliersByMetal[metal];
      if (!finite(multiplier) || multiplier <= 0 || multiplier >= 1) continue;
      const spotPrice = scalarPositivePrice(input.spotPriceUSDByMetal[metal]);
      if (!finite(spotPrice) || spotPrice <= 0) continue;
      const unit = displayUnit(priceKey);
      if (!unit) continue;

      const key = `${metal}|${priceKey}`;
      const existing = rowsByKey.get(key);
      if (existing) {
        const priceTolerance = Math.max(1e-9, Math.abs(existing.spotPrice) * 1e-9);
        const multiplierTolerance = 1e-12;
        if (Math.abs(existing.spotPrice - spotPrice) > priceTolerance || Math.abs(existing.multiplier - multiplier) > multiplierTolerance) {
          diagnostics.push(`Cykelpris: ${metal}/${priceKey} har olika spotpris eller multiplier mellan projekt; prisraden utelämnas för att undvika falsk precision.`);
          rowsByKey.delete(key);
          continue;
        }
        if (!existing.projectIds.includes(project.projectId)) existing.projectIds.push(project.projectId);
        continue;
      }

      rowsByKey.set(key, {
        metal,
        priceKey,
        unit,
        spotPrice,
        bearPrice: spotPrice * multiplier,
        multiplier,
        projectIds: [project.projectId],
      });
    }
  }

  for (const [metal, keys] of priceKeysByMetal.entries()) {
    if (keys.size <= 1) continue;
    diagnostics.push(`Cykelpris: ${metal} använder flera price keys (${[...keys].join(', ')}). Befintlig cycleMultipliersByMetal kan inte bevisa vilken multiplier som hör till varje key; ${metal}-prisrader utelämnas.`);
    for (const key of [...rowsByKey.keys()]) {
      if (key.startsWith(`${metal}|`)) rowsByKey.delete(key);
    }
  }

  return {
    rows: [...rowsByKey.values()].sort((a, b) => a.metal.localeCompare(b.metal) || a.priceKey.localeCompare(b.priceKey)),
    diagnostics,
  };
}
