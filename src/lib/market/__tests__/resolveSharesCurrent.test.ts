import { resolveCommonSharesCurrent } from '../resolveSharesCurrent.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. expected=${String(expected)} actual=${String(actual)}`);
  }
}

(function runResolveCommonSharesCurrentTests() {
  const fromBalance = resolveCommonSharesCurrent({
    balance: { commonStockSharesOutstanding: [null, 100, 120] },
    income: {
      weightedAverageShsOut: [90, 95, 99],
      weightedAverageShsOutDil: [91, 97, 101],
    },
  });
  assertEqual(fromBalance, 120, 'uses point-in-time common shares first');

  const fromIncomeBasic = resolveCommonSharesCurrent({
    balance: { commonStockSharesOutstanding: [null, null] },
    income: {
      weightedAverageShsOut: [null, 55],
      weightedAverageShsOutDil: [null, 66],
    },
  });
  assertEqual(fromIncomeBasic, 55, 'falls back to weightedAverageShsOut');

  const fromIncomeDiluted = resolveCommonSharesCurrent({
    balance: { commonStockSharesOutstanding: [null, null] },
    income: {
      weightedAverageShsOut: [null, null],
      weightedAverageShsOutDil: [40, 44],
    },
  });
  assertEqual(fromIncomeDiluted, 44, 'falls back to weightedAverageShsOutDil');

  const missing = resolveCommonSharesCurrent({
    balance: { commonStockSharesOutstanding: [0, null] },
    income: {
      weightedAverageShsOut: [null, null],
      weightedAverageShsOutDil: [NaN, null],
    },
  });
  assertEqual(missing, null, 'returns null when no positive finite candidate exists');

  console.log('resolveCommonSharesCurrent tests passed');
})();
