import assert from "node:assert/strict";
import { buildMacroAssetMap } from "../macroAssetMap.ts";

(function testFiscalPressureBaseMapping() {
  const result = buildMacroAssetMap({
    primaryRegime: "FiscalPressureBuilding",
    momentumDirection: "stable",
  });

  assert.deepEqual(result.favored.map((i) => i.title), ["Gold", "Energy"]);
  assert.deepEqual(result.neutral.map((i) => i.title), ["Broad equities"]);
  assert.deepEqual(result.underPressure.map((i) => i.title), ["Duration assets", "Small caps"]);
  assert.equal(result.favored[0]?.drivers.regime[0]?.id, "FiscalPressureBuilding");
})();

(function testOverlayAdjustmentsAndDriverMetadata() {
  const result = buildMacroAssetMap({
    primaryRegime: "FiscalPressureBuilding",
    momentumDirection: "stable",
    overlays: {
      safeHavenRiskOffOverlay: { score: 75 },
      energyShockOverlay: { score: 70 },
      inflationCostShockOverlay: { score: 65 },
      liquidityOverlay: { score: 35 },
    },
  });

  assert.ok(result.favored.some((i) => i.id === "gold"));
  assert.ok(result.favored.some((i) => i.id === "energy"));
  assert.ok(result.favored.some((i) => i.id === "copper"));
  assert.ok(result.neutral.some((i) => i.id === "durationAssets"));

  const gold = result.favored.find((i) => i.id === "gold");
  assert.ok(gold?.drivers.overlays.some((d) => d.id === "safeHavenRiskOffOverlay"));
})();

(function testCreditFundingSoftensSmallCaps() {
  const result = buildMacroAssetMap({
    primaryRegime: "FiscalDominanceRisk",
    overlays: {
      creditFundingOverlay: { score: 80 },
    },
  });

  assert.ok(result.neutral.some((i) => i.id === "smallCaps"));
  assert.ok(!result.underPressure.some((i) => i.id === "smallCaps"));
})();

console.log("macroAssetMap.test.ts: all tests passed");
