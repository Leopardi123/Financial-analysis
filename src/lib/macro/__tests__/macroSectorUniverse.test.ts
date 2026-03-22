import assert from "node:assert/strict";
import { macroSectorUniverse, resolveCanonicalSectorTargets } from "../macroSectorUniverse.ts";

(function testUniverseContainsRequiredTopLevelSectors() {
  const mainSectors = macroSectorUniverse.sectors
    .filter((item) => item.category === "main_sector")
    .map((item) => item.id);

  [
    "energy",
    "materials",
    "industrials",
    "financials",
    "tech",
    "utilities",
    "consumer_discretionary",
    "consumer_staples",
    "healthcare",
    "real_estate",
    "communication_services",
    "defense",
    "transportation_logistics",
  ].forEach((id) => assert.ok(mainSectors.includes(id)));
})();

(function testUniverseContainsMacroRelevantSubsectorsAndBuckets() {
  const ids = macroSectorUniverse.sectors.map((item) => item.id);
  ["gold_miners", "diversified_miners", "oil_gas_producers", "semiconductors", "reits_rate_sensitive"].forEach((id) => assert.ok(ids.includes(id)));
  ["hard_asset_equities", "small_caps", "duration_sensitive_equities", "credit_sensitive_cyclicals", "quality_defensives"].forEach((id) => assert.ok(ids.includes(id)));
})();

(function testAliasResolutionSupportsLegacyMacroSectorCandidates() {
  const targets = resolveCanonicalSectorTargets("defense-energy-logistics");
  assert.ok(targets.includes("defense"));
  assert.ok(targets.includes("shipping_logistics"));
  assert.ok(targets.includes("energy"));
})();

console.log("macroSectorUniverse.test.ts: all tests passed");
