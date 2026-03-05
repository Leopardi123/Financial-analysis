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

  assertAlmostEqual(
    result.metrics.DCF_prodStart_present_perShare_TargetCurrency,
    (expectedDcfPresent * 2) / 100,
    'DCF_prodStart_present_perShare_TargetCurrency should use shares_post_financing as denominator',
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

  const corporateMilestone2029 = computeLista2CfDcfMetrics({
    fcfUSD_total: [0, 0, 100, 100, 100],
    capexUSD_total: [40, 60, 50, 0, 0],
    masterN: 4,
    productionStartPeriod: 2,
    initialCapexStartPeriod: 0,
    discountRate: 0.1,
    shares_post_financing: 10,
    fx_USD_to_TargetCurrency: 1,
    npvToday_USD: 0,
    netCash_t0_post_TargetCurrency: 0,
  });

  const corporateMilestone2031 = computeLista2CfDcfMetrics({
    fcfUSD_total: [0, 0, 100, 100, 100],
    capexUSD_total: [40, 60, 50, 0, 0],
    masterN: 4,
    productionStartPeriod: 4,
    initialCapexStartPeriod: 2,
    discountRate: 0.1,
    shares_post_financing: 10,
    fx_USD_to_TargetCurrency: 1,
    npvToday_USD: 0,
    netCash_t0_post_TargetCurrency: 0,
  });

  assertEqual(
    corporateMilestone2029.metrics.InitialCAPEX_incremental_USD,
    100,
    'InitialCAPEX_incremental_USD should be strict sum(capexUSD_total[t]) for 0 <= t < tp_2029',
  );
  assertEqual(
    corporateMilestone2031.metrics.InitialCAPEX_incremental_USD,
    50,
    'InitialCAPEX_incremental_USD should be strict sum(capexUSD_total[t]) for tp_2029 <= t < tp_2031',
  );

  if (
    corporateMilestone2029.metrics.DCF_prodStart_exCapex_TargetCurrency !== null
    && corporateMilestone2029.metrics.NPV_prodStart_TargetCurrency !== null
  ) {
    if (corporateMilestone2029.metrics.DCF_prodStart_exCapex_TargetCurrency === corporateMilestone2029.metrics.NPV_prodStart_TargetCurrency) {
      throw new Error('DCF and NPV at prod-start must differ when InitialCAPEX_incremental > 0 (2029)');
    }
    assertAlmostEqual(
      corporateMilestone2029.metrics.DCF_prodStart_exCapex_TargetCurrency
        - corporateMilestone2029.metrics.NPV_prodStart_TargetCurrency,
      100,
      'DCF - NPV must equal InitialCAPEX_incremental for 2029',
    );
  }

  if (
    corporateMilestone2031.metrics.DCF_prodStart_exCapex_TargetCurrency !== null
    && corporateMilestone2031.metrics.NPV_prodStart_TargetCurrency !== null
  ) {
    if (corporateMilestone2031.metrics.DCF_prodStart_exCapex_TargetCurrency === corporateMilestone2031.metrics.NPV_prodStart_TargetCurrency) {
      throw new Error('DCF and NPV at prod-start must differ when InitialCAPEX_incremental > 0 (2031)');
    }
    assertAlmostEqual(
      corporateMilestone2031.metrics.DCF_prodStart_exCapex_TargetCurrency
        - corporateMilestone2031.metrics.NPV_prodStart_TargetCurrency,
      50,
      'DCF - NPV must equal InitialCAPEX_incremental for 2031',
    );
  }

  assertAlmostEqual(
    corporateMilestone2029.metrics.NAV_prodStart_TargetCurrency,
    corporateMilestone2029.metrics.NPV_prodStart_TargetCurrency as number,
    'NAV must equal NPV when netCash0 == 0 (2029)',
  );
  assertAlmostEqual(
    corporateMilestone2031.metrics.NAV_prodStart_TargetCurrency,
    corporateMilestone2031.metrics.NPV_prodStart_TargetCurrency as number,
    'NAV must equal NPV when netCash0 == 0 (2031)',
  );

  const invalidCapexWindow = computeLista2CfDcfMetrics({
    fcfUSD_total: [0, 0, 100],
    capexUSD_total: [50, null, 0],
    masterN: 2,
    productionStartPeriod: 2,
    initialCapexStartPeriod: 0,
    discountRate: 0.1,
    shares_post_financing: 10,
    fx_USD_to_TargetCurrency: 1,
    npvToday_USD: 0,
    netCash_t0_post_TargetCurrency: 0,
  });

  assertEqual(invalidCapexWindow.metrics.InitialCAPEX_incremental_USD, null, 'InitialCAPEX_incremental_USD should be null when capex window has null');
  assertEqual(invalidCapexWindow.metrics.NPV_prodStart_TargetCurrency, null, 'NPV_prodStart_TargetCurrency should be null when capex window is invalid');
  assertEqual(invalidCapexWindow.metrics.NAV_prodStart_TargetCurrency, null, 'NAV_prodStart_TargetCurrency should be null when NPV_prodStart is null');

  console.log('Lista2 CF+DCF tests passed');
})();
