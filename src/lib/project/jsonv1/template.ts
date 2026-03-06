import type { ProjectJsonV1, QtyUnit } from './schema.ts';
import { PRICE_KEY_DEFINITIONS } from '../../prices/keys.ts';

type NullableNumberSeries = Array<number | null>;

const DEFAULT_MASTER_N = 10;
const MONEY_UNIT_SCALE = 'USD (full dollars)';
const TONNAGE_UNIT_SCALE = 'tonnes';

const ECONOMICS_BREAKDOWN_SOURCE_CHOICES = ['FS', 'Other', 'PEA', 'PFS'] as const;
const ORE_TONNAGE_UNIT_CHOICES = ['long_ton', 'short_ton', 'tonne'] as const;
const ROYALTY_BASE_CHOICES = ['ebit', 'ebitda', 'quantity', 'revenue'] as const;
const ROYALTY_RATE_TYPE_CHOICES = ['NSR_pct', 'ad_valorem_pct'] as const;
const TAKE_BASE_TYPE_CHOICES = ['BY_METAL_REVENUE', 'PAYABLE_QTY', 'REVENUE'] as const;
const TAKE_CAP_TYPE_CHOICES = ['none', 'payableQty', 'revenue'] as const;
const TAKE_JURISDICTION_LEVEL_CHOICES = ['contractual', 'municipal', 'national', 'other', 'provincial_state'] as const;
const TAKE_RATE_TYPE_CHOICES = ['FIXED', 'TIERED', 'TIERED_REVENUE'] as const;
const TAKE_SCOPE_CHOICES = ['metalSpecific', 'project'] as const;
const TAKE_THRESHOLD_TYPE_CHOICES = ['price', 'revenue'] as const;
const TAKE_TYPE_CHOICES = ['AD_VALOREM', 'NSR'] as const;
const THROUGHPUT_UNIT_CHOICES = ['tpa', 'tpd'] as const;
const VERSION_CHOICES = ['project_json_v2'] as const;
const CURRENCY_CHOICES = ['USD'] as const;
const QTY_UNIT_CHOICES = ['g', 'kg', 'lb', 'long_ton', 'short_ton', 'tonne', 'toz'] as const;
const PRICE_KEY_CHOICES = PRICE_KEY_DEFINITIONS.map((definition) => definition.priceKey);

type ProjectJsonV1Template = ProjectJsonV1 & Record<string, unknown>;

function isChoiceKey(key: string): boolean {
  return key.startsWith('_choices_');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeSeries(value: unknown, length: number): NullableNumberSeries {
  const normalized = Array<number | null>(length).fill(null);
  if (!Array.isArray(value)) {
    return normalized;
  }

  for (let i = 0; i < length; i += 1) {
    const item = value[i];
    normalized[i] = typeof item === 'number' && Number.isFinite(item) ? item : null;
  }

  return normalized;
}

function normalizeSeriesMap(value: unknown, length: number): Record<string, NullableNumberSeries> {
  const raw = asRecord(value);
  const out: Record<string, NullableNumberSeries> = {};
  for (const [metal, series] of Object.entries(raw)) {
    if (isChoiceKey(metal)) {
      continue;
    }
    out[metal] = normalizeSeries(series, length);
  }
  return out;
}

function normalizeStringMap(value: unknown): Record<string, string> {
  const raw = asRecord(value);
  const out: Record<string, string> = {};
  for (const [key, mapValue] of Object.entries(raw)) {
    if (isChoiceKey(key)) {
      continue;
    }
    if (typeof mapValue === 'string') {
      out[key] = mapValue;
    }
  }
  return out;
}


function normalizeQtyUnitMap(value: unknown): Record<string, QtyUnit> {
  const raw = asRecord(value);
  const out: Record<string, QtyUnit> = {};
  for (const [key, mapValue] of Object.entries(raw)) {
    if (isChoiceKey(key)) {
      continue;
    }
    if (mapValue === 'toz' || mapValue === 'g' || mapValue === 'kg' || mapValue === 'lb' || mapValue === 'tonne' || mapValue === 'short_ton' || mapValue === 'long_ton') {
      out[key] = mapValue;
    }
  }
  return out;
}

type RoyaltyDetailRow = NonNullable<NonNullable<ProjectJsonV1['economicsBreakdown']>['royaltiesDetail']>[number];

function buildTemplateRoyaltyRow(length: number): RoyaltyDetailRow & Record<string, unknown> {
  return {
    id: 'royalty_1',
    label: 'Royalty 1',
    name: null,
    base: 'revenue',
    rateType: null,
    rate: null,
    royaltyUSD: Array<number | null>(length).fill(null),
    source: null,
    notes: null,
    _choices_base: [...ROYALTY_BASE_CHOICES],
    _choices_rateType: [...ROYALTY_RATE_TYPE_CHOICES],
    _choices_source: [...ECONOMICS_BREAKDOWN_SOURCE_CHOICES],
  };
}

function normalizeRoyaltiesDetail(value: unknown, length: number): NonNullable<NonNullable<ProjectJsonV1['economicsBreakdown']>['royaltiesDetail']> {
  const templateRow = buildTemplateRoyaltyRow(length);

  if (!Array.isArray(value) || value.length === 0) {
    return [templateRow];
  }

  const rows = value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((item) => ({
      ...templateRow,
      id: typeof item.id === 'string' ? item.id : templateRow.id,
      label: typeof item.label === 'string' ? item.label : templateRow.label,
      name: typeof item.name === 'string' ? item.name : templateRow.name,
      base: item.base === 'revenue' || item.base === 'ebit' || item.base === 'ebitda' || item.base === 'quantity'
        ? item.base
        : templateRow.base,
      rateType: typeof item.rateType === 'string' ? item.rateType : templateRow.rateType,
      rate: typeof item.rate === 'number' && Number.isFinite(item.rate) ? item.rate : null,
      royaltyUSD: Array.isArray(item.royaltyUSD) ? normalizeSeries(item.royaltyUSD, length) : templateRow.royaltyUSD,
      source: item.source === 'PEA' || item.source === 'PFS' || item.source === 'FS' || item.source === 'Other' ? item.source : templateRow.source,
      notes: typeof item.notes === 'string' ? item.notes : templateRow.notes,
    }));

  return rows.length > 0 ? rows : [templateRow];
}

export function buildProjectJsonV1Template(existing?: ProjectJsonV1): ProjectJsonV1Template {
  const root = asRecord(existing);
  const rootTime = asRecord(root.time);
  const requestedMasterN = rootTime.masterN;
  const masterN = Number.isInteger(requestedMasterN) && (requestedMasterN as number) >= 0
    ? requestedMasterN as number
    : DEFAULT_MASTER_N;
  const seriesLength = masterN + 1;
  const productionStartPeriod = Number.isInteger(rootTime.productionStartPeriod) ? rootTime.productionStartPeriod as number : 0;
  const productionStartYear = Number.isInteger(rootTime.productionStartYear)
    ? rootTime.productionStartYear as number
    : (new Date().getUTCFullYear() + productionStartPeriod);

  const meta = asRecord(root.meta);
  const economics = asRecord(root.economics);
  const equity = asRecord(root.equity);
  const series = asRecord(root.series);
  const metals = asRecord(root.metals);
  const operations = asRecord(root.operations);
  const operationsCapacity = asRecord(operations.capacity);
  const economicsBreakdown = asRecord(root.economicsBreakdown);
  const economicsBreakdownMeta = asRecord(economicsBreakdown.meta);
  const economicsBreakdownCogs = asRecord(economicsBreakdown.cogs);
  const economicsBreakdownSelling = asRecord(economicsBreakdown.selling);
  const economicsBreakdownTaxesDetail = economicsBreakdown.taxesDetail === null
    ? null
    : asRecord(economicsBreakdown.taxesDetail);

  const output = {
    version: 'project_json_v2',
    _description_numeric_scale: `Global input scale: enter all monetary series in ${MONEY_UNIT_SCALE}, and enter tonnage/quantity series in ${TONNAGE_UNIT_SCALE} unless a metal-specific payableQtyUnitByMetal says otherwise.`,
    _choices_version: [...VERSION_CHOICES],
    meta: {
      projectId: typeof meta.projectId === 'string' ? meta.projectId : '',
      projectName: typeof meta.projectName === 'string' ? meta.projectName : '',
      currency: 'USD',
      _choices_currency: [...CURRENCY_CHOICES],
      notes: typeof meta.notes === 'string' && meta.notes.trim().length > 0 ? meta.notes : 'Per-period arrays must be length masterN+1. Use toz (not oz) for payableQtyUnitByMetal. Price key examples: Au=XAU_USD_TOZ, Ag=XAG_USD_TOZ, Cu=CU_USD_LB or CU_USD_TONNE. Copper: CU_USD_LB = COMEX basis, CU_USD_TONNE = LME basis. If CU_USD_TONNE series is missing, system can derive from CU_USD_LB using 1 tonne = 2204.6226218 lb (warns about basis). Provide site G&A in ONE place only; prefer series.siteGandA_USD.',
    },
    time: {
      masterN,
      _description_masterN: 'Total number of modeled periods minus 1. All aligned arrays are indexed t=0..masterN and must have length masterN+1.',
      _example_masterN: 15,
      productionStartPeriod,
      _description_productionStartPeriod: '0-based index of the first production period. t=0 is the first model period. The array element at index productionStartPeriod is the first production year.',
      _example_productionStartPeriod: 2,
      _description_productionStartPeriod_example: 'Example: if productionStartPeriod = 2, then t=0 is the first model period, t=1 is the second model period, and t=2 is the first production period. In an aligned array like capexUSD, capexUSD[2] belongs to the first production year.',
      _description_timeseries_alignment: 'All time-series arrays use the same 0-based period index t=0..masterN. The value at index productionStartPeriod is the first production period in all aligned arrays.',
      _example_timeseries_alignment: {
        productionStartPeriod: 2,
        capexUSD: [61.54, 159.11, 0, 5.75, 32.05, 0, 23.05, 5.38, 0, 35.72, 40.25, 0, 0, 0, 0.58, 0],
        interpretation: [
          'capexUSD[0] = pre-production / construction period',
          'capexUSD[1] = pre-production / construction period',
          'capexUSD[2] = first production period',
          'capexUSD[3] = second production period',
        ],
        note: 'Production starts at capexUSD[2] (index 2), not capexUSD[1].',
      },
      productionStartYear,
      _description_productionStartYear: 'Calendar year at index productionStartPeriod. Derived calendar year per period is year(t) = productionStartYear + (t - productionStartPeriod).',
      _example_productionStartYear: 2030,
    },
    economics: {
      taxRate: typeof economics.taxRate === 'number' && Number.isFinite(economics.taxRate) ? economics.taxRate : null,
    },
    equity: {
      fdExtraShares: typeof equity.fdExtraShares === 'number' && Number.isFinite(equity.fdExtraShares) ? equity.fdExtraShares : 0,
      fdNotes: typeof equity.fdNotes === 'string' ? equity.fdNotes : '',
    },
    series: {
      capexUSD: normalizeSeries(series.capexUSD, seriesLength),
      _description_capexUSD: 'Per-period capital expenditure aligned to t=0..masterN. Enter values in full USD (whole dollars).',
      _example_capexUSD: [61.54, 159.11, 0, 5.75],
      _unit_capexUSD: MONEY_UNIT_SCALE,
      operatingCostsUSD: normalizeSeries(series.operatingCostsUSD, seriesLength),
      _description_operatingCostsUSD: 'Per-period operating costs aligned to t=0..masterN. Enter values in full USD (whole dollars).',
      _example_operatingCostsUSD: [0, 0, 120.5, 121.1],
      _unit_operatingCostsUSD: MONEY_UNIT_SCALE,
      sustainingCapexUSD: normalizeSeries(series.sustainingCapexUSD, seriesLength),
      _description_sustainingCapexUSD: 'Per-period sustaining capital aligned to t=0..masterN. Enter values in full USD (whole dollars).',
      _example_sustainingCapexUSD: [0, 0, 12.0, 14.5],
      _unit_sustainingCapexUSD: MONEY_UNIT_SCALE,
      _description_revenueUSD: 'Per-period project revenue (if entered in upstream workflows) must use full USD (whole dollars).',
      _example_revenueUSD: [0, 0, 256.8, 260.1],
      _unit_revenueUSD: MONEY_UNIT_SCALE,
      _description_taxesUSD: 'Per-period total taxes (if entered/overridden upstream) must use full USD (whole dollars).',
      _example_taxesUSD: [0, 0, 35.2, 36.0],
      _unit_taxesUSD: MONEY_UNIT_SCALE,
      siteGandA_USD: normalizeSeries(series.siteGandA_USD, seriesLength),
      depreciationUSD: normalizeSeries(series.depreciationUSD, seriesLength),
      workingCapitalDeltaUSD: normalizeSeries(series.workingCapitalDeltaUSD, seriesLength),
      _description_workingCapitalUSD: 'Use series.workingCapitalDeltaUSD for per-period working-capital movement. Enter values in full USD (whole dollars).',
      _example_workingCapitalUSD: [0, 0, -5.2, 1.1],
      _unit_workingCapitalUSD: MONEY_UNIT_SCALE,
      royaltiesUSD: normalizeSeries(series.royaltiesUSD, seriesLength),
      _description_royaltiesUSD: 'Per-period royalties aligned to t=0..masterN. Enter values in full USD (whole dollars).',
      _example_royaltiesUSD: [0, 0, 12.4, 12.8],
      _unit_royaltiesUSD: MONEY_UNIT_SCALE,
      reclamationUSD: normalizeSeries(series.reclamationUSD, seriesLength),
      byproductCreditsUSD: normalizeSeries(series.byproductCreditsUSD, seriesLength),
    },
    metals: {
      payableQtyByMetal: normalizeSeriesMap(metals.payableQtyByMetal, seriesLength),
      _description_payableQtyByMetal: 'Per-period payable quantity by metal; each metal array must align to t=0..masterN. Enter physical quantities in whole units, with unit defined by payableQtyUnitByMetal.',
      _example_payableQtyByMetal: { Au: [0, 0, 100, 100], Cu: [0, 0, 2000, 2000] },
      _unit_payableQtyByMetal: 'Physical units per payableQtyUnitByMetal (no thousand/million scaling)',
      _description_producedQtyByMetal: 'If you track produced quantities externally, use the same scale convention as payableQtyByMetal: whole physical units defined by each metal unit map.',
      _example_producedQtyByMetal: { Au: [0, 0, 105, 104], Cu: [0, 0, 2100, 2050] },
      _unit_producedQtyByMetal: 'Physical units per metal (no thousand/million scaling)',
      payableQtyUnitByMetal: normalizeQtyUnitMap(metals.payableQtyUnitByMetal),
      priceKeyByMetal: normalizeStringMap(metals.priceKeyByMetal),
      auPriceKey: typeof metals.auPriceKey === 'string' ? metals.auPriceKey : '',
    },
    streamsByMetal: root.streamsByMetal && typeof root.streamsByMetal === 'object' && !Array.isArray(root.streamsByMetal)
      ? root.streamsByMetal as NonNullable<ProjectJsonV1['streamsByMetal']>
      : null,
    takeItems: Array.isArray(root.takeItems) ? root.takeItems : [],
    operations: {
      capacity: {
        throughputUnit: operationsCapacity.throughputUnit === 'tpa' ? 'tpa' : 'tpd',
        _choices_throughputUnit: [...THROUGHPUT_UNIT_CHOICES],
        nameplateThroughput: typeof operationsCapacity.nameplateThroughput === 'number' && Number.isFinite(operationsCapacity.nameplateThroughput)
          ? operationsCapacity.nameplateThroughput
          : null,
        utilizationPct: typeof operationsCapacity.utilizationPct === 'number' && Number.isFinite(operationsCapacity.utilizationPct)
          ? operationsCapacity.utilizationPct
          : null,
        _description_utilizationPct: 'Plant utilization as a fraction between 0 and 1, not 0 to 100.',
        _example_utilizationPct: 0.85,
      },
      oreMilledTonnes: normalizeSeries(operations.oreMilledTonnes, seriesLength),
      oreMinedTonnes: normalizeSeries(operations.oreMinedTonnes, seriesLength),
      _description_oreMinedTonnes: 'Per-period ore mined tonnes aligned to t=0..masterN. Enter whole tonnes (not thousand tonnes or million tonnes).',
      _example_oreMinedTonnes: [1000, 1000, 1200, 1300],
      _unit_oreMinedTonnes: TONNAGE_UNIT_SCALE,
      _description_oreProcessedTonnes: 'Use operations.oreMilledTonnes as ore processed tonnes. Enter whole tonnes (not thousand tonnes or million tonnes).',
      _example_oreProcessedTonnes: [950, 980, 1180, 1280],
      _unit_oreProcessedTonnes: TONNAGE_UNIT_SCALE,
      oreTonnageUnit: operations.oreTonnageUnit === 'tonne' || operations.oreTonnageUnit === 'short_ton' || operations.oreTonnageUnit === 'long_ton' ? operations.oreTonnageUnit : null,
      _choices_oreTonnageUnit: [...ORE_TONNAGE_UNIT_CHOICES],
      gradeByMetal: normalizeSeriesMap(operations.gradeByMetal, seriesLength),
      _description_gradeByMetal: 'Per-period head grade by metal. Each metal array is aligned to t=0..masterN.',
      _example_gradeByMetal: { Au: [6.86, 6.86, 6.86], Cu: [0.45, 0.45, 0.45] },
      gradeUnitByMetal: normalizeStringMap(operations.gradeUnitByMetal),
      recoveryPctByMetal: normalizeSeriesMap(operations.recoveryPctByMetal, seriesLength),
      _description_recoveryPctByMetal: 'Per-period metallurgical recovery by metal as a fraction (0..1 preferred). Each metal array is aligned to t=0..masterN.',
      _example_recoveryPctByMetal: { Au: [0.92, 0.92, 0.92], Cu: [0.88, 0.88, 0.88] },
    },
    economicsBreakdown: {
      meta: {
        defaultSource: economicsBreakdownMeta.defaultSource === 'PEA'
          || economicsBreakdownMeta.defaultSource === 'PFS'
          || economicsBreakdownMeta.defaultSource === 'FS'
          || economicsBreakdownMeta.defaultSource === 'Other'
          ? economicsBreakdownMeta.defaultSource
          : null,
        _choices_defaultSource: [...ECONOMICS_BREAKDOWN_SOURCE_CHOICES],
        notes: typeof economicsBreakdownMeta.notes === 'string' ? economicsBreakdownMeta.notes : null,
      },
      cogs: {
        miningUSD: normalizeSeries(economicsBreakdownCogs.miningUSD, seriesLength),
        millingUSD: normalizeSeries(economicsBreakdownCogs.millingUSD, seriesLength),
        utilitiesUSD: normalizeSeries(economicsBreakdownCogs.utilitiesUSD, seriesLength),
        maintenanceUSD: normalizeSeries(economicsBreakdownCogs.maintenanceUSD, seriesLength),
        campUSD: normalizeSeries(economicsBreakdownCogs.campUSD, seriesLength),
        siteGandA_USD: normalizeSeries(economicsBreakdownCogs.siteGandA_USD, seriesLength),
      },
      selling: {
        treatmentChargesUSD: normalizeSeries(economicsBreakdownSelling.treatmentChargesUSD, seriesLength),
        refiningChargesUSD: normalizeSeries(economicsBreakdownSelling.refiningChargesUSD, seriesLength),
        tcRcUSD: normalizeSeries(economicsBreakdownSelling.tcRcUSD, seriesLength),
        transportUSD: normalizeSeries(economicsBreakdownSelling.transportUSD, seriesLength),
      },
      royaltiesDetail: normalizeRoyaltiesDetail(economicsBreakdown.royaltiesDetail, seriesLength),
      taxesDetail: economicsBreakdownTaxesDetail
        ? {
          federalIncomeTaxUSD: normalizeSeries(economicsBreakdownTaxesDetail.federalIncomeTaxUSD, seriesLength),
          municipalRevenueTaxUSD: normalizeSeries(economicsBreakdownTaxesDetail.municipalRevenueTaxUSD, seriesLength),
        }
        : null,
    },
  } as unknown as ProjectJsonV1Template;

  for (const metal of Object.keys(output.metals.payableQtyUnitByMetal ?? {})) {
    (output.metals.payableQtyUnitByMetal as Record<string, unknown>)[`_choices_${metal}`] = [...QTY_UNIT_CHOICES];
  }

  for (const metal of Object.keys(output.metals.priceKeyByMetal ?? {})) {
    (output.metals.priceKeyByMetal as Record<string, unknown>)[`_choices_${metal}`] = [...PRICE_KEY_CHOICES];
  }

  (output.metals as Record<string, unknown>)._choices_auPriceKey = [...PRICE_KEY_CHOICES];

  for (const item of Array.isArray(output.takeItems) ? output.takeItems : []) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      continue;
    }
    const mutableItem = item as Record<string, unknown>;
    mutableItem._choices_type = [...TAKE_TYPE_CHOICES];
    mutableItem._choices_jurisdictionLevel = [...TAKE_JURISDICTION_LEVEL_CHOICES];

    const appliesTo = asRecord(mutableItem.appliesTo);
    appliesTo._choices_scope = [...TAKE_SCOPE_CHOICES];
    const volumeCap = asRecord(appliesTo.volumeCap);
    volumeCap._choices_capType = [...TAKE_CAP_TYPE_CHOICES];
    appliesTo.volumeCap = volumeCap;
    mutableItem.appliesTo = appliesTo;

    const baseDefinition = asRecord(mutableItem.baseDefinition);
    baseDefinition._choices_baseType = [...TAKE_BASE_TYPE_CHOICES];
    mutableItem.baseDefinition = baseDefinition;

    const rateDefinition = asRecord(mutableItem.rateDefinition);
    rateDefinition._choices_rateType = [...TAKE_RATE_TYPE_CHOICES];
    if (Array.isArray(rateDefinition.tiers)) {
      rateDefinition.tiers = rateDefinition.tiers.map((tier) => {
        const tierRecord = asRecord(tier);
        tierRecord._choices_thresholdType = [...TAKE_THRESHOLD_TYPE_CHOICES];
        return tierRecord;
      });
    }
    mutableItem.rateDefinition = rateDefinition;
  }

  return output;
}

export function getProjectJsonV1Template(): ProjectJsonV1 {
  const masterN = 5;
  const len = masterN + 1;
  const nulls = Array(len).fill(null) as Array<number | null>;
  const auGradeExample = [6.86, 6.86, 6.86, 6.86, 6.86, 6.86];
  const cuGradeExample = [0.45, 0.45, 0.45, 0.45, 0.45, 0.45];
  const auRecoveryExample = [0.92, 0.92, 0.92, 0.92, 0.92, 0.92];
  const cuRecoveryExample = [0.88, 0.88, 0.88, 0.88, 0.88, 0.88];
  const productionSeriesExample = Array.from({ length: len }, (_, t) => (t < 2 ? 0 : 1000));
  const payableAuExample = Array.from({ length: len }, (_, t) => (t < 2 ? 0 : 100));
  const payableCuExample = Array.from({ length: len }, (_, t) => (t < 2 ? 0 : 2000));

  return buildProjectJsonV1Template({
    version: 'project_json_v2',
    meta: {
      projectId: '',
      projectName: '',
      currency: 'USD',
      notes: 'Per-period arrays must be length masterN+1. Use toz (not oz) for payableQtyUnitByMetal. Price key examples: Au=XAU_USD_TOZ, Ag=XAG_USD_TOZ, Cu=CU_USD_LB or CU_USD_TONNE. Copper: CU_USD_LB = COMEX basis, CU_USD_TONNE = LME basis. If CU_USD_TONNE series is missing, system can derive from CU_USD_LB using 1 tonne = 2204.6226218 lb (warns about basis). Provide site G&A in ONE place only; prefer series.siteGandA_USD.',
    },
    time: {
      masterN,
      productionStartPeriod: 2,
      productionStartYear: new Date().getUTCFullYear() + 2,
    },
    economics: { taxRate: 0 },
    equity: {
      fdExtraShares: 0,
      fdNotes: '',
    },
    series: {
      capexUSD: [...nulls],
      operatingCostsUSD: [...nulls],
      sustainingCapexUSD: [...nulls],
      siteGandA_USD: [...nulls],
      depreciationUSD: [...nulls],
      workingCapitalDeltaUSD: [...nulls],
      royaltiesUSD: [...nulls],
      reclamationUSD: [...nulls],
      byproductCreditsUSD: [...nulls],
    },
    metals: {
      payableQtyByMetal: {
        Au: [...payableAuExample],
        Cu: [...payableCuExample],
      },
      payableQtyUnitByMetal: {
        Au: 'toz',
        Cu: 'lb',
      },
      priceKeyByMetal: {
        Au: 'XAU_USD_TOZ',
        Cu: 'CU_USD_LB',
      },
      auPriceKey: 'XAU_USD_TOZ',
    },
    streamsByMetal: null,
    takeItems: [
      {
        id: 'example_nsr',
        type: 'NSR',
        jurisdictionLevel: 'national',
        appliesTo: {
          scope: 'project',
          metals: ['ALL'],
          geography: 'ALL',
          timing: { start_t: null, end_t: null },
          volumeCap: { capType: 'none', capAmount: null, capMetal: null },
        },
        baseDefinition: { baseType: 'REVENUE' },
        rateDefinition: { rateType: 'FIXED', rate: 0.00 },
      },
      {
        id: 'example_metal_nsr',
        type: 'NSR',
        jurisdictionLevel: 'provincial_state',
        appliesTo: {
          scope: 'metalSpecific',
          metals: ['Ag'],
          geography: 'ALL',
          timing: { start_t: null, end_t: null },
          volumeCap: { capType: 'none', capAmount: null, capMetal: null },
        },
        baseDefinition: { baseType: 'REVENUE' },
        rateDefinition: { rateType: 'FIXED', rate: 0.00 },
      },
      {
        id: 'example_gov_sliding',
        type: 'AD_VALOREM',
        jurisdictionLevel: 'national',
        appliesTo: {
          scope: 'project',
          metals: ['ALL'],
          geography: 'ALL',
          timing: { start_t: null, end_t: null },
          volumeCap: { capType: 'none', capAmount: null, capMetal: null },
        },
        baseDefinition: { baseType: 'REVENUE' },
        rateDefinition: {
          rateType: 'TIERED',
          tiers: [
            { thresholdType: 'price', thresholdValue: 1500, rate: 0.02 },
            { thresholdType: 'price', thresholdValue: 2000, rate: 0.03 },
          ],
        },
        priceKey: 'XAU_USD_TOZ',
      },
    ],
    operations: {
      capacity: { throughputUnit: 'tpd', nameplateThroughput: 10000, utilizationPct: null },
      oreMilledTonnes: [...productionSeriesExample],
      oreMinedTonnes: [...productionSeriesExample],
      oreTonnageUnit: 'tonne',
      gradeByMetal: {
        Au: [...auGradeExample],
        Cu: [...cuGradeExample],
      },
      gradeUnitByMetal: {
        Au: 'gpt',
        Cu: 'pct',
      },
      recoveryPctByMetal: {
        Au: [...auRecoveryExample],
        Cu: [...cuRecoveryExample],
      },
    },
    economicsBreakdown: {
      cogs: {
        miningUSD: [...nulls],
        millingUSD: [...nulls],
        utilitiesUSD: [...nulls],
        maintenanceUSD: [...nulls],
        campUSD: [...nulls],
        siteGandA_USD: [...nulls],
      },
      selling: {
        treatmentChargesUSD: [...nulls],
        refiningChargesUSD: [...nulls],
        tcRcUSD: [...nulls],
        transportUSD: [...nulls],
      },
      royaltiesDetail: [],
      taxesDetail: null,
    },
  });
}
