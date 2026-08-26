import { useEffect, useRef, useState } from 'react';
import type { SnapshotRequest } from '../lib/api/validateSnapshotRequest.ts';
import {
  loadLiveCorporateFinancingState,
  saveCorporateFinancingPreferences,
  type CorporateFinancingState,
} from '../lib/client/corporateFinancingStateStore.ts';
import { extraSharesStorageKey, parseExtraShares } from '../lib/market/extraShares.ts';

type Props = {
  ticker: string | null;
};

const EQUITY_ID_PREFIX = 'corp-equity-';

function clamp01(value: unknown, fallback = 1): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function financingDetails(): HTMLDetailsElement | null {
  const details = Array.from(document.querySelectorAll<HTMLDetailsElement>('details'));
  return details.find((item) => item.querySelector('summary')?.textContent?.includes('C CORPORATE FINANCING')) ?? null;
}

function nativeSetValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function setCheckbox(input: HTMLInputElement, checked: boolean): void {
  if (input.checked === checked) return;
  input.click();
}

function findCorporateExtraSharesInput(): HTMLInputElement | null {
  if (!financingDetails()) return null;
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[aria-label="Extra aktier"]'))
    .find((input) => input.offsetParent !== null) ?? null;
}

function applyHydratedState(state: CorporateFinancingState): boolean {
  const details = financingDetails();
  if (!details) return false;

  const plan = state.financingPlan;
  const byProject = state.financingPlanByProject ?? {};
  const equitySliders = Array.from(details.querySelectorAll<HTMLInputElement>(`input[id^="${EQUITY_ID_PREFIX}"]`));
  const savedProjectIds = Object.keys(byProject);
  if (savedProjectIds.length > 0) {
    const renderedProjectIds = new Set(equitySliders.map((slider) => slider.id.slice(EQUITY_ID_PREFIX.length)));
    if (savedProjectIds.some((projectId) => !renderedProjectIds.has(projectId))) return false;
  }

  if (plan) {
    const checkbox = details.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (checkbox) setCheckbox(checkbox, plan.use_cash_first === true);

    const cashSlider = Array.from(details.querySelectorAll<HTMLInputElement>('input[type="range"]'))
      .find((input) => !input.id.startsWith(EQUITY_ID_PREFIX));
    if (cashSlider && typeof plan.cash_use_percent === 'number' && Number.isFinite(plan.cash_use_percent)) {
      nativeSetValue(cashSlider, String(Math.round(clamp01(plan.cash_use_percent) * 100)));
    }
  }

  for (const slider of equitySliders) {
    const projectId = slider.id.slice(EQUITY_ID_PREFIX.length);
    const projectPlan = byProject?.[projectId];
    const fallback = plan?.equity_fraction;
    const equityFraction = projectPlan?.equity_fraction ?? fallback;
    if (typeof equityFraction === 'number' && Number.isFinite(equityFraction)) {
      nativeSetValue(slider, String(Math.round(clamp01(equityFraction) * 100)));
    }
  }

  const extraInput = findCorporateExtraSharesInput();
  if (extraInput && Number.isSafeInteger(state.extraShares) && state.extraShares >= 0) {
    nativeSetValue(extraInput, String(state.extraShares));
  }

  return true;
}

function readControls(ticker: string): {
  financingPlan: SnapshotRequest['financingPlan'];
  financingPlanByProject: SnapshotRequest['financingPlanByProject'];
  extraShares: number;
} | null {
  const details = financingDetails();
  if (!details) return null;

  const checkbox = details.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const cashSlider = Array.from(details.querySelectorAll<HTMLInputElement>('input[type="range"]'))
    .find((input) => !input.id.startsWith(EQUITY_ID_PREFIX));
  const equitySliders = Array.from(details.querySelectorAll<HTMLInputElement>(`input[id^="${EQUITY_ID_PREFIX}"]`));
  if (equitySliders.length === 0) return null;

  const financingPlanByProject = Object.fromEntries(equitySliders.map((slider) => {
    const projectId = slider.id.slice(EQUITY_ID_PREFIX.length);
    const equityFraction = clamp01(Number(slider.value) / 100);
    return [projectId, {
      equity_fraction: equityFraction,
      debt_fraction: 1 - equityFraction,
    }];
  }));

  const equityValues = Object.values(financingPlanByProject)
    .map((entry) => entry.equity_fraction)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const equityFraction = equityValues.length > 0
    ? equityValues.reduce((sum, value) => sum + value, 0) / equityValues.length
    : 1;

  const extraInput = findCorporateExtraSharesInput();
  const extraShares = extraInput
    ? parseExtraShares(extraInput.value)
    : parseExtraShares(window.localStorage.getItem(extraSharesStorageKey('corporate', ticker)) ?? '0');

  return {
    financingPlan: {
      equity_fraction: equityFraction,
      debt_fraction: 1 - equityFraction,
      use_cash_first: checkbox?.checked === true,
      cash_use_percent: cashSlider ? clamp01(Number(cashSlider.value) / 100) : 1,
      financingPlanByProject,
    } as SnapshotRequest['financingPlan'],
    financingPlanByProject,
    extraShares,
  };
}

export default function CorporateFinancingHydrationBridge({ ticker }: Props) {
  const [eventTicker, setEventTicker] = useState<string | null>(null);
  const effectiveTicker = (eventTicker ?? ticker)?.trim().toUpperCase() || null;
  const hydratedTickerRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onOpenTicker = (event: Event) => {
      const detail = (event as CustomEvent<{ ticker?: string }>).detail;
      const next = detail?.ticker?.trim().toUpperCase();
      if (next) setEventTicker(next);
    };
    window.addEventListener('screening:open-ticker', onOpenTicker as EventListener);
    return () => window.removeEventListener('screening:open-ticker', onOpenTicker as EventListener);
  }, []);

  useEffect(() => {
    if (ticker) setEventTicker(null);
  }, [ticker]);

  useEffect(() => {
    if (!effectiveTicker) return;
    let cancelled = false;
    let observer: MutationObserver | null = null;

    const hydrate = async () => {
      const state = await loadLiveCorporateFinancingState(effectiveTicker);
      if (cancelled || !state) {
        hydratedTickerRef.current = effectiveTicker;
        return;
      }

      const tryApply = () => {
        if (cancelled) return;
        if (applyHydratedState(state)) {
          hydratedTickerRef.current = effectiveTicker;
          observer?.disconnect();
          observer = null;
        }
      };

      tryApply();
      if (hydratedTickerRef.current !== effectiveTicker) {
        observer = new MutationObserver(tryApply);
        observer.observe(document.body, { childList: true, subtree: true });
      }
    };

    hydratedTickerRef.current = null;
    void hydrate();
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [effectiveTicker]);

  useEffect(() => {
    if (!effectiveTicker) return;

    const scheduleSave = (event: Event) => {
      if (hydratedTickerRef.current !== effectiveTicker) return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;

      const details = financingDetails();
      const isFinancingControl = !!details?.contains(target);
      const isCorporateExtraShares = findCorporateExtraSharesInput() === target;
      if (!isFinancingControl && !isCorporateExtraShares) return;

      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        const current = readControls(effectiveTicker);
        if (!current?.financingPlan) return;
        void saveCorporateFinancingPreferences({
          symbol: effectiveTicker,
          financingPlan: current.financingPlan,
          financingPlanByProject: current.financingPlanByProject,
          extraShares: current.extraShares,
        });
      }, 250);
    };

    document.addEventListener('input', scheduleSave, true);
    document.addEventListener('change', scheduleSave, true);
    return () => {
      document.removeEventListener('input', scheduleSave, true);
      document.removeEventListener('change', scheduleSave, true);
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [effectiveTicker]);

  return null;
}
