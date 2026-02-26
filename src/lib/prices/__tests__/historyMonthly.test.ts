import { encodeMonthlyPayload } from "../historyBlob.ts";
import { refreshHistoryRangeToMonthlyBlobs } from "../refreshHistory.ts";
import { readHistoryRowsInRange } from "../db/readHistory.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

(async function runHistoryMonthlyTests() {
  const upsertCalls: Array<{ sql: string; args: Array<string | number | null> }> = [];

  await refreshHistoryRangeToMonthlyBlobs(
    { priceKey: "XAU_USD_TOZ", from: "2026-01-01", to: "2026-02-28" },
    {
      queryFn: async (sql: string, _params: Array<string | number | null> = []) => {
        if (sql.includes("FROM price_provider_map")) {
          return [{ provider_symbol: "GCUSD", provider_kind: "commodity" }];
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

  assert(upsertCalls.length === 2, `Expected 2 upserts, got ${upsertCalls.length}`);

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
