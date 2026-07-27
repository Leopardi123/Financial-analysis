import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCorporateMilestoneYear } from '../corporateMilestoneYear.ts';

const valuationYears = [2026, 2027, 2028, 2029, 2030, 2031, 2032];
const internalCorporateYears = [2025, 2026, 2027, 2028, 2029, 2030, 2031];

test('corporate milestone labels prefer explicit production years over the internal corporate axis', () => {
  const south = resolveCorporateMilestoneYear({ tp: 3, corporateTpIndexUsed: 3, yearLabelUsed: '2029' }, valuationYears);
  const north = resolveCorporateMilestoneYear({ tp: 6, corporateTpIndexUsed: 6, yearLabelUsed: '2032' }, valuationYears);

  assert.equal(south, '2029');
  assert.equal(north, '2032');
  assert.notEqual(south, String(internalCorporateYears[3]));
  assert.notEqual(north, String(internalCorporateYears[6]));
});

test('corporate milestone labels fall back to the valuation axis', () => {
  assert.equal(resolveCorporateMilestoneYear({ tp: 3, corporateTpIndexUsed: 3 }, valuationYears), '2029');
  assert.equal(resolveCorporateMilestoneYear({ tp: 6, corporateTpIndexUsed: 6 }, valuationYears), '2032');
});
