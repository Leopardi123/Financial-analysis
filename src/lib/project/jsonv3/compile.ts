import { parseProjectJsonV1 as parseProjectJsonV2Legacy, type ParsedProjectJsonV1 } from '../jsonv1/parseLegacy.ts';
import type { FiscalLedgerLine, FiscalTakeRule } from '../fiscal/types.ts';
import type {
  ProjectJsonV3,
  ProjectJsonV3RevenueBasis,
  ProjectJsonV3ScheduleAnchor,
  ProjectJsonV3SeriesComponent,
} from './schema.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function assertSeries(raw: unknown, length: number, path: string, options: { nonNegative?: boolean } = {}): Array<number | null> {
  if (!Array.isArray(raw) || raw.length !== length) throw new Error(`${path} must be an array of length ${length} (masterN+1).`);
  return raw.map((value, index) => {
    if (value === null) return null;
    if (!finite(value)) throw new Error(`${path}[${index}] must be null or a finite number.`);
    if (options.nonNegative && value < 0) throw new Error(`${path}[${index}] must be >= 0.`);
    return value;
  });
}
function zeroSeries(length: number): Array<number | null> { return new Array<number | null>(length).fill(0); }
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
function addSeries(left: Array<number | null> | undefined, right: Array<number | null>, length: number): Array<number | null> {
  return left ? sumStrictSeries([left, right], length) : [...right];
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
    return { ...component, seriesUSD: assertSeries(component.seriesUSD, length, `${path}[${index}].seriesUSD`, { nonNegative: true }) };
  });
}

export type ParseProjectJsonV3Options = {
  requireRuntimePlacement?: boolean;
  taxScenario?: 'runtime' | 'report';
  fiscalScenario?: 'runtime' | 'report';
};
type ResolvedScheduleAnchor = ProjectJsonV3ScheduleAnchor & { year: number; sourceId: string };
function resolveScheduleAnchor(raw: unknown, path: string): ResolvedScheduleAnchor | null {
  if (raw == null) return null;
  if (!isRecord(raw)) throw new Error(`${path} must be an object or null.`);
  if (!Number.isInteger(raw.year) || (raw.year as number) < 1900 || (raw.year as number) > 2200) throw new Error(`${path}.year must be a 4-digit integer in range 1900..2200.`);
  if (typeof raw.sourceId !== 'string' || !raw.sourceId.trim()) throw new Error(`${path}.sourceId must identify the company schedule/guidance source.`);
  if (raw.asOfDate != null && (typeof raw.asOfDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.asOfDate))) throw new Error(`${path}.asOfDate must be null or YYYY-MM-DD.`);
  return raw as ResolvedScheduleAnchor;
}

function resolveTime(raw: ProjectJsonV3, options: ParseProjectJsonV3Options): { yearsByPeriod: number[]; productionStartYear: number; runtimePlacementApplied: boolean } {
  const { masterN, productionStartPeriod, nameplateCapacityPeriod, phaseByPeriod, reportPeriodLabels, runtimePlacement } = raw.time;
  const length = masterN + 1;
  if (!Number.isInteger(masterN) || masterN < 0) throw new Error('time.masterN must be an integer >= 0.');
  if (!Number.isInteger(productionStartPeriod) || productionStartPeriod < 0 || productionStartPeriod > masterN) throw new Error('time.productionStartPeriod must be an integer within 0..masterN.');
  if (nameplateCapacityPeriod != null && (!Number.isInteger(nameplateCapacityPeriod) || nameplateCapacityPeriod < productionStartPeriod || nameplateCapacityPeriod > masterN)) throw new Error('time.nameplateCapacityPeriod must be null or an integer within productionStartPeriod..masterN.');
  if (!Array.isArray(phaseByPeriod) || phaseByPeriod.length !== length) throw new Error(`time.phaseByPeriod must have exactly ${length} entries.`);
  if (reportPeriodLabels != null) {
    if (!Array.isArray(reportPeriodLabels) || reportPeriodLabels.length !== length) throw new Error(`time.reportPeriodLabels must be null or have exactly ${length} entries.`);
    reportPeriodLabels.forEach((label, index) => { if (label !== null && (typeof label !== 'string' || !label.trim())) throw new Error(`time.reportPeriodLabels[${index}] must be null or a non-empty string.`); });
  }
  const phaseRank: Record<string, number> = { construction: 0, ramp_up: 1, operations: 2, closure: 3 };
  for (let t = 0; t < phaseByPeriod.length; t += 1) {
    const phase = phaseByPeriod[t];
    if (!(phase in phaseRank)) throw new Error(`time.phaseByPeriod[${t}] is invalid.`);
    if (t > 0 && phaseRank[phase] < phaseRank[phaseByPeriod[t - 1]]) throw new Error(`time.phaseByPeriod must not move backwards at index ${t}.`);
  }
  const firstNonConstruction = phaseByPeriod.findIndex((phase) => phase !== 'construction');
  if (firstNonConstruction !== productionStartPeriod) throw new Error(`productionStartPeriod=${productionStartPeriod} must equal first non-construction report period=${firstNonConstruction}.`);
  if (phaseByPeriod[productionStartPeriod] !== 'ramp_up' && phaseByPeriod[productionStartPeriod] !== 'operations') throw new Error('productionStartPeriod must point to ramp_up or operations.');

  const requireRuntimePlacement = options.requireRuntimePlacement !== false;
  if (runtimePlacement == null) {
    if (requireRuntimePlacement) throw new Error('time.runtimePlacement requires at least constructionStart, productionStart or a sourced nameplateCapacity anchor for Project/Corporate/Compare Stocks runtime. Report reconciliation may run without calendar placement because the economics are relative.');
    const productionStartYear = 2000;
    const firstCalendarYear = productionStartYear - productionStartPeriod;
    return { yearsByPeriod: Array.from({ length }, (_, t) => firstCalendarYear + t), productionStartYear, runtimePlacementApplied: false };
  }
  if (!isRecord(runtimePlacement)) throw new Error('time.runtimePlacement must be an object or null.');
  const constructionStart = resolveScheduleAnchor(runtimePlacement.constructionStart, 'time.runtimePlacement.constructionStart');
  const productionStart = resolveScheduleAnchor(runtimePlacement.productionStart, 'time.runtimePlacement.productionStart');
  const nameplateCapacity = resolveScheduleAnchor(runtimePlacement.nameplateCapacity, 'time.runtimePlacement.nameplateCapacity');
  if (!constructionStart && !productionStart && !nameplateCapacity) throw new Error('time.runtimePlacement requires at least one sourced anchor: constructionStart, productionStart or nameplateCapacity.');
  if (constructionStart && productionStartPeriod === 0) throw new Error('time.runtimePlacement.constructionStart cannot be used when productionStartPeriod=0 because the relative economic axis contains no construction period before production.');
  if (nameplateCapacity && nameplateCapacityPeriod == null) throw new Error('time.runtimePlacement.nameplateCapacity requires time.nameplateCapacityPeriod from source evidence.');

  const candidates: Array<{ source: string; year: number }> = [];
  if (constructionStart) candidates.push({ source: 'constructionStart', year: constructionStart.year });
  if (productionStart) candidates.push({ source: 'productionStart', year: productionStart.year - productionStartPeriod });
  if (nameplateCapacity && nameplateCapacityPeriod != null) candidates.push({ source: 'nameplateCapacity', year: nameplateCapacity.year - nameplateCapacityPeriod });
  const firstCalendarYear = candidates[0]?.year;
  if (!Number.isInteger(firstCalendarYear)) throw new Error('Unable to resolve runtime calendar placement.');
  if (candidates.some((candidate) => candidate.year !== firstCalendarYear)) throw new Error(`PLACEMENT_CONFLICT: sourced schedule anchors imply different relative t=0 calendar years: ${candidates.map((item) => `${item.source}=>${item.year}`).join(', ')}. Do not stretch/interpolate or shift economic arrays; verify whether the underlying technical schedule changed.`);
  const productionStartYear = (firstCalendarYear as number) + productionStartPeriod;
  return { yearsByPeriod: Array.from({ length }, (_, t) => (firstCalendarYear as number) + t), productionStartYear, runtimePlacementApplied: true };
}

function assertRuntimeReadyEconomicSources(raw: ProjectJsonV3): void {
  const unresolved: string[] = [];
  if (raw.economics.costModel?.mode === 'UNKNOWN') unresolved.push('economics.costModel');
  if (raw.economics.sellingModel?.mode === 'UNKNOWN') unresolved.push('economics.sellingModel');
  if (raw.economics.fiscalTakeModel?.mode === 'UNKNOWN') unresolved.push('economics.fiscalTakeModel');
  if (raw.economics.taxModel?.mode === 'UNKNOWN') unresolved.push('economics.taxModel');
  if (unresolved.length > 0) throw new Error(`project_json_v3 draft placeholder(s) must be resolved from the technical report before runtime: ${unresolved.join(', ')}. UNKNOWN is not an economic assumption.`);
}
function setLedgerLine(ledger: Partial<Record<FiscalLedgerLine, Array<number | null>>>, line: FiscalLedgerLine, series: Array<number | null>, length: number): void {
  ledger[line] = ledger[line] ? sumStrictSeries([ledger[line] as Array<number | null>, series], length) : [...series];
}

/** Preserve directly reported payable quantity as canonical downstream production. */
function resolveCommercialQuantities(raw: ProjectJsonV3, length: number): {
  payabilityFactorByMetal: Record<string, Array<number | null>>;
  actualPayableQtyByMetal: Record<string, Array<number | null>>;
} {
  if (!isRecord(raw.metals.payableQtyByMetal) || !isRecord(raw.metals.priceKeyByMetal) || !isRecord(raw.metals.payableQtyUnitByMetal) || !isRecord(raw.metals.revenueBasisByMetal)) throw new Error('metals payableQtyByMetal, payableQtyUnitByMetal, priceKeyByMetal and revenueBasisByMetal are required maps.');
  const metalInProduct = raw.metals.metalInProductQtyByMetal ?? {};
  if (!isRecord(metalInProduct)) throw new Error('metals.metalInProductQtyByMetal must be an object or null.');
  const metals = Object.keys(raw.metals.revenueBasisByMetal);
  if (metals.length === 0) throw new Error('metals.revenueBasisByMetal must contain at least one economic metal.');
  for (const metal of metals) {
    if (!(metal in raw.metals.priceKeyByMetal)) throw new Error(`Missing metals.priceKeyByMetal.${metal}.`);
    if (!(metal in raw.metals.payableQtyUnitByMetal)) throw new Error(`Missing metals.payableQtyUnitByMetal.${metal}.`);
  }
  const extraPrice = Object.keys(raw.metals.priceKeyByMetal).filter((metal) => !metals.includes(metal));
  if (extraPrice.length > 0) throw new Error(`metals.priceKeyByMetal contains metal(s) without revenueBasisByMetal: ${extraPrice.join(', ')}.`);

  const payabilityFactorByMetal: Record<string, Array<number | null>> = {};
  const actualPayableQtyByMetal: Record<string, Array<number | null>> = {};
  for (const metal of metals) {
    const basis = raw.metals.revenueBasisByMetal[metal] as ProjectJsonV3RevenueBasis;
    const payable = assertSeries(raw.metals.payableQtyByMetal[metal], length, `metals.payableQtyByMetal.${metal}`, { nonNegative: true });
    actualPayableQtyByMetal[metal] = payable;
    if (basis === 'PAYABLE_DIRECT') {
      payabilityFactorByMetal[metal] = new Array<number | null>(length).fill(1);
      continue;
    }
    if (basis !== 'METAL_IN_PRODUCT_WITH_PAYABILITY_DEDUCTION') throw new Error(`Unsupported revenue basis for ${metal}: ${String(basis)}.`);
    const gross = assertSeries(metalInProduct[metal], length, `metals.metalInProductQtyByMetal.${metal}`, { nonNegative: true });
    payabilityFactorByMetal[metal] = Array.from({ length }, (_, t) => {
      if (!finite(gross[t]) || !finite(payable[t])) return null;
      const grossValue = gross[t] as number;
      const payableValue = payable[t] as number;
      if (payableValue > grossValue + 1e-9) throw new Error(`Payable quantity exceeds metal-in-product for ${metal} at t=${t}.`);
      if (grossValue === 0) return payableValue === 0 ? 1 : null;
      return payableValue / grossValue;
    });
  }
  if (raw.streamsByMetal && Object.keys(raw.streamsByMetal).length > 0) {
    const nonPayableBasis = metals.filter((metal) => raw.metals.revenueBasisByMetal[metal] !== 'PAYABLE_DIRECT');
    if (nonPayableBasis.length > 0) throw new Error(`Streams with METAL_IN_PRODUCT_WITH_PAYABILITY_DEDUCTION are not yet representable without ambiguous stream/payability ordering: ${nonPayableBasis.join(', ')}. Use source-backed PAYABLE_DIRECT or leave unverified.`);
  }
  return { payabilityFactorByMetal, actualPayableQtyByMetal };
}

export function isProjectJsonV3(raw: unknown): raw is ProjectJsonV3 { return isRecord(raw) && raw.version === 'project_json_v3'; }

export function parseProjectJsonV3(rawUnknown: unknown, options: ParseProjectJsonV3Options = {}): ParsedProjectJsonV1 {
  if (!isProjectJsonV3(rawUnknown)) throw new Error('raw.version must be "project_json_v3".');
  const raw = rawUnknown as ProjectJsonV3;
  if (!isRecord(raw.time) || !isRecord(raw.metals) || !isRecord(raw.economics) || !isRecord(raw.capital)) throw new Error('project_json_v3 requires time, metals, economics and capital objects.');
  const { masterN, productionStartPeriod } = raw.time;
  const length = masterN + 1;
  assertRuntimeReadyEconomicSources(raw);
  const { yearsByPeriod, productionStartYear, runtimePlacementApplied } = resolveTime(raw, options);

  const capexUSD = assertSeries(raw.capital.capexUSD, length, 'capital.capexUSD', { nonNegative: true });
  const sustainingCapexUSD = assertSeries(raw.capital.sustainingCapexUSD, length, 'capital.sustainingCapexUSD', { nonNegative: true });
  const closureUSD = assertSeries(raw.capital.closureUSD, length, 'capital.closureUSD', { nonNegative: true });
  const workingCapitalDeltaUSD = raw.capital.workingCapitalDeltaUSD == null ? zeroSeries(length) : assertSeries(raw.capital.workingCapitalDeltaUSD, length, 'capital.workingCapitalDeltaUSD');
  const terminalProceedsUSD = raw.capital.terminalProceedsUSD == null ? zeroSeries(length) : assertSeries(raw.capital.terminalProceedsUSD, length, 'capital.terminalProceedsUSD', { nonNegative: true });

  let operatingCostsUSD: Array<number | null>;
  let siteGandA_USD: Array<number | null>;
  const fiscalLedgerUSD: Partial<Record<FiscalLedgerLine, Array<number | null>>> = {};
  const costModel = raw.economics.costModel;
  if (!isRecord(costModel)) throw new Error('economics.costModel is required.');
  if (costModel.mode === 'AGGREGATE') {
    operatingCostsUSD = assertSeries(costModel.operatingCostsUSD, length, 'economics.costModel.operatingCostsUSD', { nonNegative: true });
    siteGandA_USD = costModel.siteGandA_USD == null ? zeroSeries(length) : assertSeries(costModel.siteGandA_USD, length, 'economics.costModel.siteGandA_USD', { nonNegative: true });
  } else if (costModel.mode === 'COMPONENTS') {
    if (!Array.isArray(costModel.components) || costModel.components.length === 0) throw new Error('economics.costModel.components must be non-empty in COMPONENTS mode.');
    const components = validateComponents(costModel.components, length, 'economics.costModel.components');
    const ga = components.filter((component) => component.category === 'site_ga').map((component) => component.seriesUSD);
    const site = components.filter((component) => component.category !== 'site_ga').map((component) => component.seriesUSD);
    operatingCostsUSD = sumStrictSeries(site, length);
    siteGandA_USD = sumStrictSeries(ga, length);
    const lineByCategory: Record<string, FiscalLedgerLine> = { mining: 'MINING_COST', processing: 'PROCESSING_COST', site_ga: 'SITE_GA', other_site_opex: 'OTHER_SITE_OPEX' };
    for (const component of components) setLedgerLine(fiscalLedgerUSD, lineByCategory[component.category], component.seriesUSD, length);
  } else throw new Error('economics.costModel.mode must be AGGREGATE or COMPONENTS for runtime.');

  let sellingCostsUSD: Array<number | null> = zeroSeries(length);
  const sellingModel = raw.economics.sellingModel;
  if (!isRecord(sellingModel)) throw new Error('economics.sellingModel is required.');
  if (sellingModel.mode === 'AGGREGATE') sellingCostsUSD = assertSeries(sellingModel.sellingCostsUSD, length, 'economics.sellingModel.sellingCostsUSD', { nonNegative: true });
  else if (sellingModel.mode === 'COMPONENTS') {
    if (!Array.isArray(sellingModel.components) || sellingModel.components.length === 0) throw new Error('economics.sellingModel.components must be non-empty in COMPONENTS mode.');
    const components = validateComponents(sellingModel.components, length, 'economics.sellingModel.components');
    sellingCostsUSD = sumStrictSeries(components.map((component) => component.seriesUSD), length);
    const lineByCategory: Record<string, FiscalLedgerLine> = { treatment_charge: 'TREATMENT_CHARGE', refining_charge: 'REFINING_CHARGE', transport: 'TRANSPORT', insurance: 'INSURANCE', marketing: 'MARKETING', other_offsite: 'OTHER_OFFSITE' };
    for (const component of components) setLedgerLine(fiscalLedgerUSD, lineByCategory[component.category], component.seriesUSD, length);
  } else if (sellingModel.mode !== 'NONE') throw new Error('economics.sellingModel.mode must be NONE, AGGREGATE or COMPONENTS for runtime.');

  const scenarioLeg = options.fiscalScenario ?? options.taxScenario ?? 'runtime';
  let taxRate: number | null = null;
  let taxCashFlowUSD: Array<number | null> | undefined;
  let taxLossCarryforward = false;
  const taxModel = raw.economics.taxModel;
  if (!isRecord(taxModel)) throw new Error('economics.taxModel is required.');
  if (taxModel.mode === 'FLAT_RATE') {
    if (!finite(taxModel.taxRate) || taxModel.taxRate < 0 || taxModel.taxRate > 0.6) throw new Error('economics.taxModel.taxRate must be finite within [0, 0.6].');
    taxRate = taxModel.taxRate;
    taxLossCarryforward = taxModel.lossCarryforward === true;
  } else if (taxModel.mode === 'LOCKED_SERIES') {
    if (scenarioLeg !== 'report') throw new Error('economics.taxModel LOCKED_SERIES is report/scenario locked and cannot be reused for normal runtime without an explicit runtime proxy.');
    taxCashFlowUSD = assertSeries(taxModel.taxCashFlowUSD, length, 'economics.taxModel.taxCashFlowUSD');
  } else if (taxModel.mode === 'REPORT_LOCKED_WITH_RUNTIME_PROXY') {
    if (scenarioLeg === 'report') taxCashFlowUSD = assertSeries(taxModel.reportTaxCashFlowUSD, length, 'economics.taxModel.reportTaxCashFlowUSD');
    else {
      if (!isRecord(taxModel.runtime) || taxModel.runtime.method !== 'NOMINAL_RATE_WITH_LOSS_CARRYFORWARD') throw new Error('economics.taxModel.runtime.method must be NOMINAL_RATE_WITH_LOSS_CARRYFORWARD.');
      if (!finite(taxModel.runtime.taxRate) || taxModel.runtime.taxRate < 0 || taxModel.runtime.taxRate > 0.6) throw new Error('economics.taxModel.runtime.taxRate must be finite within [0, 0.6].');
      taxRate = taxModel.runtime.taxRate;
      taxLossCarryforward = true;
    }
  } else throw new Error('economics.taxModel.mode must be FLAT_RATE, LOCKED_SERIES or REPORT_LOCKED_WITH_RUNTIME_PROXY for runtime.');

  let fiscalTakeRules: FiscalTakeRule[] = [];
  let lockedRevenueFiscal: Array<number | null> | undefined;
  let lockedOperatingFiscal: Array<number | null> | undefined;
  let preTaxChargesUSD: Array<number | null> | undefined;
  let postTaxChargesUSD: Array<number | null> | undefined;
  const fiscalTakeModel = raw.economics.fiscalTakeModel;
  if (!isRecord(fiscalTakeModel)) throw new Error('economics.fiscalTakeModel is required.');
  const applyLockedFiscal = (series: Array<number | null>, placement: unknown): void => {
    if (placement === 'REVENUE_DEDUCTION') lockedRevenueFiscal = addSeries(lockedRevenueFiscal, series, length);
    else if (placement === 'OPERATING_EXPENSE') lockedOperatingFiscal = addSeries(lockedOperatingFiscal, series, length);
    else if (placement === 'PRE_TAX_CHARGE') preTaxChargesUSD = addSeries(preTaxChargesUSD, series, length);
    else if (placement === 'POST_TAX_CHARGE') postTaxChargesUSD = addSeries(postTaxChargesUSD, series, length);
    else throw new Error(`Unsupported locked fiscal placement=${String(placement)}.`);
  };

  if (fiscalTakeModel.mode === 'RULES') {
    if (!Array.isArray(fiscalTakeModel.items)) throw new Error('economics.fiscalTakeModel.items must be an array in RULES mode.');
    fiscalTakeRules = [...(fiscalTakeModel.items as FiscalTakeRule[])];
    const dynamicIds = new Set(fiscalTakeRules.map((item) => item?.id).filter((id): id is string => typeof id === 'string' && id.length > 0));
    const lockedIds = new Set<string>();
    const reportLockedItems = fiscalTakeModel.reportLockedItems ?? [];
    if (!Array.isArray(reportLockedItems)) throw new Error('economics.fiscalTakeModel.reportLockedItems must be an array or null.');
    for (const [index, item] of reportLockedItems.entries()) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) throw new Error(`economics.fiscalTakeModel.reportLockedItems[${index}].id must be non-empty.`);
      if (dynamicIds.has(item.id) || lockedIds.has(item.id)) throw new Error(`economics.fiscalTakeModel contains duplicate fiscal id=${item.id}.`);
      lockedIds.add(item.id);
      if (scenarioLeg === 'report') {
        const series = assertSeries(item.reportFiscalTakeUSD, length, `economics.fiscalTakeModel.reportLockedItems[${index}].reportFiscalTakeUSD`, { nonNegative: true });
        applyLockedFiscal(series, item.placement);
      } else {
        if (!item.runtimeProxyRule) throw new Error(`Fiscal take ${item.id} is report-locked and has no runtimeProxyRule; normal Project/Corporate/Compare Stocks runtime must fail closed.`);
        if (dynamicIds.has(item.runtimeProxyRule.id)) throw new Error(`runtimeProxyRule id=${item.runtimeProxyRule.id} collides with a dynamic fiscal rule id.`);
        dynamicIds.add(item.runtimeProxyRule.id);
        fiscalTakeRules.push(item.runtimeProxyRule);
      }
    }
  } else if (fiscalTakeModel.mode === 'LOCKED_SERIES') {
    if (scenarioLeg !== 'report') throw new Error('economics.fiscalTakeModel LOCKED_SERIES is scenario-limited and cannot be reused in normal runtime without a dynamic proxy.');
    const locked = assertSeries(fiscalTakeModel.fiscalTakeUSD, length, 'economics.fiscalTakeModel.fiscalTakeUSD', { nonNegative: true });
    applyLockedFiscal(locked, fiscalTakeModel.placement);
  } else if (fiscalTakeModel.mode !== 'NONE') throw new Error('economics.fiscalTakeModel.mode must be NONE, RULES or LOCKED_SERIES for runtime.');

  if (lockedRevenueFiscal) sellingCostsUSD = sumStrictSeries([sellingCostsUSD, lockedRevenueFiscal], length);

  const { payabilityFactorByMetal, actualPayableQtyByMetal } = resolveCommercialQuantities(raw, length);
  const syntheticV2 = {
    version: 'project_json_v2',
    meta: raw.meta ?? {},
    time: { masterN, productionStartPeriod, productionStartYear },
    economics: { taxRate },
    series: {
      capexUSD, operatingCostsUSD, sustainingCapexUSD, siteGandA_USD,
      depreciationUSD: raw.economics.depreciationUSD == null ? zeroSeries(length) : assertSeries(raw.economics.depreciationUSD, length, 'economics.depreciationUSD', { nonNegative: true }),
      workingCapitalDeltaUSD, reclamationUSD: closureUSD, byproductCreditsUSD: zeroSeries(length), terminalProceedsUSD,
    },
    metals: {
      payableQtyByMetal: actualPayableQtyByMetal,
      payableQtyUnitByMetal: raw.metals.payableQtyUnitByMetal,
      priceKeyByMetal: raw.metals.priceKeyByMetal,
      auPriceKey: raw.metals.auPriceKey,
    },
    streamsByMetal: raw.streamsByMetal ?? null,
    takeItems: [],
    operations: raw.operations ?? null,
    economicsBreakdown: null,
    priceOverrides: null,
  };

  const parsed = parseProjectJsonV2Legacy(syntheticV2);
  parsed.engineInputWithoutPrices.yearsByPeriod = [...yearsByPeriod];
  for (const target of [parsed.engineInputWithoutPrices.phase1 as any, parsed.engineInput.phase1 as any]) {
    target.sellingCostsUSD = [...sellingCostsUSD];
    target.taxLossCarryforward = taxLossCarryforward;
    target.payabilityFactorByMetal = payabilityFactorByMetal;
    target.fiscalTakeRules = fiscalTakeRules;
    target.fiscalLedgerUSD = fiscalLedgerUSD;
    target.terminalProceedsUSD = [...terminalProceedsUSD];
    if (taxCashFlowUSD) { target.taxRate = null; target.taxCashFlowUSD = [...taxCashFlowUSD]; }
    if (lockedOperatingFiscal) target.royaltiesUSD = [...lockedOperatingFiscal];
    if (preTaxChargesUSD) target.preTaxChargesUSD = [...preTaxChargesUSD];
    if (postTaxChargesUSD) target.postTaxChargesUSD = [...postTaxChargesUSD];
  }
  if (taxCashFlowUSD) parsed.engineInputWithoutPrices.taxRate = null;
  (parsed.context as any).projectJsonVersion = 'project_json_v3';
  (parsed.context as any).canonicalV3 = {
    relativePeriodCount: length,
    reportPeriodLabels: raw.time.reportPeriodLabels == null ? null : [...raw.time.reportPeriodLabels],
    phaseByPeriod: [...raw.time.phaseByPeriod],
    nameplateCapacityPeriod: raw.time.nameplateCapacityPeriod ?? null,
    runtimePlacement: raw.time.runtimePlacement ?? null,
    runtimePlacementApplied,
    revenueBasisByMetal: { ...raw.metals.revenueBasisByMetal },
    actualPayableQtyByMetal,
    metalInProductQtyByMetal: raw.metals.metalInProductQtyByMetal ?? null,
    costModel: raw.economics.costModel,
    sellingModel: raw.economics.sellingModel,
    fiscalTakeModel: raw.economics.fiscalTakeModel,
    fiscalScenarioUsed: scenarioLeg,
    taxModel: raw.economics.taxModel,
    taxScenarioUsed: scenarioLeg,
    verification: raw.verification ?? null,
  };
  return parsed;
}
