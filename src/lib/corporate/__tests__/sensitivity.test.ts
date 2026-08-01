import assert from 'node:assert/strict';
import test from 'node:test';
import { CORPORATE_METAL_PRICE_MULTIPLIERS, classifyCorporateScenario, corporateScenarioLabel, createCorporateMetalPriceScenarioRequest } from '../sensitivity.ts';

test('defines exactly the seven requested scenarios and labels', () => {
  assert.deepEqual(CORPORATE_METAL_PRICE_MULTIPLIERS, [0.75, 0.85, 0.95, 1, 1.05, 1.15, 1.25]);
  assert.equal(corporateScenarioLabel(0.75), 'Spot −25 %');
  assert.equal(corporateScenarioLabel(1), 'Spot');
  assert.equal(corporateScenarioLabel(1.25), 'Spot +25 %');
});

test('scenario requests are isolated and do not mutate base or each other', () => {
  const base = { scenario: { mode: 'spot' }, fx: { source: 'auto' }, projects: [{ id: 'a' }] };
  const low = createCorporateMetalPriceScenarioRequest(base, 0.75);
  const high = createCorporateMetalPriceScenarioRequest(base, 1.25);
  assert.deepEqual(base.scenario, { mode: 'spot' });
  assert.deepEqual(low.scenario, { mode: 'spot', spotPriceMultiplier: 0.75 });
  assert.deepEqual(high.scenario, { mode: 'spot', spotPriceMultiplier: 1.25 });
  assert.notEqual(low, high);
});

test('strict diagnostics classify missing inputs without a numeric fallback', () => {
  assert.equal(classifyCorporateScenario(null), 'COMPUTABLE');
  assert.equal(classifyCorporateScenario({ warnings: ['missing resolved spot price: Au'] }), 'PARTIAL');
  assert.equal(classifyCorporateScenario({ errors: ['invalid shares'] }), 'NOT_COMPUTABLE');
});
