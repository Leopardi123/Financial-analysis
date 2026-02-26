import { convertMass, convertPreciousQuantity, convertPriceUnit } from "../units.ts";

function assertApproxEqual(actual: number | null, expected: number, tolerance: number, message: string): void {
  if (actual === null || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

(function runUnitConversionTests() {
  assertApproxEqual(convertMass(1, "short_ton", "tonne"), 0.90718474, 1e-10, "short_ton to tonne");
  assertApproxEqual(convertPreciousQuantity(1, "toz", "g"), 31.1034768, 1e-10, "toz to g");

  const usdPerTonne = 10000;
  const usdPerLb = convertPriceUnit(usdPerTonne, "USD_per_tonne", "USD_per_lb");
  const roundTrip = convertPriceUnit(usdPerLb as number, "USD_per_lb", "USD_per_tonne");

  assertApproxEqual(roundTrip, usdPerTonne, 1e-8, "USD_per_tonne and USD_per_lb roundtrip");
  assert(convertPriceUnit(Number.NaN, "USD_per_lb", "USD_per_tonne") === null, "non-finite inputs should return null");

  let threw = false;
  try {
    convertMass(1, "lb", "stone" as never);
  } catch {
    threw = true;
  }
  assert(threw, "unknown units should throw");

  console.log("Price units tests passed");
})();
