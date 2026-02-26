import { computeLista2CfDcfMetrics } from '../lista2CfDcf.ts';

function assertAlmostEqual(actual: number | null, expected: number, message: string): void {
  if (actual === null || Math.abs(actual - expected) > 1e-12) {
    throw new Error(`${message}. Expected ${expected}, received ${String(actual)}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

(function runLista2CfDcfTests() {
  const result = computeLista2CfDcfMetrics({
    fcfUSD_total: [-100, -50, 200, 300],
    masterN: 3,
    productionStartPeriod: 2,
    discountRate: 0.1,
    shares_post_financing: 100,
    fx_USD_to_TargetCurrency: 2,
    npvToday_USD: 250,
  });

  const expectedCfLom = 350;
  const expectedDcfProdStartExCapex = 200 + 300 / 1.1;
  const expectedDcfPresent = expectedDcfProdStartExCapex / (1.1 ** 2);

  assertAlmostEqual(result.metrics.CF_LOM_USD, expectedCfLom, 'CF_LOM_USD should equal sum(fcfUSD_total)');
  assertAlmostEqual(
    result.metrics.DCF_prodStart_exCapex_USD,
    expectedDcfProdStartExCapex,
    'DCF_prodStart_exCapex_USD should discount only t>=tp to production start',
  );
  assertAlmostEqual(
    result.metrics.DCF_prodStart_present_USD,
    expectedDcfPresent,
    'DCF_prodStart_present_USD should be exCapex discounted to today at tp',
  );

  assertAlmostEqual(
    result.metrics.CF_LOM_TargetCurrency,
    expectedCfLom * 2,
    'CF_LOM_TargetCurrency should equal USD * fx',
  );
  assertAlmostEqual(
    result.metrics.DCF_prodStart_present_TargetCurrency,
    expectedDcfPresent * 2,
    'DCF_prodStart_present_TargetCurrency should equal USD * fx',
  );

  const zeroCfLom = computeLista2CfDcfMetrics({
    fcfUSD_total: [0, 0, 0],
    masterN: 2,
    productionStartPeriod: 1,
    discountRate: 0.1,
    shares_post_financing: 10,
    fx_USD_to_TargetCurrency: 1.5,
    npvToday_USD: 5,
  });

  assertEqual(zeroCfLom.metrics.NPV_over_ETLV, null, 'NPV_over_ETLV should be null when CF_LOM_USD == 0');
  assertEqual(zeroCfLom.metrics.DCF_present_over_ETLV, null, 'DCF_present_over_ETLV should be null when CF_LOM_USD == 0');
  assertEqual(zeroCfLom.metrics.DCF_prodStart_over_ETLV, null, 'DCF_prodStart_over_ETLV should be null when CF_LOM_USD == 0');

  console.log('Lista2 CF+DCF tests passed');
})();
