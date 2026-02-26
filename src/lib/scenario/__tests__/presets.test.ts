import { buildPriceScenarioSetFromSpot } from '../presets.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function normalize(value: unknown): unknown {
  if (typeof value === 'number') {
    return Math.abs(value) < 1e-12 ? 0 : Number(value.toFixed(10));
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalize(entry));
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      out[key] = normalize(entry);
    }

    return out;
  }

  return value;
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  const normalizedActual = normalize(actual);
  const normalizedExpected = normalize(expected);
  const actualJson = JSON.stringify(normalizedActual);
  const expectedJson = JSON.stringify(normalizedExpected);

  if (actualJson !== expectedJson) {
    throw new Error(`${message}. Expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertThrows(fn: () => void, pattern: RegExp, message: string): void {
  let thrown: unknown;

  try {
    fn();
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof Error, `${message}. Expected function to throw`);
  assert(pattern.test((thrown as Error).message), `${message}. Error message did not match pattern`);
}

(function runPresetTests() {
  const happy = buildPriceScenarioSetFromSpot(
    {
      Au: [10, 12],
    },
    {
      masterN: 1,
      lowMultiplier: 0.8,
      highMultiplier: 1.2,
    },
  );

  assertEqual(happy.LOW.Au, [8, 9.6], 'Happy path LOW should be derived from defaults');
  assertEqual(happy.HIGH.Au, [12, 14.4], 'Happy path HIGH should be derived from defaults');

  const overridden = buildPriceScenarioSetFromSpot(
    {
      Au: [10, 12],
    },
    {
      masterN: 1,
      lowMultiplier: 0.8,
      highMultiplier: 1.2,
      perMetal: {
        Au: { low: 0.7, high: 1.3 },
      },
    },
  );

  assertEqual(overridden.LOW.Au?.[0], 7, 'Per-metal low override should be applied');
  assertEqual(overridden.HIGH.Au?.[0], 13, 'Per-metal high override should be applied');

  const withNull = buildPriceScenarioSetFromSpot(
    {
      Au: [10, null],
    },
    {
      masterN: 1,
      lowMultiplier: 0.8,
      highMultiplier: 1.2,
    },
  );

  assertEqual(withNull.LOW.Au?.[1], null, 'Null spot should propagate to LOW');
  assertEqual(withNull.HIGH.Au?.[1], null, 'Null spot should propagate to HIGH');

  assertThrows(
    () =>
      buildPriceScenarioSetFromSpot(
        {
          Au: [10, 11],
        },
        {
          masterN: 0,
          lowMultiplier: 0.8,
          highMultiplier: 1.2,
        },
      ),
    /metal Au/,
    'Length mismatch should throw',
  );

  assertThrows(
    () =>
      buildPriceScenarioSetFromSpot(
        {
          Au: [10, -1],
        },
        {
          masterN: 1,
          lowMultiplier: 0.8,
          highMultiplier: 1.2,
        },
      ),
    /cannot be negative/,
    'Negative spot should throw',
  );

  console.log('Scenario preset tests passed');
})();
