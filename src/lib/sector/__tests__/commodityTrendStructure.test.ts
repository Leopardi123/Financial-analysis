import { buildCommodityTrendStructure } from '../commodityTrendStructure.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function buildMonthlyPoints(values: number[]): Array<{ date: string; value: number }> {
  const points: Array<{ date: string; value: number }> = [];
  const cursor = new Date('2021-01-01');
  for (const value of values) {
    points.push({ date: cursor.toISOString().slice(0, 10), value });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return points;
}

(function runCommodityTrendStructureTests() {
  const deceleratingButBullishValues: number[] = [];
  let value = 100;
  for (let i = 0; i < 30; i += 1) {
    if (i < 20) value += 1.2;
    else if (i < 28) value += 2.2;
    else if (i === 28) value += 1.4;
    else value -= 0.6;
    deceleratingButBullishValues.push(Number(value.toFixed(2)));
  }

  const deceleratingModel = buildCommodityTrendStructure(buildMonthlyPoints(deceleratingButBullishValues), 60);
  assertEqual(deceleratingModel.trendStructureState, 'bullish_aligned', 'should keep bullish structure when moving averages remain aligned');
  assertEqual(deceleratingModel.trendMomentumState, 'decelerating', 'should detect decelerating momentum from latest short spread datapoints');
  assertEqual(
    deceleratingModel.expansionInterpretation,
    'Trenden är fortsatt positiv, men kortsiktig momentum avtar. Detta kan indikera att trendexpansionen mattas av.',
    'should use deceleration text when bullish structure is intact but momentum slows',
  );
  assert(!deceleratingModel.expansionInterpretation.toLowerCase().includes('trenden stärks'), 'decelerating text must not claim strengthening trend');
  assert(!deceleratingModel.expansionInterpretation.toLowerCase().includes('divergerar'), 'decelerating text must not claim divergence expansion');

  const acceleratingModel = buildCommodityTrendStructure(buildMonthlyPoints(Array.from({ length: 30 }, (_, i) => 100 + i * i * 0.2)), 60);
  assertEqual(acceleratingModel.trendMomentumState, 'accelerating', 'should mark momentum as accelerating when short spread rises at latest datapoint');

  console.log('commodityTrendStructure tests passed');
})();
