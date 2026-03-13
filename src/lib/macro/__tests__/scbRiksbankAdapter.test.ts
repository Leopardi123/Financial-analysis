import assert from "node:assert/strict";
import { fetchScbSeriesByMetadata } from "../adapters/scbAdapter.ts";
import { resolveRiksbankSeriesIdByMetadata } from "../adapters/riksbankAdapter.ts";

const originalFetch = global.fetch;

global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);

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
      ? [
        { key: ["00", "GGDebtPctGDP", "2022"], values: ["33.1"] },
        { key: ["00", "GGDebtPctGDP", "2023"], values: ["31.5"] },
      ]
      : [
        { key: ["00", "B9PctGDP", "2022"], values: ["-0.8"] },
        { key: ["00", "B9PctGDP", "2023"], values: ["0.4"] },
      ];
    return {
      ok: true,
      json: async () => ({ data }),
    } as Response;
  }

  if (url.toLowerCase().includes("api.riksbank.se/swea/v1/series")) {
    return {
      ok: true,
      json: async () => ({
        series: [
          { seriesId: "SE.TEST.KPIF", seriesName: "KPIF, year-on-year, Sweden" },
          { seriesId: "SE.TEST.REPO", seriesName: "Policy rate, Sweden" },
        ],
      }),
    } as Response;
  }

  return {
    ok: false,
    status: 404,
    text: async () => "not mocked",
    json: async () => ({}),
  } as Response;
}) as typeof fetch;

const debt = await fetchScbSeriesByMetadata({
  path: "ssd/NR/NR0109/NR0109A/Offentligfinanser",
  metricKeywordGroups: [["debt", "gdp"]],
});
assert.equal(debt.length, 2);
assert.equal(debt[0].date, "2022-12-28");
assert.equal(debt[0].value, 33.1);

const deficit = await fetchScbSeriesByMetadata({
  path: "ssd/NR/NR0109/NR0109A/Offentligfinanser",
  metricKeywordGroups: [["net", "lending", "gdp"]],
});
assert.equal(deficit.length, 2);
assert.equal(deficit[1].value, 0.4);

const resolved = await resolveRiksbankSeriesIdByMetadata({
  includeTerms: ["kpif", "year"],
  preferredIds: ["SE.FALLBACK.KPIF"],
});
assert.equal(resolved, "SE.TEST.KPIF");

if (originalFetch) {
  global.fetch = originalFetch;
}

console.log("scb/riksbank metadata adapter tests passed");
