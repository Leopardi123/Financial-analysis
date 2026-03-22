import assert from "node:assert/strict";
import { buildSubsectorCoverageAuditReport } from "../subsectorCoverageAudit.ts";

const report = buildSubsectorCoverageAuditReport("2026-03-22T00:00:00.000Z");

const subsectorIds = Object.keys(report.matrix);
assert.ok(subsectorIds.length >= 70, "expected broad subsector coverage matrix");

const gold = report.matrix.gold_miners;
assert.equal(gold.interpretationPath, "explicit_subsector");
assert.ok(gold.explicitDrivers.includes("gold"));

const diagnostics = report.matrix.diagnostics;
assert.equal(diagnostics.currentCoverageLevel, "minimal");
assert.equal(diagnostics.fallbackOnly.routingCoverage, "limited");

const requiredPairs = [
  ["gold_miners", "copper_miners"],
  ["oil_gas_producers", "refiners"],
  ["banks", "insurers"],
  ["semiconductors", "software"],
  ["uranium", "coal"],
  ["shipping", "airlines"],
  ["regulated_utilities", "reits_rate_sensitive"],
] as const;

requiredPairs.forEach(([left, right]) => {
  assert.ok(report.differentiationChecks.find((pair) => pair.pair[0] === left && pair.pair[1] === right));
});

assert.equal(report.rankedOverlayGaps[0]?.overlayId, "maritimeTradeRouteStress");
assert.equal(report.rankedOverlayGaps.length, 5);

console.log("subsectorCoverageAudit.test.ts: all tests passed");
