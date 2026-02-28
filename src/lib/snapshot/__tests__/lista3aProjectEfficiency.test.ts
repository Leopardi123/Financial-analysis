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

  assertAlmostEqual(simple.metrics.Payback_approx_years, 2.5, 'Payback_approx_years uses pre-production FCFF deficit from tp');
  assertAlmostEqual(simple.metrics.Payback_real_years, 2.5, 'Payback_real_years counts from tp using FCFF deficit recovery');
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
  assertEqual(noPayback.metrics.Payback_real_years, 0, 'non-positive production FCFF with no pre-production deficit gives immediate real payback');

  const missingPathPoint = computeLista3aProjectEfficiencyMetrics({
    masterN: 4,
    productionStartPeriod: 1,
    discountRate: 0.1,
    capexUSD_total: [-80, 0, 0, 0, 0],
    fcffUSD_total: [0, null, 20, 40, 40],
    ebitUSD_total: [0, 1, 1, 1, 1],
  });

  assertEqual(missingPathPoint.metrics.Payback_real_years, 0, 'missing FCFF at tp still returns 0 when pre-production deficit is non-positive');

  const productionAnchored = computeLista3aProjectEfficiencyMetrics({
    masterN: 5,
    productionStartPeriod: 2,
    discountRate: 0.1,
    capexUSD_total: [90e6, 277e6, 161e6, 0, 0, 0],
    fcffUSD_total: [-90e6, -277e6, -161e6, 329435868.88, 1086926918.88, 1086926918.88],
    ebitUSD_total: [0, 0, 0, 1, 1, 1],
  });

  assertAlmostEqual(productionAnchored.metrics.Payback_real_years, 2.2, 'Payback_real_years anchors to tp and includes negative tp-year');


  const userSanitySeries = computeLista3aProjectEfficiencyMetrics({
    masterN: 16,
    productionStartPeriod: 2,
    discountRate: 0.1,
    capexUSD_total: Array(17).fill(0),
    fcffUSD_total: [
      -90e6,
      -277e6,
      -161e6,
      329435868.88,
      1086926918.88,
      1199623472.72,
      866146582.32,
      593488657.92,
      706021522.24,
      932016990.48,
      785161954.24,
      379184231.44,
      465211533.2,
      425484712.4,
      373560391.28,
      465688867.36,
      387646959.92,
    ],
    ebitUSD_total: Array(17).fill(1),
  });

  assertAlmostEqual(userSanitySeries.metrics.Payback_real_years, 2.2, 'user sanity series payback_real is around 2.2 years from tp');

  const capexInvariantA = computeLista3aProjectEfficiencyMetrics({
    masterN: 4,
    productionStartPeriod: 2,
    discountRate: 0.1,
    capexUSD_total: [-10, -20, -30, -40, -50],
    fcffUSD_total: [-100, -200, -50, 200, 200],
    ebitUSD_total: [1, 1, 1, 1, 1],
  });

  const capexInvariantB = computeLista3aProjectEfficiencyMetrics({
    masterN: 4,
    productionStartPeriod: 2,
    discountRate: 0.1,
    capexUSD_total: [-1000, -2000, -3000, -4000, -5000],
    fcffUSD_total: [-100, -200, -50, 200, 200],
    ebitUSD_total: [1, 1, 1, 1, 1],
  });

  assertEqual(
    capexInvariantA.metrics.Payback_real_years,
    capexInvariantB.metrics.Payback_real_years,
    'Payback_real_years is FCFF-based and does not depend on capex arrays',
  );

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
