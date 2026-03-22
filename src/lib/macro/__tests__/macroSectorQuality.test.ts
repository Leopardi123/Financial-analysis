import assert from "node:assert/strict";
import { buildMacroAssetMap } from "../macroAssetMap.ts";
import { buildMacroSectorMap } from "../macroSectorMap.ts";
import { buildMacroSectorQualityMap } from "../macroSectorQuality.ts";

(function testCoherentWhenDirectionIsClearAndContradictionIsLow() {
  const sectorMap = buildMacroSectorMap(buildMacroAssetMap({ primaryRegime: "MonetaryDominance" }));
  const qualityMap = buildMacroSectorQualityMap(sectorMap, {
    regimeCoherence: "high",
    transitionRisk: "low",
    contradictingOverlays: [],
    modulatingOverlays: ["legacy:liquidity"],
  });

  const favoredTech = qualityMap.favored.find((item) => item.id === "tech");
  assert.equal(favoredTech?.quality, "coherent");
})();

(function testFragileWhenTransitionRiskIsElevated() {
  const sectorMap = buildMacroSectorMap(buildMacroAssetMap({ primaryRegime: "FiscalPressureBuilding" }));
  const qualityMap = buildMacroSectorQualityMap(sectorMap, {
    regimeCoherence: "medium",
    transitionRisk: "elevated",
    contradictingOverlays: ["legacy:energyShock"],
    modulatingOverlays: ["legacy:fx"],
  });

  assert.ok(qualityMap.favored.every((item) => item.quality === "fragile"));
})();

(function testMixedForNeutralBuckets() {
  const sectorMap = buildMacroSectorMap(
    buildMacroAssetMap({
      primaryRegime: "FiscalDominanceRisk",
      overlays: { creditFundingOverlay: { score: 85 } },
    })
  );
  const qualityMap = buildMacroSectorQualityMap(sectorMap, {
    regimeCoherence: "medium",
    transitionRisk: "low",
    contradictingOverlays: [],
    modulatingOverlays: ["legacy:credit", "legacy:liquidity"],
  });

  const neutralFinancials = qualityMap.neutral.find((item) => item.id === "financials");
  assert.equal(neutralFinancials?.quality, "mixed");
})();

console.log("macroSectorQuality.test.ts: all tests passed");
