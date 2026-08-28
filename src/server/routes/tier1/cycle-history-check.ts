import type { PriceKey } from '../../../lib/prices/keys.ts';
import { readHistoryRowsInRange } from '../../../lib/prices/db/readHistory.ts';
import { refreshHistoryRangeToMonthlyBlobs } from '../../../lib/prices/refreshHistory.ts';
import { computeTier1CycleMultiplier, toMonthlyLast } from '../../../lib/tier1/cycle.ts';

const ALLOWED = new Set(['XPT_USD_TOZ', 'XPD_USD_TOZ']);

function dateYearsAgo(yearsAgo: number): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - yearsAgo);
  return date.toISOString().slice(0, 10);
}

export default async function handler(req: any, res: any): Promise<void> {
  const priceKey = String(req.query?.priceKey ?? '').trim().toUpperCase();
  if (!ALLOWED.has(priceKey)) {
    res.status(400).json({ ok: false, error: 'priceKey must be XPT_USD_TOZ or XPD_USD_TOZ' });
    return;
  }
  const from = dateYearsAgo(25);
  const to = new Date().toISOString().slice(0, 10);
  try {
    const before = await readHistoryRowsInRange({ priceKey: priceKey as PriceKey, from, to });
    const monthlyBefore = toMonthlyLast(before.rows).length;
    let refreshError: string | null = null;
    try {
      await refreshHistoryRangeToMonthlyBlobs({ priceKey: priceKey as PriceKey, from, to });
    } catch (error) {
      refreshError = error instanceof Error ? error.message : String(error);
    }
    const after = await readHistoryRowsInRange({ priceKey: priceKey as PriceKey, from, to });
    const monthly = toMonthlyLast(after.rows);
    const cycle = computeTier1CycleMultiplier(after.rows);
    res.status(200).json({
      ok: true,
      priceKey,
      from,
      to,
      monthlyBefore,
      monthlyAfter: monthly.length,
      firstMonth: monthly[0]?.date ?? null,
      lastMonth: monthly[monthly.length - 1]?.date ?? null,
      refreshError,
      cycle,
    });
  } catch (error) {
    res.status(500).json({ ok: false, priceKey, error: error instanceof Error ? error.message : String(error) });
  }
}
