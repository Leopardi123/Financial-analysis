import { decodeMonthlyPayload, encodeMonthlyPayload } from "../historyBlob.ts";
import { refreshHistoryRangeToMonthlyBlobs } from "../refreshHistory.ts";
import { readHistoryRowsInRange } from "../db/readHistory.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

(async function runHistoryMonthlyTests() {
  const upsertCalls: Array<{ sql: string; args: Array<string | number | null> }> = [];

  await refreshHistoryRangeToMonthlyBlobs(
    { priceKey: "XAU_USD_TOZ", from: "2026-01-01", to: "2026-02-28" },
    {
      queryFn: async (sql: string, _params: Array<string | number | null> = []) => {
        if (sql.includes("FROM price_provider_map")) {
          return [{ provider: "FMP", provider_symbol: "GCUSD", provider_kind: "commodity" }];
        }
        if (sql.includes("FROM price_eod_monthly")) {
          return [];
        }
        return [];
      },
      executeFn: async (sql: string, _params: Array<string | number | null> = []) => {
        upsertCalls.push({ sql, args: _params });
        return {} as never;
      },
      fetchHistoricalFn: async () => [
        { date: "2026-01-10", close: 100 },
        { date: "2026-01-31", close: 101 },
        { date: "2026-02-01", close: 102 },
      ],
    },
  );

  assert(upsertCalls.length === 2, `Expected 2 FMP upserts, got ${upsertCalls.length}`);
  assert(upsertCalls.every((call) => call.args[3] === "FMP"), "FMP history rows must retain FMP provider provenance");
  assert(upsertCalls.every((call) => call.args[4] === "GCUSD"), "FMP history rows must retain GCUSD source symbol");

  const fredUpserts: Array<{ sql: string; args: Array<string | number | null> }> = [];
  await refreshHistoryRangeToMonthlyBlobs(
    { priceKey: "ZN_USD_LB", from: "2026-07-15", to: "2026-07-31" },
    {
      queryFn: async (sql: string) => {
        if (sql.includes("FROM price_provider_map")) {
          return [{ provider: "FRED", provider_symbol: "PZINCUSDM", provider_kind: "commodity" }];
        }
        if (sql.includes("FROM price_eod_monthly")) {
          return [];
        }
        return [];
      },
      executeFn: async (sql: string, args: Array<string | number | null> = []) => {
        fredUpserts.push({ sql, args });
        return {} as never;
      },
      fetchFredCommodityPriceSeriesFn: async (mapping, range) => {
        assert(mapping.fredSeriesId === "PZINCUSDM", `Expected PZINCUSDM, got ${mapping.fredSeriesId}`);
        assert(range.fromUtc === "2026-07-01", `FRED fetch should expand mid-month from-date to source month start, got ${range.fromUtc}`);
        assert(range.toUtc === "2026-07-31", `FRED fetch should preserve to-date, got ${range.toUtc}`);
        return [{ dateUtc: "2026-07-31", close: 2204.6226218487757, sourcePeriod: "2026-07" }];
      },
    },
  );

  assert(fredUpserts.length === 1, `Expected 1 FRED upsert, got ${fredUpserts.length}`);
  assert(fredUpserts[0].args[3] === "FRED", "FRED history row must be labelled FRED");
  assert(fredUpserts[0].args[4] === "PZINCUSDM", "FRED history row must retain exact series id");
  const fredPayload = decodeMonthlyPayload(String(fredUpserts[0].args[2]));
  assert(fredPayload.dates[0] === "2026-07-31", "FRED monthly observation should be stored at month end");
  assertApprox(fredPayload.close[0], 1, 1e-12, "FRED zinc USD/tonne should normalize to canonical USD/lb");

  const payloadJan = encodeMonthlyPayload({
    dates: ["2026-01-05", "2026-01-20"],
    close: [10, 20],
  });
  const payloadFeb = encodeMonthlyPayload({
    dates: ["2026-02-02", "2026-02-15"],
    close: [30, 40],
  });

  const read = await readHistoryRowsInRange(
    { priceKey: "XAU_USD_TOZ", from: "2026-01-10", to: "2026-02-10" },
    {
      queryFn: async () => [
        { yyyymm: "202601", payload: payloadJan },
        { yyyymm: "202602", payload: payloadFeb },
      ],
    },
  );

  assert(
    JSON.stringify(read.rows) === JSON.stringify([
      { date: "2026-01-20", close: 20 },
      { date: "2026-02-02", close: 30 },
    ]),
    `Unexpected range rows: ${JSON.stringify(read.rows)}`,
  );

  console.log("History monthly tests passed");
})();
