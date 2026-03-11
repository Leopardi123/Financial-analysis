import assert from "node:assert/strict";
import { runGlobalMacroEngine } from "../engine.ts";
import type { MacroSeriesInput } from "../types.ts";

function makeSeries(seriesKey: string, fn: (index: number) => number): MacroSeriesInput {
  const points = Array.from({ length: 120 }, (_, index) => {
    const month = String((index % 12) + 1).padStart(2, "0");
    const year = 2015 + Math.floor(index / 12);
    return { date: `${year}-${month}-28`, value: fn(index) };
  });
  return { seriesKey, points };
}

function makeQuarterlySeries(seriesKey: string, fn: (index: number) => number): MacroSeriesInput {
  const points = Array.from({ length: 40 }, (_, index) => {
    const month = String(((index % 4) * 3) + 3).padStart(2, "0");
    const year = 2015 + Math.floor(index / 4);
    return { date: `${year}-${month}-28`, value: fn(index) };
  });
  return { seriesKey, points };
}

function makeAnnualSeries(seriesKey: string, fn: (index: number) => number): MacroSeriesInput {
  const points = Array.from({ length: 12 }, (_, index) => {
    const year = 2013 + index;
    return { date: `${year}-12-28`, value: fn(index) };
  });
  return { seriesKey, points };
}

const series: MacroSeriesInput[] = [
  makeSeries("debt_to_gdp_us", (i) => i),
  makeSeries("deficit_to_gdp_us", (i) => i * 0.5),
  makeSeries("real_yield_10y_us", (i) => 200 - i),
  makeSeries("nominal_yield_10y_us", (i) => 200 - i),
  makeSeries("yield_curve_10y_minus_2y_us", (i) => 80 - i),
  makeSeries("core_cpi_us", (i) => 50 + i),
  makeSeries("core_cpi_yoy_us", (i) => 70 + i),
  makeSeries("breakeven_10y_us", (i) => 60 + i),
  makeSeries("gold_usd", (i) => 80 + i),
  makeSeries("gold_minus_real_yield_spread", (i) => 90 + i),
  makeSeries("pmi_momentum_us", (i) => 50 + i),
  makeSeries("hy_spread_us", (i) => 10 + i),
];

const { regime, indicators } = runGlobalMacroEngine({ region: "US", series, asOfDate: "2024-12-28" });

assert.ok(["MonetaryDominance", "Balanced", "FiscalPressureBuilding", "FiscalDominanceRisk"].includes(regime.coreRegimeLabel));
assert.equal(regime.growthOverlay, "Neutral");
assert.equal(regime.stressOverlay, "High");
assert.equal(regime.hardAssetOverlay, "Strong");

const clear = indicators.find((entry) => entry.indicatorId === "debt_gdp_us");
const speculative = indicators.find((entry) => entry.indicatorId === "gold_usd");
assert.ok(clear?.contribution !== null && speculative?.contribution !== null);
assert.ok(Math.abs(speculative!.contribution!) < Math.abs(clear!.contribution!), "speculative contribution should be damped by class weight");

const mixedCadenceSeries: MacroSeriesInput[] = [
  makeQuarterlySeries("debt_to_gdp_us", (i) => 80 + i),
  makeAnnualSeries("deficit_to_gdp_us", (i) => -6 + i * 0.2),
  makeSeries("real_yield_10y_us", (i) => 200 - i),
  makeSeries("nominal_yield_10y_us", (i) => 200 - i),
  makeSeries("yield_curve_10y_minus_2y_us", (i) => 80 - i),
  makeSeries("core_cpi_us", (i) => 50 + i),
  makeSeries("core_cpi_yoy_us", (i) => 70 + i),
  makeSeries("breakeven_10y_us", (i) => 60 + i),
  makeSeries("gold_usd", (i) => 80 + i),
  makeSeries("gold_minus_real_yield_spread", (i) => 90 + i),
  makeSeries("pmi_momentum_us", (i) => 50 + i),
  makeSeries("hy_spread_us", (i) => 10 + i),
];
const mixedCadenceRun = runGlobalMacroEngine({ region: "US", series: mixedCadenceSeries, asOfDate: "2024-12-28" });
assert.ok(mixedCadenceRun.indicators.find((entry) => entry.indicatorId === "debt_gdp_us")?.score !== null);
assert.ok(mixedCadenceRun.indicators.find((entry) => entry.indicatorId === "deficit_gdp_us")?.score !== null);

console.log("macro engine tests passed");
