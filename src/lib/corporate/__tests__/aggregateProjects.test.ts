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


  const v2CalendarAligned = await aggregateProjectsCorporateV1(
    {
      discountRate: 0.1,
      projects: [
        {
          projectId: 'v2-A',
          rawJson: {
            version: 'project_json_v2',
            time: { masterN: 6, productionStartPeriod: 4, productionStartYear: 2029 },
          },
        },
        {
          projectId: 'v2-B',
          rawJson: {
            version: 'project_json_v2',
            time: { masterN: 7, productionStartPeriod: 5, productionStartYear: 2031 },
          },
        },
        {
          projectId: 'v2-C',
          rawJson: {
            version: 'project_json_v2',
            time: { masterN: 1, productionStartPeriod: 0, productionStartYear: 2026 },
          },
        },
      ],
    },
    makeDepsByProjectId({
      'v2-A': {
        periodEndDatesUtc: ['ignore'],
        fcffUSD: [1, 1, 1, 1, 1, 1, 1],
        capexUSD: [-1, -1, -1, -1, -1, -1, -1],
        grossRevenueUSD: [10, 10, 10, 10, 10, 10, 10],
        auPriceUSDPerOz: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
        sustainingCostUSD: [2, 2, 2, 2, 2, 2, 2],
        payableAuEqOz: [1, 1, 1, 1, 1, 1, 1],
      },
      'v2-B': {
        periodEndDatesUtc: ['ignore'],
        fcffUSD: [2, 2, 2, 2, 2, 2, 2, 2],
        capexUSD: [-2, -2, -2, -2, -2, -2, -2, -2],
        grossRevenueUSD: [20, 20, 20, 20, 20, 20, 20, 20],
        auPriceUSDPerOz: [2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000],
        sustainingCostUSD: [4, 4, 4, 4, 4, 4, 4, 4],
        payableAuEqOz: [2, 2, 2, 2, 2, 2, 2, 2],
      },
      'v2-C': {
        periodEndDatesUtc: ['ignore'],
        fcffUSD: [3, 3],
        capexUSD: [-3, -3],
        grossRevenueUSD: [30, 30],
        auPriceUSDPerOz: [3000, 3000],
        sustainingCostUSD: [6, 6],
        payableAuEqOz: [3, 3],
      },
    }),
  );

  assertDeepEqual(
    v2CalendarAligned.corporateYearsByPeriod,
    [2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033],
    'v2 corporate calendar axis should span min..max years',
  );
  assertDeepEqual(
    v2CalendarAligned.fcffUSD_total,
    [1, 6, 6, 3, 3, 3, 3, 2, 2],
    'v2 corporate aggregation should align by calendar year',
  );

  await assertRejects(
    () =>
      aggregateProjectsCorporateV1(
        {
          discountRate: 0.1,
          projects: [
            {
              projectId: 'bad-v2',
              rawJson: ({
                version: 'project_json_v2',
                time: { masterN: 3, productionStartPeriod: 1 },
              } as any),
            },
          ],
        },
        makeDepsByProjectId({
          'bad-v2': {
            periodEndDatesUtc: ['ignore'],
            fcffUSD: [1, 1, 1, 1],
            capexUSD: [0, 0, 0, 0],
            grossRevenueUSD: [0, 0, 0, 0],
            auPriceUSDPerOz: [1000, 1000, 1000, 1000],
            sustainingCostUSD: [0, 0, 0, 0],
            payableAuEqOz: [1, 1, 1, 1],
          },
        }),
      ),
    /Corporate v2 invalid project time inputs.*bad-v2/s,
    'v2 invalid project time should include projectId in clear error',
  );


  console.log('Corporate aggregateProjects tests passed');
})();
