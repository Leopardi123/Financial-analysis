export type CanonicalProducerMetricsInput = {
  revenueByMetalUSD: Readonly<Record<string, number>>;
  cashOperatingCostsUSD: number;
  royaltiesUSD: number;
  productionTaxesUSD: number;
  tcRcUSD: number;
  siteGnaUSD: number;
  corporateGnaUSD: number;
  otherRecurringOperatingCashExpensesUSD: number;
  sustainingCapexUSD: number;
  sustainingExplorationDevelopmentUSD: number;
  cashTaxesUSD: number | null;
  workingCapitalDeltaUSD: number;
  otherRecurringNonEbitdaCashSpendUSD: number;
  growthCapexUSD: number;
  growthExplorationDevelopmentUSD: number;
  byproductCreditsUSD?: number;
};

export type CanonicalProducerMetrics = {
  revenueUSD: number;
  ebitdaUSD: number;
  fcffBeforeGrowthUSD: number | null;
  fcffAfterGrowthUSD: number | null;
  diagnostics: string[];
};

function assertFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be finite non-negative spend`);
  }
}

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be finite`);
  }
}

export function computeCanonicalProducerMetrics(input: CanonicalProducerMetricsInput): CanonicalProducerMetrics {
  const raw = input as CanonicalProducerMetricsInput & Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(raw, 'interestExpenseUSD')) {
    throw new Error('Canonical Producer cash flow is FCFF: interestExpenseUSD must not be included');
  }

  if (input.byproductCreditsUSD !== undefined && input.byproductCreditsUSD !== 0) {
    throw new Error('Canonical Producer EBITDA must not add by-product credits on top of metal revenue');
  }

  const revenueValues = Object.values(input.revenueByMetalUSD);
  if (revenueValues.length === 0) {
    throw new Error('revenueByMetalUSD must contain at least one metal');
  }
  for (const [metal, value] of Object.entries(input.revenueByMetalUSD)) {
    assertFinite(value, `revenueByMetalUSD.${metal}`);
  }

  const spendFields: Array<[string, number]> = [
    ['cashOperatingCostsUSD', input.cashOperatingCostsUSD],
    ['royaltiesUSD', input.royaltiesUSD],
    ['productionTaxesUSD', input.productionTaxesUSD],
    ['tcRcUSD', input.tcRcUSD],
    ['siteGnaUSD', input.siteGnaUSD],
    ['corporateGnaUSD', input.corporateGnaUSD],
    ['otherRecurringOperatingCashExpensesUSD', input.otherRecurringOperatingCashExpensesUSD],
    ['sustainingCapexUSD', input.sustainingCapexUSD],
    ['sustainingExplorationDevelopmentUSD', input.sustainingExplorationDevelopmentUSD],
    ['otherRecurringNonEbitdaCashSpendUSD', input.otherRecurringNonEbitdaCashSpendUSD],
    ['growthCapexUSD', input.growthCapexUSD],
    ['growthExplorationDevelopmentUSD', input.growthExplorationDevelopmentUSD],
  ];
  for (const [field, value] of spendFields) {
    assertFiniteNonNegative(value, field);
  }
  assertFinite(input.workingCapitalDeltaUSD, 'workingCapitalDeltaUSD');

  const revenueUSD = revenueValues.reduce((sum, value) => sum + value, 0);
  const ebitdaUSD = revenueUSD
    - input.cashOperatingCostsUSD
    - input.royaltiesUSD
    - input.productionTaxesUSD
    - input.tcRcUSD
    - input.siteGnaUSD
    - input.corporateGnaUSD
    - input.otherRecurringOperatingCashExpensesUSD;

  if (input.cashTaxesUSD === null || input.cashTaxesUSD === undefined) {
    return {
      revenueUSD,
      ebitdaUSD,
      fcffBeforeGrowthUSD: null,
      fcffAfterGrowthUSD: null,
      diagnostics: ['CASH_TAX_UNKNOWN'],
    };
  }
  assertFiniteNonNegative(input.cashTaxesUSD, 'cashTaxesUSD');

  const fcffBeforeGrowthUSD = ebitdaUSD
    - input.sustainingCapexUSD
    - input.sustainingExplorationDevelopmentUSD
    - input.cashTaxesUSD
    - input.workingCapitalDeltaUSD
    - input.otherRecurringNonEbitdaCashSpendUSD;

  const fcffAfterGrowthUSD = fcffBeforeGrowthUSD
    - input.growthCapexUSD
    - input.growthExplorationDevelopmentUSD;

  return {
    revenueUSD,
    ebitdaUSD,
    fcffBeforeGrowthUSD,
    fcffAfterGrowthUSD,
    diagnostics: [],
  };
}
