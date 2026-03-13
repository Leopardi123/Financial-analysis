import assert from "node:assert/strict";
import { aggregateGlobalMacroRegime } from "../global.ts";
import type { MacroRegimeSnapshot } from "../types.ts";

function mk(region: "US" | "EA" | "SE", fiscal: number, monetary: number, inflation: number, credibility: number): MacroRegimeSnapshot {
  return {
    asOfDate: "2024-12-28",
    region,
    blockScores: { A_FISCAL: fiscal, B_MONETARY: monetary, C_INFLATION: inflation, D_CREDIBILITY: credibility },
    macroScoreTotal: 0,
    macroConfidence: 80,
    coreRegimeLabel: "Balanced",
    growthOverlay: "Neutral",
    stressOverlay: "Medium",
    hardAssetOverlay: "Neutral",
    clearSignalStrength: 0.2,
    speculativeSignalStrength: 0.1,
    topDrivers: [
      { region, indicatorId: `d_${region}`, title: `Driver ${region}`, block: "A_FISCAL", score: 1, percentile10y: 80, contribution: 2, direction: "rising", change1m: 1, change3m: 2, yoy: 3, driverNote: null },
    ],
    regimeExplanation: { title: "x", summary: "x", driverHighlights: [] },
  };
}

const g = aggregateGlobalMacroRegime([
  mk("US", 80, 60, 50, 70),
  mk("EA", 40, 50, 60, 30),
  mk("SE", 20, 40, 30, 50),
]);

assert.ok(g.blockScores.A_FISCAL !== null);
assert.equal(Math.round(g.blockScores.A_FISCAL!), 57);
assert.equal(g.region, "GLOBAL");
assert.ok(g.topDrivers.length > 0);
assert.ok(g.topDrivers.some((d) => d.region === "US"));

console.log("global macro aggregation tests passed");
