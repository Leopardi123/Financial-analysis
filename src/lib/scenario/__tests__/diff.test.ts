import { computeScenarioDiff } from '../diff.ts';
import type { CorporateScenarioRunnerOutput } from '../corporateScenarioRunner.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

type SnapshotOverride = {
  corporateProjects?: {
    npvToday_USD_total?: number | null;
    dcfProdStart_present_USD_total?: number | null;
    aiscAuEqUSDPerOz_LOM_corp?: number | null;
  };
  financing?: {
    navToday_TargetCurrency?: number | null;
  };
  marketValue?: {
    ev_TargetCurrency?: number | null;
    ev_over_npv?: number | null;
    p_over_nav?: number | null;
  };
  perShare?: {
    npvToday_perShare_TargetCurrency?: number | null;
    navToday_perShare_TargetCurrency?: number | null;
    dcfProdStart_present_perShare_TargetCurrency?: number | null;
  };
};

function makeSnapshot(override: SnapshotOverride = {}): CorporateScenarioRunnerOutput['SPOT'] {
  return {
    corporateProjects: {
      npvToday_USD_total: 100,
      dcfProdStart_present_USD_total: 90,
      aiscAuEqUSDPerOz_LOM_corp: 1000,
      ...override.corporateProjects,
    },
    financing: {
      navToday_TargetCurrency: 50,
      ...override.financing,
    },
    marketValue: {
      ev_TargetCurrency: 120,
      ev_over_npv: 1.2,
      p_over_nav: 2,
      ...override.marketValue,
    },
    perShare: {
      npvToday_perShare_TargetCurrency: 10,
      navToday_perShare_TargetCurrency: 5,
      dcfProdStart_present_perShare_TargetCurrency: 9,
      ...override.perShare,
    },
  } as CorporateScenarioRunnerOutput['SPOT'];
}

function findMetric(
  rows: ReturnType<typeof computeScenarioDiff>['rows'],
  metric: string,
): ReturnType<typeof computeScenarioDiff>['rows'][number] {
  const row = rows.find((item) => item.metric === metric);
  if (!row) {
    throw new Error(`missing metric row ${metric}`);
  }

  return row;
}

(function runScenarioDiffTests() {
  const happyInput = {
    SPOT: makeSnapshot({
      corporateProjects: { npvToday_USD_total: 100 },
      perShare: { npvToday_perShare_TargetCurrency: 10 },
    }),
    LOW: makeSnapshot({
      corporateProjects: { npvToday_USD_total: 80 },
      perShare: { npvToday_perShare_TargetCurrency: 8 },
    }),
    HIGH: makeSnapshot({
      corporateProjects: { npvToday_USD_total: 120 },
      perShare: { npvToday_perShare_TargetCurrency: 12 },
    }),
  } as CorporateScenarioRunnerOutput;

  const happy = computeScenarioDiff(happyInput);
  const npvRow = findMetric(happy.rows, 'NPV_USD');

  assertEqual(npvRow.LOW_delta, -20, 'LOW delta should be LOW - SPOT for NPV');
  assertEqual(npvRow.LOW_deltaPct, -0.2, 'LOW delta pct should be delta / abs(SPOT) for NPV');
  assertEqual(npvRow.HIGH_delta, 20, 'HIGH delta should be HIGH - SPOT for NPV');
  assertEqual(npvRow.HIGH_deltaPct, 0.2, 'HIGH delta pct should be delta / abs(SPOT) for NPV');

  const perShareRow = findMetric(happy.rows, 'NPV_perShare_Target');
  assertEqual(perShareRow.LOW_delta, -2, 'LOW per-share delta should be LOW - SPOT');
  assertEqual(perShareRow.HIGH_deltaPct, 0.2, 'HIGH per-share delta pct should be delta / abs(SPOT)');

  const spotNullInput = {
    SPOT: makeSnapshot({ financing: { navToday_TargetCurrency: null } }),
    LOW: makeSnapshot({ financing: { navToday_TargetCurrency: 10 } }),
    HIGH: makeSnapshot({ financing: { navToday_TargetCurrency: 12 } }),
  } as CorporateScenarioRunnerOutput;

  const spotNull = computeScenarioDiff(spotNullInput);
  const navRow = findMetric(spotNull.rows, 'NAV_TargetCurrency');

  assertEqual(navRow.LOW_delta, null, 'LOW delta should be null when SPOT is null');
  assertEqual(navRow.LOW_deltaPct, null, 'LOW delta pct should be null when SPOT is null');

  const spotZeroInput = {
    SPOT: makeSnapshot({ marketValue: { ev_over_npv: 0 } }),
    LOW: makeSnapshot({ marketValue: { ev_over_npv: 1 } }),
    HIGH: makeSnapshot({ marketValue: { ev_over_npv: 2 } }),
  } as CorporateScenarioRunnerOutput;

  const spotZero = computeScenarioDiff(spotZeroInput);
  const evOverNpvRow = findMetric(spotZero.rows, 'EV_over_NPV');

  assertEqual(evOverNpvRow.LOW_delta, 1, 'LOW delta should still compute when SPOT is zero');
  assertEqual(evOverNpvRow.LOW_deltaPct, null, 'LOW delta pct should be null when SPOT is zero');

  console.log('Scenario diff tests passed');
})();
