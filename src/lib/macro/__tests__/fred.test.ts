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

const derived = buildDerivedSeries({ pmi_us: pmi });
const momentum = derived.pmi_momentum_us ?? [];

assert.equal(momentum.length, 3);
assert.deepEqual(momentum.map((p) => p.date), ["2024-04-30", "2024-05-31", "2024-06-30"]);
assert.deepEqual(momentum.map((p) => p.value), [4, 4, 4]);

console.log("macro fred derived series tests passed");
