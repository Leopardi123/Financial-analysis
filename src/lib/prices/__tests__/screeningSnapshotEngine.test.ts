import { computePriceScreenSnapshot, type DailyPriceRow } from "../screening/snapshotEngine.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function buildRows(symbol: string, count: number): DailyPriceRow[] {
  const rows: DailyPriceRow[] = [];
  const start = new Date("2024-01-01T00:00:00Z");
  for (let i = 0; i < count; i += 1) {
    const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    rows.push({
      symbol,
      price_date: date,
      close: 100 + i,
      adjusted_close: null,
      volume: 1000 + i,
      source: "fmp",
      currency: "USD",
    });
  }
  return rows;
}

(function run() {
  const enoughRows = buildRows("AAPL", 80);
  const result = computePriceScreenSnapshot("AAPL", enoughRows);

  assert(result.snapshot.last_close === 179, "last close should equal latest close");
  assert(result.snapshot.return_5d !== null, "return_5d should be present with enough history");
  assert(result.snapshot.return_20d !== null, "return_20d should be present with enough history");
  assert(result.snapshot.return_60d !== null, "return_60d should be present with enough history");
  assert(result.snapshot.ma20 !== null, "ma20 should be present");
  assert(result.snapshot.ma50 !== null, "ma50 should be present");
  assert(result.snapshot.high_60d !== null, "high_60d should be present");
  assert(result.snapshot.high_252d === null, "high_252d should be null with only 80 rows");
  assert(result.snapshot.drawdown_252d === null, "drawdown_252d should be null with only 80 rows");
  assert(result.snapshot.trend_state !== null, "trend state should be resolved");
  assert(result.snapshot.recovery_state !== null, "recovery state should be resolved");

  const shortRows = buildRows("MSFT", 10);
  const shortResult = computePriceScreenSnapshot("MSFT", shortRows);
  assert(shortResult.snapshot.return_20d === null, "return_20d should be null with short history");
  assert(shortResult.snapshot.drawdown_252d === null, "drawdown_252d should be null with short history");
  assert(shortResult.snapshot.ma50 === null, "ma50 should be null with short history");
  assert(shortResult.debug.null_reasons.return_20d === "insufficient_history_min_21", "debug should expose return_20d null reason");

  console.log("screeningSnapshotEngine tests passed");
})();
