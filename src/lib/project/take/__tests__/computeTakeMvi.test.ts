import { computeTotalTakeUSD_MVI } from '../computeTakeMvi.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

(function runComputeTakeMviTests() {
  const happy = computeTotalTakeUSD_MVI({
    masterN: 2,
    productionStartPeriod: 0,
    grossRevenueUSD: [100, 200, 300],
    revenueByMetalUSD: {
      Au: [70, 150, 210],
      Ag: [30, 50, 90],
    },
    takeItems: [
      {
        id: 't1',
        type: 'NSR',
        jurisdictionLevel: 'contractual',
        appliesTo: {
          scope: 'project',
          metals: ['ALL'],
          geography: 'ALL',
          timing: { start_t: null, end_t: null },
          volumeCap: { capType: 'none', capAmount: null, capMetal: null },
        },
        baseDefinition: { baseType: 'REVENUE' },
        rateDefinition: { rateType: 'FIXED', rate: 0.01 },
      },
      {
        id: 't2',
        type: 'government',
        jurisdictionLevel: 'national',
        appliesTo: {
          scope: 'project',
          metals: ['ALL'],
          geography: 'ALL',
          timing: { start_t: null, end_t: null },
          volumeCap: { capType: 'none', capAmount: null, capMetal: null },
        },
        baseDefinition: { baseType: 'REVENUE' },
        rateDefinition: { rateType: 'FIXED', rate: 0.03 },
      },
    ],
  });
  assertDeepEqual(happy.totalTakeUSD, [4, 8, 12], 'happy path sums FIXED REVENUE items');

  const timing = computeTotalTakeUSD_MVI({
    masterN: 2,
    productionStartPeriod: 0,
    grossRevenueUSD: [100, 200, 300],
    revenueByMetalUSD: {
      Au: [100, 200, 300],
    },
    takeItems: [
      {
        id: 't1',
        type: 'NSR',
        jurisdictionLevel: 'national',
        appliesTo: {
          scope: 'project',
          metals: ['ALL'],
          geography: 'ALL',
          timing: { start_t: 1, end_t: 1 },
          volumeCap: { capType: 'none', capAmount: null, capMetal: null },
        },
        baseDefinition: { baseType: 'REVENUE' },
        rateDefinition: { rateType: 'FIXED', rate: 0.1 },
      },
    ],
  });
  assertDeepEqual(timing.totalTakeUSD, [0, 20, 0], 'timing window applies only inside range');

  const strictNull = computeTotalTakeUSD_MVI({
    masterN: 2,
    productionStartPeriod: 0,
    grossRevenueUSD: [100, null, 300],
    revenueByMetalUSD: {
      Au: [100, null, 300],
    },
    takeItems: [
      {
        id: 't1',
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
        rateDefinition: { rateType: 'FIXED', rate: 0.04 },
      },
    ],
  });
  assert(strictNull.totalTakeUSD[1] === null, 'grossRevenue null yields null take in-period');

  const invalidRate = computeTotalTakeUSD_MVI({
    masterN: 0,
    productionStartPeriod: 0,
    grossRevenueUSD: [100],
    revenueByMetalUSD: {
      Au: [100],
    },
    takeItems: [
      {
        id: 'bad',
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
        rateDefinition: { rateType: 'FIXED', rate: 1.2 },
      },
    ],
  });
  assertDeepEqual(invalidRate.totalTakeUSD, [0], 'invalid items are ignored');
  assert(
    invalidRate.diagnostics.some((line) => line.includes('rate must be finite in [0,1]')),
    'invalid rate emits diagnostic',
  );

  const metalSpecificAuOnly = computeTotalTakeUSD_MVI({
    masterN: 2,
    productionStartPeriod: 0,
    grossRevenueUSD: [600, 900, 1200],
    revenueByMetalUSD: {
      Au: [500, 700, 1000],
      Ag: [100, 200, 200],
    },
    takeItems: [
      {
        id: 'au_take',
        type: 'NSR',
        jurisdictionLevel: 'provincial_state',
        appliesTo: {
          scope: 'metalSpecific',
          metals: ['Au'],
          geography: 'ALL',
          timing: { start_t: null, end_t: null },
          volumeCap: { capType: 'none', capAmount: null, capMetal: null },
        },
        baseDefinition: { baseType: 'REVENUE' },
        rateDefinition: { rateType: 'FIXED', rate: 0.1 },
      },
    ],
  });
  assertDeepEqual(metalSpecificAuOnly.totalTakeUSD, [50, 70, 100], 'metal specific item taxes only selected metal base');

  const missingMetalIgnored = computeTotalTakeUSD_MVI({
    masterN: 1,
    productionStartPeriod: 0,
    grossRevenueUSD: [100, 100],
    revenueByMetalUSD: {
      Au: [90, 90],
    },
    takeItems: [
      {
        id: 'bad_metal',
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
        rateDefinition: { rateType: 'FIXED', rate: 0.1 },
      },
    ],
  });
  assertDeepEqual(missingMetalIgnored.totalTakeUSD, [0, 0], 'item with missing metal key is ignored');
  assert(
    missingMetalIgnored.diagnostics.some((line) => line.includes('metal missing from revenueByMetalUSD')),
    'missing metal diagnostic emitted',
  );



  const tieredPrice = computeTotalTakeUSD_MVI({
    masterN: 2,
    productionStartPeriod: 0,
    grossRevenueUSD: [100, 100, 100],
    revenueByMetalUSD: {
      Au: [100, 100, 100],
    },
    spotPriceUSDByMetal: {
      Au: [1400, 1600, 2100],
    },
    takeItems: [
      {
        id: 'tier_price',
        type: 'government',
        jurisdictionLevel: 'national',
        appliesTo: {
          scope: 'metalSpecific',
          metals: ['Au'],
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
      },
    ],
  });
  assertDeepEqual(tieredPrice.totalTakeUSD, [0, 2, 3], 'tiered price thresholds apply progressive top-hit rate');

  const tieredRevenue = computeTotalTakeUSD_MVI({
    masterN: 2,
    productionStartPeriod: 0,
    grossRevenueUSD: [90, 150, 250],
    revenueByMetalUSD: {
      Au: [90, 150, 250],
    },
    takeItems: [
      {
        id: 'tier_revenue',
        type: 'government',
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
            { thresholdType: 'revenue', thresholdValue: 100, rate: 0.01 },
            { thresholdType: 'revenue', thresholdValue: 200, rate: 0.02 },
          ],
        },
      },
    ],
  });
  assertDeepEqual(tieredRevenue.totalTakeUSD, [0, 1.5, 5], 'tiered revenue thresholds use base revenue metric');

  const mixedThresholdRejected = computeTotalTakeUSD_MVI({
    masterN: 0,
    productionStartPeriod: 0,
    grossRevenueUSD: [100],
    revenueByMetalUSD: {
      Au: [100],
    },
    takeItems: [
      {
        id: 'mixed_tiers',
        type: 'government',
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
            { thresholdType: 'price', thresholdValue: 1000, rate: 0.01 },
            { thresholdType: 'revenue', thresholdValue: 200, rate: 0.02 },
          ],
        },
      },
    ],
  });
  assertDeepEqual(mixedThresholdRejected.totalTakeUSD, [0], 'mixed thresholdType tiers are ignored');
  assert(
    mixedThresholdRejected.diagnostics.some((line) => line.includes('mixed thresholdType not supported')),
    'mixed thresholdType emits diagnostic',
  );

  const missingPriceKeyMultiMetal = computeTotalTakeUSD_MVI({
    masterN: 0,
    productionStartPeriod: 0,
    grossRevenueUSD: [100],
    revenueByMetalUSD: {
      Au: [60],
      Ag: [40],
    },
    spotPriceUSDByMetal: {
      Au: [1900],
      Ag: [25],
    },
    takeItems: [
      {
        id: 'tier_no_pricekey',
        type: 'government',
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
          ],
        },
      },
    ],
  });
  assertDeepEqual(missingPriceKeyMultiMetal.totalTakeUSD, [0], 'missing priceKey in multi-metal project is ignored');
  assert(
    missingPriceKeyMultiMetal.diagnostics.some((line) => line.includes('price threshold requires priceKey (multi-metal project)')),
    'missing priceKey multi-metal diagnostic emitted',
  );

  console.log('Take MVI compute tests passed');
})();
