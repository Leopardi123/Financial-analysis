process.env.FMP_API_KEY = process.env.FMP_API_KEY ?? "test";
import assert from "node:assert/strict";
import { loadCanonicalMacroSeries } from "../canonicalMacroSeries.ts";

const originalFetch = global.fetch;

global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);

  if (url.includes("api.scb.se/OV0104/v1/doris/en/ssd/START/PR/PR0101") && !url.includes("KPIFMAnad") && !init?.method) {
    return {
      ok: true,
      json: async () => ([{ id: "PR0101A/KPIFMAnad" }, { id: "PR0101B" }]),
    } as Response;
  }

  if (url.includes("api.riksbank.se/swea/v1/series") || url.includes("api.riksbank.se/swea/v1/Series")) {
    return {
      ok: true,
      json: async () => ({
        series: [
          { seriesId: "SECBREPOEFF", seriesName: "Policy rate" },
          { seriesId: "SEGVB10YC", seriesName: "Swedish Government Bond, maturity 10 years" },
        ],
      }),
    } as Response;
  }

  if (url.includes("api.riksbank.se/swea/v1/Observations/SECBREPOEFF")) {
    return { ok: true, json: async () => ({ observations: [{ date: "2022-12-28", value: 2.5 }, { date: "2023-12-28", value: 4.0 }] }) } as Response;
  }
  if (url.includes("api.riksbank.se/swea/v1/Observations/SEGVB10YC")) {
    return { ok: true, json: async () => ({ observations: [{ date: "2022-12-28", value: 2.0 }, { date: "2023-12-28", value: 2.8 }] }) } as Response;
  }
  if (url.includes("api.riksbank.se/swea/v1/Observations/")) {
    return { ok: true, json: async () => ({ observations: [] }) } as Response;
  }

  if (url.includes("START/PR/PR0101/PR0101A/KPIFMAnad") && !init?.method) {
    return {
      ok: true,
      json: async () => ({
        variables: [
          { code: "ContentsCode", values: ["KPIF_12M", "KPIF_MM"], valueTexts: ["KPIF 12-month change", "KPIF monthly change"] },
          { code: "Tid", values: ["2022M12", "2023M12"], valueTexts: ["2022M12", "2023M12"] },
        ],
      }),
    } as Response;
  }

  if (url.includes("START/NR/NR0109/NR0109A/Offentligfinanser") && !init?.method) {
    return {
      ok: true,
      json: async () => ({
        variables: [
          { code: "ContentsCode", values: ["GGDebtPctGDP", "B9PctGDP"], valueTexts: ["Debt as % of GDP", "Net lending as % of GDP"] },
          { code: "Tid", values: ["2022", "2023"], valueTexts: ["2022", "2023"] },
        ],
      }),
    } as Response;
  }

  if (init?.method === "POST" && url.includes("START/PR/PR0101/PR0101A/KPIFMAnad")) {
    const body = JSON.parse(String(init.body ?? "{}"));
    const metric = body.query?.find((q: any) => q.code === "ContentsCode")?.selection?.values?.[0];
    const data = metric === "KPIF_12M"
      ? [{ key: ["KPIF_12M", "2022M12"], values: ["10.2"] }, { key: ["KPIF_12M", "2023M12"], values: ["5.8"] }]
      : [{ key: ["KPIF_MM", "2022M12"], values: ["0.7"] }, { key: ["KPIF_MM", "2023M12"], values: ["0.2"] }];
    return { ok: true, json: async () => ({ data }) } as Response;
  }

  if (init?.method === "POST" && url.includes("START/NR/NR0109/NR0109A/Offentligfinanser")) {
    const body = JSON.parse(String(init.body ?? "{}"));
    const metric = body.query?.find((q: any) => q.code === "ContentsCode")?.selection?.values?.[0];
    if (metric === "GGDebtPctGDP") {
      return { ok: true, json: async () => ({ data: [{ key: ["GGDebtPctGDP", "2022"], values: ["33.1"] }, { key: ["GGDebtPctGDP", "2023"], values: ["31.5"] }] }) } as Response;
    }
    return { ok: true, json: async () => ({ data: [{ key: ["B9PctGDP", "2022"], values: ["-0.8"] }, { key: ["B9PctGDP", "2023"], values: ["0.4"] }] }) } as Response;
  }

  if (url.includes("financialmodelingprep.com/stable/historical-price-eod/full")) {
    return { ok: true, json: async () => ([{ date: "2022-12-28", close: 1800 }, { date: "2023-12-28", close: 1900 }]) } as Response;
  }

  return { ok: false, status: 404, text: async () => "not mocked", json: async () => ({}) } as Response;
}) as typeof fetch;

const out = await loadCanonicalMacroSeries("SE", "latest");
assert.ok((out.sourceSeries.kpif_yoy_se ?? []).length > 0);
assert.ok((out.sourceSeries.inflation_momentum_se ?? []).length > 0);
assert.ok((out.sourceSeries.policy_rate_se ?? []).length > 0);
assert.ok((out.sourceSeries.government_bond_yield_10y_se ?? []).length > 0);
assert.ok((out.derivedSeries.real_yield_10y_se ?? []).length > 0);
assert.ok((out.derivedSeries.gold_vs_real_yield_se ?? []).length > 0);
assert.ok(out.partialSeries.includes("debt_gdp_se"));
assert.ok(out.partialSeries.includes("deficit_gdp_se"));

if (originalFetch) global.fetch = originalFetch;
console.log("SE canonical macro mapping tests passed");
