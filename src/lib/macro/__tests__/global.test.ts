import assert from "node:assert/strict";
import { aggregateGlobalBlockScores, aggregateGlobalTopDrivers } from "../global.ts";

const blocks = aggregateGlobalBlockScores({
  US: { A_FISCAL: 80, B_MONETARY: 60, C_INFLATION: 40, D_CREDIBILITY: 20 },
  EA: { A_FISCAL: 40, B_MONETARY: 50, C_INFLATION: 60, D_CREDIBILITY: 70 },
  SE: { A_FISCAL: 20, B_MONETARY: 30, C_INFLATION: 40, D_CREDIBILITY: 50 },
});

assert.equal(Math.round((blocks.A_FISCAL ?? 0) * 100) / 100, 57);
assert.equal(Math.round((blocks.B_MONETARY ?? 0) * 100) / 100, 52);

const drivers = aggregateGlobalTopDrivers({
  US: [{ region: "US", indicatorId: "real_yield_10y_us", title: "Real Yield 10Y (US)", block: "B_MONETARY", score: 2, percentile10y: 95, contribution: 2.2, direction: "rising", change1m: 0.1, change3m: 0.2, yoy: 0.5, driverNote: null }],
  EA: [{ region: "EA", indicatorId: "breakeven_10y_ea", title: "10Y Breakeven (EA)", block: "C_INFLATION", score: 2, percentile10y: 94, contribution: 2.0, direction: "rising", change1m: 0.1, change3m: 0.2, yoy: 0.5, driverNote: null }],
});

assert.equal(drivers.length, 2);
assert.equal(drivers[0].region, "US");

console.log("macro global aggregation tests passed");
