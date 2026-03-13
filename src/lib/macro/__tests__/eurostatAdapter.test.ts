import assert from "node:assert/strict";
import { fetchEurostatSeries } from "../adapters/eurostatAdapter.ts";

const originalFetch = global.fetch;

global.fetch = (async () => {
  const payload = {
    id: ["geo", "unit", "time"],
    size: [1, 1, 3],
    dimension: {
      geo: { category: { index: { EA20: 0 } } },
      unit: { category: { index: { PC_GDP: 0 } } },
      time: { category: { index: { "2022": 0, "2023": 1, "2024": 2 } } },
    },
    value: {
      "0": 90.1,
      "1": 91.2,
      "2": 92.3,
    },
  };
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}) as typeof fetch;

const rows = await fetchEurostatSeries({
  dataset: "gov_10dd_edpt1",
  filters: { geo: "EA20", sector: "S13", unit: "PC_GDP", na_item: "GD", freq: "A" },
});

assert.equal(rows.length, 3);
assert.equal(rows[0].date, "2022-12-28");
assert.equal(rows[2].value, 92.3);

if (originalFetch) {
  global.fetch = originalFetch;
}

console.log("eurostat adapter tests passed");
