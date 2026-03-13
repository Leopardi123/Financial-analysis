process.env.FMP_API_KEY = process.env.FMP_API_KEY ?? "test";
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

  if (url.includes("START__PR__PR0101__PR0101G/KPIF") && !init?.method) {
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

  if (url.includes("START__NR__NR0108/FirBruttoKonvAr") && !init?.method) {
    return {
      ok: true,
      json: async () => ({
        variables: [
          { code: "Sector", values: ["S13"], valueTexts: ["General government"] },
          { code: "Account item", values: ["FL01N"], valueTexts: ["Total Maastricht debt"] },
          { code: "Tid", values: ["2022", "2023"], valueTexts: ["2022", "2023"] },
        ],
      }),
    } as Response;
  }

  if (url.includes("START__NR__NR0103__NR0103F/SektorENS2010Ar") && !init?.method) {
    return {
      ok: true,
      json: async () => ({
        variables: [
          { code: "Sector", values: ["S13", "S1"], valueTexts: ["General government", "Total economy"] },
          { code: "Transaction", values: ["B9", "B1GQ"], valueTexts: ["Net lending/net borrowing", "Gross domestic product"] },
          { code: "Tid", values: ["2022", "2023"], valueTexts: ["2022", "2023"] },
        ],
      }),
    } as Response;
  }

  if (init?.method === "POST" && url.includes("START__PR__PR0101__PR0101G/KPIF")) {
    const body = JSON.parse(String(init.body ?? "{}"));
    const metric = body.query?.find((q: any) => q.code === "ContentsCode")?.selection?.values?.[0];
    const data = metric === "KPIF_12M"
      ? [{ key: ["KPIF_12M", "2022M12"], values: ["10.2"] }, { key: ["KPIF_12M", "2023M12"], values: ["5.8"] }]
      : [{ key: ["KPIF_MM", "2022M12"], values: ["0.7"] }, { key: ["KPIF_MM", "2023M12"], values: ["0.2"] }];
    return { ok: true, json: async () => ({ data }) } as Response;
  }

  if (init?.method === "POST" && url.includes("START__NR__NR0108/FirBruttoKonvAr")) {
    return { ok: true, json: async () => ({ data: [{ key: ["S13", "FL01N", "2022"], values: ["2200"] }, { key: ["S13", "FL01N", "2023"], values: ["2300"] }] }) } as Response;
  }

  if (init?.method === "POST" && url.includes("START__NR__NR0103__NR0103F/SektorENS2010Ar")) {
    const body = JSON.parse(String(init.body ?? "{}"));
    const sector = body.query?.find((q: any) => q.code === "Sector")?.selection?.values?.[0];
    const trx = body.query?.find((q: any) => q.code === "Transaction")?.selection?.values?.[0];
    if (sector === "S13" && trx === "B9") {
      return { ok: true, json: async () => ({ data: [{ key: ["S13", "B9", "2022"], values: ["-40"] }, { key: ["S13", "B9", "2023"], values: ["10"] }] }) } as Response;
    }
    return { ok: true, json: async () => ({ data: [{ key: ["S1", "B1GQ", "2022"], values: ["6200"] }, { key: ["S1", "B1GQ", "2023"], values: ["6500"] }] }) } as Response;
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

if (originalFetch) global.fetch = originalFetch;
console.log("SE canonical macro mapping tests passed");
