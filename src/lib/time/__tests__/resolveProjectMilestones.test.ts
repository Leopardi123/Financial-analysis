import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProjectMilestonesV2 } from '../resolveProjectMilestones.ts';

test('legacy project defaults commercial and valuation milestones to first production', () => {
  const resolved = resolveProjectMilestonesV2({ masterN: 10, productionStartPeriod: 2 });
  assert.deepEqual(resolved, {
    firstProductionPeriod: 2,
    commercialProductionPeriod: 2,
    valuationMilestonePeriod: 2,
  });
});

test('commissioning can precede commercial production and the valuation milestone', () => {
  const resolved = resolveProjectMilestonesV2({
    masterN: 11,
    productionStartPeriod: 0,
    commercialProductionPeriod: 1,
    valuationMilestonePeriod: 1,
  });
  assert.deepEqual(resolved, {
    firstProductionPeriod: 0,
    commercialProductionPeriod: 1,
    valuationMilestonePeriod: 1,
  });
});

test('valuation milestone defaults to commercial production when commercial is explicit', () => {
  const resolved = resolveProjectMilestonesV2({
    masterN: 8,
    productionStartPeriod: 1,
    commercialProductionPeriod: 3,
  });
  assert.equal(resolved.valuationMilestonePeriod, 3);
});

test('rejects commercial production before first physical production', () => {
  assert.throws(
    () => resolveProjectMilestonesV2({ masterN: 8, productionStartPeriod: 2, commercialProductionPeriod: 1 }),
    /commercialProductionPeriod must be >= productionStartPeriod/,
  );
});

test('rejects milestones outside the modeled period range', () => {
  assert.throws(
    () => resolveProjectMilestonesV2({ masterN: 8, productionStartPeriod: 2, commercialProductionPeriod: 9 }),
    /commercialProductionPeriod must be <= masterN/,
  );
  assert.throws(
    () => resolveProjectMilestonesV2({ masterN: 8, productionStartPeriod: 2, valuationMilestonePeriod: 9 }),
    /valuationMilestonePeriod must be <= masterN/,
  );
});
