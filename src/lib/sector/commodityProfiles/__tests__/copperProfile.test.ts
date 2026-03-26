import assert from "node:assert/strict";
import { copperCommodityProfile } from "../profiles/copperProfile.ts";
import { goldCommodityProfile } from "../profiles/goldProfile.ts";
import type { CommodityProfileInput } from "../types.ts";

const asOf = "2026-03-01";

const goldInput: CommodityProfileInput = {
  commodity: "gold",
  asOf,
  indicators: {
    gold_usd: { key: "gold_usd", valueLatest: 2200, percentile10y: 80, score: 1.2, change1m: 2.1, change3m: 4.3, yoy: 16.2, asOf, momentum12m: 16.2, deviationFromMeanZ: 1.4 },
    gold_minus_real_yield_spread: { key: "gold_minus_real_yield_spread", valueLatest: 1.3, percentile10y: 75, score: 0.8, change1m: 0.2, change3m: 0.4, yoy: 0.9, asOf },
    real_yield_10y_us: { key: "real_yield_10y_us", valueLatest: 1.4, percentile10y: 30, score: -0.7, change1m: -0.2, change3m: -0.4, yoy: -0.6, asOf },
    usd_broad_index: { key: "usd_broad_index", valueLatest: 98, percentile10y: 45, score: -0.1, change1m: -0.4, change3m: -0.8, yoy: -1.2, asOf },
    usd_yoy: { key: "usd_yoy", valueLatest: -1.2, percentile10y: 40, score: -0.3, change1m: -0.1, change3m: -0.2, yoy: -1.2, asOf },
    core_cpi_yoy_us: { key: "core_cpi_yoy_us", valueLatest: 3.1, percentile10y: 65, score: 0.5, change1m: 0.1, change3m: 0.2, yoy: 0.4, asOf },
    breakeven_10y_us: { key: "breakeven_10y_us", valueLatest: 2.4, percentile10y: 70, score: 0.6, change1m: 0.1, change3m: 0.3, yoy: 0.5, asOf },
    vix_index: { key: "vix_index", valueLatest: 19, percentile10y: 55, score: 0.2, change1m: -0.1, change3m: 0.1, yoy: 0.3, asOf },
    hy_spread_us: { key: "hy_spread_us", valueLatest: 4.2, percentile10y: 52, score: 0.1, change1m: 0.1, change3m: 0.1, yoy: 0.2, asOf },
    financial_conditions_index: { key: "financial_conditions_index", valueLatest: 0.1, percentile10y: 50, score: 0, change1m: 0, change3m: 0, yoy: 0, asOf },
  },
  overlays: {
    inflationCostShockOverlay: 60,
    liquidityOverlay: 62,
    creditFundingOverlay: 58,
    safeHavenRiskOffOverlay: 55,
    globalUnrestOverlay: 57,
    pmiDemandOverlay: 80,
    copperSupplyOverlay: 20,
  },
  manualInputs: {},
  macroContext: { coreRegimeLabel: "FiscalPressureBuilding", hardAssetOverlay: null, macroConfidence: 0.7 },
};

const copperInput: CommodityProfileInput = {
  commodity: "copper",
  asOf,
  indicators: {
    copper_usd: { key: "copper_usd", valueLatest: 4.1, percentile10y: 28, score: -0.4, change1m: 1.4, change3m: 3.2, yoy: 4.5, asOf, momentum12m: 4.5, deviationFromMeanZ: -0.7 },
    pmi_us: { key: "pmi_us", valueLatest: 52.6, percentile10y: 68, score: 0.5, change1m: 0.6, change3m: 1.8, yoy: 2.1, asOf },
    copper_lme_inventory: { key: "copper_lme_inventory", valueLatest: 180, percentile10y: 32, score: -0.6, change1m: -0.8, change3m: -1.2, yoy: -3.3, asOf },
    copper_capex_proxy: { key: "copper_capex_proxy", valueLatest: 54, percentile10y: 62, score: 0.4, change1m: 0.8, change3m: 1.4, yoy: 2.5, asOf },
  },
  overlays: {
    pmiDemandOverlay: 78,
    copperSupplyOverlay: 63,
    liquidityOverlay: 10,
    safeHavenRiskOffOverlay: 90,
  },
  manualInputs: {},
  macroContext: { coreRegimeLabel: "Balanced", hardAssetOverlay: null, macroConfidence: 0.5 },
};

const goldSnapshot = goldCommodityProfile.compute(goldInput);
const copperSnapshot = copperCommodityProfile.compute(copperInput);

assert.ok(goldSnapshot, "gold snapshot should resolve");
assert.ok(copperSnapshot, "copper snapshot should resolve");

assert.equal(copperSnapshot?.category, "industrial");
assert.equal(copperSnapshot?.phase, "Early Cycle", "Copper should classify low percentile + improving PMI as Early Cycle");
assert.equal(copperSnapshot?.copperRegime, "Demand expansion");
assert.equal(copperSnapshot?.diagnostics.ignoredOverlays.includes("liquidityOverlay"), true, "Copper must ignore monetary overlays");

assert.notEqual(goldSnapshot?.phase, copperSnapshot?.phase, "Gold and Copper should diverge under different logic.");
assert.equal(goldSnapshot?.commodity, "gold");
assert.ok(goldSnapshot?.goldRegime, "Gold regime should remain available and unaffected");

console.log("copperProfile.test.ts passed");
