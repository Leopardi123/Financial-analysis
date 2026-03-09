import type { ManualMetalPriceEntry, ResolvedMetalPrice } from './resolveMetalPrice.ts';
import { resolveMetalPrice } from './resolveMetalPrice.ts';

export type DashboardTask = {
  id: string;
  category: 'Råvaror';
  title: string;
  actionLabel: 'Klicka här';
  metalKey: string;
  projectIds: string[];
  severity: 'warning';
  metal: string;
  unit: string | null;
  resolution: ResolvedMetalPrice;
};

export function collectDashboardTasks(args: {
  projectPriceNeeds: Array<{ projectId: string; metal: string; metalKey: string; fmpSpotValue: number | null; unit: string | null; }>;
  manualByMetalKey: Record<string, ManualMetalPriceEntry>;
  nowUtcIso?: string;
}): DashboardTask[] {
  const grouped = new Map<string, DashboardTask>();

  for (const need of args.projectPriceNeeds) {
    const resolution = resolveMetalPrice({
      metal: need.metal,
      metalKey: need.metalKey,
      fmpSpotValue: need.fmpSpotValue,
      manualEntry: args.manualByMetalKey[need.metalKey] ?? null,
      nowUtcIso: args.nowUtcIso,
    });
    if (!resolution.actionRequired) continue;

    const id = `missing-price-${need.metalKey}`;
    const current = grouped.get(id);
    if (!current) {
      grouped.set(id, {
        id,
        category: 'Råvaror',
        title: `${need.metal}, ${need.metalKey} saknar pris`,
        actionLabel: 'Klicka här',
        metalKey: need.metalKey,
        projectIds: [need.projectId],
        severity: 'warning',
        metal: need.metal,
        unit: need.unit,
        resolution,
      });
      continue;
    }
    if (!current.projectIds.includes(need.projectId)) current.projectIds.push(need.projectId);
  }

  return [...grouped.values()].sort((a, b) => a.title.localeCompare(b.title));
}
