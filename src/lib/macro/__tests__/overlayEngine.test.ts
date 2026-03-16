import assert from "node:assert/strict";
import { buildRegionalOverlays, buildSeriesMap } from "../overlayEngine.ts";

const rows: Array<{ series_key: string; date: string; value: number | null }> = [];
for (let i = 0; i < 24; i += 1) {
  const month = String((i % 12) + 1).padStart(2, "0");
  const year = 2023 + Math.floor(i / 12);
  const date = `${year}-${month}-28`;
  rows.push({ series_key: "policy_uncertainty_us", date, value: 100 + i });
  rows.push({ series_key: "lu_repricing_us", date, value: 0.1 + i * 0.01 });
  // Simulate runtime where canonical key exists but is null/empty.
  rows.push({ series_key: "ACMTP10", date, value: null });
}

const overlays = buildRegionalOverlays("US", "2024-12-28", buildSeriesMap(rows));
const local = overlays.overlays.localUnrestOverlay;

assert.equal(typeof local.blockScores.signal, "number");
assert.equal(typeof local.blockScores.repricing, "number");
assert.equal(typeof local.score, "number");
assert.notEqual(local.label, "Not implemented");
assert.ok(local.confidence > 0);

const repricing = local.components.find((component) => component.id === "lu_repricing_us");
assert.ok(repricing);
assert.equal(typeof repricing?.rawValue, "number");
assert.equal(typeof repricing?.score, "number");

console.log("macro overlay engine local unrest tests passed");
