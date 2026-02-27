import { convertMass, convertPreciousQuantity } from '../../prices/units.ts';
import { getPriceKeyDefinition } from '../../prices/keys.ts';
import type { ProjectEngineFullProductionV1Input } from '../types.ts';
import type { QtyUnit } from './schema.ts';
import type { ParsedProjectJsonV1 } from './parse.ts';
import { resolvePriceSeries, type PriceScenario as CorePriceScenario } from '../../prices/resolve.ts';

export type PriceScenario =
  | { mode: 'spot' }
  | { mode: 'percentile'; lookbackYears: number; percentile: number }
  | { mode: 'fixed'; fixedPriceByKey: Record<string, number> };


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

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function resolveProjectPricesToEngineInput(
  args: {
    parsed: ParsedProjectJsonV1;
    scenario?: PriceScenario;
    from?: string;
    to?: string;
    allowRefresh?: boolean;
    projectId?: string;
    spotAnchorDateUtc?: string;
  },
  deps: { resolvePriceSeriesFn?: typeof resolvePriceSeries } = {},
): Promise<ProjectEngineFullProductionV1Input & { diagnostics?: { warnings: string[] } }> {
  const { parsed, from } = args;
  const resolvePriceSeriesFn = deps.resolvePriceSeriesFn ?? resolvePriceSeries;
  const scenario = args.scenario ?? { mode: 'spot' };
  const warnings: string[] = [];
  const projectId = args.projectId ?? 'unknown';

  const masterN = parsed.engineInputWithoutPrices.masterN;
  const len = masterN + 1;
  const targets = parsed.engineInputWithoutPrices.periodEndDatesUtc
    ? [...parsed.engineInputWithoutPrices.periodEndDatesUtc]
    : Array.from({ length: len }, (_item, t) => {
        const date = new Date(`${from}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + t * 365);
        return date.toISOString().slice(0, 10);
      });
  const fallbackAnchorDateUtc = targets[0] ?? from;
  const todayUtc = todayUtcDateString();
  const spotAnchorDateUtc = scenario.mode === 'spot'
    ? ((args.spotAnchorDateUtc ?? fallbackAnchorDateUtc ?? todayUtc) > todayUtc
        ? todayUtc
        : (args.spotAnchorDateUtc ?? fallbackAnchorDateUtc ?? todayUtc))
    : '';

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

    const coreScenario: CorePriceScenario = scenario.mode === 'fixed'
      ? { mode: 'fixed', fixedByKey: scenario.fixedPriceByKey }
      : scenario;
    const resolved = await resolvePriceSeriesFn({
      price_key: priceKey,
      anchorDatesUtc: scenario.mode === 'spot' ? [spotAnchorDateUtc] : targets,
      scenario: coreScenario,
      allowRefresh: args.allowRefresh === true,
    });
    const resolvedValues = scenario.mode === 'spot'
      ? new Array(len).fill(resolved.values[0] ?? null)
      : resolved.values;
    spotPriceUSDByMetal[metal] = resolvedValues;

    if (scenario.mode === 'spot') {
      if (spotPriceUSDByMetal[metal].some((value) => value === null)) {
        warnings.push(`projectId=${projectId} metal=${metal} key=${priceKey} date=${spotAnchorDateUtc} mode=spot reason=No close on or before anchor date`);
      }
      continue;
    }

    spotPriceUSDByMetal[metal].forEach((value, index) => {
      if (value !== null) {
        return;
      }

      const periodEndDate = targets[index] ?? 'unknown-date';
      const reason = scenario.mode === 'fixed'
        ? `Missing fixed price for key ${priceKey}`
        : `No closes in trailing ${scenario.lookbackYears}y window`;

      warnings.push(`projectId=${projectId} metal=${metal} key=${priceKey} date=${periodEndDate} mode=${scenario.mode} reason=${reason}`);
    });
  }

  let auPriceUSDPerOz: Array<number | null>;

  {
    const coreScenario: CorePriceScenario = scenario.mode === 'fixed'
      ? { mode: 'fixed', fixedByKey: scenario.fixedPriceByKey }
      : scenario;
    const resolvedAu = await resolvePriceSeriesFn({
      price_key: parsed.engineInputWithoutPrices.auPriceKey,
      anchorDatesUtc: scenario.mode === 'spot' ? [spotAnchorDateUtc] : targets,
      scenario: coreScenario,
      allowRefresh: args.allowRefresh === true,
    });
    auPriceUSDPerOz = scenario.mode === 'spot'
      ? new Array(len).fill(resolvedAu.values[0] ?? null)
      : resolvedAu.values;
  }

  if (scenario.mode === 'spot') {
    if (auPriceUSDPerOz.some((value) => value === null)) {
      warnings.push(`projectId=${projectId} metal=Au key=${parsed.engineInputWithoutPrices.auPriceKey} date=${spotAnchorDateUtc} mode=spot reason=No close on or before anchor date`);
    }
  } else {
    auPriceUSDPerOz.forEach((value, index) => {
      if (value !== null) {
        return;
      }
      const periodEndDate = targets[index] ?? 'unknown-date';
      const reason = scenario.mode === 'fixed'
        ? `Missing fixed price for key ${parsed.engineInputWithoutPrices.auPriceKey}`
        : `No closes in trailing ${scenario.lookbackYears}y window`;
      warnings.push(`projectId=${projectId} metal=Au key=${parsed.engineInputWithoutPrices.auPriceKey} date=${periodEndDate} mode=${scenario.mode} reason=${reason}`);
    });
  }

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
