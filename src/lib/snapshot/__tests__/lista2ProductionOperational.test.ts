import { computeLista2ProductionOperationalMetrics } from '../lista2ProductionOperational.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

(function run() {
  const happy = computeLista2ProductionOperationalMetrics({
    masterN: 4,
    productionStartPeriod: 1,
    payableAuEqOz_total: [0, 10, 15, 0, 5],
    aiscAuEqUSDPerOz_LOM: 1200,
    capexUSD_total: [-100, 0, 0, 0, 0],
  });

  assertEqual(happy.Time_to_production, 1, 'Time_to_production uses tp');
  assertEqual(happy.LOM_periods, 3, 'LOM counts periods with payable > 0');
  assertEqual(happy.LOM_production_AuEq_Oz, 30, 'LOM production sums payable periods');
  assertEqual(happy.Annual_production_AuEq_Oz, 10, 'Annual production equals LOM production / LOM');
  assertEqual(happy.AISC_AuEq_USD_per_Oz_LOM, 1200, 'AISC passes through from aggregate layer');
  assertEqual(happy.CAPEX_per_annual_AuEq_Oz, 10, 'CAPEX per annual ounce uses |initial capex| / annual production');

  const nullGuard = computeLista2ProductionOperationalMetrics({
    masterN: 2,
    productionStartPeriod: null,
    payableAuEqOz_total: [1, 1, 1],
    aiscAuEqUSDPerOz_LOM: null,
    capexUSD_total: [-10, 0, 0],
  });

  assertEqual(nullGuard.Time_to_production, null, 'missing tp returns null metrics');
  assertEqual(nullGuard.LOM_periods, null, 'missing tp returns null metrics');

  console.log('Lista2 production operational tests passed');
})();
