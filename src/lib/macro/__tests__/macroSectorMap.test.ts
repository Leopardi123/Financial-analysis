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
  assert.ok(sectorMap.favored.some((item) => item.id === "gold-miners"));
  assert.ok(sectorMap.underPressure.some((item) => item.id === "long-duration-tech"));
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
  assert.ok(sectorMap.favored.some((item) => item.id === "gold-hard-assets-safehaven"));
  assert.ok(sectorMap.favored.some((item) => item.id === "defense-energy-logistics"));
  assert.ok(sectorMap.neutral.some((item) => item.id === "financials-cyclicals-softened"));
})();

(function testSourceAssetsAreTracked() {
  const assetMap = buildMacroAssetMap({
    primaryRegime: "MonetaryDominance",
    momentumDirection: "stable",
  });
  const sectorMap = buildMacroSectorMap(assetMap);
  const growthTech = sectorMap.favored.find((item) => item.id === "growth-tech");
  assert.ok(growthTech);
  assert.ok(growthTech?.sourceAssets.some((asset) => asset.id === "growthEquities"));
})();

console.log("macroSectorMap.test.ts: all tests passed");
