import assert from "node:assert/strict";
import { buildRegionalOverlays, buildSeriesMap } from "../overlayEngine.ts";

const rows: Array<{ series_key: string; date: string; value: number | null }> = [];
for (let i = 0; i < 60; i += 1) {
  const month = String((i % 12) + 1).padStart(2, "0");
  const year = 2020 + Math.floor(i / 12);
  const date = `${year}-${month}-28`;
  rows.push({ series_key: "WALCL", date, value: 8000 + i * 10 });
  rows.push({ series_key: "WDTGAL", date, value: 500 + i });
  rows.push({ series_key: "RRPONTSYD", date, value: 200 + i });
  rows.push({ series_key: "M2SL", date, value: 20000 + i * 20 });
  rows.push({ series_key: "TOTBKCR", date, value: 14000 + i * 15 });
  rows.push({ series_key: "GDP", date, value: 26000 + Math.floor(i / 3) * 30 });
  rows.push({ series_key: "DFII10", date, value: 1.5 + i * 0.01 });
  rows.push({ series_key: "NFCI", date, value: -0.5 + i * 0.01 });
  rows.push({ series_key: "BAMLH0A0HYM2", date, value: 4 + i * 0.02 });
  rows.push({ series_key: "DRTSCILM", date, value: -5 + i * 0.03 });
}

const overlays = buildRegionalOverlays("US", "2024-12-28", buildSeriesMap(rows));
const liquidity = overlays.overlays.liquidityOverlay;

assert.equal(liquidity.runtime?.scoreFormula, "score = 0.40 × quantity + 0.35 × price + 0.25 × transmission");
assert.deepEqual(liquidity.runtime?.includedBlocksInTotal, ["quantity", "price", "transmission"]);
assert.deepEqual(liquidity.runtime?.excludedBlocks, ["bridge"]);

const quantityIds = liquidity.components.filter((c) => c.block === "quantity").map((c) => c.id).sort();
assert.deepEqual(quantityIds, ["bank_credit_ratio", "effective_fed_liquidity_ratio", "m2_ratio"]);

const trans = liquidity.components.find((c) => c.id === "liq_trans_credit");
assert.ok(trans);
assert.equal(trans?.exactSource, "DRTSCILM");

assert.equal(liquidity.bridgeDiagnostic?.includedInTotal, false);
console.log("liquidity overlay spec tests passed");
