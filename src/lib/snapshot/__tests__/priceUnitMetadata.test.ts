import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSnapshotSeries,
  priceUSDUnitFromPriceKey,
  type ProjectSeriesContext,
} from '../runCorporateSnapshot.ts';
import { getProjectJsonV1Template } from '../../project/jsonv1/template.ts';
import { parseProjectJsonV1 } from '../../project/jsonv1/parse.ts';
import { resolveProjectPricesToEngineInput } from '../../project/jsonv1/resolvePrices.ts';

const LB_PER_TONNE = 2204.62262185;

function context(args: {
  metal: string;
  quantities: number[];
  quantityUnit: string;
  priceKey: string;
  prices: number[];
}): ProjectSeriesContext {
  const length = args.quantities.length;
  const zeros = () => new Array<number>(length).fill(0);
  return {
    projectId: 'unit-metadata-test',
    taxRate: 0,
    taxRateByPeriod: zeros(),
    yearsByPeriod: Array.from({ length }, (_, index) => 2027 + index),
    payableQtyByMetal: { [args.metal]: args.quantities },
    payableQtyUnitByMetal: { [args.metal]: args.quantityUnit },
    priceKeyByMetal: { [args.metal]: args.priceKey },
    priceUSDUnitByMetal: { [args.metal]: priceUSDUnitFromPriceKey(args.priceKey) },
    spotPriceUSDByMetal: { [args.metal]: args.prices },
    revenueByMetal_USD: { [args.metal]: zeros() },
    operations: { throughputUnit: null, nameplateThroughput: null, utilizationPct: null },
    economicsBreakdown: null,
    royaltiesDetail: [],
    taxesDetail: null,
    economics: {
      operatingCostsUSD: zeros(),
      sustainingCapexUSD: zeros(),
      siteGandA_USD: zeros(),
      royaltiesUSD: zeros(),
      reclamationUSD: zeros(),
      byproductCreditsUSD: zeros(),
      sustainingCostUSD: zeros(),
      sustainingAdjustedOperatingEarningsUSD: zeros(),
      ebitdaUSD: zeros(),
      depreciationUSD: zeros(),
      ebitUSD: zeros(),
      taxableIncomeUSD: zeros(),
      effectiveTaxRate: zeros(),
      taxUSD: zeros(),
      workingCapitalDeltaUSD: zeros(),
      fcffUSD: zeros(),
      capexUSD: zeros(),
      totalCapexUSD: zeros(),
    },
  };
}

function build(project: ProjectSeriesContext) {
  return buildSnapshotSeries({
    masterN: project.yearsByPeriod.length - 1,
    corporateYearsByPeriod: project.yearsByPeriod,
    projectSeriesContexts: [project],
  });
}

test('A: Cu tonne price metadata preserves tonne economics', () => {
  const price = 14_109.58477952;
  const project = context({ metal: 'Cu', quantities: [1], quantityUnit: 'tonne', priceKey: 'CU_USD_TONNE', prices: [price] });
  const series = build(project);

  assert.equal(project.priceUSDUnitByMetal.Cu, 'USD_tonne');
  assert.equal(series.unitAudit?.metals.Cu.canonicalQtyUnit, 'lb');
  assert.ok(Math.abs((series.revenueByMetal_USD.Cu[0] ?? 0) - price) < 1e-9);
  assert.ok(Math.abs((series.revenueByMetal_USD.Cu[0] ?? 0) - 31_106_309.79) > 1_000_000);
});

test('B: Cu pound price metadata converts a tonne quantity once', () => {
  const project = context({ metal: 'Cu', quantities: [1], quantityUnit: 'tonne', priceKey: 'CU_USD_LB', prices: [6.4] });
  const series = build(project);

  assert.equal(project.priceUSDUnitByMetal.Cu, 'USD_lb');
  assert.ok(Math.abs((series.unitAudit?.metals.Cu.conversionFactorExample ?? 0) - LB_PER_TONNE) < 2e-9);
  assert.ok(Math.abs((series.revenueByMetal_USD.Cu[0] ?? 0) - (6.4 * LB_PER_TONNE)) < 1e-6);
});

test('C: Au troy-ounce metadata preserves troy-ounce economics', () => {
  const project = context({ metal: 'Au', quantities: [100], quantityUnit: 'toz', priceKey: 'XAU_USD_TOZ', prices: [2_500] });
  const series = build(project);

  assert.equal(project.priceUSDUnitByMetal.Au, 'USD_toz');
  assert.equal(series.revenueByMetal_USD.Au[0], 250_000);
});

test('price-key unit metadata fails fast for an unsupported key', () => {
  assert.throws(() => priceUSDUnitFromPriceKey('CU_USD_UNKNOWN'), /Unknown price key: CU_USD_UNKNOWN/);
});

test('D: Viscaria 10Y in-situ uses the resolved Cu tonne price once', () => {
  const quantities = [1_934, 24_665, 26_818, 27_174, 27_942, 27_389, 27_845, 24_709, 22_994, 23_420];
  const price = 6.4 * 2204.6226218;
  const project = context({
    metal: 'Cu',
    quantities,
    quantityUnit: 'tonne',
    priceKey: 'CU_USD_TONNE',
    prices: quantities.map(() => price),
  });
  const series = build(project);
  const inSitu10Y = series.totalRevenue_USD.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const inflated = quantities.reduce((sum, quantity) => sum + quantity, 0) * price * LB_PER_TONNE;
  const shares = 380_552_083.3333333;
  const evUSD = 1_000_000_000;

  assert.ok(Math.abs(inSitu10Y - 3_314_200_368.8614535) < 1e-6);
  assert.equal(`${(inSitu10Y / 1_000_000_000).toFixed(1)}B USD`, '3.3B USD');
  assert.equal(`${(inflated / 1_000_000_000).toFixed(1)}B USD`, '7306.6B USD');
  assert.ok((inSitu10Y / shares) < (inflated / shares) / 2_000);
  assert.equal((evUSD / inSitu10Y).toFixed(1), '0.3');
  assert.equal((evUSD / inflated).toFixed(1), '0.0');
});

test('derived Cu source price series remains under its matching USD/lb key', async () => {
  const input = getProjectJsonV1Template();
  input.economicsBreakdown = null;
  input.time.masterN = 0;
  input.time.productionStartPeriod = 0;
  input.time.productionStartYear = new Date().getUTCFullYear();
  for (const key of ['capexUSD', 'operatingCostsUSD', 'sustainingCapexUSD', 'siteGandA_USD', 'reclamationUSD', 'byproductCreditsUSD', 'depreciationUSD', 'workingCapitalDeltaUSD'] as const) {
    input.series[key] = [0];
  }
  input.metals.payableQtyByMetal = { Cu: [1] };
  input.metals.payableQtyUnitByMetal = { Cu: 'tonne' };
  input.metals.priceKeyByMetal = { Cu: 'CU_USD_TONNE' };
  input.metals.auPriceKey = 'XAU_USD_TOZ';
  if (input.operations) {
    input.operations.oreMilledTonnes = [null];
    input.operations.oreMinedTonnes = [null];
    input.operations.gradeByMetal = { Cu: [null] };
    input.operations.recoveryPctByMetal = { Cu: [null] };
  }

  const resolved = await resolveProjectPricesToEngineInput(
    {
      parsed: parseProjectJsonV1(input),
      scenario: { mode: 'fixed', fixedPriceByKey: { CU_USD_LB: 6.4, XAU_USD_TOZ: 2_500 } },
    },
    {
      resolvePriceSeriesFn: async ({ price_key, anchorDatesUtc, scenario }) => ({
        values: anchorDatesUtc.map(() => scenario.mode === 'fixed' ? (scenario.fixedByKey[price_key] ?? null) : null),
        warnings: [],
      }),
    },
  );

  assert.ok(Math.abs((resolved.spotPriceUSDByMetal.Cu[0] ?? 0) - (6.4 * 2204.6226218)) < 1e-9);
  assert.equal(resolved.priceSeriesByKey?.CU_USD_LB[0], 6.4);
  assert.equal(resolved.priceSeriesByKey?.CU_USD_TONNE[0], 6.4 * 2204.6226218);
});
