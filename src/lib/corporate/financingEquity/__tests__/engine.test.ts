import { computeCorporateEquityFinancing } from '../engine.ts';
import type { CorporateEquityFinancingInput } from '../types.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertApproxEqual(actual: number, expected: number, epsilon: number, message: string): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertThrows(fn: () => void, message: string): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

function makeBaseInput(): CorporateEquityFinancingInput {
  return {
    shares_current: 1000,
    equityNeeded_TargetCurrency: 100,
    equityRaisePrice_TargetCurrency_perShare: 3,
  };
}

(function runCorporateEquityFinancingTests() {
  const happy = computeCorporateEquityFinancing(makeBaseInput());
  assertEqual(happy.newShares, 34, 'happy path should round up to whole shares by default');
  assertEqual(happy.shares_post_financing, 1034, 'happy path should compute post-financing shares');

  const noRounding = computeCorporateEquityFinancing({
    ...makeBaseInput(),
    roundToWholeShares: false,
  });
  assertApproxEqual(noRounding.newShares as number, 100 / 3, 1e-12, 'no rounding should keep fractional new shares');
  assertApproxEqual(
    noRounding.shares_post_financing as number,
    1000 + 100 / 3,
    1e-12,
    'no rounding should keep fractional post-financing shares',
  );

  const zeroRaise = computeCorporateEquityFinancing({
    ...makeBaseInput(),
    equityNeeded_TargetCurrency: 0,
  });
  assertEqual(zeroRaise.newShares, 0, 'zero raise should issue zero new shares');
  assertEqual(
    zeroRaise.shares_post_financing,
    1000,
    'zero raise should keep post-financing shares equal to current shares',
  );

  assertThrows(
    () =>
      computeCorporateEquityFinancing({
        ...makeBaseInput(),
        shares_current: 0,
      }),
    'shares_current <= 0 should throw',
  );

  assertThrows(
    () =>
      computeCorporateEquityFinancing({
        ...makeBaseInput(),
        equityNeeded_TargetCurrency: -1,
      }),
    'equityNeeded_TargetCurrency < 0 should throw',
  );

  assertThrows(
    () =>
      computeCorporateEquityFinancing({
        ...makeBaseInput(),
        equityRaisePrice_TargetCurrency_perShare: 0,
      }),
    'equityRaisePrice_TargetCurrency_perShare <= 0 should throw',
  );

  const nullPropagation = computeCorporateEquityFinancing({
    ...makeBaseInput(),
    equityNeeded_TargetCurrency: null,
  });
  assertEqual(nullPropagation.newShares, null, 'null equityNeeded should propagate to null newShares');
  assertEqual(
    nullPropagation.shares_post_financing,
    null,
    'null equityNeeded should propagate to null post-financing shares',
  );

  console.log('Corporate equity financing engine tests passed');
})();
