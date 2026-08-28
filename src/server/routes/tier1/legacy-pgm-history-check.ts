import { fetchLegacyCommodityHistoricalFull } from '../../../lib/prices/providers/fmp.ts';
import { getLegacySymbolForPriceKey } from '../../../lib/prices/providers/legacyCommoditySymbolMap.ts';
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

  const symbol = getLegacySymbolForPriceKey(priceKey);
  if (!symbol) {
    res.status(500).json({ ok: false, priceKey, error: 'No verified legacy symbol mapping.' });
    return;
  }

  const from = dateYearsAgo(25);
  const to = new Date().toISOString().slice(0, 10);
  try {
    const rows = await fetchLegacyCommodityHistoricalFull(symbol, { fromUtc: from, toUtc: to });
    const monthly = toMonthlyLast(rows);
    const cycle = computeTier1CycleMultiplier(rows);
    res.status(200).json({
      ok: true,
      priceKey,
      symbol,
      endpoint: `/api/v3/historical-price-full/${symbol}`,
      from,
      to,
      dailyRows: rows.length,
      monthlyObservations: monthly.length,
      firstDate: rows[0]?.date ?? null,
      lastDate: rows[rows.length - 1]?.date ?? null,
      cycle,
    });
  } catch (error) {
    res.status(500).json({ ok: false, priceKey, symbol, error: error instanceof Error ? error.message : String(error) });
  }
}
