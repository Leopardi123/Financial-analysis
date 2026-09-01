import { computeProjectEngineFullProductionV1 } from '../project/engineFullProductionV1.ts';
import { parseProjectJsonV1 } from '../project/jsonv1/parse.ts';
import { resolveProjectPricesToEngineInput } from '../project/jsonv1/resolvePrices.ts';
import type {
  CorporateAggregationDeps,
  CorporateAggregationInput,
  CorporateAggregationOutput,
  CorporateProjectEngineSnapshot,
} from './types.ts';

type ProjectAxis = {
  projectId: string;
  masterN: number;
  productionStartPeriod: number;
  productionStartYear: number;
  yearsByPeriod: number[];
  yearToT: Map<number, number>;
};

function validateBaseInput(input: CorporateAggregationInput): void {
  if (!(input.discountRate > 0 && input.discountRate <= 0.25)) throw new Error('discountRate must satisfy 0 < r <= 0.25');
  if (input.projects.length < 1) throw new Error('At least one project is required for corporate aggregation');
}

function getProjectAxisOrThrow(
  projectId: string,
  rawJson: unknown,
  parse: NonNullable<CorporateAggregationDeps['parseProject']>,
): ProjectAxis {
  try {
    const parsed = parse(rawJson);
    const engine = parsed.engineInputWithoutPrices;
    const masterN = engine.masterN;
    const productionStartPeriod = engine.productionStartPeriod;
    const yearsByPeriod = engine.yearsByPeriod;

    if (!Number.isInteger(masterN) || masterN < 0) throw new Error(`masterN=${String(masterN)}`);
    if (!Number.isInteger(productionStartPeriod) || productionStartPeriod < 0 || productionStartPeriod > masterN) {
      throw new Error(`productionStartPeriod=${String(productionStartPeriod)}`);
    }
    if (!Array.isArray(yearsByPeriod) || yearsByPeriod.length !== masterN + 1) {
      throw new Error(`yearsByPeriod length=${Array.isArray(yearsByPeriod) ? yearsByPeriod.length : 'missing'}, expected=${masterN + 1}`);
    }
    if (!yearsByPeriod.every((year) => Number.isInteger(year) && year >= 1000 && year <= 9999)) {
      throw new Error('yearsByPeriod must contain absolute 4-digit years');
    }
    for (let t = 1; t < yearsByPeriod.length; t += 1) {
      if (yearsByPeriod[t] <= yearsByPeriod[t - 1]) throw new Error(`yearsByPeriod is not strictly increasing at t=${t}`);
    }

    const productionStartYear = yearsByPeriod[productionStartPeriod];
    return {
      projectId,
      masterN,
      productionStartPeriod,
      productionStartYear,
      yearsByPeriod: [...yearsByPeriod],
      yearToT: new Map<number, number>(yearsByPeriod.map((year, t) => [year, t])),
    };
  } catch (error) {
    throw new Error(`Invalid project timeline for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sumStrictByYearGrid(
  corporateYears: number[],
  projects: Array<CorporateProjectEngineSnapshot & { yearToT: Map<number, number> }>,
  readSeries: (project: CorporateProjectEngineSnapshot) => Array<number | null>,
): Array<number | null> {
  const sums = new Array<number>(corporateYears.length).fill(0);
  const hasContributor = new Array<boolean>(corporateYears.length).fill(false);
  const nullAtYear = new Array<boolean>(corporateYears.length).fill(false);
  for (const project of projects) {
    const series = readSeries(project);
    for (let j = 0; j < corporateYears.length; j += 1) {
      if (nullAtYear[j]) continue;
      const t = project.yearToT.get(corporateYears[j]);
      if (t === undefined) continue;
      hasContributor[j] = true;
      const value = series[t];
      if (value === null) { nullAtYear[j] = true; continue; }
      sums[j] += value;
    }
  }
  return sums.map((value, j) => (nullAtYear[j] || !hasContributor[j] ? null : value));
}

function mergeCanonicalMetalPrices(
  corporateYears: number[],
  projects: Array<CorporateProjectEngineSnapshot & { yearToT: Map<number, number> }>,
): { priceUSDByMetal: Record<string, Array<number | null>>; priceKeyByMetal: Record<string, string> } {
  const metals = new Set<string>();
  for (const project of projects) for (const metal of Object.keys(project.priceUSDByMetal ?? {})) metals.add(metal);
  const priceUSDByMetal: Record<string, Array<number | null>> = {};
  const priceKeyByMetal: Record<string, string> = {};
  for (const metal of metals) {
    const keys = new Set(projects.map((project) => project.priceKeyByMetal?.[metal]).filter((key): key is string => typeof key === 'string'));
    if (keys.size !== 1) continue;
    priceKeyByMetal[metal] = [...keys][0];
    priceUSDByMetal[metal] = corporateYears.map((year) => {
      const values: number[] = [];
      for (const project of projects) {
        const t = project.yearToT.get(year);
        if (t === undefined) continue;
        const value = project.priceUSDByMetal?.[metal]?.[t];
        if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
      }
      if (values.length === 0) return null;
      const first = values[0];
      return values.every((value) => Math.abs(value - first) <= Math.max(1e-9, Math.abs(first) * 1e-9)) ? first : null;
    });
  }
  return { priceUSDByMetal, priceKeyByMetal };
}

function computeStrictValueMetrics(args: { fcffUSD_total: Array<number | null>; discountRate: number }): Pick<CorporateAggregationOutput, 'CF_LOM_USD' | 'NPV_today_USD'> {
  if (args.fcffUSD_total.some((value) => value === null)) return { CF_LOM_USD: null, NPV_today_USD: null };
  let cfLOM = 0;
  let npv = 0;
  for (let t = 0; t < args.fcffUSD_total.length; t += 1) {
    const fcff = args.fcffUSD_total[t] as number;
    cfLOM += fcff;
    npv += fcff / (1 + args.discountRate) ** t;
  }
  return { CF_LOM_USD: cfLOM, NPV_today_USD: npv };
}

function computeCorporateAiscLom(args: { sustainingCostUSD_total: Array<number | null>; payableAuEqOz_total: Array<number | null> }): number | null {
  let numerator = 0;
  let denominator = 0;
  let lomPeriods = 0;
  for (let t = 0; t < args.payableAuEqOz_total.length; t += 1) {
    const payable = args.payableAuEqOz_total[t];
    if (payable == null || payable <= 0) continue;
    lomPeriods += 1;
    const sustainingCost = args.sustainingCostUSD_total[t];
    if (sustainingCost === null) return null;
    numerator += sustainingCost;
    denominator += payable;
  }
  if (lomPeriods === 0 || denominator <= 0) return null;
  return numerator / denominator;
}

function assertSeriesLength(series: Array<number | null>, expectedLength: number, projectId: string, label: string): void {
  if (series.length !== expectedLength) throw new Error(`Project ${projectId} ${label} length must be ${expectedLength}`);
}

async function projectToSeriesViaDeps(
  args: { projectId: string; rawJson: unknown; yearsByPeriod: number[] },
  deps: CorporateAggregationDeps,
): Promise<CorporateProjectEngineSnapshot> {
  if (deps.projectToSeries) return deps.projectToSeries({ projectId: args.projectId, rawJson: args.rawJson });
  const parse = deps.parseProject ?? parseProjectJsonV1;
  const resolvePrices = deps.resolvePrices ?? resolveProjectPricesToEngineInput;
  const runProjectEngine = deps.runProjectEngine ?? computeProjectEngineFullProductionV1;
  const parsed = parse(args.rawJson);
  const from = `${args.yearsByPeriod[0]}-12-31`;
  const to = `${args.yearsByPeriod[args.yearsByPeriod.length - 1]}-12-31`;
  const resolvedInput = await resolvePrices({ parsed, from, to });
  const out = runProjectEngine(resolvedInput);
  return {
    capexUSD: out.capexUSD_used,
    fcffUSD: out.phase1.fcffUSD,
    grossRevenueUSD: out.revenue.grossRevenueUSD,
    auPriceUSDPerOz: resolvedInput.aisc.auPriceUSDPerOz,
    priceUSDByMetal: resolvedInput.spotPriceUSDByMetal,
    priceKeyByMetal: resolvedInput.priceKeyByMetal,
    sustainingCostUSD: out.phase1.sustainingCostUSD,
    payableAuEqOz: out.aisc.payableAuEqOz,
  };
}

export async function aggregateProjectsCorporateV1(input: CorporateAggregationInput, deps: CorporateAggregationDeps = {}): Promise<CorporateAggregationOutput> {
  validateBaseInput(input);
  const parse = deps.parseProject ?? parseProjectJsonV1;
  const projectAxes = input.projects.map((project) => getProjectAxisOrThrow(project.projectId, project.rawJson, parse));
  const projects = await Promise.all(input.projects.map((project, index) => projectToSeriesViaDeps({ projectId: project.projectId, rawJson: project.rawJson, yearsByPeriod: projectAxes[index].yearsByPeriod }, deps)));

  for (let index = 0; index < input.projects.length; index += 1) {
    const periodLength = projectAxes[index].masterN + 1;
    const projectId = input.projects[index].projectId;
    assertSeriesLength(projects[index].capexUSD, periodLength, projectId, 'capexUSD');
    assertSeriesLength(projects[index].fcffUSD, periodLength, projectId, 'fcffUSD');
    assertSeriesLength(projects[index].grossRevenueUSD, periodLength, projectId, 'grossRevenueUSD');
    assertSeriesLength(projects[index].auPriceUSDPerOz, periodLength, projectId, 'auPriceUSDPerOz');
    assertSeriesLength(projects[index].sustainingCostUSD, periodLength, projectId, 'sustainingCostUSD');
    assertSeriesLength(projects[index].payableAuEqOz, periodLength, projectId, 'payableAuEqOz');
    for (const [metal, series] of Object.entries(projects[index].priceUSDByMetal ?? {})) assertSeriesLength(series, periodLength, projectId, `priceUSDByMetal[${metal}]`);
  }

  const minYear = Math.min(...projectAxes.flatMap((time) => time.yearsByPeriod));
  const maxYear = Math.max(...projectAxes.flatMap((time) => time.yearsByPeriod));
  const corporateYearsByPeriod = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
  const yearToCorporateIndex = new Map<number, number>(corporateYearsByPeriod.map((year, j) => [year, j]));
  if (yearToCorporateIndex.size !== corporateYearsByPeriod.length) throw new Error('Corporate years axis contains duplicate years');

  const projectsWithYears = projects.map((projectSeries, index) => ({ ...projectSeries, yearToT: projectAxes[index].yearToT }));
  const capexUSD_total = sumStrictByYearGrid(corporateYearsByPeriod, projectsWithYears, (project) => project.capexUSD);
  const fcffUSD_total = sumStrictByYearGrid(corporateYearsByPeriod, projectsWithYears, (project) => project.fcffUSD);
  const grossRevenueUSD_total = sumStrictByYearGrid(corporateYearsByPeriod, projectsWithYears, (project) => project.grossRevenueUSD);
  const auPriceUSDPerOz = sumStrictByYearGrid(corporateYearsByPeriod, projectsWithYears, (project) => project.auPriceUSDPerOz);
  const sustainingCostUSD_total = sumStrictByYearGrid(corporateYearsByPeriod, projectsWithYears, (project) => project.sustainingCostUSD);
  const payableAuEqOz_total = sumStrictByYearGrid(corporateYearsByPeriod, projectsWithYears, (project) => project.payableAuEqOz);
  const { priceUSDByMetal, priceKeyByMetal } = mergeCanonicalMetalPrices(corporateYearsByPeriod, projectsWithYears);
  const valueMetrics = computeStrictValueMetrics({ fcffUSD_total, discountRate: input.discountRate });
  const aiscAuEqUSDPerOz_LOM = computeCorporateAiscLom({ sustainingCostUSD_total, payableAuEqOz_total });
  const nullPeriods = fcffUSD_total.filter((value) => value === null).length;

  return {
    corporateYearsByPeriod,
    corporateMasterN: corporateYearsByPeriod.length - 1,
    capexUSD_total,
    fcffUSD_total,
    grossRevenueUSD_total,
    auPriceUSDPerOz,
    priceUSDByMetal,
    priceKeyByMetal,
    sustainingCostUSD_total,
    payableAuEqOz_total,
    aiscAuEqUSDPerOz_LOM,
    CF_LOM_USD: valueMetrics.CF_LOM_USD,
    NPV_today_USD: valueMetrics.NPV_today_USD,
    diagnostics: {
      projectCount: input.projects.length,
      usedDatesCount: corporateYearsByPeriod.length,
      nullPeriods,
      notes: [
        `corporateYearsByPeriod_first8=${JSON.stringify(corporateYearsByPeriod.slice(0, 8))}`,
        `corporateMinYear=${String(minYear)}`,
        `corporateMaxYear=${String(maxYear)}`,
      ],
    },
  };
}
