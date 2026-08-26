import type { SnapshotRequest } from '../api/validateSnapshotRequest.ts';
import { extraSharesStorageKey, parseExtraShares } from '../market/extraShares.ts';

export type CorporateFinancingState = {
  financingPlan: SnapshotRequest['financingPlan'];
  financingPlanByProject: SnapshotRequest['financingPlanByProject'];
  extraShares: number;
  updatedAtUtc?: string | null;
};

function sessionStorageKey(symbol: string): string {
  return `corporateFinancing.live.v2.${symbol.trim().toUpperCase()}`;
}

function readLocalExtraShares(symbol: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    return parseExtraShares(window.localStorage.getItem(extraSharesStorageKey('corporate', symbol)) ?? '0');
  } catch {
    return 0;
  }
}

function saveSession(symbol: string, state: CorporateFinancingState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(sessionStorageKey(symbol), JSON.stringify(state));
  } catch {
    // Session cache is optional.
  }
}

function loadSession(symbol: string): CorporateFinancingState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(sessionStorageKey(symbol));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CorporateFinancingState;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      financingPlan: parsed.financingPlan,
      financingPlanByProject: parsed.financingPlanByProject,
      extraShares: Number.isSafeInteger(parsed.extraShares) && parsed.extraShares >= 0 ? parsed.extraShares : 0,
      updatedAtUtc: parsed.updatedAtUtc ?? null,
    };
  } catch {
    return null;
  }
}

async function persistRemote(symbol: string, state: CorporateFinancingState): Promise<void> {
  if (typeof fetch === 'undefined') return;
  try {
    await fetch('/api/corporate-financing-preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        symbol,
        financingPlan: state.financingPlan,
        financingPlanByProject: state.financingPlanByProject,
        extraShares: state.extraShares,
      }),
    });
  } catch {
    // Persistence must never block snapshot execution.
  }
}

export function saveLiveCorporateFinancingState(payload: SnapshotRequest): void {
  if (typeof window === 'undefined' || !payload.symbol || !payload.financingPlan) return;
  const symbol = payload.symbol.trim().toUpperCase();
  const state: CorporateFinancingState = {
    financingPlan: payload.financingPlan,
    financingPlanByProject: payload.financingPlanByProject,
    extraShares: readLocalExtraShares(symbol),
    updatedAtUtc: new Date().toISOString(),
  };
  saveSession(symbol, state);
  void persistRemote(symbol, state);
}

export async function saveCorporateExtraShares(symbolRaw: string, extraShares: number): Promise<void> {
  const symbol = symbolRaw.trim().toUpperCase();
  if (!symbol) return;
  const current = (await loadLiveCorporateFinancingState(symbol)) ?? {
    financingPlan: undefined,
    financingPlanByProject: undefined,
    extraShares: 0,
  };
  const state: CorporateFinancingState = {
    ...current,
    extraShares: Number.isSafeInteger(extraShares) && extraShares >= 0 ? extraShares : 0,
    updatedAtUtc: new Date().toISOString(),
  };
  saveSession(symbol, state);
  await persistRemote(symbol, state);
}

export async function loadLiveCorporateFinancingState(symbolRaw: string): Promise<CorporateFinancingState | null> {
  const symbol = symbolRaw.trim().toUpperCase();
  if (!symbol) return null;

  if (typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`/api/corporate-financing-preferences?symbol=${encodeURIComponent(symbol)}`);
      if (response.ok) {
        const body = await response.json() as { ok?: boolean; state?: CorporateFinancingState | null };
        if (body.ok && body.state) {
          const state: CorporateFinancingState = {
            financingPlan: body.state.financingPlan,
            financingPlanByProject: body.state.financingPlanByProject,
            extraShares: Number.isSafeInteger(body.state.extraShares) && body.state.extraShares >= 0 ? body.state.extraShares : 0,
            updatedAtUtc: body.state.updatedAtUtc ?? null,
          };
          saveSession(symbol, state);
          return state;
        }
      }
    } catch {
      // Fall through to local/session fallback.
    }
  }

  const session = loadSession(symbol);
  if (session) return session;

  const localExtraShares = readLocalExtraShares(symbol);
  if (localExtraShares > 0) {
    const migrated: CorporateFinancingState = {
      financingPlan: undefined,
      financingPlanByProject: undefined,
      extraShares: localExtraShares,
      updatedAtUtc: new Date().toISOString(),
    };
    saveSession(symbol, migrated);
    void persistRemote(symbol, migrated);
    return migrated;
  }

  return null;
}
