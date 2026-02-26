import { mergeMonthlyPayload, sliceMonthlyPayload, type MonthlyPricePayload } from "../historyBlob.ts";

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

(function runHistoryBlobTests() {
  const base: MonthlyPricePayload = {
    dates: ["2026-02-01", "2026-02-02"],
    close: [100, 101],
    open: [99, 100],
  };

  const updates: MonthlyPricePayload = {
    dates: ["2026-02-02", "2026-02-03"],
    close: [999, 102],
    open: [998, 101],
  };

  const merged = mergeMonthlyPayload(base, updates);

  assertDeepEqual(
    merged,
    {
      dates: ["2026-02-01", "2026-02-02", "2026-02-03"],
      close: [100, 999, 102],
      open: [99, 998, 101],
      high: undefined,
      low: undefined,
      volume: undefined,
    },
    "mergeMonthlyPayload should dedupe and keep latest",
  );

  const sliced = sliceMonthlyPayload(
    {
      dates: ["2026-02-03", "2026-02-01", "2026-02-02"],
      close: [103, 101, 102],
    },
    "2026-02-02",
    "2026-02-03",
  );

  assertDeepEqual(
    sliced,
    {
      dates: ["2026-02-02", "2026-02-03"],
      close: [102, 103],
      open: undefined,
      high: undefined,
      low: undefined,
      volume: undefined,
    },
    "sliceMonthlyPayload should return sorted range",
  );

  console.log("History blob tests passed");
})();
