export type CanonicalProducerMetricsInput = {
  revenueByMetalUSD: Readonly<Record<string, number | null>>;
  cashOperatingCostsUSD: number | null;
  royaltiesUSD: number | null;
  productionTaxesUSD: number | null;
  tcRcUSD: number | null;
  siteGnaUSD: number | null;
  corporateGnaUSD: number | null;
  otherRecurringOperatingCashExpensesUSD: number | null;
  sustainingCapexUSD: number | null;
  sustainingExplorationDevelopmentUSD: number | null;
  cashTaxesUSD: number | null;
  workingCapitalDeltaUSD: number | null;
  otherRecurringNonEbitdaCashSpendUSD: number | null;
  growthCapexUSD: number | null;
  growthExplorationDevelopmentUSD: number | null;
  byproductCreditsUSD?: number;
};

export type CanonicalProducerMetrics = {
  revenueUSD: number | null;
  ebitdaUSD: number | null;
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

function validateNullableSpend(value: number | null, field: string): void {
  if (value !== null) assertFiniteNonNegative(value, field);
}

function validateNullableFinite(value: number | null, field: string): void {
  if (value !== null) assertFinite(value, field);
}

export function computeCanonicalProducerMetrics(input: CanonicalProducerMetricsInput): CanonicalProducerMetrics {
  const raw = input as CanonicalProducerMetricsInput & Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(raw, 'interestExpenseUSD')) {
    throw new Error('Canonical Producer cash flow is FCFF: interestExpenseUSD must not be included');
  }

  if (input.byproductCreditsUSD !== undefined && input.byproductCreditsUSD !== 0) {
    throw new Error('Canonical Producer EBITDA must not add by-product credits on top of metal revenue');
  }

  const revenueEntries = Object.entries(input.revenueByMetalUSD);
  if (revenueEntries.length === 0) {
    throw new Error('revenueByMetalUSD must contain at least one metal');
  }
  for (const [metal, value] of revenueEntries) {
    if (value !== null) assertFinite(value, `revenueByMetalUSD.${metal}`);
  }

  const nonNegativeSpendFields: Array<[string, number | null]> = [
    ['cashOperatingCostsUSD', input.cashOperatingCostsUSD],
    ['royaltiesUSD', input.royaltiesUSD],
    ['productionTaxesUSD', input.productionTaxesUSD],
    ['tcRcUSD', input.tcRcUSD],
    ['siteGnaUSD', input.siteGnaUSD],
    ['corporateGnaUSD', input.corporateGnaUSD],
    ['otherRecurringOperatingCashExpensesUSD', input.otherRecurringOperatingCashExpensesUSD],
    ['sustainingCapexUSD', input.sustainingCapexUSD],
    ['sustainingExplorationDevelopmentUSD', input.sustainingExplorationDevelopmentUSD],
    ['cashTaxesUSD', input.cashTaxesUSD],
    ['otherRecurringNonEbitdaCashSpendUSD', input.otherRecurringNonEbitdaCashSpendUSD],
    ['growthCapexUSD', input.growthCapexUSD],
    ['growthExplorationDevelopmentUSD', input.growthExplorationDevelopmentUSD],
  ];
  for (const [field, value] of nonNegativeSpendFields) validateNullableSpend(value, field);
  validateNullableFinite(input.workingCapitalDeltaUSD, 'workingCapitalDeltaUSD');

  const diagnostics: string[] = [];
  const missingRevenueMetals = revenueEntries.filter(([, value]) => value === null).map(([metal]) => metal);
  if (missingRevenueMetals.length > 0) {
    diagnostics.push(...missingRevenueMetals.map((metal) => `REVENUE_${metal}_UNKNOWN`));
  }
  const revenueUSD = missingRevenueMetals.length === 0
    ? revenueEntries.reduce((sum, [, value]) => sum + (value as number), 0)
    : null;

  const operatingFields: Array<[string, number | null]> = [
    ['CASH_OPERATING_COSTS_UNKNOWN', input.cashOperatingCostsUSD],
    ['ROYALTIES_UNKNOWN', input.royaltiesUSD],
    ['PRODUCTION_TAXES_UNKNOWN', input.productionTaxesUSD],
    ['TC_RC_UNKNOWN', input.tcRcUSD],
    ['SITE_GNA_UNKNOWN', input.siteGnaUSD],
    ['CORPORATE_GNA_UNKNOWN', input.corporateGnaUSD],
    ['OTHER_RECURRING_OPERATING_CASH_EXPENSES_UNKNOWN', input.otherRecurringOperatingCashExpensesUSD],
  ];
  const missingOperating = operatingFields.filter(([, value]) => value === null);
  diagnostics.push(...missingOperating.map(([code]) => code));

  const ebitdaUSD = revenueUSD === null || missingOperating.length > 0
    ? null
    : revenueUSD
      - (input.cashOperatingCostsUSD as number)
      - (input.royaltiesUSD as number)
      - (input.productionTaxesUSD as number)
      - (input.tcRcUSD as number)
      - (input.siteGnaUSD as number)
      - (input.corporateGnaUSD as number)
      - (input.otherRecurringOperatingCashExpensesUSD as number);

  const preGrowthFields: Array<[string, number | null]> = [
    ['SUSTAINING_CAPEX_UNKNOWN', input.sustainingCapexUSD],
    ['SUSTAINING_EXPLORATION_DEVELOPMENT_UNKNOWN', input.sustainingExplorationDevelopmentUSD],
    ['CASH_TAX_UNKNOWN', input.cashTaxesUSD],
    ['WORKING_CAPITAL_DELTA_UNKNOWN', input.workingCapitalDeltaUSD],
    ['OTHER_RECURRING_NON_EBITDA_CASH_SPEND_UNKNOWN', input.otherRecurringNonEbitdaCashSpendUSD],
  ];
  const missingPreGrowth = preGrowthFields.filter(([, value]) => value === null);
  diagnostics.push(...missingPreGrowth.map(([code]) => code));

  const fcffBeforeGrowthUSD = ebitdaUSD === null || missingPreGrowth.length > 0
    ? null
    : ebitdaUSD
      - (input.sustainingCapexUSD as number)
      - (input.sustainingExplorationDevelopmentUSD as number)
      - (input.cashTaxesUSD as number)
      - (input.workingCapitalDeltaUSD as number)
      - (input.otherRecurringNonEbitdaCashSpendUSD as number);

  const growthFields: Array<[string, number | null]> = [
    ['GROWTH_CAPEX_UNKNOWN', input.growthCapexUSD],
    ['GROWTH_EXPLORATION_DEVELOPMENT_UNKNOWN', input.growthExplorationDevelopmentUSD],
  ];
  const missingGrowth = growthFields.filter(([, value]) => value === null);
  diagnostics.push(...missingGrowth.map(([code]) => code));

  const fcffAfterGrowthUSD = fcffBeforeGrowthUSD === null || missingGrowth.length > 0
    ? null
    : fcffBeforeGrowthUSD
      - (input.growthCapexUSD as number)
      - (input.growthExplorationDevelopmentUSD as number);

  return {
    revenueUSD,
    ebitdaUSD,
    fcffBeforeGrowthUSD,
    fcffAfterGrowthUSD,
    diagnostics,
  };
}
