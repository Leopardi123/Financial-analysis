import type { CorporateProjectsInput, CorporateProjectsOutput } from './types.ts';

const SERIES_FIELDS = ['grossRevenueUSD', 'capexUSD', 'fcffUSD', 'sustainingCostUSD', 'payableAuEqOz'] as const;
type SeriesField = (typeof SERIES_FIELDS)[number];

type ProjectSeriesMap = Record<SeriesField, (number | null)[]>;

type ValidatedProject = CorporateProjectsInput['projects'][number] & ProjectSeriesMap;

function assertValidInput(input: CorporateProjectsInput & { discountRate: number }): void {
  if (input.projects.length < 1) {
    throw new Error('At least one project is required');
  }

  if (!Number.isFinite(input.discountRate) || input.discountRate <= 0 || input.discountRate > 0.25) {
    throw new Error('discountRate must be finite and within (0, 0.25]');
  }

  const expectedLength = input.masterN + 1;

  for (const project of input.projects) {
    if (!Number.isInteger(project.productionStartPeriod)) {
      throw new Error(`Project ${project.id} has non-integer productionStartPeriod`);
    }

    for (const field of SERIES_FIELDS) {
      if (project[field].length !== expectedLength) {
        throw new Error(`Project ${project.id} field ${field} length must be ${expectedLength}`);
      }
    }
  }
}

function sumSeriesStrict(projects: ValidatedProject[], field: SeriesField, masterN: number): (number | null)[] {
  const output: (number | null)[] = [];

  for (let t = 0; t <= masterN; t += 1) {
    let sum = 0;
    let invalid = false;

    for (const project of projects) {
      const value = project[field][t];
      if (value === null || !Number.isFinite(value)) {
        invalid = true;
        break;
      }
      sum += value;
    }

    output.push(invalid ? null : sum);
  }

  return output;
}

function sumStrict(values: (number | null)[]): number | null {
  let sum = 0;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) {
      return null;
    }
    sum += value;
  }
  return sum;
}

export function computeCorporateProjects(
  input: CorporateProjectsInput & { discountRate: number },
): CorporateProjectsOutput {
  assertValidInput(input);

  const projects = input.projects as ValidatedProject[];

  const grossRevenueUSD_total = sumSeriesStrict(projects, 'grossRevenueUSD', input.masterN);
  const capexUSD_total = sumSeriesStrict(projects, 'capexUSD', input.masterN);
  const fcffUSD_total = sumSeriesStrict(projects, 'fcffUSD', input.masterN);
  const sustainingCostUSD_total = sumSeriesStrict(projects, 'sustainingCostUSD', input.masterN);

  const cfLOM_USD_total = sumStrict(fcffUSD_total);

  let npvToday_USD_total: number | null = 0;
  for (let t = 0; t <= input.masterN; t += 1) {
    const fcff = fcffUSD_total[t];
    if (fcff === null || !Number.isFinite(fcff)) {
      npvToday_USD_total = null;
      break;
    }

    const discountFactor = 1 / (1 + input.discountRate) ** t;
    npvToday_USD_total += fcff * discountFactor;
  }

  let denominator = 0;
  let numerator = 0;
  let aiscInvalid = false;

  for (const project of projects) {
    for (let t = 0; t <= input.masterN; t += 1) {
      const payable = project.payableAuEqOz[t];
      const included = t >= project.productionStartPeriod && payable !== null && Number.isFinite(payable) && payable > 0;
      if (!included) {
        continue;
      }

      denominator += payable;

      const sustainingCost = project.sustainingCostUSD[t];
      if (sustainingCost === null || !Number.isFinite(sustainingCost)) {
        aiscInvalid = true;
      } else {
        numerator += sustainingCost;
      }
    }
  }

  const payableAuEqOz_total_included = denominator > 0 ? denominator : null;
  const sustainingCostUSD_total_included = aiscInvalid ? null : numerator;

  const aiscAuEqUSDPerOz_LOM_corp =
    aiscInvalid || denominator <= 0 || sustainingCostUSD_total_included === null
      ? null
      : sustainingCostUSD_total_included / denominator;

  return {
    grossRevenueUSD_total,
    capexUSD_total,
    fcffUSD_total,
    sustainingCostUSD_total,
    cfLOM_USD_total,
    npvToday_USD_total,
    payableAuEqOz_total_included,
    sustainingCostUSD_total_included,
    aiscAuEqUSDPerOz_LOM_corp,
  };
}
