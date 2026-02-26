import { readHistoryRowsInRange, type HistoryRow } from '../../prices/db/readHistory.ts';
import { refreshHistoryRangeToMonthlyBlobs } from '../../prices/refreshHistory.ts';
import { convertMass, convertPreciousQuantity } from '../../prices/units.ts';
import { getPriceKeyDefinition, type PriceKey } from '../../prices/keys.ts';
import type { ProjectEngineFullProductionV1Input } from '../types.ts';
import type { QtyUnit } from './schema.ts';
import type { ParsedProjectJsonV1 } from './parse.ts';

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
    from: string;
    to: string;
  },
  deps: {
    readHistoryRows?: (params: { priceKey: PriceKey; from: string; to: string }) => Promise<{ rows: HistoryRow[]; missing: boolean }>;
    refreshHistoryRows?: (params: { priceKey: PriceKey; from: string; to: string }) => Promise<{ monthsTouched: number }>;
    allowRefresh?: boolean;
    onWarning?: (warning: string) => void;
    projectId?: string;
  } = {},
): Promise<ProjectEngineFullProductionV1Input> {
  const { parsed, from, to } = args;
  const readHistoryRows = deps.readHistoryRows ?? ((params) => readHistoryRowsInRange(params));
  const refreshHistoryRows = deps.refreshHistoryRows ?? ((params) => refreshHistoryRangeToMonthlyBlobs(params));
  const allowRefresh = deps.allowRefresh === true;

  const emitWarning = (warning: string) => {
    if (deps.onWarning) {
      deps.onWarning(warning);
    }
  };

  const emitMissingTargetWarnings = (args: {
    projectId: string;
    metal: string;
    priceKey: string;
    targets: string[];
    series: Array<number | null>;
  }) => {
    for (let i = 0; i < args.targets.length; i += 1) {
      if (args.series[i] !== null) {
        continue;
      }
      emitWarning(
        `No price coverage for project ${args.projectId}, metal ${args.metal}, priceKey ${args.priceKey}, targetDate ${args.targets[i]} (no close <= target date).`,
      );
    }
  };

  const readHistoryWithOptionalRefresh = async (params: { priceKey: PriceKey; metal: string }): Promise<HistoryRow[]> => {
    let history = await readHistoryRows({
      priceKey: params.priceKey,
      from,
      to,
    });

    if (history.missing && allowRefresh) {
      await refreshHistoryRows({
        priceKey: params.priceKey,
        from,
        to,
      });
      history = await readHistoryRows({
        priceKey: params.priceKey,
        from,
        to,
      });
    }

    if (history.missing && !allowRefresh) {
      emitWarning(
        `Missing price history months for project ${deps.projectId ?? 'unknown'}, metal ${params.metal}, priceKey ${params.priceKey} in range ${from}..${to}.`,
      );
    }

    return history.rows;
  };

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

    const historyRows = await readHistoryWithOptionalRefresh({ priceKey: priceKey as PriceKey, metal });
    const spotSeries = resolveSeriesAtTargets(historyRows, targets);
    spotPriceUSDByMetal[metal] = spotSeries;
    emitMissingTargetWarnings({
      projectId: deps.projectId ?? 'unknown',
      metal,
      priceKey,
      targets,
      series: spotSeries,
    });
  }

  const auPriceKey = parsed.engineInputWithoutPrices.auPriceKey;
  const auHistoryRows = await readHistoryWithOptionalRefresh({
    priceKey: auPriceKey as PriceKey,
    metal: 'AuEq',
  });
  let auPriceUSDPerOz = resolveSeriesAtTargets(auHistoryRows, targets);
  emitMissingTargetWarnings({
    projectId: deps.projectId ?? 'unknown',
    metal: 'AuEq',
    priceKey: auPriceKey,
    targets,
    series: auPriceUSDPerOz,
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
    ...(usedFallbackDateMapping ? { meta: { usedFallbackDateMapping: true } } : {}),
  };
}
