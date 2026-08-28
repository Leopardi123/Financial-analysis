import type { PriceKey } from '../../../lib/prices/keys.ts';
import { readHistoryRowsInRange } from '../../../lib/prices/db/readHistory.ts';
import { refreshHistoryRangeToMonthlyBlobs } from '../../../lib/prices/refreshHistory.ts';
import { getLegacySymbolForPriceKey } from '../../../lib/prices/providers/legacyCommoditySymbolMap.ts';
import { computeTier1CycleMultiplier, toMonthlyLast } from '../../../lib/tier1/cycle.ts';

const ALLOWED = ['XPT_USD_TOZ', 'XPD_USD_TOZ'] as const;

function dateYearsAgo(yearsAgo: number): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - yearsAgo);
  return date.toISOString().slice(0, 10);
}

async function check(priceKey: (typeof ALLOWED)[number], from: string, to: string): Promise<Record<string, unknown>> {
  const symbol = getLegacySymbolForPriceKey(priceKey);
  if (!symbol) return { ok: false, priceKey, error: 'No verified legacy symbol mapping.' };
  try {
    const before = await readHistoryRowsInRange({ priceKey: priceKey as PriceKey, from, to });
    const monthlyBefore = toMonthlyLast(before.rows).length;
    const refreshed = await refreshHistoryRangeToMonthlyBlobs({ priceKey: priceKey as PriceKey, from, to });
    const after = await readHistoryRowsInRange({ priceKey: priceKey as PriceKey, from, to });
    const monthly = toMonthlyLast(after.rows);
    return {
      ok: true,
      priceKey,
      verifiedLegacySymbol: symbol,
      legacyEndpoint: `/api/v3/historical-price-full/${symbol}`,
      monthlyBefore,
      monthsTouched: refreshed.monthsTouched,
      monthlyAfter: monthly.length,
      firstDate: after.rows[0]?.date ?? null,
      lastDate: after.rows[after.rows.length - 1]?.date ?? null,
      cycle: computeTier1CycleMultiplier(after.rows),
    };
  } catch (error) {
    return { ok: false, priceKey, verifiedLegacySymbol: symbol, error: error instanceof Error ? error.message : String(error) };
  }
}

export default async function handler(req: any, res: any): Promise<void> {
  const from = dateYearsAgo(25);
  const to = new Date().toISOString().slice(0, 10);
  const results = await Promise.all(ALLOWED.map((key) => check(key, from, to)));
  res.status(200).json({ ok: true, from, to, results });
}
