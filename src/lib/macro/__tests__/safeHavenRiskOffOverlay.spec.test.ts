import assert from "node:assert/strict";
import { buildRegionalOverlays, buildSeriesMap } from "../overlayEngine.ts";

function monthDate(offset: number): string {
  const year = 2014 + Math.floor(offset / 12);
  const month = String((offset % 12) + 1).padStart(2, "0");
  return `${year}-${month}-28`;
}

const rows: Array<{ series_key: string; date: string; value: number | null }> = [];
for (let i = 0; i < 144; i += 1) {
  const date = monthDate(i);
  rows.push({ series_key: "gold_usd", date, value: 1200 + i * 3 + Math.sin(i / 6) * 20 });
  rows.push({ series_key: "SP500", date, value: 1700 + i * 8 + Math.cos(i / 5) * 30 });
  rows.push({ series_key: "SX5E", date, value: 2500 + i * 4 + Math.sin(i / 4) * 25 });
  rows.push({ series_key: "DGS10", date, value: 3.5 - i * 0.005 + Math.sin(i / 9) * 0.03 });
  rows.push({ series_key: "YC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y", date, value: 2.2 - i * 0.004 + Math.cos(i / 10) * 0.02 });
}

const map = buildSeriesMap(rows);

const us = buildRegionalOverlays("US", "2025-12-28", map).overlays.safeHavenRiskOffOverlay;
const ea = buildRegionalOverlays("EA", "2025-12-28", map).overlays.safeHavenRiskOffOverlay;

assert.equal(us.components.length, 2);
assert.equal(ea.components.length, 2);
assert.deepEqual(us.components.map((c) => c.block).sort(), ["duration", "gold_equity"]);
assert.deepEqual(ea.components.map((c) => c.block).sort(), ["duration", "gold_equity"]);

const usGold = us.components.find((c) => c.block === "gold_equity");
const eaGold = ea.components.find((c) => c.block === "gold_equity");
const usDur = us.components.find((c) => c.block === "duration");
const eaDur = ea.components.find((c) => c.block === "duration");

assert.ok(usGold && eaGold && usDur && eaDur);
assert.equal(usGold?.exactSource, "FMP stable/historical-price-eod/full?symbol=GCUSD :: FRED SP500");
assert.equal(eaGold?.exactSource, "FMP stable/historical-price-eod/full?symbol=GCUSD :: STOXX SX5E");
assert.equal(usDur?.exactSource, "DGS10");
assert.equal(eaDur?.exactSource, "YC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y");
assert.equal(usGold?.proxy, false);
assert.equal(eaGold?.proxy, false);
assert.equal(usDur?.proxy, false);
assert.equal(eaDur?.proxy, false);

assert.equal(typeof us.goldEquityFlightScore, "number");
assert.equal(typeof us.durationFlightScore, "number");
assert.equal(typeof ea.goldEquityFlightScore, "number");
assert.equal(typeof ea.durationFlightScore, "number");
assert.equal((usGold as any)?.validForProduction, true);
assert.equal((usDur as any)?.validForProduction, true);
assert.equal((usGold as any)?.diagnosticOnly, false);
assert.equal((usDur as any)?.diagnosticOnly, false);
assert.equal((usGold as any)?.gatingFailureReason || "none", "none");
assert.equal((usDur as any)?.gatingFailureReason || "none", "none");
assert.equal((usGold as any)?.percentilePlusScoreCheck, "pass");
assert.equal((usDur as any)?.percentilePlusScoreCheck, "pass");

const usRuntime = (us as any).runtime;
assert.deepEqual(Object.keys(usRuntime.aggregationWeights).sort(), ["duration", "gold_equity"]);
assert.ok(!("usd" in usRuntime.aggregationWeights));
assert.equal(usRuntime.scoreFormula, "safe_haven_overlay_score = 0.65*gold_equity_flight_score + 0.35*duration_flight_score");
assert.equal(usRuntime.safeHavenDebug.verificationTrace.some((line: string) => line.includes("cap to [-3,+3]")), true);

const partialRows = rows.filter((r) => r.series_key !== "SP500");
const partial = buildRegionalOverlays("US", "2025-12-28", buildSeriesMap(partialRows)).overlays.safeHavenRiskOffOverlay;
const partialRuntime = (partial as any).runtime;
assert.deepEqual(partialRuntime.includedBlocksInTotal, ["duration"]);
assert.equal(partialRuntime.status, "partial");
assert.equal(partialRuntime.safeHavenDebug.runtimeCompleteness, "partial");
assert.equal(partialRuntime.safeHavenDebug.fidelityBadge, "Structurally partial");
assert.equal(partialRuntime.scoreFormula.includes("weighted_average(available production-valid block scores)"), true);
assert.equal(partialRuntime.scoreFormula.includes("uses duration only"), true);

console.log("safe haven risk-off overlay v1 tests passed");
