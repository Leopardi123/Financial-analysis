import { computeCanonicalProducerMetrics } from '../metrics.ts';
import { assertValuationDateUtc, validateProducerRunContext } from '../schema.ts';
import { computeEnterpriseValueUSD, computeProducerValuationMultiples } from '../valuation.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertThrows(fn: () => void, pattern: RegExp, message: string): void {
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof Error, `${message}. Expected function to throw`);
  assert(pattern.test((thrown as Error).message), `${message}. Error message did not match pattern`);
}

const baseInput = {
  revenueByMetalUSD: { Au: 100, Ag: 20 },
  cashOperatingCostsUSD: 40,
  royaltiesUSD: 5,
  productionTaxesUSD: 2,
  tcRcUSD: 3,
  siteGnaUSD: 4,
  corporateGnaUSD: 6,
  otherRecurringOperatingCashExpensesUSD: 0,
  sustainingCapexUSD: 10,
  sustainingExplorationDevelopmentUSD: 2,
  cashTaxesUSD: 8,
  workingCapitalDeltaUSD: 1,
  otherRecurringNonEbitdaCashSpendUSD: 1,
  growthCapexUSD: 7,
  growthExplorationDevelopmentUSD: 3,
};

(function runPhase1CoreTests() {
  assertThrows(() => assertValuationDateUtc(undefined), /explicit YYYY-MM-DD/, 'valuation date is mandatory');
  assertThrows(() => assertValuationDateUtc('2026-02-30'), /valid calendar date/, 'invalid calendar dates fail');
  assertValuationDateUtc('2026-08-22');

  const context = validateProducerRunContext({
    valuationDateUtc: '2026-08-22',
    selectedYear: 2030,
    priceMode: 'SPOT',
    caseMode: 'BASE',
  });
  assertEqual(context.valuationDateUtc, '2026-08-22', 'run context preserves explicit valuation date');

  const metrics = computeCanonicalProducerMetrics(baseInput);
  assertEqual(metrics.revenueUSD, 120, 'metal revenues sum once');
  assertEqual(metrics.ebitdaUSD, 60, 'canonical EBITDA excludes sustaining and growth CAPEX');
  assertEqual(metrics.fcffBeforeGrowthUSD, 38, 'FCFF before growth deducts sustaining, cash tax, WC and other recurring cash spend');
  assertEqual(metrics.fcffAfterGrowthUSD, 28, 'FCFF after growth deducts growth CAPEX and growth development');

  const sustainingSensitivity = computeCanonicalProducerMetrics({ ...baseInput, sustainingCapexUSD: 25 });
  assertEqual(sustainingSensitivity.ebitdaUSD, metrics.ebitdaUSD, 'sustaining CAPEX never changes EBITDA');
  assertEqual(sustainingSensitivity.fcffBeforeGrowthUSD, 23, 'sustaining CAPEX changes FCFF before growth dollar for dollar');

  const growthSensitivity = computeCanonicalProducerMetrics({ ...baseInput, growthCapexUSD: 100 });
  assertEqual(growthSensitivity.ebitdaUSD, metrics.ebitdaUSD, 'growth CAPEX never changes EBITDA');
  assertEqual(growthSensitivity.fcffBeforeGrowthUSD, metrics.fcffBeforeGrowthUSD, 'growth CAPEX never changes FCFF before growth');
  assertEqual(growthSensitivity.fcffAfterGrowthUSD, -65, 'growth CAPEX changes FCFF after growth only');

  const corporateGnaSensitivity = computeCanonicalProducerMetrics({ ...baseInput, corporateGnaUSD: 16 });
  assertEqual(corporateGnaSensitivity.ebitdaUSD, 50, 'corporate G&A is deducted exactly once from EBITDA');

  assertThrows(
    () => computeCanonicalProducerMetrics({ ...baseInput, byproductCreditsUSD: 20 }),
    /must not add by-product credits/,
    'by-product credits cannot be added on top of metal revenue',
  );

  assertThrows(
    () => computeCanonicalProducerMetrics({ ...baseInput, interestExpenseUSD: 5 } as typeof baseInput),
    /FCFF: interestExpenseUSD must not be included/,
    'interest is structurally excluded from FCFF',
  );

  const unknownTax = computeCanonicalProducerMetrics({ ...baseInput, cashTaxesUSD: null });
  assertEqual(unknownTax.ebitdaUSD, 60, 'unknown cash tax does not block EBITDA');
  assertEqual(unknownTax.fcffBeforeGrowthUSD, null, 'unknown cash tax blocks FCFF before growth');
  assertEqual(unknownTax.fcffAfterGrowthUSD, null, 'unknown cash tax blocks FCFF after growth');
  assertEqual(unknownTax.diagnostics[0], 'CASH_TAX_UNKNOWN', 'unknown tax is explicit, never silently zero');

  const ev = computeEnterpriseValueUSD({
    marketCapUSD: 1000,
    debtUSD: 200,
    preferredEquityUSD: 10,
    nonControllingInterestUSD: 20,
    includedLeaseLiabilitiesUSD: 30,
    cashUSD: 100,
    nonOperatingInvestmentsUSD: 40,
    otherEnterpriseAdjustmentsUSD: 5,
  });
  assertEqual(ev, 1125, 'enterprise value bridge applies each component once');

  const multiples = computeProducerValuationMultiples({
    enterpriseValueUSD: 1125,
    ebitdaUSD: 225,
    fcffBeforeGrowthUSD: 125,
    fcffAfterGrowthUSD: 75,
  });
  assertEqual(multiples.evToEbitda, 5, 'EV/EBITDA is available');
  assertEqual(multiples.evToFcffBeforeGrowth, 9, 'EV/FCFF before growth is available');
  assertEqual(multiples.evToFcffAfterGrowth, 15, 'EV/FCFF after growth is available');
  assert(!Object.prototype.hasOwnProperty.call(multiples, 'pToFcf'), 'nonstandard P/FCFF is not exposed as P/FCF');

  console.log('Mining Producer Phase 1 core tests passed');
})();
