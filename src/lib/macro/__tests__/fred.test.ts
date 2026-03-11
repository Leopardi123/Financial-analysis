import assert from "node:assert/strict";
import { buildDerivedSeries } from "../fred.ts";

const pmi = [
  { date: "2024-01-31", value: 48 },
  { date: "2024-02-29", value: 49 },
  { date: "2024-03-31", value: 50 },
  { date: "2024-04-30", value: 52 },
  { date: "2024-05-31", value: 53 },
  { date: "2024-06-30", value: 54 },
];

const gold = [
  { date: "2024-01-31", value: 100 },
  { date: "2024-02-29", value: 110 },
  { date: "2024-03-31", value: 120 },
  { date: "2024-04-30", value: 130 },
];

const realYield = [
  { date: "2024-01-31", value: 1 },
  { date: "2024-02-29", value: 2 },
  { date: "2024-03-31", value: 3 },
  { date: "2024-04-30", value: 4 },
];

const derived = buildDerivedSeries({ pmi_us: pmi, gold_usd: gold, real_yield_10y_us: realYield });
const momentum = derived.pmi_momentum_us ?? [];

assert.equal(momentum.length, 3);
assert.deepEqual(momentum.map((p) => p.date), ["2024-04-30", "2024-05-31", "2024-06-30"]);
assert.deepEqual(momentum.map((p) => p.value), [4, 4, 4]);

const spread = derived.gold_minus_real_yield_spread ?? [];
assert.equal(spread.length, 4);
assert.ok(spread.every((p) => Math.abs(p.value ?? 0) < 1e-12), "expected zscore spread to be 0 for linearly aligned series");

console.log("macro fred derived series tests passed");
