import { resolvePriceSeries } from '../prices/resolve.ts';
import { convertPriceToCanonical } from '../prices/units/convert.ts';
import { validateProducerRunContext } from './schema.ts';
import type { ProducerJsonV1, ProducerRunContext, ReportedPriceDeck } from './types.ts';

export type ProducerCanonicalPriceUnit = 'USD_per_toz' | 'USD_per_tonne';

export type ProducerMetalPrice = {
  metal: string;
  valueUSD: number | null;
  unit: ProducerCanonicalPriceUnit;
  priceKey?: string;
  readiness: 'production_ready' | 'proxy_or_unverified' | 'explicit_input';
};

export type ResolvedProducerPriceDeck = {
  id: string;
  mode: ProducerRunContext['priceMode'];
  valuationDateUtc: string;
  pricesByMetal: Record<string, ProducerMetalPrice>;
  warnings: string[];
  sourceReportedDeckId?: string;
};

export type ExplicitLongTermPriceDeck = {
  id: string;
  pricesByMetal: Record<string, { value: number; unit: string }>;
};

type SpotMetalSpec = {
  priceKey: string;
  sourceUnit: string;
  canonicalUnit: ProducerCanonicalPriceUnit;
  productionReady: boolean;
  priceType: 'market' | 'monthly-benchmark';
  readinessReason?: string;
};

const SPOT_METAL_SPECS: Record<string, SpotMetalSpec> = {
  Au: {
    priceKey: 'XAU_USD_TOZ',
    sourceUnit: 'USD_per_toz',
    canonicalUnit: 'USD_per_toz',
    productionReady: true,
    priceType: 'market',
  },
  Ag: {
    priceKey: 'XAG_USD_TOZ',
    sourceUnit: 'USD_per_toz',
    canonicalUnit: 'USD_per_toz',
    productionReady: true,
    priceType: 'market',
  },
  Pt: {
    priceKey: 'XPT_USD_TOZ',
    sourceUnit: 'USD_per_toz',
    canonicalUnit: 'USD_per_toz',
    productionReady: true,
    priceType: 'market',
  },
  Pd: {
    priceKey: 'XPD_USD_TOZ',
    sourceUnit: 'USD_per_toz',
    canonicalUnit: 'USD_per_toz',
    productionReady: true,
    priceType: 'market',
  },
  Cu: {
    priceKey: 'CU_USD_LB',
    sourceUnit: 'USD_per_lb',
    canonicalUnit: 'USD_per_tonne',
    productionReady: true,
    priceType: 'market',
  },
  Al: {
    priceKey: 'AL_USD_TONNE',
    sourceUnit: 'USD_per_tonne',
    canonicalUnit: 'USD_per_tonne',
    productionReady: true,
    priceType: 'market',
  },
  Zn: {
    priceKey: 'ZN_USD_LB',
    sourceUnit: 'USD_per_lb',
    canonicalUnit: 'USD_per_tonne',
    productionReady: true,
    priceType: 'monthly-benchmark',
  },
  Pb: {
    priceKey: 'PB_USD_LB',
    sourceUnit: 'USD_per_lb',
    canonicalUnit: 'USD_per_tonne',
    productionReady: true,
    priceType: 'monthly-benchmark',
  },
  Ni: {
    priceKey: 'NI_USD_LB',
    sourceUnit: 'USD_per_lb',
    canonicalUnit: 'USD_per_tonne',
    productionReady: true,
    priceType: 'monthly-benchmark',
  },
};

function uniqueMetals(metals: readonly string[]): string[] {
  return [...new Set(metals)].sort();
}

function commercialTermMetals(producer: ProducerJsonV1): string[] {
  return producer.projects.flatMap((project) => (project.metalStreams ?? []).map((stream) => stream.metal));
}

function normalizeExplicitPrice(
  metal: string,
  input: { value: number; unit: string } | undefined,
): { price: ProducerMetalPrice; warning?: string } {
  const spec = SPOT_METAL_SPECS[metal];
  const canonicalUnit = spec?.canonicalUnit;
  if (!canonicalUnit) {
    return {
      price: { metal, valueUSD: null, unit: 'USD_per_tonne', readiness: 'explicit_input' },
      warning: `Unsupported metal ${metal}; canonical Producer price unit is not registered`,
    };
  }
  if (!input || !Number.isFinite(input.value)) {
    return {
      price: { metal, valueUSD: null, unit: canonicalUnit, readiness: 'explicit_input' },
      warning: `Missing explicit price for ${metal}`,
    };
  }
  try {
    const valueUSD = convertPriceToCanonical({
      value: input.value,
      fromUnit: input.unit,
      canonicalUnit,
    });
    return { price: { metal, valueUSD, unit: canonicalUnit, readiness: 'explicit_input' } };
  } catch (error) {
    return {
      price: { metal, valueUSD: null, unit: canonicalUnit, readiness: 'explicit_input' },
      warning: error instanceof Error ? `${metal}: ${error.message}` : `${metal}: unsupported price unit`,
    };
  }
}

function selectReportedDeck(producer: ProducerJsonV1, reportedPriceDeckId?: string): ReportedPriceDeck | null {
  const decks = producer.reportedPriceDecks ?? [];
  if (reportedPriceDeckId) {
    return decks.find((deck) => deck.id === reportedPriceDeckId) ?? null;
  }
  return decks.length === 1 ? decks[0] : null;
}

export async function resolveProducerPriceDeck(
  args: {
    producer: ProducerJsonV1;
    context: ProducerRunContext;
    metals: readonly string[];
    ltDeck?: ExplicitLongTermPriceDeck;
    reportedPriceDeckId?: string;
    allowNonProductionReadySpotKeys?: boolean;
  },
  deps: { resolvePriceSeriesFn?: typeof resolvePriceSeries } = {},
): Promise<ResolvedProducerPriceDeck> {
  validateProducerRunContext(args.context);
  if (args.producer.valuation.valuationDateUtc !== args.context.valuationDateUtc) {
    throw new Error(
      `Producer valuationDateUtc ${args.producer.valuation.valuationDateUtc} does not match run context ${args.context.valuationDateUtc}`,
    );
  }

  const metals = uniqueMetals([...args.metals, ...commercialTermMetals(args.producer)]);
  const warnings: string[] = [];
  const pricesByMetal: Record<string, ProducerMetalPrice> = {};
  const resolvePriceSeriesFn = deps.resolvePriceSeriesFn ?? resolvePriceSeries;

  if (args.context.priceMode === 'SPOT') {
    for (const metal of metals) {
      const spec = SPOT_METAL_SPECS[metal];
      if (!spec) {
        pricesByMetal[metal] = {
          metal,
          valueUSD: null,
          unit: 'USD_per_tonne',
          readiness: 'proxy_or_unverified',
        };
        warnings.push(`Unsupported SPOT metal ${metal}; no canonical price key is registered for Producer Model`);
        continue;
      }
      if (!spec.productionReady && !args.allowNonProductionReadySpotKeys) {
        pricesByMetal[metal] = {
          metal,
          valueUSD: null,
          unit: spec.canonicalUnit,
          priceKey: spec.priceKey,
          readiness: 'proxy_or_unverified',
        };
        warnings.push(`${metal} SPOT blocked: ${spec.readinessReason ?? 'price key is not production-ready'}`);
        continue;
      }

      const resolved = await resolvePriceSeriesFn({
        price_key: spec.priceKey,
        anchorDatesUtc: [args.context.valuationDateUtc],
        scenario: { mode: 'spot' },
        allowRefresh: true,
      });
      warnings.push(...resolved.warnings.map((warning) => `${metal}: ${warning}`));
      if (spec.priceType === 'monthly-benchmark') {
        warnings.push(`${metal}: Producer SPOT mode uses the latest available FRED/IMF monthly period-average benchmark; this value is not a spot quote.`);
      }
      const raw = resolved.values[0];
      let valueUSD: number | null = null;
      if (raw !== null && Number.isFinite(raw)) {
        try {
          valueUSD = convertPriceToCanonical({
            value: raw,
            fromUnit: spec.sourceUnit,
            canonicalUnit: spec.canonicalUnit,
          });
        } catch (error) {
          warnings.push(error instanceof Error ? `${metal}: ${error.message}` : `${metal}: price conversion failed`);
        }
      } else {
        warnings.push(`${metal}: no ${spec.priceType === 'monthly-benchmark' ? 'monthly benchmark' : 'SPOT price'} resolved for ${args.context.valuationDateUtc}`);
      }
      pricesByMetal[metal] = {
        metal,
        valueUSD,
        unit: spec.canonicalUnit,
        priceKey: spec.priceKey,
        readiness: spec.productionReady ? 'production_ready' : 'proxy_or_unverified',
      };
    }

    return {
      id: `SPOT:${args.context.valuationDateUtc}`,
      mode: 'SPOT',
      valuationDateUtc: args.context.valuationDateUtc,
      pricesByMetal,
      warnings,
    };
  }

  if (args.context.priceMode === 'LT') {
    if (!args.ltDeck) {
      return {
        id: 'LT:UNRESOLVED',
        mode: 'LT',
        valuationDateUtc: args.context.valuationDateUtc,
        pricesByMetal,
        warnings: ['LT mode requires an explicit versioned long-term price deck; none was supplied'],
      };
    }
    for (const metal of metals) {
      const normalized = normalizeExplicitPrice(metal, args.ltDeck.pricesByMetal[metal]);
      pricesByMetal[metal] = normalized.price;
      if (normalized.warning) warnings.push(normalized.warning);
    }
    return {
      id: `LT:${args.ltDeck.id}`,
      mode: 'LT',
      valuationDateUtc: args.context.valuationDateUtc,
      pricesByMetal,
      warnings,
    };
  }

  const reportedDeck = selectReportedDeck(args.producer, args.reportedPriceDeckId);
  if (!reportedDeck) {
    const reason = args.reportedPriceDeckId
      ? `Reported price deck ${args.reportedPriceDeckId} was not found`
      : (args.producer.reportedPriceDecks ?? []).length > 1
        ? 'REPORTED mode has multiple source price decks; reportedPriceDeckId must be explicit to prevent hidden mixing'
        : 'REPORTED mode requires a source price deck';
    return {
      id: 'REPORTED:UNRESOLVED',
      mode: 'REPORTED',
      valuationDateUtc: args.context.valuationDateUtc,
      pricesByMetal,
      warnings: [reason],
    };
  }

  for (const metal of metals) {
    const normalized = normalizeExplicitPrice(metal, reportedDeck.metals?.[metal]);
    pricesByMetal[metal] = normalized.price;
    if (normalized.warning) warnings.push(normalized.warning);
  }
  return {
    id: `REPORTED:${args.producer.company.id}:${reportedDeck.id}`,
    mode: 'REPORTED',
    valuationDateUtc: args.context.valuationDateUtc,
    pricesByMetal,
    warnings,
    sourceReportedDeckId: reportedDeck.id,
  };
}
