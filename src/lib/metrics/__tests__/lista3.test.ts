import { computeLista3 } from '../lista3.ts';

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
    strictRoi10Y: false,
  });

  assertAlmostEqual(paybackCase.Payback_real_years, 2.5, 'Payback_real follows project logic from tp');

  const roiStrictIncomplete = computeLista3({
    masterN: 6,
    tp: 2,
    fcfUSD: [-50, -50, 40, 40, 40, 0, 0],
    initialCapexUSD: 100,
    strictRoi10Y: true,
  });

  assertEqual(roiStrictIncomplete.ROI_10Y_pct, null, 'ROI_10Y strict null when 10Y window incomplete');

  console.log('Lista3 metrics tests passed');
})();
