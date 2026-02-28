import { computeLista3aProjectEfficiencyMetrics } from '../lista3aProjectEfficiency.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertAlmostEqual(actual: number | null, expected: number, message: string): void {
  if (actual === null || Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

(function run() {
  const simple = computeLista3aProjectEfficiencyMetrics({
    masterN: 5,
    productionStartPeriod: 2,
    discountRate: 0.1,
    capexUSD_total: [-50, -50, 0, 0, 0, 0],
    fcffUSD_total: [-50, -50, 40, 40, 40, 40],
    ebitUSD_total: [0, 0, 60, 60, 60, 60],
  });

  assertAlmostEqual(simple.metrics.Payback_approx_years, 2.5, 'Payback_approx_years matches expected');
  assertAlmostEqual(simple.metrics.Payback_real_years, 1.5, 'Payback_real_years matches expected from tp onward');
  assertAlmostEqual(simple.metrics.ROI_10Y_pct, 160, 'ROI_10Y_pct computes over available window');
  assertAlmostEqual(simple.metrics.LOM_average_EBIT_ROCE_pct, 60, 'LOM_average_EBIT_ROCE_pct computes average EBIT ROCE');

  const dfExpected = (60 / 1.1 ** 2 + 60 / 1.1 ** 3 + 60 / 1.1 ** 4 + 60 / 1.1 ** 5) / 100 * 100;
  assertAlmostEqual(simple.metrics.LOM_discounted_EBIT_ROCE_pct, dfExpected, 'discounted EBIT ROCE uses DF_toToday');

  const noPayback = computeLista3aProjectEfficiencyMetrics({
    masterN: 4,
    productionStartPeriod: 1,
    discountRate: 0.1,
    capexUSD_total: [-100, 0, 0, 0, 0],
    fcffUSD_total: [0, -1, 0, -2, 0],
    ebitUSD_total: [0, 1, 1, 1, 1],
  });

  assertEqual(noPayback.metrics.Payback_approx_years, null, 'non-positive production FCFF gives null approx payback');
  assertEqual(noPayback.metrics.Payback_real_years, null, 'non-positive production FCFF gives null real payback');

  const missingPathPoint = computeLista3aProjectEfficiencyMetrics({
    masterN: 4,
    productionStartPeriod: 1,
    discountRate: 0.1,
    capexUSD_total: [-80, 0, 0, 0, 0],
    fcffUSD_total: [0, 20, null, 40, 40],
    ebitUSD_total: [0, 1, 1, 1, 1],
  });

  assertEqual(missingPathPoint.metrics.Payback_real_years, null, 'missing FCFF point in payback path gives null real payback');

  const discounted = computeLista3aProjectEfficiencyMetrics({
    masterN: 3,
    productionStartPeriod: 1,
    discountRate: 0.2,
    capexUSD_total: [-100, 0, 0, 0],
    fcffUSD_total: [0, 50, 50, 50],
    ebitUSD_total: [0, 10, 10, 10],
  });

  const discountedEbitExpected = (10 / 1.2 + 10 / 1.2 ** 2 + 10 / 1.2 ** 3);
  assertAlmostEqual(
    discounted.metrics.LOM_discounted_EBIT_ROCE_pct,
    discountedEbitExpected,
    'discounted EBIT ROCE discounts each period to today',
  );

  console.log('Lista3A project efficiency tests passed');
})();
