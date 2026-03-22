import assert from "node:assert/strict";
import { buildMacroAssetMap } from "../macroAssetMap.ts";
import { buildMacroSectorMap } from "../macroSectorMap.ts";

(function testDerivedFromAssetMapMetadata() {
  const assetMap = buildMacroAssetMap({
    primaryRegime: "FiscalPressureBuilding",
    momentumDirection: "stable",
  });

  const sectorMap = buildMacroSectorMap(assetMap);
  assert.equal(sectorMap.metadata.derivedFromAssetMap, true);
  assert.ok(sectorMap.favored.some((item) => item.id === "gold_miners"));
  assert.ok(sectorMap.underPressure.some((item) => item.id === "tech"));
})();

(function testOverlaySectorInterpretation() {
  const assetMap = buildMacroAssetMap({
    primaryRegime: "FiscalDominanceRisk",
    overlays: {
      safeHavenRiskOffOverlay: { score: 75 },
      localUnrestOverlay: { score: 75 },
      creditFundingOverlay: { score: 80 },
    },
  });

  const sectorMap = buildMacroSectorMap(assetMap);
  assert.ok(sectorMap.favored.some((item) => item.id === "gold_miners"));
  assert.ok(sectorMap.favored.some((item) => item.id === "defense"));
  assert.ok(sectorMap.favored.some((item) => item.id === "energy"));
  assert.ok(sectorMap.favored.some((item) => item.id === "defense_contractors"));
  assert.ok(sectorMap.favored.some((item) => item.id === "shipping_logistics"));
  assert.ok(sectorMap.neutral.some((item) => item.id === "financials"));
})();

(function testExpandedUniverseCapturesSubsectorsAndMacroBuckets() {
  const assetMap = buildMacroAssetMap({
    primaryRegime: "FiscalPressureBuilding",
    overlays: {
      energyShockOverlay: { score: 80 },
      inflationCostShockOverlay: { score: 80 },
    },
  });

  const sectorMap = buildMacroSectorMap(assetMap);
  assert.ok(sectorMap.favored.some((item) => item.id === "oil_gas_producers"));
  assert.ok(sectorMap.favored.some((item) => item.id === "oil_services"));
  assert.ok(sectorMap.favored.some((item) => item.id === "refiners"));
  assert.ok(sectorMap.favored.some((item) => item.id === "hard_asset_equities"));
})();

(function testCanonicalDedupAndLabelCleanliness() {
  const assetMap = buildMacroAssetMap({
    primaryRegime: "FiscalPressureBuilding",
    overlays: {
      safeHavenRiskOffOverlay: { score: 75 },
      localUnrestOverlay: { score: 75 },
      energyShockOverlay: { score: 80 },
      inflationCostShockOverlay: { score: 80 },
    },
  });

  const sectorMap = buildMacroSectorMap(assetMap);
  const favoredIds = sectorMap.favored.map((item) => item.id);
  const uniqueFavoredIds = new Set(favoredIds);
  assert.equal(favoredIds.length, uniqueFavoredIds.size);
  assert.ok(!sectorMap.favored.some((item) => item.title.includes("/")));

  const goldMiners = sectorMap.favored.find((item) => item.id === "gold_miners");
  assert.ok(goldMiners?.sourceAssets.some((asset) => asset.id === "gold"));
})();

(function testSourceAssetsAreTracked() {
  const assetMap = buildMacroAssetMap({
    primaryRegime: "MonetaryDominance",
    momentumDirection: "stable",
  });
  const sectorMap = buildMacroSectorMap(assetMap);
  const tech = sectorMap.favored.find((item) => item.id === "tech");
  assert.ok(tech);
  assert.ok(tech?.sourceAssets.some((asset) => asset.id === "growthEquities"));
})();

console.log("macroSectorMap.test.ts: all tests passed");
