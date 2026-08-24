export type ProducerEnterpriseValueInput = {
  marketCapUSD: number;
  debtUSD: number;
  preferredEquityUSD: number;
  nonControllingInterestUSD: number;
  includedLeaseLiabilitiesUSD: number;
  cashUSD: number;
  nonOperatingInvestmentsUSD: number;
  otherEnterpriseAdjustmentsUSD: number;
};

export type ProducerValuationMultiplesInput = {
  enterpriseValueUSD: number;
  ebitdaUSD: number | null;
  fcffBeforeGrowthUSD: number | null;
  fcffAfterGrowthUSD: number | null;
};

function finite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be finite`);
  }
}

function divideOrNull(numerator: number, denominator: number | null): number | null {
  if (denominator === null || denominator <= 0 || !Number.isFinite(denominator)) {
    return null;
  }
  return numerator / denominator;
}

export function computeEnterpriseValueUSD(input: ProducerEnterpriseValueInput): number {
  for (const [field, value] of Object.entries(input)) {
    finite(value, field);
  }
  return input.marketCapUSD
    + input.debtUSD
    + input.preferredEquityUSD
    + input.nonControllingInterestUSD
    + input.includedLeaseLiabilitiesUSD
    - input.cashUSD
    - input.nonOperatingInvestmentsUSD
    + input.otherEnterpriseAdjustmentsUSD;
}

export function computeProducerValuationMultiples(input: ProducerValuationMultiplesInput): {
  evToEbitda: number | null;
  evToFcffBeforeGrowth: number | null;
  evToFcffAfterGrowth: number | null;
} {
  finite(input.enterpriseValueUSD, 'enterpriseValueUSD');
  return {
    evToEbitda: divideOrNull(input.enterpriseValueUSD, input.ebitdaUSD),
    evToFcffBeforeGrowth: divideOrNull(input.enterpriseValueUSD, input.fcffBeforeGrowthUSD),
    evToFcffAfterGrowth: divideOrNull(input.enterpriseValueUSD, input.fcffAfterGrowthUSD),
  };
}
