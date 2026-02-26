import { convertMass, convertPreciousQuantity } from '../../prices/units.js';
import { getPriceKeyDefinition } from '../../prices/keys.js';
import type { ProjectEngineFullProductionV1Input } from '../types.js';
import type { QtyUnit } from './schema.js';
import type { ParsedProjectJsonV1 } from './parse.js';
import { resolvePriceSeries, type PriceScenario as CorePriceScenario } from '../../prices/resolve.js';

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

export async function resolveProjectPricesToEngineInput(
  args: {
    parsed: ParsedProjectJsonV1;
    scenario?: PriceScenario;
    from?: string;
    to?: string;
    allowRefresh?: boolean;
  },
  deps: { resolvePriceSeriesFn?: typeof resolvePriceSeries } = {},
): Promise<ProjectEngineFullProductionV1Input & { diagnostics?: { warnings: string[] } }> {
  const { parsed, from } = args;
  const resolvePriceSeriesFn = deps.resolvePriceSeriesFn ?? resolvePriceSeries;
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
      anchorDatesUtc: targets,
      scenario: coreScenario,
      allowRefresh: args.allowRefresh === true,
    });
    spotPriceUSDByMetal[metal] = resolved.values;

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

      warnings.push(`projectId=unknown metal=${metal} key=${priceKey} date=${periodEndDate} mode=${scenario.mode} reason=${reason}`);
    });
  }

  let auPriceUSDPerOz: Array<number | null>;

  {
    const coreScenario: CorePriceScenario = scenario.mode === 'fixed'
      ? { mode: 'fixed', fixedByKey: scenario.fixedPriceByKey }
      : scenario;
    const resolvedAu = await resolvePriceSeriesFn({
      price_key: parsed.engineInputWithoutPrices.auPriceKey,
      anchorDatesUtc: targets,
      scenario: coreScenario,
      allowRefresh: args.allowRefresh === true,
    });
    auPriceUSDPerOz = resolvedAu.values;
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
    warnings.push(`projectId=unknown metal=Au key=${parsed.engineInputWithoutPrices.auPriceKey} date=${periodEndDate} mode=${scenario.mode} reason=${reason}`);
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
