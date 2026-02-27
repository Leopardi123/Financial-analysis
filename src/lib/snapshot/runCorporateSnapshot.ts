import { validateSnapshotRequest } from '../api/validateSnapshotRequest.ts';
import { loadProjectsForSymbol } from '../api/loadProjectsForSymbol.ts';
import { parseProjectJsonV1 } from '../project/jsonv1/parse.ts';
import { computeProjectEngineFullProductionV1 } from '../project/engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../project/jsonv1/resolvePrices.ts';
import { aggregateProjectsCorporateV1 } from '../corporate/aggregateProjects.ts';
import { computeCorporateFinancing } from '../corporate/financing/compute.ts';
import { deriveBuildFundingNeedUSD } from '../corporate/financing/deriveBuildFundingNeed.ts';
import { buildCorporateSnapshot } from '../corporate/snapshot/buildCorporateSnapshot.ts';
import { resolveFxUSDToTarget } from '../prices/fx/resolveFx.ts';
import { getTodayUtcDateString } from '../prices/fx/date.ts';
import { fxKeyUSDTo } from '../prices/fx/keys.ts';
import { computeLista2CfDcfMetrics } from './lista2CfDcf.ts';
import { computeLista3aProjectEfficiencyMetrics } from './lista3aProjectEfficiency.ts';
import { computeLista4TenYearMetrics } from './lista4TenYear.ts';
import type { CorporateSnapshotSeries } from '../corporate/snapshot/types.ts';
import { canonicalUnitForMetal } from '../units/metalUnits.ts';
import { convertPriceToCanonical, convertQuantityToCanonical } from '../units/conversion.ts';

const CORPORATE_SNAPSHOT_MAX_REFRESH_KEYS = 10;

function toFiniteOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function sanitizeSeries(series: Array<number | null>): Array<number | null> {
  return series.map((value) => toFiniteOrNull(value));
}

function assertSeriesLength(
  series: Array<number | null>,
  expectedLength: number,
  label: string,
): void {
  if (series.length !== expectedLength) {
    throw new Error(`${label} length must equal masterN+1 (${expectedLength})`);
  }
}


function sumComponentsAtIndex(components: Array<number | null>): number | null {
  let sum = 0;
  let hasAny = false;
  for (const value of components) {
    const finite = toFiniteOrNull(value);
    if (finite !== null) {
      sum += finite;
      hasAny = true;
    }
  }
  return hasAny ? sum : null;
}

function sumStrictAlignedSeries(args: {
  corporateDates: string[];
  projectDateSeries: Array<{ projectId: string; periodEndDatesUtc: string[]; series: Array<number | null> }>;
  label: string;
}): Array<number | null> {
  const sums = new Array<number>(args.corporateDates.length).fill(0);
  const hasContributor = new Array<boolean>(args.corporateDates.length).fill(false);
  const nullAtDate = new Array<boolean>(args.corporateDates.length).fill(false);

  for (const projectSeries of args.projectDateSeries) {
    assertSeriesLength(
      projectSeries.series,
      projectSeries.periodEndDatesUtc.length,
      `${args.label} project=${projectSeries.projectId}`,
    );

    const dateToIndex = new Map<string, number>(
      projectSeries.periodEndDatesUtc.map((date, idx) => [date, idx]),
    );

    for (let t = 0; t < args.corporateDates.length; t += 1) {
      if (nullAtDate[t]) {
        continue;
      }
      const projectIndex = dateToIndex.get(args.corporateDates[t]);
      if (projectIndex === undefined) {
        continue;
      }

      hasContributor[t] = true;
      const value = toFiniteOrNull(projectSeries.series[projectIndex]);
      if (value === null) {
        nullAtDate[t] = true;
        continue;
      }
      sums[t] += value;
    }
  }

  return sums.map((value, t) => (nullAtDate[t] || !hasContributor[t] ? null : value));
}


type EconomicsBreakdownSeries = {
  cogs?: {
    miningUSD?: Array<number | null>;
    millingUSD?: Array<number | null>;
    utilitiesUSD?: Array<number | null>;
    maintenanceUSD?: Array<number | null>;
    campUSD?: Array<number | null>;
    siteGandA_USD?: Array<number | null>;
  };
  selling?: {
    treatmentChargesUSD?: Array<number | null>;
    refiningChargesUSD?: Array<number | null>;
    tcRcUSD?: Array<number | null>;
    transportUSD?: Array<number | null>;
  };
  totalCogsUSD?: Array<number | null>;
  totalSellingUSD?: Array<number | null>;
  totalOperatingCostsUSD?: Array<number | null>;
};

type RoyaltyDetailSeries = {
  id: string;
  label: string;
  base: 'revenue' | 'ebit' | 'ebitda' | 'quantity';
  rate: number | null;
  royaltyUSD: Array<number | null>;
};

type TaxesDetailSeries = {
  federalIncomeTaxUSD?: Array<number | null>;
  municipalRevenueTaxUSD?: Array<number | null>;
};

type ProjectSeriesContext = {
  projectId: string;
  periodEndDatesUtc: string[];
  payableQtyByMetal: Record<string, Array<number | null>>;
  payableQtyUnitByMetal: Record<string, string>;
  priceUSDUnitByMetal: Record<string, string>;
  spotPriceUSDByMetal: Record<string, Array<number | null>>;
  revenueByMetal_USD: Record<string, Array<number | null>>;
  operations: {
    oreMinedTonnes?: Array<number | null>;
    oreMilledTonnes?: Array<number | null>;
    throughputUnit: 'tpd' | 'tpa' | null;
    nameplateThroughput: number | null;
    utilizationPct: number | null;
  };
  economicsBreakdown: EconomicsBreakdownSeries | null;
  royaltiesDetail: RoyaltyDetailSeries[];
  taxesDetail: TaxesDetailSeries | null;
  economics: {
    operatingCostsUSD: Array<number | null>;
    sustainingCapexUSD: Array<number | null>;
    siteGandA_USD: Array<number | null>;
    royaltiesUSD: Array<number | null>;
    reclamationUSD: Array<number | null>;
    byproductCreditsUSD: Array<number | null>;
    sustainingCostUSD: Array<number | null>;
    ebitUSD: Array<number | null>;
    taxUSD: Array<number | null>;
    fcffUSD: Array<number | null>;
    capexUSD: Array<number | null>;
  };
};

function buildSnapshotSeries(args: {
  masterN: number;
  corporateDates: string[];
  projectSeriesContexts: ProjectSeriesContext[];
}): CorporateSnapshotSeries {
  const expectedLength = args.masterN + 1;
  if (args.corporateDates.length !== expectedLength) {
    throw new Error(`series.periodEndDatesUtc length must equal masterN+1 (${expectedLength})`);
  }

  const periodIndex = Array.from({ length: expectedLength }, (_, i) => i);
  const periodEndDatesUtc = args.corporateDates.map((date) => (typeof date === 'string' ? date : null));

  const throughputUnits = new Set(args.projectSeriesContexts.map((entry) => entry.operations.throughputUnit).filter((v) => v !== null));
  const throughputUnit = throughputUnits.size === 1 ? [...throughputUnits][0] as 'tpd' | 'tpa' : null;

  const nameplateVals = args.projectSeriesContexts.map((entry) => entry.operations.nameplateThroughput).filter((v): v is number => v !== null);
  const utilizationVals = args.projectSeriesContexts.map((entry) => entry.operations.utilizationPct).filter((v): v is number => v !== null);

  const oreMinedTonnes = sumStrictAlignedSeries({
    corporateDates: args.corporateDates,
    projectDateSeries: args.projectSeriesContexts
      .filter((entry) => Array.isArray(entry.operations.oreMinedTonnes))
      .map((entry) => ({
        projectId: entry.projectId,
        periodEndDatesUtc: entry.periodEndDatesUtc,
        series: sanitizeSeries(entry.operations.oreMinedTonnes ?? []),
      })),
    label: 'series.oreMinedTonnes',
  });

  const oreMilledTonnes = sumStrictAlignedSeries({
    corporateDates: args.corporateDates,
    projectDateSeries: args.projectSeriesContexts
      .filter((entry) => Array.isArray(entry.operations.oreMilledTonnes))
      .map((entry) => ({
        projectId: entry.projectId,
        periodEndDatesUtc: entry.periodEndDatesUtc,
        series: sanitizeSeries(entry.operations.oreMilledTonnes ?? []),
      })),
    label: 'series.oreMilledTonnes',
  });

  const payableQtyByMetal: Record<string, Array<number | null>> = {};
  const payableQtyUnitByMetal: Record<string, string> = {};
  const priceUsedByMetal_USD: Record<string, Array<number | null>> = {};
  const revenueByMetal_USD: Record<string, Array<number | null>> = {};
  const unitAudit: NonNullable<CorporateSnapshotSeries['unitAudit']> = { metals: {} };

  const metalKeys = [...new Set(args.projectSeriesContexts.flatMap((entry) => Object.keys(entry.payableQtyByMetal)))].sort((a, b) => a.localeCompare(b));

  for (const metal of metalKeys) {
    const qtyProjects = args.projectSeriesContexts
      .filter((entry) => Array.isArray(entry.payableQtyByMetal[metal]))
      .map((entry) => ({
        projectId: entry.projectId,
        periodEndDatesUtc: entry.periodEndDatesUtc,
        series: sanitizeSeries(entry.payableQtyByMetal[metal]),
      }));

    const revenueProjects = args.projectSeriesContexts
      .filter((entry) => Array.isArray(entry.revenueByMetal_USD[metal]))
      .map((entry) => ({
        projectId: entry.projectId,
        periodEndDatesUtc: entry.periodEndDatesUtc,
        series: sanitizeSeries(entry.revenueByMetal_USD[metal]),
      }));

    const spotPriceProjects = args.projectSeriesContexts
      .filter((entry) => Array.isArray(entry.spotPriceUSDByMetal[metal]))
      .map((entry) => ({
        projectId: entry.projectId,
        periodEndDatesUtc: entry.periodEndDatesUtc,
        series: sanitizeSeries(entry.spotPriceUSDByMetal[metal]),
      }));

    payableQtyByMetal[metal] = sumStrictAlignedSeries({ corporateDates: args.corporateDates, projectDateSeries: qtyProjects, label: `series.payableQtyByMetal.${metal}` });
    const fallbackRevenue = sumStrictAlignedSeries({ corporateDates: args.corporateDates, projectDateSeries: revenueProjects, label: `series.revenueByMetal_USD.${metal}` });

    const unitSet = new Set(args.projectSeriesContexts.map((entry) => entry.payableQtyUnitByMetal[metal]).filter((v): v is string => typeof v === 'string'));
    if (unitSet.size > 1) {
      throw new Error(`series.payableQtyUnitByMetal.${metal} has inconsistent units across projects`);
    }
    if (unitSet.size === 0) {
      throw new Error(`series.payableQtyUnitByMetal.${metal} missing for all projects`);
    }
    const qtyUnit = [...unitSet][0];
    payableQtyUnitByMetal[metal] = qtyUnit;

    const canonicalUnit = canonicalUnitForMetal(metal);
    const priceUnitSet = new Set(args.projectSeriesContexts.map((entry) => entry.priceUSDUnitByMetal[metal]).filter((v): v is string => typeof v === 'string'));
    const warnings: string[] = [];
    const priceUnit = priceUnitSet.size > 0 ? [...priceUnitSet][0] : `USD_${canonicalUnit}`;
    if (priceUnitSet.size > 1) {
      warnings.push(`price unit mismatch across projects for ${metal}`);
    }

    priceUsedByMetal_USD[metal] = new Array<number | null>(expectedLength).fill(null);
    revenueByMetal_USD[metal] = new Array<number | null>(expectedLength).fill(null);

    for (let t = 0; t < expectedLength; t += 1) {
      const spotValues = spotPriceProjects
        .map((project) => {
          const idx = project.periodEndDatesUtc.indexOf(args.corporateDates[t]);
          return idx >= 0 ? project.series[idx] : null;
        })
        .filter((value): value is number => value !== null);
      if (spotValues.length > 0) {
        const first = spotValues[0];
        if (spotValues.some((value) => value !== first)) {
          warnings.push(`spot price mismatch across projects: metal ${metal} period ${t}`);
        }
        priceUsedByMetal_USD[metal][t] = first;
      }

      const qty = payableQtyByMetal[metal][t];
      const price = priceUsedByMetal_USD[metal][t];

      if (qty === null || price === null) {
        revenueByMetal_USD[metal][t] = fallbackRevenue[t];
        continue;
      }

      const qtyCanonical = convertQuantityToCanonical(metal, qty, qtyUnit);
      const priceCanonical = convertPriceToCanonical(metal, price, priceUnit);

      if (qtyCanonical === null || priceCanonical === null) {
        revenueByMetal_USD[metal][t] = null;
        warnings.push(`unit mismatch: metal ${metal} period ${t}`);
      } else {
        revenueByMetal_USD[metal][t] = qtyCanonical * priceCanonical;
      }
    }

    const firstFiniteIndex = payableQtyByMetal[metal].findIndex((value): value is number => value !== null && Number.isFinite(value));
    const conversionFactorExample = firstFiniteIndex >= 0
      ? (() => {
          const raw = payableQtyByMetal[metal][firstFiniteIndex] as number;
          const canonical = convertQuantityToCanonical(metal, raw, qtyUnit);
          if (canonical === null || raw === 0) {
            return undefined;
          }
          return canonical / raw;
        })()
      : undefined;

    unitAudit.metals[metal] = {
      qtyUnit,
      canonicalQtyUnit: canonicalUnit,
      priceUnit,
      canonicalPriceUnit: canonicalUnit,
      ...(conversionFactorExample !== undefined ? { conversionFactorExample } : {}),
      warnings,
    };
  }

  const totalRevenue_USD = new Array<number | null>(expectedLength).fill(null);
  for (let t = 0; t < expectedLength; t += 1) {
    let sum = 0;
    let hasAny = false;
    let hasNull = false;
    for (const metal of metalKeys) {
      const revenue = revenueByMetal_USD[metal][t];
      if (revenue === null) {
        hasNull = true;
        continue;
      }
      hasAny = true;
      sum += revenue;
    }
    totalRevenue_USD[t] = hasAny && !hasNull ? sum : null;
  }

  const aggregateEconomic = (label: keyof ProjectSeriesContext['economics']): Array<number | null> => sumStrictAlignedSeries({
    corporateDates: args.corporateDates,
    projectDateSeries: args.projectSeriesContexts.map((entry) => ({
      projectId: entry.projectId,
      periodEndDatesUtc: entry.periodEndDatesUtc,
      series: sanitizeSeries(entry.economics[label]),
    })),
    label: `series.${label}`,
  });

  const operatingCostsUSD = aggregateEconomic('operatingCostsUSD');
  const sustainingCapexUSD = aggregateEconomic('sustainingCapexUSD');
  const siteGandA_USD = aggregateEconomic('siteGandA_USD');
  const royaltiesUSD = aggregateEconomic('royaltiesUSD');
  const reclamationUSD = aggregateEconomic('reclamationUSD');
  const byproductCreditsUSD = aggregateEconomic('byproductCreditsUSD');
  const sustainingCostUSD = aggregateEconomic('sustainingCostUSD');
  const ebitUSD = aggregateEconomic('ebitUSD');
  const taxUSD = aggregateEconomic('taxUSD');
  const fcffUSD = aggregateEconomic('fcffUSD');
  const capexUSD = aggregateEconomic('capexUSD');

  const aggregateBreakdownSeries = (seriesByProject: Array<{ projectId: string; periodEndDatesUtc: string[]; series: Array<number | null> }>, label: string): Array<number | null> =>
    sumStrictAlignedSeries({
      corporateDates: args.corporateDates,
      projectDateSeries: seriesByProject,
      label,
    });

  const aggregateOptionalBreakdownSeries = (
    selector: (entry: ProjectSeriesContext) => Array<number | null> | undefined,
    label: string,
  ): Array<number | null> | undefined => {
    const contributing = args.projectSeriesContexts
      .map((entry) => {
        const series = selector(entry);
        if (!series) {
          return null;
        }
        return {
          projectId: entry.projectId,
          periodEndDatesUtc: entry.periodEndDatesUtc,
          series: sanitizeSeries(series),
        };
      })
      .filter((value): value is { projectId: string; periodEndDatesUtc: string[]; series: Array<number | null> } => value !== null);

    if (contributing.length === 0) {
      return undefined;
    }

    return aggregateBreakdownSeries(contributing, label);
  };

  const hasAnyEconomicsBreakdown = args.projectSeriesContexts.some((entry) => entry.economicsBreakdown !== null);
  const economicsBreakdown: EconomicsBreakdownSeries = {};
  economicsBreakdown.cogs = {
    miningUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.cogs?.miningUSD, 'series.economicsBreakdown.cogs.miningUSD'),
    millingUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.cogs?.millingUSD, 'series.economicsBreakdown.cogs.millingUSD'),
    utilitiesUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.cogs?.utilitiesUSD, 'series.economicsBreakdown.cogs.utilitiesUSD'),
    maintenanceUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.cogs?.maintenanceUSD, 'series.economicsBreakdown.cogs.maintenanceUSD'),
    campUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.cogs?.campUSD, 'series.economicsBreakdown.cogs.campUSD'),
    siteGandA_USD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.cogs?.siteGandA_USD, 'series.economicsBreakdown.cogs.siteGandA_USD'),
  };

  economicsBreakdown.selling = {
    treatmentChargesUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.selling?.treatmentChargesUSD, 'series.economicsBreakdown.selling.treatmentChargesUSD'),
    refiningChargesUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.selling?.refiningChargesUSD, 'series.economicsBreakdown.selling.refiningChargesUSD'),
    tcRcUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.selling?.tcRcUSD, 'series.economicsBreakdown.selling.tcRcUSD'),
    transportUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.selling?.transportUSD, 'series.economicsBreakdown.selling.transportUSD'),
  };

  const totalCogsUSD = new Array<number | null>(expectedLength).fill(null);
  const totalSellingUSD = new Array<number | null>(expectedLength).fill(null);
  const totalOperatingCostsUSD = new Array<number | null>(expectedLength).fill(null);
  const cogs = economicsBreakdown.cogs ?? {};
  const selling = economicsBreakdown.selling ?? {};
  for (let t = 0; t < expectedLength; t += 1) {
    totalCogsUSD[t] = sumComponentsAtIndex([
      cogs.miningUSD?.[t] ?? null,
      cogs.millingUSD?.[t] ?? null,
      cogs.utilitiesUSD?.[t] ?? null,
      cogs.maintenanceUSD?.[t] ?? null,
      cogs.campUSD?.[t] ?? null,
      cogs.siteGandA_USD?.[t] ?? null,
    ]);

    const tcRcCombined = selling.tcRcUSD?.[t] ?? sumComponentsAtIndex([
      selling.treatmentChargesUSD?.[t] ?? null,
      selling.refiningChargesUSD?.[t] ?? null,
    ]);

    totalSellingUSD[t] = sumComponentsAtIndex([
      tcRcCombined,
      selling.transportUSD?.[t] ?? null,
    ]);

    totalOperatingCostsUSD[t] = sumComponentsAtIndex([
      totalCogsUSD[t],
      totalSellingUSD[t],
      operatingCostsUSD[t],
    ]);
  }

  economicsBreakdown.totalCogsUSD = totalCogsUSD.some((v) => v !== null) ? totalCogsUSD : undefined;
  economicsBreakdown.totalSellingUSD = totalSellingUSD.some((v) => v !== null) ? totalSellingUSD : undefined;
  economicsBreakdown.totalOperatingCostsUSD = totalOperatingCostsUSD.some((v) => v !== null) ? totalOperatingCostsUSD : undefined;

  const royaltiesById = new Map<string, {
    id: string;
    label: string;
    base: 'revenue' | 'ebit' | 'ebitda' | 'quantity';
    rate: number | null;
    projectSeries: Array<{ projectId: string; periodEndDatesUtc: string[]; series: Array<number | null> }>;
  }>();

  for (const entry of args.projectSeriesContexts) {
    for (const detail of entry.royaltiesDetail) {
      if (!royaltiesById.has(detail.id)) {
        royaltiesById.set(detail.id, {
          id: detail.id,
          label: detail.label,
          base: detail.base,
          rate: detail.rate,
          projectSeries: [],
        });
      }
      royaltiesById.get(detail.id)?.projectSeries.push({
        projectId: entry.projectId,
        periodEndDatesUtc: entry.periodEndDatesUtc,
        series: sanitizeSeries(detail.royaltyUSD),
      });
    }
  }

  const royaltiesDetail = [...royaltiesById.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((detail) => ({
      id: detail.id,
      label: detail.label,
      royaltyUSD: aggregateBreakdownSeries(detail.projectSeries, `series.royaltiesDetail.${detail.id}.royaltyUSD`),
    }));

  const taxesDetail: TaxesDetailSeries = {
    federalIncomeTaxUSD: aggregateOptionalBreakdownSeries((entry) => entry.taxesDetail?.federalIncomeTaxUSD, 'series.taxesDetail.federalIncomeTaxUSD'),
    municipalRevenueTaxUSD: aggregateOptionalBreakdownSeries((entry) => entry.taxesDetail?.municipalRevenueTaxUSD, 'series.taxesDetail.municipalRevenueTaxUSD'),
  };

  return {
    periodIndex,
    periodEndDatesUtc,
    oreMinedTonnes,
    oreMilledTonnes,
    throughputUnit,
    nameplateThroughput: nameplateVals.length > 0 ? nameplateVals.reduce((a, b) => a + b, 0) : null,
    utilizationPct: utilizationVals.length > 0 ? utilizationVals.reduce((a, b) => a + b, 0) / utilizationVals.length : null,
    payableQtyByMetal,
    payableQtyUnitByMetal,
    priceUsedByMetal_USD,
    revenueByMetal_USD,
    totalRevenue_USD,
    operatingCostsUSD,
    sustainingCapexUSD,
    siteGandA_USD,
    royaltiesUSD,
    reclamationUSD,
    byproductCreditsUSD,
    sustainingCostUSD,
    ebitUSD,
    taxUSD,
    fcffUSD,
    capexUSD,
    economicsBreakdown: hasAnyEconomicsBreakdown ? economicsBreakdown : undefined,
    royaltiesDetail: royaltiesDetail.length > 0 ? royaltiesDetail : undefined,
    taxesDetail: taxesDetail.federalIncomeTaxUSD || taxesDetail.municipalRevenueTaxUSD ? taxesDetail : undefined,
    unitAudit,
  };
}

type SnapshotDiagnostics = {
  warnings: string[];
  errors: string[];
  meta: {
    refresh: boolean;
    mode: 'inline' | 'symbol';
    projectCount: number;
    symbol?: string;
    fxSource?: 'auto' | 'manual';
  };
};

export type CorporateSnapshotRunResult =
  | { ok: true; snapshot: ReturnType<typeof buildCorporateSnapshot>; diagnostics: SnapshotDiagnostics }
  | { ok: false; diagnostics: SnapshotDiagnostics };

export async function runCorporateSnapshotPipeline(args: {
  body: unknown;
  refresh?: boolean;
}): Promise<CorporateSnapshotRunResult> {
  const refresh = args.refresh === true;
  const diagnostics: SnapshotDiagnostics = {
    warnings: [],
    errors: [],
    meta: {
      refresh,
      mode: 'inline',
      projectCount: 0,
    },
  };

  try {
    const validation = validateSnapshotRequest(args.body);
    diagnostics.warnings.push(...validation.warnings);

    if (!validation.ok) {
      diagnostics.errors.push(...validation.errors);
      return { ok: false, diagnostics };
    }

    const input = validation.value;

    const projects = typeof input.symbol === 'string'
      ? await loadProjectsForSymbol(input.symbol)
      : input.projects;

    if (typeof input.symbol === 'string') {
      diagnostics.meta.mode = 'symbol';
      diagnostics.meta.symbol = input.symbol;
      if (projects.length === 0) {
        diagnostics.errors.push(`No stored projects found for symbol=${input.symbol}`);
        return { ok: false, diagnostics };
      }
    }

    const resolverScenario = input.scenario.mode === 'percentile'
      ? { mode: 'percentile' as const, lookbackYears: input.scenario.lookbackYears, percentile: input.scenario.percentile }
      : input.scenario.mode === 'fixed'
        ? { mode: 'fixed' as const, fixedPriceByKey: input.scenario.fixedPriceByKey }
        : { mode: 'spot' as const };

    const firstProjectPeriodEnd = typeof projects[0]?.rawJson?.time === 'object' && projects[0]?.rawJson?.time !== null
      ? (projects[0].rawJson.time as Record<string, unknown>).periodEndDatesUtc
      : undefined;
    const t0AnchorDate = Array.isArray(firstProjectPeriodEnd) && typeof firstProjectPeriodEnd[0] === 'string'
      ? firstProjectPeriodEnd[0]
      : null;
    const spotAnchorDateUtc = input.fx.anchor === 't0_period_end'
      ? (t0AnchorDate ?? getTodayUtcDateString())
      : getTodayUtcDateString();

    diagnostics.meta.projectCount = projects.length;
    diagnostics.meta.fxSource = input.fx.source;

    const requestedPriceKeys = new Set<string>();
    for (const project of projects) {
      const rawJson = project.rawJson as Record<string, unknown>;
      const metals = rawJson.metals;
      if (typeof metals === 'object' && metals !== null) {
        const priceKeyByMetal = (metals as Record<string, unknown>).priceKeyByMetal;
        if (typeof priceKeyByMetal === 'object' && priceKeyByMetal !== null) {
          for (const value of Object.values(priceKeyByMetal)) {
            if (typeof value === 'string') {
              requestedPriceKeys.add(value);
            }
          }
        }

        const auPriceKey = (metals as Record<string, unknown>).auPriceKey;
        if (typeof auPriceKey === 'string') {
          requestedPriceKeys.add(auPriceKey);
        }
      }
    }

    if (refresh && requestedPriceKeys.size > CORPORATE_SNAPSHOT_MAX_REFRESH_KEYS) {
      diagnostics.errors.push(
        `refresh=1 exceeds max unique price keys (${CORPORATE_SNAPSHOT_MAX_REFRESH_KEYS}); received ${requestedPriceKeys.size}`,
      );
      return { ok: false, diagnostics };
    }

    const projectsForBuildFunding = [] as Array<{
      projectId: string;
      productionStartPeriod: number;
      periodEndDatesUtc: string[];
    }>;

    const projectSeriesContexts: ProjectSeriesContext[] = [];

    const aggregation = await aggregateProjectsCorporateV1(
      {
        discountRate: input.discountRate,
        projects,
      },
      {
        projectToSeries: async ({ projectId, rawJson }) => {
          const parsed = parseProjectJsonV1(rawJson);
          const periodEndDatesUtc = parsed.engineInputWithoutPrices.periodEndDatesUtc;
          const productionStartPeriod = parsed.engineInputWithoutPrices.productionStartPeriod;
          if (!periodEndDatesUtc || periodEndDatesUtc.length === 0) {
            throw new Error(`Project ${projectId} is missing time.periodEndDatesUtc; required for corporate aggregation v1.`);
          }
          if (!Number.isInteger(productionStartPeriod)) {
            throw new Error(`Project ${projectId} is missing integer productionStartPeriod`);
          }

          projectsForBuildFunding.push({
            projectId,
            productionStartPeriod,
            periodEndDatesUtc,
          });

          const from = periodEndDatesUtc[0];
          const to = periodEndDatesUtc[periodEndDatesUtc.length - 1];

          const resolved = await resolveProjectPricesToEngineInput(
            { parsed, from, to, scenario: resolverScenario, projectId, spotAnchorDateUtc },
            {},
          );

          diagnostics.warnings.push(...(resolved.diagnostics?.warnings ?? []));

          for (const [metal, series] of Object.entries(resolved.spotPriceUSDByMetal)) {
            const priceKey = parsed.engineInputWithoutPrices.priceKeyByMetal[metal];
            series.forEach((value, index) => {
              if (value === null) {
                diagnostics.warnings.push(
                  `Missing price coverage for project=${projectId} metal=${metal} priceKey=${priceKey} targetDate=${periodEndDatesUtc[index]}`,
                );
              }
            });
          }

          resolved.aisc.auPriceUSDPerOz.forEach((value, index) => {
            if (value === null) {
              diagnostics.warnings.push(
                `Missing price coverage for project=${projectId} metal=Au priceKey=${parsed.engineInputWithoutPrices.auPriceKey} targetDate=${periodEndDatesUtc[index]}`,
              );
            }
          });

          const out = computeProjectEngineFullProductionV1(resolved);
          const projectLength = periodEndDatesUtc.length;
          const nullSeries = new Array<number | null>(projectLength).fill(null);
          const taxRate = parsed.engineInputWithoutPrices.taxRate;
          const taxByRule = out.phase1.ebitUSD.map((ebit) => {
            const finiteEbit = toFiniteOrNull(ebit);
            return finiteEbit === null ? null : Math.max(0, finiteEbit) * taxRate;
          });

          const projectEconomicsBreakdown = parsed.context.economicsBreakdown;
          const ebitdaSeries = out.phase1.ebitUSD.map((ebit, idx) => {
            const finiteEbit = toFiniteOrNull(ebit);
            const finiteTax = toFiniteOrNull(taxByRule[idx]);
            if (finiteEbit === null) {
              return null;
            }
            return finiteTax === null ? finiteEbit : finiteEbit + finiteTax;
          });

          const royaltiesDetail = (projectEconomicsBreakdown?.royaltiesDetail ?? []).map((detail) => {
            const explicitRoyaltyUSD = detail.royaltyUSD ? sanitizeSeries(detail.royaltyUSD) : null;
            const rate = toFiniteOrNull(detail.rate);
            const baseSeries = detail.base === 'revenue'
              ? out.revenue.grossRevenueUSD
              : detail.base === 'ebit'
                ? out.phase1.ebitUSD
                : detail.base === 'ebitda'
                  ? ebitdaSeries
                  : nullSeries;

            const royaltyUSD = explicitRoyaltyUSD ?? baseSeries.map((value) => {
              const finiteBase = toFiniteOrNull(value);
              if (finiteBase === null || rate === null) {
                return null;
              }
              return Math.max(0, finiteBase) * rate;
            });

            return {
              id: detail.id,
              label: detail.label,
              base: detail.base,
              rate,
              royaltyUSD: sanitizeSeries(royaltyUSD),
            };
          });

          const taxesDetail = projectEconomicsBreakdown?.taxesDetail
            ? {
                federalIncomeTaxUSD: projectEconomicsBreakdown.taxesDetail.federalIncomeTaxUSD
                  ? sanitizeSeries(projectEconomicsBreakdown.taxesDetail.federalIncomeTaxUSD)
                  : undefined,
                municipalRevenueTaxUSD: projectEconomicsBreakdown.taxesDetail.municipalRevenueTaxUSD
                  ? sanitizeSeries(projectEconomicsBreakdown.taxesDetail.municipalRevenueTaxUSD)
                  : undefined,
              }
            : null;

          projectSeriesContexts.push({
            projectId,
            periodEndDatesUtc,
            payableQtyByMetal: Object.fromEntries(
              Object.entries(parsed.engineInputWithoutPrices.payableQtyByMetal).map(([metal, series]) => [metal, sanitizeSeries(series)]),
            ),
            payableQtyUnitByMetal: { ...parsed.engineInputWithoutPrices.payableQtyUnitByMetal },
            priceUSDUnitByMetal: Object.fromEntries(
              Object.keys(parsed.engineInputWithoutPrices.priceKeyByMetal).map((metal) => [metal, `USD_${canonicalUnitForMetal(metal)}`]),
            ),
            spotPriceUSDByMetal: Object.fromEntries(
              Object.entries(resolved.spotPriceUSDByMetal).map(([metal, series]) => [metal, sanitizeSeries(series)]),
            ),
            revenueByMetal_USD: Object.fromEntries(
              Object.entries(out.revenue.byMetalRevenueUSD).map(([metal, series]) => [metal, sanitizeSeries(series)]),
            ),
            operations: {
              oreMinedTonnes: parsed.context.operations?.oreMinedTonnes ? sanitizeSeries(parsed.context.operations.oreMinedTonnes) : undefined,
              oreMilledTonnes: parsed.context.operations?.oreMilledTonnes ? sanitizeSeries(parsed.context.operations.oreMilledTonnes) : undefined,
              throughputUnit: parsed.context.operations?.capacity.throughputUnit ?? null,
              nameplateThroughput: toFiniteOrNull(parsed.context.operations?.capacity.nameplateThroughput),
              utilizationPct: toFiniteOrNull(parsed.context.operations?.capacity.utilizationPct),
            },
            economicsBreakdown: projectEconomicsBreakdown
              ? {
                  cogs: {
                    miningUSD: projectEconomicsBreakdown.cogs?.miningUSD ? sanitizeSeries(projectEconomicsBreakdown.cogs.miningUSD) : undefined,
                    millingUSD: projectEconomicsBreakdown.cogs?.millingUSD ? sanitizeSeries(projectEconomicsBreakdown.cogs.millingUSD) : undefined,
                    utilitiesUSD: projectEconomicsBreakdown.cogs?.utilitiesUSD ? sanitizeSeries(projectEconomicsBreakdown.cogs.utilitiesUSD) : undefined,
                    maintenanceUSD: projectEconomicsBreakdown.cogs?.maintenanceUSD ? sanitizeSeries(projectEconomicsBreakdown.cogs.maintenanceUSD) : undefined,
                    campUSD: projectEconomicsBreakdown.cogs?.campUSD ? sanitizeSeries(projectEconomicsBreakdown.cogs.campUSD) : undefined,
                    siteGandA_USD: projectEconomicsBreakdown.cogs?.siteGandA_USD ? sanitizeSeries(projectEconomicsBreakdown.cogs.siteGandA_USD) : undefined,
                  },
                  selling: {
                    treatmentChargesUSD: projectEconomicsBreakdown.selling?.treatmentChargesUSD ? sanitizeSeries(projectEconomicsBreakdown.selling.treatmentChargesUSD) : undefined,
                    refiningChargesUSD: projectEconomicsBreakdown.selling?.refiningChargesUSD ? sanitizeSeries(projectEconomicsBreakdown.selling.refiningChargesUSD) : undefined,
                    tcRcUSD: projectEconomicsBreakdown.selling?.tcRcUSD ? sanitizeSeries(projectEconomicsBreakdown.selling.tcRcUSD) : undefined,
                    transportUSD: projectEconomicsBreakdown.selling?.transportUSD ? sanitizeSeries(projectEconomicsBreakdown.selling.transportUSD) : undefined,
                  },
                }
              : null,
            royaltiesDetail,
            taxesDetail,
            economics: {
              operatingCostsUSD: sanitizeSeries(parsed.engineInputWithoutPrices.phase1.operatingCostsUSD),
              sustainingCapexUSD: sanitizeSeries(parsed.engineInputWithoutPrices.phase1.sustainingCapexUSD),
              siteGandA_USD: sanitizeSeries(parsed.engineInputWithoutPrices.phase1.siteGandA_USD),
              royaltiesUSD: sanitizeSeries(out.nationalTake.totalRoyaltiesUSD),
              reclamationUSD: sanitizeSeries(parsed.engineInputWithoutPrices.phase1.reclamationUSD),
              byproductCreditsUSD: sanitizeSeries(parsed.engineInputWithoutPrices.phase1.byproductCreditsUSD ?? nullSeries),
              sustainingCostUSD: sanitizeSeries(out.phase1.sustainingCostUSD),
              ebitUSD: sanitizeSeries(out.phase1.ebitUSD),
              taxUSD: sanitizeSeries(taxByRule),
              fcffUSD: sanitizeSeries(out.phase1.fcffUSD),
              capexUSD: sanitizeSeries(out.capexUSD_used),
            },
          });

          return {
            periodEndDatesUtc,
            capexUSD: out.capexUSD_used,
            fcffUSD: out.phase1.fcffUSD,
            grossRevenueUSD: out.revenue.grossRevenueUSD,
            auPriceUSDPerOz: resolved.aisc.auPriceUSDPerOz,
            sustainingCostUSD: out.phase1.sustainingCostUSD,
            payableAuEqOz: out.aisc.payableAuEqOz,
          };
        },
      },
    );

    diagnostics.warnings.push(...aggregation.diagnostics.notes);


    let buildFundingNeedUSD = input.buildFundingNeed_USD;
    if (buildFundingNeedUSD === undefined) {
      diagnostics.warnings.push(
        'buildFundingNeed_USD derived from capex schedule using first production date window',
      );
      buildFundingNeedUSD = deriveBuildFundingNeedUSD({
        corporatePeriodEndDatesUtc: aggregation.corporatePeriodEndDatesUtc,
        capexUSD_total: aggregation.capexUSD_total,
        projects: projectsForBuildFunding,
      });

      if (buildFundingNeedUSD === null) {
        diagnostics.warnings.push(
          'buildFundingNeed_USD derivation returned null because capexUSD_total contains null in the build window',
        );
      }
    }

    let fxRate = input.fx_USD_to_TargetCurrency ?? null;
    if (input.fx.source === 'manual') {
      fxRate = input.fx.manual_fx_USD_to_TargetCurrency ?? input.fx_USD_to_TargetCurrency ?? null;
    } else {
      const fxScenario = input.fx.scenario.mode === 'percentile'
        ? { mode: 'percentile' as const, lookbackYears: input.fx.scenario.lookbackYears, percentile: input.fx.scenario.percentile }
        : input.fx.scenario.mode === 'fixed'
          ? {
              mode: 'fixed' as const,
              fixedFx: input.fx.scenario.fixedPriceByKey[fxKeyUSDTo(input.targetCurrency)],
            }
          : { mode: 'spot' as const };
      const resolvedFx = await resolveFxUSDToTarget({
        targetCurrency: input.targetCurrency,
        anchorDateUtc: spotAnchorDateUtc,
        scenario: fxScenario,
        allowRefresh: refresh,
      });
      diagnostics.warnings.push(...resolvedFx.warnings);
      fxRate = resolvedFx.fx;

      if (fxRate === null && input.fx_USD_to_TargetCurrency !== undefined) {
        fxRate = input.fx_USD_to_TargetCurrency;
        diagnostics.warnings.push('FX auto-resolve failed; using legacy fx_USD_to_TargetCurrency fallback');
      }
      if (fxRate === null) {
        diagnostics.warnings.push('FX missing and auto-resolve failed; target-currency outputs will be null.');
      }
    }

    const marketInput = {
      shares_current: input.market?.shares_current ?? null,
      price_current_TargetCurrency: input.market?.price_current_TargetCurrency ?? null,
      preferredEquity_TargetCurrency: input.market?.preferredEquity_TargetCurrency ?? null,
      minorityInterest_TargetCurrency: input.market?.minorityInterest_TargetCurrency ?? null,
    };

    const financing = fxRate === null
      ? {
          cash_used_for_build_TargetCurrency: null,
          cash_t0_post_TargetCurrency: null,
          new_debt_TargetCurrency: null,
          debt_t0_post_TargetCurrency: null,
          equity_raised_TargetCurrency: null,
          new_shares: null,
          shares_post_financing: marketInput.shares_current,
          NPV_today_TargetCurrency: null,
          NAV_today_TargetCurrency: null,
          Debt_to_Equity_ratio: null,
          npvToday_TargetCurrency: null,
          navToday_TargetCurrency: null,
          cash_AfterCashFirst_TargetCurrency_t0: null,
          debt_TargetCurrency_t0: null,
          netCash_TargetCurrency_t0: null,
          enterpriseAdjustments_TargetCurrency_t0: 0,
          evAdditive_Component_TargetCurrency_t0: null,
        }
      : computeCorporateFinancing({
          NPV_today_USD: aggregation.NPV_today_USD,
          targetCurrency: input.targetCurrency,
          fx_USD_to_TargetCurrency: fxRate,
          cash_t0_TargetCurrency: input.balanceSheet?.cash_t0_TargetCurrency ?? null,
          debt_t0_TargetCurrency: input.balanceSheet?.debt_t0_TargetCurrency ?? null,
          shares_current: marketInput.shares_current,
          price_current_TargetCurrency: marketInput.price_current_TargetCurrency,
          financingPlan: input.financingPlan,
          buildFundingNeed_USD: buildFundingNeedUSD,
        });

    const productionStartIndices = projectsForBuildFunding
      .map((project) => {
        const productionDate = project.periodEndDatesUtc[project.productionStartPeriod];
        const corporateIndex = aggregation.corporatePeriodEndDatesUtc.indexOf(productionDate);
        return corporateIndex >= 0 ? corporateIndex : null;
      })
      .filter((value): value is number => value !== null);

    const corporateProductionStartPeriod =
      productionStartIndices.length > 0 ? Math.min(...productionStartIndices) : null;

    if (projectsForBuildFunding.length > 0 && corporateProductionStartPeriod === null) {
      diagnostics.warnings.push(
        'Lista2 CF+DCF productionStartPeriod unavailable after corporate date-grid alignment; outputs set to null',
      );
    }

    const lista2 = computeLista2CfDcfMetrics({
      fcfUSD_total: aggregation.fcffUSD_total,
      masterN: aggregation.corporateMasterN,
      productionStartPeriod: corporateProductionStartPeriod,
      discountRate: input.discountRate,
      shares_post_financing: financing.shares_post_financing,
      fx_USD_to_TargetCurrency: fxRate,
      npvToday_USD: aggregation.NPV_today_USD,
    });
    diagnostics.warnings.push(...lista2.warnings);
    diagnostics.errors.push(...lista2.errors);

    const rawBody = args.body as Record<string, unknown>;
    const rawBalance = rawBody.balanceSheet;
    const totalStockholdersEquity_USD =
      typeof rawBalance === 'object' && rawBalance !== null && Number.isFinite((rawBalance as Record<string, unknown>).totalStockholdersEquity_t0_USD)
        ? ((rawBalance as Record<string, unknown>).totalStockholdersEquity_t0_USD as number)
        : typeof rawBalance === 'object' && rawBalance !== null && Number.isFinite((rawBalance as Record<string, unknown>).totalStockholdersEquity_USD)
          ? ((rawBalance as Record<string, unknown>).totalStockholdersEquity_USD as number)
          : null;

    const lista4 = computeLista4TenYearMetrics({
      masterN: aggregation.corporateMasterN,
      revenueUSD_total: aggregation.grossRevenueUSD_total,
      fcffUSD_total: aggregation.fcffUSD_total,
      auPriceUSDPerOz: aggregation.auPriceUSDPerOz,
      fx_USD_to_TargetCurrency: fxRate,
      shares_current: marketInput.shares_current,
      shares_post_financing: financing.shares_post_financing,
      ev_TargetCurrency: null,
      totalStockholdersEquity_USD,
    });

    const snapshotSeries = buildSnapshotSeries({
      masterN: aggregation.corporateMasterN,
      corporateDates: aggregation.corporatePeriodEndDatesUtc,
      projectSeriesContexts,
    });

    const lista3a = computeLista3aProjectEfficiencyMetrics({
      masterN: aggregation.corporateMasterN,
      productionStartPeriod: corporateProductionStartPeriod,
      discountRate: input.discountRate,
      fcffUSD_total: aggregation.fcffUSD_total,
      ebitUSD_total: snapshotSeries.ebitUSD,
      capexUSD_total: aggregation.capexUSD_total,
    });
    diagnostics.warnings.push(...lista3a.warnings);

    const snapshot = buildCorporateSnapshot({
      targetCurrency: input.targetCurrency,
      aggregation,
      financing,
      market: marketInput,
      lista2CfDcf: lista2.metrics,
      lista3aProjectEfficiency: lista3a.metrics,
      lista4TenYear: lista4,
    });

    snapshot.series = snapshotSeries;

    return { ok: true, snapshot, diagnostics };
  } catch (error) {
    diagnostics.errors.push((error as Error).message);
    return { ok: false, diagnostics };
  }
}
