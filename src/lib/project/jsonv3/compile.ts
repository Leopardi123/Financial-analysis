import { parseProjectJsonV1 as parseProjectJsonV2Legacy, type ParsedProjectJsonV1 } from '../jsonv1/parseLegacy.ts';
import type { ProjectJsonV3, ProjectJsonV3SeriesComponent } from './schema.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function assertSeries(raw: unknown, length: number, path: string, options: { nonNegative?: boolean } = {}): Array<number | null> {
  if (!Array.isArray(raw) || raw.length !== length) {
    throw new Error(`${path} must be an array of length ${length} (masterN+1).`);
  }
  return raw.map((value, index) => {
    if (value === null) return null;
    if (!finite(value)) throw new Error(`${path}[${index}] must be null or a finite number.`);
    if (options.nonNegative && value < 0) throw new Error(`${path}[${index}] must be >= 0.`);
    return value;
  });
}

function zeroSeries(length: number): Array<number | null> {
  return new Array<number | null>(length).fill(0);
}

function sumStrictSeries(seriesList: Array<Array<number | null>>, length: number): Array<number | null> {
  if (seriesList.length === 0) return zeroSeries(length);
  return Array.from({ length }, (_, t) => {
    let total = 0;
    for (const series of seriesList) {
      const value = series[t];
      if (!finite(value)) return null;
      total += value;
    }
    return total;
  });
}

function validateComponents<T extends string>(
  components: Array<ProjectJsonV3SeriesComponent<T>>,
  length: number,
  path: string,
): Array<ProjectJsonV3SeriesComponent<T> & { seriesUSD: Array<number | null> }> {
  const ids = new Set<string>();
  return components.map((component, index) => {
    if (!component || typeof component !== 'object') throw new Error(`${path}[${index}] must be an object.`);
    if (typeof component.id !== 'string' || !component.id.trim()) throw new Error(`${path}[${index}].id must be a non-empty string.`);
    if (ids.has(component.id)) throw new Error(`${path} contains duplicate id=${component.id}.`);
    ids.add(component.id);
    return {
      ...component,
      seriesUSD: assertSeries(component.seriesUSD, length, `${path}[${index}].seriesUSD`, { nonNegative: true }),
    };
  });
}

function resolveTime(raw: ProjectJsonV3): { yearsByPeriod: number[]; productionStartYear: number } {
  const { masterN, productionStartPeriod, periodEndDatesUtc, phaseByPeriod } = raw.time;
  const length = masterN + 1;
  if (!Number.isInteger(masterN) || masterN < 0) throw new Error('time.masterN must be an integer >= 0.');
  if (!Number.isInteger(productionStartPeriod) || productionStartPeriod < 0 || productionStartPeriod > masterN) {
    throw new Error('time.productionStartPeriod must be an integer within 0..masterN.');
  }
  if (!Array.isArray(periodEndDatesUtc) || periodEndDatesUtc.length !== length) {
    throw new Error(`time.periodEndDatesUtc must have exactly ${length} entries.`);
  }
  if (!Array.isArray(phaseByPeriod) || phaseByPeriod.length !== length) {
    throw new Error(`time.phaseByPeriod must have exactly ${length} entries.`);
  }

  const years = periodEndDatesUtc.map((date, index) => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) {
      throw new Error(`time.periodEndDatesUtc[${index}] must be a valid YYYY-MM-DD date.`);
    }
    return Number(date.slice(0, 4));
  });
  for (let t = 1; t < years.length; t += 1) {
    if (years[t] !== years[t - 1] + 1) {
      throw new Error(`project_json_v3 currently requires annual report periods; period ${t - 1}->${t} must advance exactly one calendar year.`);
    }
    if (periodEndDatesUtc[t] <= periodEndDatesUtc[t - 1]) {
      throw new Error(`time.periodEndDatesUtc must be strictly increasing at index ${t}.`);
    }
  }

  const phaseRank: Record<string, number> = { construction: 0, ramp_up: 1, operations: 2, closure: 3 };
  for (let t = 0; t < phaseByPeriod.length; t += 1) {
    const phase = phaseByPeriod[t];
    if (!(phase in phaseRank)) throw new Error(`time.phaseByPeriod[${t}] is invalid.`);
    if (t > 0 && phaseRank[phase] < phaseRank[phaseByPeriod[t - 1]]) {
      throw new Error(`time.phaseByPeriod must not move backwards at index ${t}.`);
    }
  }
  const firstNonConstruction = phaseByPeriod.findIndex((phase) => phase !== 'construction');
  if (firstNonConstruction !== productionStartPeriod) {
    throw new Error(`productionStartPeriod=${productionStartPeriod} must equal first non-construction report period=${firstNonConstruction}.`);
  }
  if (phaseByPeriod[productionStartPeriod] !== 'ramp_up' && phaseByPeriod[productionStartPeriod] !== 'operations') {
    throw new Error('productionStartPeriod must point to ramp_up or operations.');
  }

  return { yearsByPeriod: years, productionStartYear: years[productionStartPeriod] };
}

function assertRuntimeReadyEconomicSources(raw: ProjectJsonV3): void {
  const unresolved: string[] = [];
  if (raw.economics.costModel?.mode === 'UNKNOWN') unresolved.push('economics.costModel');
  if (raw.economics.sellingModel?.mode === 'UNKNOWN') unresolved.push('economics.sellingModel');
  if (raw.economics.royaltyModel?.mode === 'UNKNOWN') unresolved.push('economics.royaltyModel');
  if (raw.economics.taxModel?.mode === 'UNKNOWN') unresolved.push('economics.taxModel');
  if (unresolved.length > 0) {
    throw new Error(`project_json_v3 draft placeholder(s) must be resolved from the technical report before runtime: ${unresolved.join(', ')}. UNKNOWN is not an economic assumption.`);
  }
}

export function isProjectJsonV3(raw: unknown): raw is ProjectJsonV3 {
  return isRecord(raw) && raw.version === 'project_json_v3';
}

export function parseProjectJsonV3(rawUnknown: unknown): ParsedProjectJsonV1 {
  if (!isProjectJsonV3(rawUnknown)) throw new Error('raw.version must be "project_json_v3".');
  const raw = rawUnknown as ProjectJsonV3;
  if (!isRecord(raw.time) || !isRecord(raw.metals) || !isRecord(raw.economics) || !isRecord(raw.capital)) {
    throw new Error('project_json_v3 requires time, metals, economics and capital objects.');
  }

  const { masterN, productionStartPeriod } = raw.time;
  const length = masterN + 1;
  const { yearsByPeriod, productionStartYear } = resolveTime(raw);
  assertRuntimeReadyEconomicSources(raw);

  const capexUSD = assertSeries(raw.capital.capexUSD, length, 'capital.capexUSD', { nonNegative: true });
  const sustainingCapexUSD = assertSeries(raw.capital.sustainingCapexUSD, length, 'capital.sustainingCapexUSD', { nonNegative: true });
  const closureUSD = assertSeries(raw.capital.closureUSD, length, 'capital.closureUSD', { nonNegative: true });
  const workingCapitalDeltaUSD = raw.capital.workingCapitalDeltaUSD == null
    ? zeroSeries(length)
    : assertSeries(raw.capital.workingCapitalDeltaUSD, length, 'capital.workingCapitalDeltaUSD');
  const terminalProceedsUSD = raw.capital.terminalProceedsUSD == null
    ? zeroSeries(length)
    : assertSeries(raw.capital.terminalProceedsUSD, length, 'capital.terminalProceedsUSD', { nonNegative: true });

  let operatingCostsUSD: Array<number | null>;
  let siteGandA_USD: Array<number | null>;
  const costModel = raw.economics.costModel;
  if (!isRecord(costModel)) throw new Error('economics.costModel is required.');
  if (costModel.mode === 'AGGREGATE') {
    operatingCostsUSD = assertSeries(costModel.operatingCostsUSD, length, 'economics.costModel.operatingCostsUSD', { nonNegative: true });
    siteGandA_USD = costModel.siteGandA_USD == null
      ? zeroSeries(length)
      : assertSeries(costModel.siteGandA_USD, length, 'economics.costModel.siteGandA_USD', { nonNegative: true });
  } else if (costModel.mode === 'COMPONENTS') {
    if (!Array.isArray(costModel.components) || costModel.components.length === 0) {
      throw new Error('economics.costModel.components must be non-empty in COMPONENTS mode.');
    }
    const components = validateComponents(costModel.components, length, 'economics.costModel.components');
    const ga = components.filter((component) => component.category === 'site_ga').map((component) => component.seriesUSD);
    const site = components.filter((component) => component.category !== 'site_ga').map((component) => component.seriesUSD);
    operatingCostsUSD = sumStrictSeries(site, length);
    siteGandA_USD = sumStrictSeries(ga, length);
  } else {
    throw new Error('economics.costModel.mode must be AGGREGATE or COMPONENTS for runtime.');
  }

  let sellingCostsUSD: Array<number | null> = zeroSeries(length);
  const sellingModel = raw.economics.sellingModel;
  if (!isRecord(sellingModel)) throw new Error('economics.sellingModel is required.');
  if (sellingModel.mode === 'AGGREGATE') {
    sellingCostsUSD = assertSeries(sellingModel.sellingCostsUSD, length, 'economics.sellingModel.sellingCostsUSD', { nonNegative: true });
  } else if (sellingModel.mode === 'COMPONENTS') {
    if (!Array.isArray(sellingModel.components) || sellingModel.components.length === 0) {
      throw new Error('economics.sellingModel.components must be non-empty in COMPONENTS mode.');
    }
    const components = validateComponents(sellingModel.components, length, 'economics.sellingModel.components');
    sellingCostsUSD = sumStrictSeries(components.map((component) => component.seriesUSD), length);
  } else if (sellingModel.mode !== 'NONE') {
    throw new Error('economics.sellingModel.mode must be NONE, AGGREGATE or COMPONENTS for runtime.');
  }

  let taxRate: number | null = null;
  let taxCashFlowUSD: Array<number | null> | undefined;
  const taxModel = raw.economics.taxModel;
  if (!isRecord(taxModel)) throw new Error('economics.taxModel is required.');
  if (taxModel.mode === 'FLAT_RATE') {
    if (!finite(taxModel.taxRate) || taxModel.taxRate < 0 || taxModel.taxRate > 0.6) {
      throw new Error('economics.taxModel.taxRate must be finite within [0, 0.6].');
    }
    taxRate = taxModel.taxRate;
  } else if (taxModel.mode === 'LOCKED_SERIES') {
    taxCashFlowUSD = assertSeries(taxModel.taxCashFlowUSD, length, 'economics.taxModel.taxCashFlowUSD');
  } else {
    throw new Error('economics.taxModel.mode must be FLAT_RATE or LOCKED_SERIES for runtime.');
  }

  let takeItems: Array<unknown> = [];
  let lockedRoyalties: Array<number | null> | undefined;
  const royaltyModel = raw.economics.royaltyModel;
  if (!isRecord(royaltyModel)) throw new Error('economics.royaltyModel is required.');
  if (royaltyModel.mode === 'RULES') {
    if (!Array.isArray(royaltyModel.items)) throw new Error('economics.royaltyModel.items must be an array in RULES mode.');
    takeItems = royaltyModel.items;
  } else if (royaltyModel.mode === 'LOCKED_SERIES') {
    lockedRoyalties = assertSeries(royaltyModel.royaltiesUSD, length, 'economics.royaltyModel.royaltiesUSD', { nonNegative: true });
  } else if (royaltyModel.mode !== 'NONE') {
    throw new Error('economics.royaltyModel.mode must be NONE, RULES or LOCKED_SERIES for runtime.');
  }

  if (!isRecord(raw.metals.payableQtyByMetal) || !isRecord(raw.metals.payableQtyUnitByMetal) || !isRecord(raw.metals.priceKeyByMetal)) {
    throw new Error('metals payableQtyByMetal, payableQtyUnitByMetal and priceKeyByMetal are required maps.');
  }

  const syntheticV2 = {
    version: 'project_json_v2',
    meta: raw.meta ?? {},
    time: { masterN, productionStartPeriod, productionStartYear },
    economics: { taxRate },
    series: {
      capexUSD,
      operatingCostsUSD,
      sustainingCapexUSD,
      siteGandA_USD,
      depreciationUSD: raw.economics.depreciationUSD == null ? zeroSeries(length) : assertSeries(raw.economics.depreciationUSD, length, 'economics.depreciationUSD', { nonNegative: true }),
      workingCapitalDeltaUSD,
      reclamationUSD: closureUSD,
      byproductCreditsUSD: zeroSeries(length),
      terminalProceedsUSD,
    },
    metals: {
      payableQtyByMetal: raw.metals.payableQtyByMetal,
      payableQtyUnitByMetal: raw.metals.payableQtyUnitByMetal,
      priceKeyByMetal: raw.metals.priceKeyByMetal,
      auPriceKey: raw.metals.auPriceKey,
    },
    streamsByMetal: raw.streamsByMetal ?? null,
    takeItems,
    operations: raw.operations ?? null,
    economicsBreakdown: null,
    priceOverrides: null,
  };

  const parsed = parseProjectJsonV2Legacy(syntheticV2);
  parsed.engineInputWithoutPrices.yearsByPeriod = [...yearsByPeriod];
  (parsed.engineInputWithoutPrices.phase1 as any).sellingCostsUSD = [...sellingCostsUSD];
  (parsed.engineInput.phase1 as any).sellingCostsUSD = [...sellingCostsUSD];
  if (taxCashFlowUSD) {
    parsed.engineInputWithoutPrices.phase1.taxRate = null;
    parsed.engineInput.phase1.taxRate = null;
    (parsed.engineInputWithoutPrices.phase1 as any).taxCashFlowUSD = [...taxCashFlowUSD];
    (parsed.engineInput.phase1 as any).taxCashFlowUSD = [...taxCashFlowUSD];
    parsed.engineInputWithoutPrices.taxRate = null;
  }
  if (lockedRoyalties) {
    (parsed.engineInputWithoutPrices.phase1 as any).royaltiesUSD = [...lockedRoyalties];
    (parsed.engineInput.phase1 as any).royaltiesUSD = [...lockedRoyalties];
  }
  (parsed.engineInputWithoutPrices.phase1 as any).terminalProceedsUSD = [...terminalProceedsUSD];
  (parsed.engineInput.phase1 as any).terminalProceedsUSD = [...terminalProceedsUSD];
  (parsed.context as any).projectJsonVersion = 'project_json_v3';
  (parsed.context as any).canonicalV3 = {
    periodEndDatesUtc: [...raw.time.periodEndDatesUtc],
    phaseByPeriod: [...raw.time.phaseByPeriod],
    costModel: raw.economics.costModel,
    sellingModel: raw.economics.sellingModel,
    royaltyModel: raw.economics.royaltyModel,
    taxModel: raw.economics.taxModel,
    verification: raw.verification ?? null,
  };
  return parsed;
}