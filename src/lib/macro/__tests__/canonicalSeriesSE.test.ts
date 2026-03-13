import assert from "node:assert/strict";
import { loadCanonicalMacroSeries } from "../canonicalMacroSeries.ts";

const originalFetch = global.fetch;

global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);

  if (url.includes("api.riksbank.se/swea/v1/series") || url.includes("api.riksbank.se/swea/v1/Series")) {
    return {
      ok: true,
      json: async () => ({
        series: [
          { seriesId: "SE.REAL.KPIF.YOY", seriesName: "KPIF year over year Sweden" },
          { seriesId: "SE.REAL.POLICY", seriesName: "Policy rate Sweden" },
          { seriesId: "SE.REAL.GOV10Y", seriesName: "Government bond yield 10 year Sweden" },
          { seriesId: "SE.REAL.M3.YOY", seriesName: "M3 year over year Sweden" },
        ],
      }),
    } as Response;
  }

  if (url.includes("api.riksbank.se/swea/v1/Observations/SE.REAL.KPIF.YOY")) {
    return { ok: true, json: async () => ({ observations: [{ date: "2024-01-31", value: 2.1 }, { date: "2024-02-29", value: 2.2 }] }) } as Response;
  }
  if (url.includes("api.riksbank.se/swea/v1/Observations/SE.REAL.POLICY")) {
    return { ok: true, json: async () => ({ observations: [{ date: "2024-01-31", value: 3.75 }, { date: "2024-02-29", value: 3.75 }] }) } as Response;
  }
  if (url.includes("api.riksbank.se/swea/v1/Observations/SE.REAL.GOV10Y")) {
    return { ok: true, json: async () => ({ observations: [{ date: "2024-01-31", value: 2.4 }, { date: "2024-02-29", value: 2.5 }] }) } as Response;
  }
  if (url.includes("api.riksbank.se/swea/v1/Observations/SE.REAL.M3.YOY")) {
    return { ok: true, json: async () => ({ observations: [{ date: "2024-01-31", value: 1.2 }, { date: "2024-02-29", value: 1.4 }] }) } as Response;
  }
  if (url.includes("api.riksbank.se/swea/v1/Observations/")) {
    return { ok: true, json: async () => ({ observations: [] }) } as Response;
  }

  if (url.includes("api.scb.se") && !init?.method) {
    return {
      ok: true,
      json: async () => ({
        variables: [
          { code: "Region", values: ["00"], valueTexts: ["Sweden"] },
          { code: "ContentsCode", values: ["GGDebtPctGDP", "B9PctGDP"], valueTexts: ["Debt as % of GDP", "Net lending as % of GDP"] },
          { code: "Tid", values: ["2022", "2023"], valueTexts: ["2022", "2023"] },
        ],
      }),
    } as Response;
  }

  if (url.includes("api.scb.se") && init?.method === "POST") {
    const body = JSON.parse(String(init.body ?? "{}")) as { query?: Array<{ code: string; selection?: { values?: string[] } }> };
    const metric = body.query?.find((q) => q.code === "ContentsCode")?.selection?.values?.[0];
    const data = metric === "GGDebtPctGDP"
      ? [{ key: ["00", "GGDebtPctGDP", "2022"], values: ["34.2"] }, { key: ["00", "GGDebtPctGDP", "2023"], values: ["33.4"] }]
      : [{ key: ["00", "B9PctGDP", "2022"], values: ["-0.6"] }, { key: ["00", "B9PctGDP", "2023"], values: ["0.2"] }];
    return { ok: true, json: async () => ({ data }) } as Response;
  }

  if (url.includes("financialmodelingprep.com/stable/historical-price-eod/full")) {
    return {
      ok: true,
      json: async () => ([
        { date: "2024-01-31", close: 2000 },
        { date: "2024-02-29", close: 2025 },
      ]),
    } as Response;
  }

  return { ok: false, status: 404, text: async () => "not mocked", json: async () => ({}) } as Response;
}) as typeof fetch;

const out = await loadCanonicalMacroSeries("SE", "latest");
assert.ok((out.sourceSeries.kpif_yoy_se ?? []).length > 0);
assert.ok((out.sourceSeries.policy_rate_se ?? []).length > 0);
assert.ok((out.sourceSeries.government_bond_yield_10y_se ?? []).length > 0);
assert.ok((out.derivedSeries.real_yield_10y_se ?? []).length > 0);

if (originalFetch) {
  global.fetch = originalFetch;
}

console.log("SE canonical macro mapping tests passed");
