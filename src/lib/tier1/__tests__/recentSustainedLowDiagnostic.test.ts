import { readHistoryRowsInRange } from '../../prices/db/readHistory.ts';
import { getPriceKeyDefinition, type PriceKey } from '../../prices/keys.ts';
import { toMonthlyLast, type PriceHistoryRow } from '../cycle.ts';

const LOOKBACK_YEARS = 10;
const ROLLING_MONTHS = 6;
const MIN_SEPARATION_MONTHS = 12;
const LOW_COUNT = 3;
const TO = '2026-09-02';
const FROM = '2016-09-02';

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

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function monthOrdinal(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return year * 12 + month - 1;
}

function rollingAverages(monthly: PriceHistoryRow[]): Array<{ date: string; value: number }> {
  const result: Array<{ date: string; value: number }> = [];
  for (let index = ROLLING_MONTHS - 1; index < monthly.length; index += 1) {
    const window = monthly.slice(index - ROLLING_MONTHS + 1, index + 1);
    if (window.length !== ROLLING_MONTHS) continue;
    result.push({ date: monthly[index].date, value: mean(window.map((row) => row.close)) });
  }
  return result;
}

function chooseSeparatedLows(points: Array<{ date: string; value: number }>): Array<{ date: string; value: number }> {
  const sorted = [...points].sort((a, b) => a.value - b.value || a.date.localeCompare(b.date));
  const selected: Array<{ date: string; value: number }> = [];
  for (const point of sorted) {
    if (selected.every((existing) => Math.abs(monthOrdinal(point.date) - monthOrdinal(existing.date)) >= MIN_SEPARATION_MONTHS)) {
      selected.push(point);
      if (selected.length === LOW_COUNT) break;
    }
  }
  return selected.sort((a, b) => a.date.localeCompare(b.date));
}

function displayValue(priceKey: string, value: number): string {
  const unit = getPriceKeyDefinition(priceKey).canonicalUnit;
  if (unit === 'USD_per_lb') return `${value.toFixed(3)} USD/lb`;
  if (unit === 'USD_per_toz') return `${value.toFixed(2)} USD/toz`;
  if (unit === 'USD_per_tonne') return `${value.toFixed(0)} USD/tonne`;
  return String(value);
}

(async function runRecentSustainedLowDiagnostic() {
  console.log(`RECENT SUSTAINED LOW DIAGNOSTIC — ${LOOKBACK_YEARS}y history, ${ROLLING_MONTHS}m rolling mean, ${MIN_SEPARATION_MONTHS}m minimum separation, median of ${LOW_COUNT} lows`);
  console.log(`Window: ${FROM} → ${TO}`);

  let unavailable = 0;
  for (const priceKey of SERIES) {
    try {
      const history = await readHistoryRowsInRange({ priceKey: priceKey as PriceKey, from: FROM, to: TO });
      const monthly = toMonthlyLast(history.rows);
      const points = rollingAverages(monthly);
      const lows = chooseSeparatedLows(points);
      if (lows.length < LOW_COUNT) {
        unavailable += 1;
        console.log(`${priceKey}: N/A — ${monthly.length} monthly observations, only ${lows.length} separated lows; missingMonths=${history.missing}`);
        continue;
      }
      const stress = median(lows.map((point) => point.value));
      console.log(`${priceKey}: stress=${displayValue(priceKey, stress)} | lows=${lows.map((point) => `${point.date.slice(0, 7)} ${displayValue(priceKey, point.value)}`).join(' ; ')} | monthly=${monthly.length} | missingMonths=${history.missing}`);
    } catch (error) {
      unavailable += 1;
      console.log(`${priceKey}: N/A — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Diagnostic complete. unavailable=${unavailable}/${SERIES.length}. No Tier policy/runtime values were changed.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
