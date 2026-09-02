import { readHistoryRowsInRange } from '../src/lib/prices/db/readHistory.ts';
import { getPriceKeyDefinition, type PriceKey } from '../src/lib/prices/keys.ts';
import { analyzeRecentSustainedLows } from '../src/lib/tier1/recentSustainedLow.ts';

const SERIES = [
  'XAU_USD_TOZ',
  'XAG_USD_TOZ',
  'XPT_USD_TOZ',
  'XPD_USD_TOZ',
  'CU_USD_LB',
  'ZN_USD_LB',
  'PB_USD_LB',
  'NI_USD_LB',
  'MO_USD_TONNE',
] as const;

function dateYearsAgo(to: string, yearsAgo: number): string {
  const date = new Date(`${to}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - yearsAgo);
  return date.toISOString().slice(0, 10);
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const to = new Date().toISOString().slice(0, 10);
  const configurations = [7, 10] as const;
  const results: Record<string, unknown> = {};

  for (const priceKey of SERIES) {
    const byLookback: Record<string, unknown> = {};
    for (const lookbackYears of configurations) {
      const from = dateYearsAgo(to, lookbackYears);
      try {
        const history = await readHistoryRowsInRange({ priceKey: priceKey as PriceKey, from, to });
        const analysis = analyzeRecentSustainedLows(history.rows, {
          lookbackYears,
          rollingMonths: 6,
          minimumSeparationMonths: 12,
          selectedLowCount: 3,
        });
        byLookback[String(lookbackYears)] = {
          ...analysis,
          from,
          to,
          missingMonths: history.missing,
        };
      } catch (error) {
        byLookback[String(lookbackYears)] = {
          status: 'NOT_VERIFIED',
          from,
          to,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    results[priceKey] = {
      unit: getPriceKeyDefinition(priceKey).canonicalUnit,
      lookbacks: byLookback,
    };
  }

  res.status(200).json({
    ok: true,
    diagnosticOnly: true,
    tierRuntimeChanged: false,
    method: 'Recent sustained low diagnostic: 6-month rolling average; choose the three lowest observations separated by at least 12 months; stress price is their median.',
    generatedAtUtc: new Date().toISOString(),
    results,
  });
}
