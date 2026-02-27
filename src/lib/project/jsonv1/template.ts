import type { ProjectJsonV1, QtyUnit } from './schema.ts';

type NullableNumberSeries = Array<number | null>;

const DEFAULT_MASTER_N = 10;

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

function buildPeriodEndDatesUtc(masterN: number): string[] {
  const startYear = new Date().getUTCFullYear();
  return Array.from({ length: masterN + 1 }, (_, index) => `${startYear + index}-12-31`);
}

function normalizeSeriesMap(value: unknown, length: number): Record<string, NullableNumberSeries> {
  const raw = asRecord(value);
  const out: Record<string, NullableNumberSeries> = {};
  for (const [metal, series] of Object.entries(raw)) {
    out[metal] = normalizeSeries(series, length);
  }
  return out;
}

function normalizeStringMap(value: unknown): Record<string, string> {
  const raw = asRecord(value);
  const out: Record<string, string> = {};
  for (const [key, mapValue] of Object.entries(raw)) {
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
    if (mapValue === 'toz' || mapValue === 'g' || mapValue === 'kg' || mapValue === 'lb' || mapValue === 'tonne' || mapValue === 'short_ton' || mapValue === 'long_ton') {
      out[key] = mapValue;
    }
  }
  return out;
}

type RoyaltyDetailRow = NonNullable<NonNullable<ProjectJsonV1['economicsBreakdown']>['royaltiesDetail']>[number];

function buildTemplateRoyaltyRow(length: number): RoyaltyDetailRow {
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

export function buildProjectJsonV1Template(existing?: ProjectJsonV1): ProjectJsonV1 {
  const root = asRecord(existing);
  const rootTime = asRecord(root.time);
  const requestedMasterN = rootTime.masterN;
  const masterN = Number.isInteger(requestedMasterN) && (requestedMasterN as number) >= 0
    ? requestedMasterN as number
    : DEFAULT_MASTER_N;
  const seriesLength = masterN + 1;

  const existingPeriodEndDates = Array.isArray(rootTime.periodEndDatesUtc)
    ? rootTime.periodEndDatesUtc.filter((item): item is string => typeof item === 'string').slice(0, seriesLength)
    : [];
  const generatedPeriodEndDates = buildPeriodEndDatesUtc(masterN);
  const periodEndDatesUtc = generatedPeriodEndDates.map((date, index) => existingPeriodEndDates[index] ?? date);

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

  const output: ProjectJsonV1 = {
    version: 'project_json_v1',
    meta: {
      projectId: typeof meta.projectId === 'string' ? meta.projectId : '',
      projectName: typeof meta.projectName === 'string' ? meta.projectName : '',
      currency: 'USD',
      notes: typeof meta.notes === 'string' ? meta.notes : '',
    },
    time: {
      masterN,
      productionStartPeriod: Number.isInteger(rootTime.productionStartPeriod) ? rootTime.productionStartPeriod as number : 0,
      periodEndDatesUtc,
    },
    economics: {
      taxRate: typeof economics.taxRate === 'number' && Number.isFinite(economics.taxRate) ? economics.taxRate : null,
    },
    equity: {
      fdExtraShares: typeof equity.fdExtraShares === 'number' && Number.isFinite(equity.fdExtraShares) ? equity.fdExtraShares : null,
      fdNotes: typeof equity.fdNotes === 'string' ? equity.fdNotes : '',
    },
    series: {
      capexUSD: normalizeSeries(series.capexUSD, seriesLength),
      operatingCostsUSD: normalizeSeries(series.operatingCostsUSD, seriesLength),
      sustainingCapexUSD: normalizeSeries(series.sustainingCapexUSD, seriesLength),
      siteGandA_USD: normalizeSeries(series.siteGandA_USD, seriesLength),
      depreciationUSD: normalizeSeries(series.depreciationUSD, seriesLength),
      workingCapitalDeltaUSD: normalizeSeries(series.workingCapitalDeltaUSD, seriesLength),
      royaltiesUSD: normalizeSeries(series.royaltiesUSD, seriesLength),
      reclamationUSD: normalizeSeries(series.reclamationUSD, seriesLength),
      byproductCreditsUSD: normalizeSeries(series.byproductCreditsUSD, seriesLength),
    },
    metals: {
      payableQtyByMetal: normalizeSeriesMap(metals.payableQtyByMetal, seriesLength),
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
        nameplateThroughput: typeof operationsCapacity.nameplateThroughput === 'number' && Number.isFinite(operationsCapacity.nameplateThroughput)
          ? operationsCapacity.nameplateThroughput
          : null,
        utilizationPct: typeof operationsCapacity.utilizationPct === 'number' && Number.isFinite(operationsCapacity.utilizationPct)
          ? operationsCapacity.utilizationPct
          : null,
      },
      oreMilledTonnes: normalizeSeries(operations.oreMilledTonnes, seriesLength),
      oreMinedTonnes: normalizeSeries(operations.oreMinedTonnes, seriesLength),
      oreTonnageUnit: operations.oreTonnageUnit === 'tonne' || operations.oreTonnageUnit === 'short_ton' || operations.oreTonnageUnit === 'long_ton' ? operations.oreTonnageUnit : null,
      gradeByMetal: normalizeSeriesMap(operations.gradeByMetal, seriesLength),
      gradeUnitByMetal: normalizeStringMap(operations.gradeUnitByMetal),
      recoveryPctByMetal: normalizeSeriesMap(operations.recoveryPctByMetal, seriesLength),
    },
    economicsBreakdown: {
      meta: {
        defaultSource: economicsBreakdownMeta.defaultSource === 'PEA'
          || economicsBreakdownMeta.defaultSource === 'PFS'
          || economicsBreakdownMeta.defaultSource === 'FS'
          || economicsBreakdownMeta.defaultSource === 'Other'
          ? economicsBreakdownMeta.defaultSource
          : null,
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
  };

  return output;
}

export function getProjectJsonV1Template(): ProjectJsonV1 {
  const masterN = 5;
  const len = masterN + 1;
  const nulls = Array(len).fill(null) as Array<number | null>;

  return buildProjectJsonV1Template({
    version: 'project_json_v1',
    meta: {
      projectId: '',
      projectName: '',
      currency: 'USD',
      notes: '',
    },
    time: {
      masterN,
      productionStartPeriod: 2,
      periodEndDatesUtc: ['2026-12-31', '2027-12-31', '2028-12-31', '2029-12-31', '2030-12-31', '2031-12-31'],
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
        Au: [...nulls],
        Cu: [...nulls],
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
    ],
    operations: {
      capacity: { throughputUnit: 'tpd', nameplateThroughput: 10000, utilizationPct: null },
      oreMilledTonnes: [...nulls],
      oreMinedTonnes: [...nulls],
      oreTonnageUnit: 'tonne',
      gradeByMetal: {
        Au: [...nulls],
        Cu: [...nulls],
      },
      gradeUnitByMetal: {
        Au: 'gpt',
        Cu: 'pct',
      },
      recoveryPctByMetal: {
        Au: [...nulls],
        Cu: [...nulls],
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
