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

  console.log('Take MVI compute tests passed');
})();
