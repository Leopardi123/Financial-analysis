import { convertMass, convertPreciousQuantity } from '../../prices/units.ts';
import { getPriceKeyDefinition } from '../../prices/keys.ts';
import type { ProjectEngineFullProductionV1Input } from '../types.ts';
import type { QtyUnit } from './schema.ts';
import type { ParsedProjectJsonV1 } from './parse.ts';
import { resolvePriceSeries, type PriceScenario as CorePriceScenario } from '../../prices/resolve.ts';
import { getCommodityPriceKeyForLegacySymbol, getLegacySymbolForPriceKey } from '../../prices/providers/legacyCommoditySymbolMap.ts';
import { isManualMetalPriceValid, resolveMetalPrice, type ManualMetalPriceEntry } from '../../engine/pricing/resolveMetalPrice.ts';
import {
  fetchNasdaqDataLinkMetalPrice,
  metalCodeToNasdaqMetal,
  normalizeNasdaqMetalPriceUnit,
  type NasdaqDataLinkResolution,
} from '../../prices/nasdaqDataLinkMetals.ts';

export type PriceScenario =
  | { mode: 'spot' }
  | { mode: 'percentile'; lookbackYears: number; percentile: number }
  | { mode: 'fixed'; fixedPriceByKey: Record<string, number> };

export type MetalPriceDiagnostic = {
  priceKeyRequested: string;
  liveSymbol: string | null;
  liveFeedIdentifier: string | null;
  liveEndpoint: string | null;
  livePriceAvailable: boolean;
  livePriceValue: number | null;
  interpretedUnit: string | null;
  normalizedOutputValue: number | null;
  sanityBandUsed: { min: number; max: number; unit: string } | null;
  sanityPass: boolean | null;
  sanityReason: string | null;
  manualFallbackAvailable: boolean;
  manualFallbackValue: number | null;
  fallbackUsed: boolean;
  priceSourceUsed: 'fmp' | 'manual' | 'missing' | 'expired' | 'scenario-series' | 'nasdaq_data_link';
  datasetId: string | null;
  asOfDate: string | null;
  sourceUnit: string | null;
  missingSourceReason: string | null;
  manualEnteredAtUtc?: string | null;
  manualExpiresAtUtc?: string | null;
  reason: string;
};

const CU_LB_PER_TONNE = 2204.6226218;
const CU_DERIVED_WARNING = 'Cu COMEX–LME basis can diverge; unit conversion is not basis conversion.';

const BASE_METAL_USD_LB_SANITY_BANDS: Record<string, { min: number; max: number; unit: string }> = {
  CU_USD_LB: { min: 0.25, max: 15, unit: 'USD/lb' },
  PB_USD_LB: { min: 0.1, max: 8, unit: 'USD/lb' },
  ZN_USD_LB: { min: 0.1, max: 8, unit: 'USD/lb' },
  NI_USD_LB: { min: 0.5, max: 40, unit: 'USD/lb' },
};

function inferInterpretedUnitFromPriceKey(priceKey: string): string | null {
  const definition = getPriceKeyDefinition(priceKey);
  if (definition.canonicalUnit === 'USD_per_lb') return 'USD/lb';
  if (definition.canonicalUnit === 'USD_per_tonne') return 'USD/tonne';
  if (definition.canonicalUnit === 'USD_per_toz') return 'USD/toz';
  return null;
}

function getSanityBandForPriceKey(priceKey: string): { min: number; max: number; unit: string } | null {
  return BASE_METAL_USD_LB_SANITY_BANDS[priceKey] ?? null;
}

function evaluateLiveSanity(args: { priceKey: string; liveValue: number | null }): {
  pass: boolean | null;
  reason: string | null;
  band: { min: number; max: number; unit: string } | null;
} {
  const band = getSanityBandForPriceKey(args.priceKey);
  if (!band) {
    return { pass: null, reason: null, band: null };
  }
  if (args.liveValue === null) {
    return { pass: null, reason: 'No finite live value to validate.', band };
  }
  const pass = args.liveValue >= band.min && args.liveValue <= band.max;
  return {
    pass,
    reason: pass
      ? `Live value ${args.liveValue} within sanity band ${band.min}..${band.max} ${band.unit}`
      : `Live value ${args.liveValue} outside sanity band ${band.min}..${band.max} ${band.unit}`,
    band,
  };
}

function inferCuBasisForPriceKey(priceKey: string): 'COMEX' | 'LME' | null {
  if (priceKey === 'CU_USD_LB') {
    return 'COMEX';
  }
  if (priceKey === 'CU_USD_TONNE') {
    return 'LME';
  }
  return null;
}

function canonicalQtyUnitFromPriceKey(priceKey: string): 'toz' | 'lb' | 'tonne' {
  let resolvedPriceKey = priceKey;
  try {
    getPriceKeyDefinition(resolvedPriceKey);
  } catch {
    const mappedPriceKey = getCommodityPriceKeyForLegacySymbol(priceKey);
    if (mappedPriceKey) {
      resolvedPriceKey = mappedPriceKey;
    }
  }

  const unit = getPriceKeyDefinition(resolvedPriceKey).canonicalUnit;
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
    manualMetalPriceByKey?: Record<string, ManualMetalPriceEntry>;
  },
  deps: {
    resolvePriceSeriesFn?: typeof resolvePriceSeries;
    fetchNasdaqMetalPriceFn?: (args: { metal: 'zinc' | 'nickel' | 'lead'; apiKey?: string | null }) => Promise<NasdaqDataLinkResolution>;
  } = {},
): Promise<ProjectEngineFullProductionV1Input & {
  diagnostics?: {
    warnings: string[];
    metalPriceDiagnostics?: Record<string, MetalPriceDiagnostic>;
    metalsUsingLivePrices?: string[];
    metalsUsingManualFallback?: string[];
    metalsWithPriceFailure?: string[];
  };
}> {
  const { parsed } = args;
  const resolvePriceSeriesFn = deps.resolvePriceSeriesFn ?? resolvePriceSeries;
  const fetchNasdaqMetalPriceFn = deps.fetchNasdaqMetalPriceFn ?? fetchNasdaqDataLinkMetalPrice;
  const scenario = args.scenario ?? { mode: 'spot' };
  const warnings: string[] = [];
  const seenWarnings = new Set<string>();
  const pushWarning = (message: string) => {
    if (!seenWarnings.has(message)) {
      seenWarnings.add(message);
      warnings.push(message);
    }
  };
  const projectId = args.projectId ?? 'unknown';

  const masterN = parsed.engineInputWithoutPrices.masterN;
  const len = masterN + 1;
  const targets = parsed.engineInputWithoutPrices.yearsByPeriod.map((year) => `${year}-12-31`);
  const todayUtc = todayUtcDateString();
  const spotAnchorDateUtc = scenario.mode === 'spot' ? todayUtc : '';

  const spotPriceUSDByMetal: Record<string, Array<number | null>> = {};
  const priceSeriesByKey: Record<string, Array<number | null>> = {};
  const payableQtyByMetalCanonical: Record<string, Array<number | null>> = {};
  const metalPriceDiagnostics: Record<string, MetalPriceDiagnostic> = {};

  const coreScenario: CorePriceScenario = scenario.mode === 'fixed'
    ? { mode: 'fixed', fixedByKey: scenario.fixedPriceByKey }
    : scenario;

  const spotValueByPriceKey = new Map<string, number | null>();

  async function resolveSeriesForPriceKey(priceKey: string): Promise<Array<number | null>> {
    if (scenario.mode === 'spot') {
      if (spotValueByPriceKey.has(priceKey)) {
        return new Array(len).fill(spotValueByPriceKey.get(priceKey) ?? null);
      }

      const resolvedSpot = await resolvePriceSeriesFn({
        price_key: priceKey,
        anchorDatesUtc: [spotAnchorDateUtc],
        scenario: coreScenario,
        allowRefresh: args.allowRefresh === true,
      }).catch((error: unknown) => {
        pushWarning(`Spot resolver failed for ${priceKey}: ${error instanceof Error ? error.message : String(error)}; strict manual/missing resolution continues.`);
        return { values: [null], warnings: [] };
      });
      if (resolvedSpot.warnings.length > 0) {
        resolvedSpot.warnings.forEach((warning) => pushWarning(warning));
      }

      const scalar = resolvedSpot.values[0] ?? null;
      spotValueByPriceKey.set(priceKey, scalar);
      return new Array(len).fill(scalar);
    }

    const resolved = await resolvePriceSeriesFn({
      price_key: priceKey,
      anchorDatesUtc: targets,
      scenario: coreScenario,
      allowRefresh: args.allowRefresh === true,
    });
    if (resolved.warnings.length > 0) {
      resolved.warnings.forEach((warning) => pushWarning(warning));
    }
    return resolved.values;
  }

  async function resolveSeriesWithCuFallback(args: { metal: string; requestedPriceKey: string }): Promise<{
    resolvedSeries: Array<number | null>;
    priceKeyUsed: string;
    derived: boolean;
    derivedFrom?: string;
    conversionFactor?: number;
    inferredBasisRequested?: 'COMEX' | 'LME';
    inferredBasisSource?: 'COMEX' | 'LME';
    failureReason?: string;
  }> {
    const { metal, requestedPriceKey } = args;
    const requestedSeries = await resolveSeriesForPriceKey(requestedPriceKey);
    if (requestedSeries.some((value) => value !== null)) {
      const inferredBasis = metal === 'Cu' ? inferCuBasisForPriceKey(requestedPriceKey) : null;
      return {
        resolvedSeries: requestedSeries,
        priceKeyUsed: requestedPriceKey,
        derived: false,
        ...(inferredBasis ? { inferredBasisRequested: inferredBasis, inferredBasisSource: inferredBasis } : {}),
      };
    }

    if (metal !== 'Cu') {
      return {
        resolvedSeries: requestedSeries,
        priceKeyUsed: requestedPriceKey,
        derived: false,
        failureReason: `No prices available for requested key ${requestedPriceKey}`,
      };
    }

    if (requestedPriceKey === 'CU_USD_TONNE') {
      const sourceKey = 'CU_USD_LB';
      const sourceSeries = await resolveSeriesForPriceKey(sourceKey);
      if (!sourceSeries.some((value) => value !== null)) {
        return {
          resolvedSeries: requestedSeries,
          priceKeyUsed: requestedPriceKey,
          derived: false,
          inferredBasisRequested: 'LME',
          failureReason: 'No prices available for requested key CU_USD_TONNE and fallback key CU_USD_LB',
        };
      }
      return {
        resolvedSeries: sourceSeries.map((value) => (value === null ? null : value * CU_LB_PER_TONNE)),
        priceKeyUsed: sourceKey,
        derived: true,
        derivedFrom: sourceKey,
        conversionFactor: CU_LB_PER_TONNE,
        inferredBasisRequested: 'LME',
        inferredBasisSource: 'COMEX',
      };
    }

    if (requestedPriceKey === 'CU_USD_LB') {
      const sourceKey = 'CU_USD_TONNE';
      const sourceSeries = await resolveSeriesForPriceKey(sourceKey);
      if (!sourceSeries.some((value) => value !== null)) {
        return {
          resolvedSeries: requestedSeries,
          priceKeyUsed: requestedPriceKey,
          derived: false,
          inferredBasisRequested: 'COMEX',
          failureReason: 'No prices available for requested key CU_USD_LB and fallback key CU_USD_TONNE',
        };
      }
      return {
        resolvedSeries: sourceSeries.map((value) => (value === null ? null : value / CU_LB_PER_TONNE)),
        priceKeyUsed: sourceKey,
        derived: true,
        derivedFrom: sourceKey,
        conversionFactor: 1 / CU_LB_PER_TONNE,
        inferredBasisRequested: 'COMEX',
        inferredBasisSource: 'LME',
      };
    }

    return {
      resolvedSeries: requestedSeries,
      priceKeyUsed: requestedPriceKey,
      derived: false,
      failureReason: `Cu fallback supports only CU_USD_LB and CU_USD_TONNE. Requested ${requestedPriceKey}`,
    };
  }

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

    if (getLegacySymbolForPriceKey(priceKey) === null) {
      pushWarning(`Unknown legacy commodity symbol for metal=${metal} priceKey=${priceKey}`);
    }

    const isNasdaqMetalInSpot = scenario.mode === 'spot' && metalCodeToNasdaqMetal(metal) !== null;
    if (isNasdaqMetalInSpot) {
      const manualEntry = args.manualMetalPriceByKey?.[priceKey] ?? null;
      const manualIsValid = isManualMetalPriceValid(manualEntry);
      const manualIsExpired = Boolean(manualEntry?.expiresAtUtc) && !manualIsValid;
      let selectedValue: number | null = null;
      let selectedUnit: string | null = inferInterpretedUnitFromPriceKey(priceKey);
      let selectedSource: MetalPriceDiagnostic['priceSourceUsed'] = 'missing';
      let sourceReason = 'No valid source resolved.';
      let datasetId: string | null = null;
      let asOfDate: string | null = null;
      let missingSourceReason: string | null = null;
      let sourceUnit: string | null = null;

      if (manualIsValid) {
        selectedValue = manualEntry?.value ?? null;
        selectedUnit = manualEntry?.unit ?? selectedUnit;
        selectedSource = 'manual';
        sourceReason = 'Manual metal price is valid and has highest priority in modeled/prerevenue spot mode.';
      } else {
        const nasdaqMetal = metalCodeToNasdaqMetal(metal);
        const nasdaqResolution = await fetchNasdaqMetalPriceFn({ metal: nasdaqMetal! });
        if (!nasdaqResolution.ok) {
          datasetId = nasdaqResolution.datasetId ?? null;
          missingSourceReason = nasdaqResolution.missingSourceReason;
          selectedSource = manualIsExpired ? 'expired' : 'missing';
          sourceReason = nasdaqResolution.missingSourceReason;
          selectedUnit = nasdaqResolution.unit ?? selectedUnit;
          sourceUnit = nasdaqResolution.unit ?? null;
        } else {
          sourceUnit = nasdaqResolution.value.unit;
          const normalized = normalizeNasdaqMetalPriceUnit({
            price: nasdaqResolution.value.price,
            fromUnit: nasdaqResolution.value.unit,
            toUnit: inferInterpretedUnitFromPriceKey(priceKey) ?? nasdaqResolution.value.unit,
          });
          asOfDate = nasdaqResolution.value.date;
          datasetId = nasdaqResolution.value.datasetId;
          if (!normalized.ok) {
            selectedSource = manualIsExpired ? 'expired' : 'missing';
            sourceReason = normalized.missingSourceReason;
            missingSourceReason = normalized.missingSourceReason;
            selectedUnit = nasdaqResolution.value.unit;
          } else {
            selectedValue = normalized.normalizedPrice;
            selectedSource = 'nasdaq_data_link';
            selectedUnit = inferInterpretedUnitFromPriceKey(priceKey) ?? nasdaqResolution.value.unit;
            sourceReason = normalized.conversionNote
              ? `Nasdaq Data Link price resolved (${nasdaqResolution.value.datasetId}). ${normalized.conversionNote}`
              : `Nasdaq Data Link price resolved (${nasdaqResolution.value.datasetId}).`;
          }
        }
      }

      const selectedSeries = new Array<number | null>(len).fill(selectedValue);
      spotPriceUSDByMetal[metal] = selectedSeries;
      priceSeriesByKey[priceKey] = [...selectedSeries];
      metalPriceDiagnostics[metal] = {
        priceKeyRequested: priceKey,
        liveSymbol: null,
        liveFeedIdentifier: null,
        liveEndpoint: null,
        livePriceAvailable: false,
        livePriceValue: null,
        interpretedUnit: selectedUnit,
        normalizedOutputValue: selectedValue,
        sanityBandUsed: null,
        sanityPass: null,
        sanityReason: null,
        manualFallbackAvailable: typeof manualEntry?.value === 'number' && Number.isFinite(manualEntry.value),
        manualFallbackValue: manualEntry?.value ?? null,
        fallbackUsed: selectedSource === 'manual',
        priceSourceUsed: selectedSource,
        reason: sourceReason,
        manualEnteredAtUtc: manualEntry?.enteredAtUtc ?? null,
        manualExpiresAtUtc: manualEntry?.expiresAtUtc ?? null,
        datasetId,
        asOfDate,
        sourceUnit,
        missingSourceReason,
      };
      pushWarning(`price source metal=${metal} -> ${selectedSource}${datasetId ? ` datasetId=${datasetId}` : ''}${asOfDate ? ` asOfDate=${asOfDate}` : ''}${selectedValue !== null ? ` value=${selectedValue}` : ''}${selectedUnit ? ` unit=${selectedUnit}` : ''}${missingSourceReason ? ` missingSourceReason=${JSON.stringify(missingSourceReason)}` : ''}`);
      continue;
    }

    const resolvedPrice = await resolveSeriesWithCuFallback({ metal, requestedPriceKey: priceKey });

    const livePriceValue = resolvedPrice.resolvedSeries.find((value: number | null) => typeof value === 'number' && Number.isFinite(value)) ?? null;
    const livePriceAvailable = livePriceValue !== null;

    let selectedSeries = [...resolvedPrice.resolvedSeries];
    let priceSourceUsed: MetalPriceDiagnostic['priceSourceUsed'] = 'scenario-series';
    let sourceReason = `Scenario mode=${scenario.mode}; resolved scenario series used.`;
    let manualFallbackValue: number | null = null;
    let manualFallbackAvailable = false;
    let manualEnteredAtUtc: string | null = null;
    let manualExpiresAtUtc: string | null = null;

    const sanity = evaluateLiveSanity({ priceKey, liveValue: livePriceValue });

    if (scenario.mode === 'spot') {
      const fmpSpotValue = sanity.pass === false ? null : livePriceValue;
      const manualEntry = args.manualMetalPriceByKey?.[priceKey] ?? null;
      const resolved = resolveMetalPrice({ metal, metalKey: priceKey, fmpSpotValue, manualEntry });
      selectedSeries = new Array<number | null>(len).fill(resolved.value);
      priceSourceUsed = resolved.source;
      sourceReason = resolved.reason ?? (resolved.source === 'fmp' ? `FMP spot available for ${priceKey}.` : `Missing spot for ${priceKey}.`);
      manualFallbackValue = manualEntry?.value ?? null;
      manualFallbackAvailable = typeof manualEntry?.value === 'number' && Number.isFinite(manualEntry.value);
      manualEnteredAtUtc = manualEntry?.enteredAtUtc ?? null;
      manualExpiresAtUtc = manualEntry?.expiresAtUtc ?? null;
    }

    spotPriceUSDByMetal[metal] = selectedSeries;
    priceSeriesByKey[priceKey] = [...selectedSeries];
    if (resolvedPrice.priceKeyUsed !== priceKey && resolvedPrice.derivedFrom) {
      priceSeriesByKey[resolvedPrice.derivedFrom] = await resolveSeriesForPriceKey(resolvedPrice.derivedFrom);
    }

    const liveSymbol = getLegacySymbolForPriceKey(priceKey);
    const fallbackUsed = priceSourceUsed === 'manual';
    const normalizedOutputValue = selectedSeries.find((value: number | null) => typeof value === 'number' && Number.isFinite(value)) ?? null;

    metalPriceDiagnostics[metal] = {
      priceKeyRequested: priceKey,
      liveSymbol,
      liveFeedIdentifier: liveSymbol ? `FMP legacy commodity symbol ${liveSymbol}` : null,
      liveEndpoint: liveSymbol ? `/api/v3/historical-price-full/${liveSymbol}` : null,
      livePriceAvailable,
      livePriceValue,
      interpretedUnit: inferInterpretedUnitFromPriceKey(priceKey),
      normalizedOutputValue,
      sanityBandUsed: sanity.band,
      sanityPass: sanity.pass,
      sanityReason: sanity.reason,
      manualFallbackAvailable,
      manualFallbackValue,
      fallbackUsed,
      priceSourceUsed,
      reason: sourceReason,
      manualEnteredAtUtc,
      manualExpiresAtUtc,
      datasetId: null,
      asOfDate: null,
      sourceUnit: inferInterpretedUnitFromPriceKey(priceKey),
      missingSourceReason: null,
    };

    pushWarning(
      `price source metal=${metal} -> ${priceSourceUsed}${livePriceAvailable ? ` live=${String(livePriceValue)}` : ''}${sanity.pass === false ? ` sanity=failed band=${sanity.band ? `${sanity.band.min}-${sanity.band.max} ${sanity.band.unit}` : 'n/a'}` : ''}${priceSourceUsed === 'manual' ? ` manualFallback=${String(manualFallbackValue)}` : ''}${!livePriceAvailable ? ` (live price unavailable for ${priceKey})` : ''}`,
    );

    const needsCuBasisWarning = metal === 'Cu' && resolvedPrice.derived === true;
    const needsUnitWarning = sourceQtyUnit !== targetQtyUnit;
    const warningText = needsCuBasisWarning || needsUnitWarning ? CU_DERIVED_WARNING : null;
    pushWarning(
      `price_diagnostic metal=${metal} qty_unit=${sourceQtyUnit} price_key_requested=${priceKey} price_key_used=${resolvedPrice.priceKeyUsed} derived=${resolvedPrice.derived}${resolvedPrice.derivedFrom ? ` derived_from=${resolvedPrice.derivedFrom}` : ''}${resolvedPrice.conversionFactor !== undefined ? ` conversion_factor=${resolvedPrice.conversionFactor}` : ''}${resolvedPrice.inferredBasisRequested ? ` inferred_basis_requested=${resolvedPrice.inferredBasisRequested}` : ''}${resolvedPrice.inferredBasisSource ? ` inferred_basis_source=${resolvedPrice.inferredBasisSource}` : ''}${warningText ? ` warning=${JSON.stringify(warningText)}` : ''}${resolvedPrice.failureReason ? ` failure_reason=${JSON.stringify(resolvedPrice.failureReason)}` : ''}`,
    );

    if (scenario.mode === 'spot') {
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

      pushWarning(`projectId=${projectId} metal=${metal} key=${priceKey} date=${periodEndDate} mode=${scenario.mode} reason=${reason}`);
    });
  }

  const metalsUsingLivePrices = Object.entries(metalPriceDiagnostics)
    .filter(([, item]) => item.priceSourceUsed === 'fmp')
    .map(([metal]) => metal)
    .sort((a, b) => a.localeCompare(b));
  const metalsUsingManualFallback = Object.entries(metalPriceDiagnostics)
    .filter(([, item]) => item.priceSourceUsed === 'manual')
    .map(([metal]) => metal)
    .sort((a, b) => a.localeCompare(b));
  const metalsWithPriceFailure = Object.entries(metalPriceDiagnostics)
    .filter(([, item]) => item.priceSourceUsed === 'missing' || item.priceSourceUsed === 'expired')
    .map(([metal]) => metal)
    .sort((a, b) => a.localeCompare(b));

  pushWarning(`metalsUsingLivePrices=[${metalsUsingLivePrices.join(',')}]`);
  pushWarning(`metalsUsingManualFallback=[${metalsUsingManualFallback.join(',')}]`);
  pushWarning(`metalsWithPriceFailure=[${metalsWithPriceFailure.join(',')}]`);

  let auPriceUSDPerOz: Array<number | null> = await resolveSeriesForPriceKey(parsed.engineInputWithoutPrices.auPriceKey);
  priceSeriesByKey[parsed.engineInputWithoutPrices.auPriceKey] = [...auPriceUSDPerOz];

  if (scenario.mode !== 'spot') {
    auPriceUSDPerOz.forEach((value, index) => {
      if (value !== null) {
        return;
      }
      const periodEndDate = targets[index] ?? 'unknown-date';
      const reason = scenario.mode === 'fixed'
        ? `Missing fixed price for key ${parsed.engineInputWithoutPrices.auPriceKey}`
        : `No closes in trailing ${scenario.lookbackYears}y window`;
      pushWarning(`projectId=${projectId} metal=Au key=${parsed.engineInputWithoutPrices.auPriceKey} date=${periodEndDate} mode=${scenario.mode} reason=${reason}`);
    });
  }



  if (parsed.priceOverrides.auPriceUSDPerOz) {
    auPriceUSDPerOz = [...parsed.priceOverrides.auPriceUSDPerOz];
  }


  return {
    masterN,
    streamsByMetal: parsed.engineInputWithoutPrices.streamsByMetal,
    payableQtyByMetal: payableQtyByMetalCanonical,
    spotPriceUSDByMetal,
    priceSeriesByKey,
    priceKeyByMetal: parsed.engineInputWithoutPrices.priceKeyByMetal,
    auPriceKey: parsed.engineInputWithoutPrices.auPriceKey,
    takeItems: parsed.engineInputWithoutPrices.takeItems,
    royaltiesDetail: parsed.engineInputWithoutPrices.royaltiesDetail ?? null,
    phase1: parsed.engineInputWithoutPrices.phase1,
    phase2: parsed.engineInputWithoutPrices.phase2,
    aisc: {
      auPriceUSDPerOz,
    },
    ...(warnings.length > 0 || Object.keys(metalPriceDiagnostics).length > 0
      ? {
        diagnostics: {
          warnings,
          metalPriceDiagnostics,
          metalsUsingLivePrices,
          metalsUsingManualFallback,
          metalsWithPriceFailure,
        },
      }
      : {}),
  };
}
