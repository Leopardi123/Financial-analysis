import type { ManualMetalPriceEntry } from './resolveMetalPrice.ts';

const STORAGE_KEY = 'manualMetalPriceStore.v1';

function readStorage(): Record<string, ManualMetalPriceEntry> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ManualMetalPriceEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(next: Record<string, ManualMetalPriceEntry>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function getManualMetalPrice(metalKey: string): ManualMetalPriceEntry | null {
  const store = readStorage();
  return store[metalKey] ?? null;
}

export function getManualMetalPriceStore(): Record<string, ManualMetalPriceEntry> {
  return readStorage();
}

export function saveManualMetalPrice(args: {
  metalKey: string;
  displayName: string;
  unit: string | null;
  value: number;
  enteredAtUtc?: string;
}): ManualMetalPriceEntry {
  const enteredAtUtc = args.enteredAtUtc ?? new Date().toISOString();
  const expiresAt = new Date(enteredAtUtc);
  expiresAt.setMonth(expiresAt.getMonth() + 1);

  const entry: ManualMetalPriceEntry = {
    metalKey: args.metalKey,
    displayName: args.displayName,
    unit: args.unit,
    value: args.value,
    enteredAtUtc,
    expiresAtUtc: expiresAt.toISOString(),
  };

  const store = readStorage();
  store[args.metalKey] = entry;
  writeStorage(store);
  return entry;
}
