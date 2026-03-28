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
  assertEqual(deceleratingModel.trendExpansionState, 'expanding', 'should keep expansion state expanding when spread level is still expanding overall');
  assertEqual(deceleratingModel.trendMomentumState, 'decelerating', 'should detect decelerating momentum from latest short spread datapoints');
  assertEqual(
    deceleratingModel.expansionInterpretation,
    'Den långsiktiga trendstrukturen är fortsatt positiv, men kortsiktig momentum avtar.',
    'should synthesize long direction and short momentum when structure is bullish and momentum slows',
  );
  assertEqual(deceleratingModel.longTrendDirection, 'up', 'long direction should be up for bullish aligned structure');
  assertEqual(deceleratingModel.shortTrendMomentum, 'decelerating', 'short momentum should be decelerating when latest spread delta is negative');
  assert(deceleratingModel.expansionInfoLines.includes('Trenden är stark men tappar momentum.'), 'summary line should mention strong trend but fading momentum');
  assert(!deceleratingModel.expansionInterpretation.toLowerCase().includes('trenden stärks'), 'decelerating text must not claim strengthening trend');
  assert(!deceleratingModel.expansionInterpretation.toLowerCase().includes('expansionen ökar'), 'decelerating text must not claim increasing expansion');

  const acceleratingModel = buildCommodityTrendStructure(buildMonthlyPoints(Array.from({ length: 30 }, (_, i) => 100 + i * i * 0.2)), 60);
  assertEqual(acceleratingModel.trendMomentumState, 'accelerating', 'should mark momentum as accelerating when short spread rises at latest datapoint');

  console.log('commodityTrendStructure tests passed');
})();
