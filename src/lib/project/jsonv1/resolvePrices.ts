import { readHistoryRowsInRange, type HistoryRow } from '../../prices/db/readHistory.ts';
import { convertMass, convertPreciousQuantity } from '../../prices/units.ts';
import { getPriceKeyDefinition, type PriceKey } from '../../prices/keys.ts';
import type { ProjectEngineFullProductionV1Input } from '../types.ts';
import type { QtyUnit } from './schema.ts';
import type { ParsedProjectJsonV1 } from './parse.ts';

export type PriceScenario =
  | { mode: 'spot' }
  | { mode: 'percentile'; lookbackYears: number; percentile: number }
  | { mode: 'fixed'; fixedPriceByKey: Record<string, number> };

function resolveSeriesAtTargets(rows: HistoryRow[], targets: string[]): Array<number | null> {
  const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const series: Array<number | null> = [];
  let cursor = 0;
  let latest: number | null = null;

  for (const target of targets) {
    while (cursor < sortedRows.length && sortedRows[cursor].date <= target) {
      latest = sortedRows[cursor].close;
      cursor += 1;
    }
    series.push(latest);
  }

  return series;
}

function subtractUtcYears(dateStr: string, years: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function resolvePercentileSeriesAtTargets(args: {
  rows: HistoryRow[];
  targets: string[];
  lookbackYears: number;
  percentile: number;
}): Array<number | null> {
  const sortedRows = [...args.rows].sort((a, b) => a.date.localeCompare(b.date));
  const p = args.percentile / 100;

  return args.targets.map((target) => {
    const windowStart = subtractUtcYears(target, args.lookbackYears);
    const closes = sortedRows
      .filter((row) => row.date >= windowStart && row.date <= target)
      .map((row) => row.close)
      .sort((a, b) => a - b);

    if (closes.length === 0) {
      return null;
    }

    const index = Math.floor(p * (closes.length - 1));
    return closes[index];
  });
}

function canonicalQtyUnitFromPriceKey(priceKey: string): 'toz' | 'lb' | 'tonne' {
  const unit = getPriceKeyDefinition(priceKey).canonicalUnit;
  if (unit === 'USD_per_toz') {
    return 'toz';
  }
  if (unit === 'USD_per_lb') {
    return 'lb';
  }
  if (unit === 'USD_per_tonne') {
    return 'tonne';
  }
  throw new Error(`Price key ${priceKey} is not a commodity price`);
}

function convertQty(value: number | null, from: QtyUnit, to: 'toz' | 'lb' | 'tonne'): number | null {
  if (value === null) {
    return null;
  }

  if (from === to) {
    return value;
  }

  if ((from === 'toz' || from === 'g' || from === 'kg') && to === 'toz') {
    return convertPreciousQuantity(value, from, 'toz');
  }

  if ((from === 'lb' || from === 'tonne' || from === 'short_ton' || from === 'long_ton' || from === 'kg') && (to === 'lb' || to === 'tonne')) {
    return convertMass(value, from, to);
  }

  throw new Error(`Cannot convert quantity from ${from} to ${to}`);
}

function mapQtySeriesToCanonical(args: {
  qtySeries: Array<number | null>;
  fromUnit: QtyUnit;
  toUnit: 'toz' | 'lb' | 'tonne';
  metal: string;
}): Array<number | null> {
  return args.qtySeries.map((value, index) => {
    const converted = convertQty(value, args.fromUnit, args.toUnit);
    if (converted === null && value !== null) {
      throw new Error(`Failed quantity conversion for ${args.metal}[${index}] from ${args.fromUnit} to ${args.toUnit}`);
    }
    return converted;
  });
}

export async function resolveProjectPricesToEngineInput(
  args: {
    parsed: ParsedProjectJsonV1;
    scenario?: PriceScenario;
    from?: string;
    to?: string;
    allowRefresh?: boolean;
  },
  deps: {
    readHistoryRows?: (params: { priceKey: PriceKey; from: string; to: string }) => Promise<{ rows: HistoryRow[]; missing: boolean }>;
  } = {},
): Promise<ProjectEngineFullProductionV1Input & { diagnostics?: { warnings: string[] } }> {
  const { parsed, from, to } = args;
  const readHistoryRows = deps.readHistoryRows ?? ((params) => readHistoryRowsInRange(params));
  const scenario = args.scenario ?? { mode: 'spot' };
  const warnings: string[] = [];

  const masterN = parsed.engineInputWithoutPrices.masterN;
  const len = masterN + 1;
  const targets = parsed.engineInputWithoutPrices.periodEndDatesUtc
    ? [...parsed.engineInputWithoutPrices.periodEndDatesUtc]
    : Array.from({ length: len }, (_item, t) => {
        const date = new Date(`${from}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + t * 365);
        return date.toISOString().slice(0, 10);
      });

  const spotPriceUSDByMetal: Record<string, Array<number | null>> = {};
  const payableQtyByMetalCanonical: Record<string, Array<number | null>> = {};

  const fallbackFrom = targets.length > 0 ? targets[0] : '1970-01-01';
  const fallbackTo = targets.length > 0 ? targets[targets.length - 1] : fallbackFrom;

  for (const [metal, qtySeries] of Object.entries(parsed.engineInputWithoutPrices.payableQtyByMetal)) {
    const priceKey = parsed.engineInputWithoutPrices.priceKeyByMetal[metal];
    if (!priceKey) {
      throw new Error(`Missing priceKeyByMetal for metal ${metal}`);
    }

    const targetQtyUnit = canonicalQtyUnitFromPriceKey(priceKey);
    const sourceQtyUnit = parsed.engineInputWithoutPrices.payableQtyUnitByMetal[metal];
    payableQtyByMetalCanonical[metal] = mapQtySeriesToCanonical({
      qtySeries,
      fromUnit: sourceQtyUnit,
      toUnit: targetQtyUnit,
      metal,
    });

    const historyFrom = scenario.mode === 'percentile'
      ? subtractUtcYears(from ?? fallbackFrom, scenario.lookbackYears)
      : (from ?? fallbackFrom);
    const history = await readHistoryRows({
      priceKey: priceKey as PriceKey,
      from: historyFrom,
      to: to ?? fallbackTo,
    });
    if (scenario.mode === 'spot') {
      spotPriceUSDByMetal[metal] = resolveSeriesAtTargets(history.rows, targets);
    } else if (scenario.mode === 'percentile') {
      spotPriceUSDByMetal[metal] = resolvePercentileSeriesAtTargets({
        rows: history.rows,
        targets,
        lookbackYears: scenario.lookbackYears,
        percentile: scenario.percentile,
      });
    } else {
      const fixed = scenario.fixedPriceByKey[priceKey];
      spotPriceUSDByMetal[metal] = targets.map(() => (Number.isFinite(fixed) && fixed > 0 ? fixed : null));
    }

    spotPriceUSDByMetal[metal].forEach((value, index) => {
      if (value !== null) {
        return;
      }

      const periodEndDate = targets[index] ?? 'unknown-date';
      const reason = scenario.mode === 'fixed'
        ? `Missing fixed price for key ${priceKey}`
        : scenario.mode === 'percentile'
          ? `No closes in trailing ${scenario.lookbackYears}y window`
          : 'No close on or before period end';

      warnings.push(`projectId=unknown metal=${metal} key=${priceKey} periodEndDate=${periodEndDate} mode=${scenario.mode} reason=${reason}`);
    });
  }

  let auPriceUSDPerOz: Array<number | null>;

  if (scenario.mode === 'fixed') {
    const fixed = scenario.fixedPriceByKey[parsed.engineInputWithoutPrices.auPriceKey];
    auPriceUSDPerOz = targets.map(() => (Number.isFinite(fixed) && fixed > 0 ? fixed : null));
  } else {
    const auHistoryFrom = scenario.mode === 'percentile'
      ? subtractUtcYears(from ?? fallbackFrom, scenario.lookbackYears)
      : (from ?? fallbackFrom);
    const auHistory = await readHistoryRows({
      priceKey: parsed.engineInputWithoutPrices.auPriceKey as PriceKey,
      from: auHistoryFrom,
      to: to ?? fallbackTo,
    });
    auPriceUSDPerOz = scenario.mode === 'percentile'
      ? resolvePercentileSeriesAtTargets({
          rows: auHistory.rows,
          targets,
          lookbackYears: scenario.lookbackYears,
          percentile: scenario.percentile,
        })
      : resolveSeriesAtTargets(auHistory.rows, targets);
  }

  auPriceUSDPerOz.forEach((value, index) => {
    if (value !== null) {
      return;
    }
    const periodEndDate = targets[index] ?? 'unknown-date';
    const reason = scenario.mode === 'fixed'
      ? `Missing fixed price for key ${parsed.engineInputWithoutPrices.auPriceKey}`
      : scenario.mode === 'percentile'
        ? `No closes in trailing ${scenario.lookbackYears}y window`
        : 'No close on or before period end';
    warnings.push(`projectId=unknown metal=Au key=${parsed.engineInputWithoutPrices.auPriceKey} periodEndDate=${periodEndDate} mode=${scenario.mode} reason=${reason}`);
  });

  if (parsed.priceOverrides.spotPriceUSDByMetal) {
    for (const [metal, series] of Object.entries(parsed.priceOverrides.spotPriceUSDByMetal)) {
      spotPriceUSDByMetal[metal] = [...series];
    }
  }

  if (parsed.priceOverrides.auPriceUSDPerOz) {
    auPriceUSDPerOz = [...parsed.priceOverrides.auPriceUSDPerOz];
  }

  const usedFallbackDateMapping = parsed.engineInputWithoutPrices.periodEndDatesUtc === undefined;

  return {
    masterN,
    streamsByMetal: parsed.engineInputWithoutPrices.streamsByMetal,
    payableQtyByMetal: payableQtyByMetalCanonical,
    spotPriceUSDByMetal,
    takeItems: parsed.engineInputWithoutPrices.takeItems,
    phase1: parsed.engineInputWithoutPrices.phase1,
    phase2: parsed.engineInputWithoutPrices.phase2,
    aisc: {
      auPriceUSDPerOz,
    },
    ...(warnings.length > 0 ? { diagnostics: { warnings } } : {}),
    ...(usedFallbackDateMapping ? { meta: { usedFallbackDateMapping: true } } : {}),
  };
}
