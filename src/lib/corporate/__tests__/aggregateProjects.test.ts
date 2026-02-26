import { aggregateProjectsCorporateV1 } from '../aggregateProjects.ts';
import type { CorporateAggregationDeps, CorporateProjectEngineSnapshot } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertApproxEqual(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertRejects(fn: () => Promise<unknown>, pattern: RegExp, message: string): Promise<void> {
  return fn()
    .then(() => {
      throw new Error(`${message}. Expected function to reject`);
    })
    .catch((error) => {
      assert(error instanceof Error, `${message}. Expected Error`);
      assert(pattern.test((error as Error).message), `${message}. Error message did not match`);
    });
}

function makeDepsByProjectId(records: Record<string, CorporateProjectEngineSnapshot>): CorporateAggregationDeps {
  return {
    projectToSeries: async ({ projectId }) => {
      const record = records[projectId];
      if (!record) {
        throw new Error(`Missing fake project ${projectId}`);
      }
      return record;
    },
  };
}

(async function run() {
  const sameDates = await aggregateProjectsCorporateV1(
    {
      discountRate: 0.1,
      projects: [
        { projectId: 'A', rawJson: {} },
        { projectId: 'B', rawJson: {} },
      ],
    },
    makeDepsByProjectId({
      A: {
        periodEndDatesUtc: ['2024-12-31', '2025-12-31', '2026-12-31'],
        fcffUSD: [10, 10, 10],
        capexUSD: [-1, -1, -1],
        grossRevenueUSD: [100, 100, 100],
        auPriceUSDPerOz: [2000, 2000, 2000],
        sustainingCostUSD: [5, 5, 5],
        payableAuEqOz: [1, 1, 1],
      },
      B: {
        periodEndDatesUtc: ['2024-12-31', '2025-12-31', '2026-12-31'],
        fcffUSD: [20, 20, 20],
        capexUSD: [-2, -2, -2],
        grossRevenueUSD: [200, 200, 200],
        auPriceUSDPerOz: [2000, 2000, 2000],
        sustainingCostUSD: [10, 10, 10],
        payableAuEqOz: [2, 2, 2],
      },
    }),
  );

  assertDeepEqual(sameDates.fcffUSD_total, [30, 30, 30], 'same-date projects should aggregate fcff');
  assertDeepEqual(sameDates.capexUSD_total, [-3, -3, -3], 'same-date projects should aggregate capex');
  assertDeepEqual(sameDates.corporatePeriodEndDatesUtc, ['2024-12-31', '2025-12-31', '2026-12-31'], 'same-date grid');
  assertApproxEqual(sameDates.aiscAuEqUSDPerOz_LOM as number, 5, 1e-12, 'corporate AISC should follow aggregated flow rule');

  const expectedNpv = 30 * (1 + 1 / 1.1 + 1 / 1.1 ** 2);
  assertApproxEqual(sameDates.NPV_today_USD as number, expectedNpv, 1e-9, 'NPV should discount corporate fcff axis');

  const unionDates = await aggregateProjectsCorporateV1(
    {
      discountRate: 0.1,
      projects: [
        { projectId: 'A', rawJson: {} },
        { projectId: 'B', rawJson: {} },
      ],
    },
    makeDepsByProjectId({
      A: {
        periodEndDatesUtc: ['2024-12-31', '2025-12-31'],
        fcffUSD: [10, 10],
        capexUSD: [-1, -1],
        grossRevenueUSD: [100, 100],
        auPriceUSDPerOz: [2000, 2000],
        sustainingCostUSD: [5, 5],
        payableAuEqOz: [1, 1],
      },
      B: {
        periodEndDatesUtc: ['2025-12-31', '2026-12-31'],
        fcffUSD: [20, 20],
        capexUSD: [-2, -2],
        grossRevenueUSD: [200, 200],
        auPriceUSDPerOz: [2000, 2000],
        sustainingCostUSD: [10, 10],
        payableAuEqOz: [2, 2],
      },
    }),
  );

  assertDeepEqual(unionDates.corporatePeriodEndDatesUtc, ['2024-12-31', '2025-12-31', '2026-12-31'], 'union grid should dedupe and sort dates');
  assertDeepEqual(unionDates.fcffUSD_total, [10, 30, 20], 'missing periods should contribute zero on union grid');
  assertDeepEqual(unionDates.capexUSD_total, [-1, -3, -2], 'capex union-grid aggregation should use missing as zero');

  const strictNull = await aggregateProjectsCorporateV1(
    {
      discountRate: 0.1,
      projects: [
        { projectId: 'A', rawJson: {} },
        { projectId: 'B', rawJson: {} },
      ],
    },
    makeDepsByProjectId({
      A: {
        periodEndDatesUtc: ['2024-12-31', '2025-12-31'],
        fcffUSD: [10, null],
        capexUSD: [-1, -1],
        grossRevenueUSD: [100, 100],
        auPriceUSDPerOz: [2000, 2000],
        sustainingCostUSD: [5, 5],
        payableAuEqOz: [1, 1],
      },
      B: {
        periodEndDatesUtc: ['2024-12-31', '2025-12-31'],
        fcffUSD: [20, 20],
        capexUSD: [-2, -2],
        grossRevenueUSD: [200, 200],
        auPriceUSDPerOz: [2000, 2000],
        sustainingCostUSD: [10, 10],
        payableAuEqOz: [2, 2],
      },
    }),
  );

  assertDeepEqual(strictNull.fcffUSD_total, [30, null], 'null in a contributing project should null aggregate period');
  assert(strictNull.NPV_today_USD === null, 'strict null FCFF should null NPV');

  await assertRejects(
    () =>
      aggregateProjectsCorporateV1(
        {
          discountRate: 0.1,
          projects: [{ projectId: 'missing-dates', rawJson: {} }],
        },
        {
          parseProject: (() => ({
            engineInputWithoutPrices: {},
          })) as unknown as CorporateAggregationDeps['parseProject'],
          resolvePrices: (async () => ({} as never)) as unknown as CorporateAggregationDeps['resolvePrices'],
          runProjectEngine: (() => ({
            capexUSD_used: [0],
            phase1: {
              fcffUSD: [0],
              sustainingCostUSD: [0],
            },
            revenue: {
              grossRevenueUSD: [0],
            },
            aisc: {
              auPriceUSDPerOz: [2000],
              payableAuEqOz: [0],
              lomPeriods: 0,
              aiscAuEqUSDPerOz_LOM: null,
            },
          })) as unknown as CorporateAggregationDeps['runProjectEngine'],
        },
      ),
    /Project missing-dates is missing time\.periodEndDatesUtc; required for corporate aggregation v1\./,
    'missing periodEndDatesUtc should throw clear error',
  );

  console.log('Corporate aggregateProjects tests passed');
})();
