import type { SnapshotRequest } from '../api/validateSnapshotRequest.ts';

export type CorporateFinancingState = {
  financingPlan: SnapshotRequest['financingPlan'];
  financingPlanByProject: SnapshotRequest['financingPlanByProject'];
};

function storageKey(symbol: string): string {
  return `corporateFinancing.live.v1.${symbol.trim().toUpperCase()}`;
}

export function saveLiveCorporateFinancingState(payload: SnapshotRequest): void {
  if (typeof window === 'undefined' || !payload.symbol || !payload.financingPlan) return;
  try {
    const state: CorporateFinancingState = {
      financingPlan: payload.financingPlan,
      financingPlanByProject: payload.financingPlanByProject,
    };
    window.sessionStorage.setItem(storageKey(payload.symbol), JSON.stringify(state));
  } catch {
    // Storage is an optional synchronization layer; snapshot execution must never depend on it.
  }
}

export function loadLiveCorporateFinancingState(symbol: string): CorporateFinancingState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(symbol));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CorporateFinancingState;
    if (!parsed || typeof parsed !== 'object' || !parsed.financingPlan) return null;
    return parsed;
  } catch {
    return null;
  }
}
