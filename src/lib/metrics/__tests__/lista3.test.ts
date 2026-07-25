import { computeIrr, computeLista3 } from '../lista3.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertAlmostEqual(actual: number | null, expected: number, message: string, tolerance = 1e-9): void {
  if (actual === null || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

(function run() {
  const paybackCase = computeLista3({
    masterN: 6,
    tp: 2,
    fcfUSD: [-50, -50, 40, 40, 40, 0, 0],
    initialCapexUSD: 100,
    discountRate: 0.1,
    strictRoi10Y: false,
  });

  assertAlmostEqual(paybackCase.Payback_real_years, 2.5, 'Payback_real follows project logic from tp');

  const roiStrictIncomplete = computeLista3({
    masterN: 6,
    tp: 2,
    fcfUSD: [-50, -50, 40, 40, 40, 0, 0],
    initialCapexUSD: 100,
    discountRate: 0.1,
    strictRoi10Y: true,
  });

  assertEqual(roiStrictIncomplete.ROI_10Y_pct, null, 'ROI_10Y strict null when 10Y window incomplete');

  const projectCashflows = [-90.144, -90.144, 125.414, 299.793, 299.793, 299.793, 299.793, 299.793, 299.793, -34.065, -29.520];
  const multipleRootProject = computeIrr(projectCashflows, 0.1);
  assertEqual(multipleRootProject.roots.length, 2, 'project root scan should find both roots');
  assertAlmostEqual(multipleRootProject.roots[0], -0.69567, 'project negative root', 1e-5);
  assertAlmostEqual(multipleRootProject.roots[1], 0.84169, 'project positive root', 1e-5);
  assertAlmostEqual(multipleRootProject.selectedRoot, 0.84169, 'project should select positive root above discount rate', 1e-5);
  assertEqual(multipleRootProject.selectionReason, 'positive root above project discount rate', 'project root selection reason');
  assertEqual((multipleRootProject.residual as number) < 1e-6, true, 'project selected-root NPV residual');

  const reclamationCountedOnce = computeIrr([...projectCashflows.slice(0, -1), -14.760], 0.1);
  assertAlmostEqual(reclamationCountedOnce.selectedRoot, 0.84183, 'positive root after reclamation double-count fix', 1e-5);
  assertEqual(reclamationCountedOnce.roots.length, 2, 't=9 negative FCFF should preserve both roots after reclamation fix');

  const conventional = computeIrr([-100, 60, 60], 0.1);
  assertEqual(conventional.roots.length, 1, 'conventional series should have one root');
  assertAlmostEqual(conventional.selectedRoot, conventional.roots[0], 'conventional series should select its only root');
  assertEqual((conventional.residual as number) < 1e-9, true, 'conventional selected-root NPV residual');

  const twoPositiveRoots = computeIrr([-100, 230, -132], 0.1);
  assertEqual(twoPositiveRoots.roots.length, 2, 'non-conventional series should expose all roots');
  assertAlmostEqual(twoPositiveRoots.roots[0], 0.1, 'first positive root', 1e-8);
  assertAlmostEqual(twoPositiveRoots.roots[1], 0.2, 'second positive root', 1e-8);
  assertAlmostEqual(twoPositiveRoots.selectedRoot, 0.2, 'root equal to discount rate should not win above-rate selection', 1e-8);
  assertEqual(twoPositiveRoots.roots.some((root) => root < 0), false, 'no negative root should be selected when positive roots exist');

  console.log('Lista3 metrics tests passed');
})();
