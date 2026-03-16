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
  { date: "2024-01-15", value: 100 },
  { date: "2024-01-31", value: 101 },
  { date: "2024-02-29", value: 111 },
  { date: "2024-03-31", value: 121 },
  { date: "2024-04-30", value: 131 },
];

const realYield = [
  { date: "2024-01-31", value: 1 },
  { date: "2024-02-29", value: 2 },
  { date: "2024-03-31", value: 3 },
  { date: "2024-04-30", value: 4 },
];


const industrialMonthly = [
  { date: "2024-01-01", value: 200 },
  { date: "2024-02-01", value: 210 },
  { date: "2024-03-01", value: 220 },
  { date: "2024-04-01", value: 230 },
];


const debtToGdp = [
  { date: "2024-01-31", value: 100 },
  { date: "2024-02-29", value: 101 },
  { date: "2024-03-31", value: 102 },
  { date: "2024-04-30", value: 103 },
];

const nominal10y = [
  { date: "2024-01-31", value: 4 },
  { date: "2024-02-29", value: 4.1 },
  { date: "2024-03-31", value: 4.2 },
  { date: "2024-04-30", value: 4.3 },
];


const walcl = [
  { date: "2024-01-31", value: 8000 },
  { date: "2024-02-29", value: 8010 },
  { date: "2024-03-31", value: 8020 },
  { date: "2024-04-30", value: 8030 },
];

const wdtgal = [
  { date: "2024-01-31", value: 500 },
  { date: "2024-02-29", value: 505 },
  { date: "2024-03-31", value: 510 },
  { date: "2024-04-30", value: 515 },
];

const rrpontsyd = [
  { date: "2024-01-31", value: 200 },
  { date: "2024-02-29", value: 205 },
  { date: "2024-03-31", value: 210 },
  { date: "2024-04-30", value: 215 },
];

const gdp = [
  { date: "2024-01-31", value: 26000 },
  { date: "2024-02-29", value: 26000 },
  { date: "2024-03-31", value: 26100 },
  { date: "2024-04-30", value: 26100 },
];

const m2 = Array.from({ length: 14 }, (_, idx) => ({
  date: `2023-${String(idx + 1).padStart(2, "0")}-28`.replace("-13-", "-01-").replace("-14-", "-02-"),
  value: 100 + idx,
})).map((p, i) => ({ ...p, date: i < 12 ? `2023-${String(i + 1).padStart(2, "0")}-28` : `2024-${String(i - 11).padStart(2, "0")}-28` }));

const derived = buildDerivedSeries({ pmi_us: pmi, gold_usd: gold, real_yield_10y_us: realYield, nominal_yield_10y_us: nominal10y, debt_to_gdp_us: debtToGdp, m2sl: m2, silver_usd: gold, industrial_metals_index: industrialMonthly, WALCL: walcl, WDTGAL: wdtgal, RRPONTSYD: rrpontsyd, GDP: gdp });
const momentum = derived.pmi_momentum_us ?? [];

assert.equal(momentum.length, 3);
assert.deepEqual(momentum.map((p) => p.date), ["2024-04-30", "2024-05-31", "2024-06-30"]);
assert.deepEqual(momentum.map((p) => p.value), [4, 4, 4]);

const spread = derived.gold_minus_real_yield_spread ?? [];
assert.equal(spread.length, 4);
assert.ok(spread.every((p) => Math.abs(p.value ?? 0) < 1e-6), "expected zscore spread to be near 0 for linearly aligned series");

assert.equal((derived.gold_silver_ratio ?? [])[0]?.value, 1);
assert.ok((derived.m2_yoy ?? []).length >= 2);
assert.ok((derived.m2_momentum ?? []).length >= 1);
assert.deepEqual((derived.industrial_metals_vs_gold ?? []).map((p) => p.date), ["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"]);
assert.ok((derived.industrial_metals_vs_gold ?? []).every((p) => (p.value ?? 0) > 1));
assert.equal((derived.interest_cost_proxy_us ?? [])[0]?.value, 4);

const eff = derived.effective_fed_liquidity ?? [];
assert.equal(eff.length, 4);
assert.equal(eff[0]?.value, 7300);
const effRatio = derived.effective_fed_liquidity_ratio ?? [];
assert.equal(effRatio.length, 4);
assert.ok(Math.abs((effRatio[0]?.value ?? 0) - (7300 / 26000)) < 1e-12);

console.log("macro fred derived series tests passed");
