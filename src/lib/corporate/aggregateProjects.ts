import { computeProjectEngineFullProductionV1 } from '../project/engineFullProductionV1.js';
import { parseProjectJsonV1 } from '../project/jsonv1/parse.js';
import { resolveProjectPricesToEngineInput } from '../project/jsonv1/resolvePrices.js';
import type {
  CorporateAggregationDeps,
  CorporateAggregationInput,
  CorporateAggregationOutput,
  CorporateProjectEngineSnapshot,
} from './types.js';

function validateBaseInput(input: CorporateAggregationInput): void {
  if (!(input.discountRate > 0 && input.discountRate <= 0.25)) {
    throw new Error('discountRate must satisfy 0 < r <= 0.25');
  }

  if (input.projects.length < 1) {
    throw new Error('At least one project is required for corporate aggregation');
  }
}

function buildCorporateDateGrid(projects: CorporateProjectEngineSnapshot[]): string[] {
  const allDates = projects.flatMap((project) => project.periodEndDatesUtc);
  return [...new Set(allDates)].sort((a, b) => a.localeCompare(b));
}

function sumStrictByDateGrid(
  corporateDates: string[],
  projects: CorporateProjectEngineSnapshot[],
  readSeries: (project: CorporateProjectEngineSnapshot) => Array<number | null>,
): Array<number | null> {
  const sums = new Array<number>(corporateDates.length).fill(0);
  const nullAtDate = new Array<boolean>(corporateDates.length).fill(false);

  for (const project of projects) {
    const dateToProjectIndex = new Map<string, number>(project.periodEndDatesUtc.map((date, index) => [date, index]));
    const series = readSeries(project);

    for (let corporateIndex = 0; corporateIndex < corporateDates.length; corporateIndex += 1) {
      if (nullAtDate[corporateIndex]) {
        continue;
      }

      const date = corporateDates[corporateIndex];
      const projectIndex = dateToProjectIndex.get(date);
      if (projectIndex === undefined) {
        continue;
      }

      const value = series[projectIndex];
      if (value === null) {
        nullAtDate[corporateIndex] = true;
        continue;
      }

      sums[corporateIndex] += value;
    }
  }

  return sums.map((value, index) => (nullAtDate[index] ? null : value));
}

function computeStrictValueMetrics(args: {
  fcffUSD_total: Array<number | null>;
  discountRate: number;
}): Pick<CorporateAggregationOutput, 'CF_LOM_USD' | 'NPV_today_USD'> {
  if (args.fcffUSD_total.some((value) => value === null)) {
    return {
      CF_LOM_USD: null,
      NPV_today_USD: null,
    };
  }

  let cfLOM = 0;
  let npv = 0;
  for (let t = 0; t < args.fcffUSD_total.length; t += 1) {
    const fcff = args.fcffUSD_total[t] as number;
    cfLOM += fcff;
    npv += fcff / (1 + args.discountRate) ** t;
  }

  return {
    CF_LOM_USD: cfLOM,
    NPV_today_USD: npv,
  };
}

function computeCorporateAiscLom(args: {
  sustainingCostUSD_total: Array<number | null>;
  payableAuEqOz_total: Array<number | null>;
}): number | null {
  let numerator = 0;
  let denominator = 0;
  let lomPeriods = 0;

  for (let t = 0; t < args.payableAuEqOz_total.length; t += 1) {
    const payable = args.payableAuEqOz_total[t];
    if (payable == null || payable <= 0) {
      continue;
    }

    lomPeriods += 1;
    const sustainingCost = args.sustainingCostUSD_total[t];
    if (sustainingCost === null) {
      return null;
    }

    numerator += sustainingCost;
    denominator += payable;
  }

  if (lomPeriods === 0 || denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}

function assertSeriesLength(series: Array<number | null>, expectedLength: number, projectId: string, label: string): void {
  if (series.length !== expectedLength) {
    throw new Error(`Project ${projectId} ${label} length must be ${expectedLength}`);
  }
}

async function defaultProjectToSeries(args: {
  projectId: string;
  rawJson: unknown;
}): Promise<CorporateProjectEngineSnapshot> {
  const parsed = parseProjectJsonV1(args.rawJson);
  const periodEndDatesUtc = parsed.engineInputWithoutPrices.periodEndDatesUtc;
  if (!periodEndDatesUtc) {
    throw new Error(`Project ${args.projectId} is missing time.periodEndDatesUtc; required for corporate aggregation v1.`);
  }

  const resolved = await resolveProjectPricesToEngineInput({
    parsed,
    from: periodEndDatesUtc[0],
    to: periodEndDatesUtc[periodEndDatesUtc.length - 1],
  });
  const out = computeProjectEngineFullProductionV1(resolved);

  return {
    periodEndDatesUtc,
    capexUSD: out.capexUSD_used,
    fcffUSD: out.phase1.fcffUSD,
    sustainingCostUSD: out.phase1.sustainingCostUSD,
    payableAuEqOz: out.aisc.payableAuEqOz,
  };
}

async function projectToSeriesViaDeps(
  args: { projectId: string; rawJson: unknown },
  deps: CorporateAggregationDeps,
): Promise<CorporateProjectEngineSnapshot> {
  if (deps.projectToSeries) {
    return deps.projectToSeries(args);
  }

  const parse = deps.parseProject ?? parseProjectJsonV1;
  const resolvePrices = deps.resolvePrices ?? resolveProjectPricesToEngineInput;
  const runProjectEngine = deps.runProjectEngine ?? computeProjectEngineFullProductionV1;

  const parsed = parse(args.rawJson);
  const periodEndDatesUtc = parsed.engineInputWithoutPrices.periodEndDatesUtc;

  if (!periodEndDatesUtc) {
    throw new Error(`Project ${args.projectId} is missing time.periodEndDatesUtc; required for corporate aggregation v1.`);
  }

  const resolvedInput = await resolvePrices({
    parsed,
    from: periodEndDatesUtc[0],
    to: periodEndDatesUtc[periodEndDatesUtc.length - 1],
  });

  const out = runProjectEngine(resolvedInput);

  return {
    periodEndDatesUtc,
    capexUSD: out.capexUSD_used,
    fcffUSD: out.phase1.fcffUSD,
    sustainingCostUSD: out.phase1.sustainingCostUSD,
    payableAuEqOz: out.aisc.payableAuEqOz,
  };
}

export async function aggregateProjectsCorporateV1(
  input: CorporateAggregationInput,
  deps: CorporateAggregationDeps = {},
): Promise<CorporateAggregationOutput> {
  validateBaseInput(input);

  const projects = deps.projectToSeries || deps.parseProject || deps.resolvePrices || deps.runProjectEngine
    ? await Promise.all(input.projects.map((project) => projectToSeriesViaDeps({ projectId: project.projectId, rawJson: project.rawJson }, deps)))
    : await Promise.all(input.projects.map((project) => defaultProjectToSeries({ projectId: project.projectId, rawJson: project.rawJson })));

  for (let index = 0; index < input.projects.length; index += 1) {
    const periodLength = projects[index].periodEndDatesUtc.length;
    const projectId = input.projects[index].projectId;

    assertSeriesLength(projects[index].capexUSD, periodLength, projectId, 'capexUSD');
    assertSeriesLength(projects[index].fcffUSD, periodLength, projectId, 'fcffUSD');
    assertSeriesLength(projects[index].sustainingCostUSD, periodLength, projectId, 'sustainingCostUSD');
    assertSeriesLength(projects[index].payableAuEqOz, periodLength, projectId, 'payableAuEqOz');
  }

  const corporatePeriodEndDatesUtc = buildCorporateDateGrid(projects);
  const corporateMasterN = corporatePeriodEndDatesUtc.length - 1;

  const capexUSD_total = sumStrictByDateGrid(corporatePeriodEndDatesUtc, projects, (project) => project.capexUSD);
  const fcffUSD_total = sumStrictByDateGrid(corporatePeriodEndDatesUtc, projects, (project) => project.fcffUSD);
  const sustainingCostUSD_total = sumStrictByDateGrid(corporatePeriodEndDatesUtc, projects, (project) => project.sustainingCostUSD);
  const payableAuEqOz_total = sumStrictByDateGrid(corporatePeriodEndDatesUtc, projects, (project) => project.payableAuEqOz);

  const valueMetrics = computeStrictValueMetrics({ fcffUSD_total, discountRate: input.discountRate });
  const aiscAuEqUSDPerOz_LOM = computeCorporateAiscLom({
    sustainingCostUSD_total,
    payableAuEqOz_total,
  });

  const nullPeriods = fcffUSD_total.filter((value) => value === null).length;

  return {
    corporatePeriodEndDatesUtc,
    corporateMasterN,
    capexUSD_total,
    fcffUSD_total,
    sustainingCostUSD_total,
    payableAuEqOz_total,
    aiscAuEqUSDPerOz_LOM,
    CF_LOM_USD: valueMetrics.CF_LOM_USD,
    NPV_today_USD: valueMetrics.NPV_today_USD,
    diagnostics: {
      projectCount: input.projects.length,
      usedDatesCount: corporatePeriodEndDatesUtc.length,
      nullPeriods,
      notes: [],
    },
  };
}
