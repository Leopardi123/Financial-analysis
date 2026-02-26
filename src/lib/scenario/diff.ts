import type { CorporateScenarioRunnerOutput } from './corporateScenarioRunner.ts';

type ScenarioSnapshot = CorporateScenarioRunnerOutput['SPOT'];

export type ScenarioMetricRow = {
  metric: string;
  SPOT: number | null;
  LOW: number | null;
  HIGH: number | null;
  LOW_delta: number | null;
  LOW_deltaPct: number | null;
  HIGH_delta: number | null;
  HIGH_deltaPct: number | null;
};

export type ScenarioDiffOutput = {
  rows: ScenarioMetricRow[];
  meta: {
    hasNulls: boolean;
  };
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toNumberOrNull(value: unknown): number | null {
  return finite(value) ? value : null;
}

function computeDelta(
  spot: number | null,
  scenario: number | null,
): { delta: number | null; deltaPct: number | null } {
  if (!finite(spot)) {
    return { delta: null, deltaPct: null };
  }

  if (!finite(scenario)) {
    return { delta: null, deltaPct: null };
  }

  const delta = scenario - spot;
  const spotAbs = Math.abs(spot);

  return {
    delta,
    deltaPct: spotAbs > 0 ? delta / spotAbs : null,
  };
}

const metricGetters: Array<{ metric: string; get: (snapshot: ScenarioSnapshot) => number | null }> = [
  {
    metric: 'NPV_USD',
    get: (snapshot) => toNumberOrNull(snapshot.corporateProjects.npvToday_USD_total),
  },
  {
    metric: 'DCF_prodStart_present_USD',
    get: (snapshot) => toNumberOrNull(snapshot.corporateProjects.dcfProdStart_present_USD_total),
  },
  {
    metric: 'NAV_TargetCurrency',
    get: (snapshot) => toNumberOrNull(snapshot.financing.navToday_TargetCurrency),
  },
  {
    metric: 'EV_TargetCurrency',
    get: (snapshot) => toNumberOrNull(snapshot.marketValue.ev_TargetCurrency),
  },
  {
    metric: 'EV_over_NPV',
    get: (snapshot) => toNumberOrNull(snapshot.marketValue.ev_over_npv),
  },
  {
    metric: 'P_over_NAV',
    get: (snapshot) => toNumberOrNull(snapshot.marketValue.p_over_nav),
  },
  {
    metric: 'AISC_USD_per_Oz',
    get: (snapshot) => toNumberOrNull(snapshot.corporateProjects.aiscAuEqUSDPerOz_LOM_corp),
  },
  {
    metric: 'NPV_perShare_Target',
    get: (snapshot) => toNumberOrNull(snapshot.perShare.npvToday_perShare_TargetCurrency),
  },
  {
    metric: 'NAV_perShare_Target',
    get: (snapshot) => toNumberOrNull(snapshot.perShare.navToday_perShare_TargetCurrency),
  },
  {
    metric: 'DCF_prodStart_present_perShare_Target',
    get: (snapshot) => toNumberOrNull(snapshot.perShare.dcfProdStart_present_perShare_TargetCurrency),
  },
];

export function computeScenarioDiff(input: CorporateScenarioRunnerOutput): ScenarioDiffOutput {
  const rows = metricGetters.map(({ metric, get }) => {
    const SPOT = get(input.SPOT);
    const LOW = get(input.LOW);
    const HIGH = get(input.HIGH);

    const lowDelta = computeDelta(SPOT, LOW);
    const highDelta = computeDelta(SPOT, HIGH);

    return {
      metric,
      SPOT,
      LOW,
      HIGH,
      LOW_delta: lowDelta.delta,
      LOW_deltaPct: lowDelta.deltaPct,
      HIGH_delta: highDelta.delta,
      HIGH_deltaPct: highDelta.deltaPct,
    };
  });

  const hasNulls = rows.some((row) => row.SPOT === null || row.LOW === null || row.HIGH === null);

  return {
    rows,
    meta: {
      hasNulls,
    },
  };
}
