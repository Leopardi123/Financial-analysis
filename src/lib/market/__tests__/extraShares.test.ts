import assert from 'node:assert/strict';
import test from 'node:test';
import { extraSharesStorageKey, formatExtraSharesInput, parseExtraShares } from '../extraShares.ts';

test('extra shares accepts arbitrary non-negative integer digits and treats empty as zero', () => {
  assert.equal(parseExtraShares(''), 0);
  assert.equal(parseExtraShares('1 234 567'), 1_234_567);
  assert.equal(parseExtraShares('-12'), 12);
  assert.equal(formatExtraSharesInput('1234567').replace(/\D/g, ''), '1234567');
});

test('project and consolidated corporate values have separate persistent keys', () => {
  assert.notEqual(extraSharesStorageKey('project', 'abc', 'p1'), extraSharesStorageKey('project', 'abc', 'p2'));
  assert.notEqual(extraSharesStorageKey('project', 'abc', 'p1'), extraSharesStorageKey('corporate', 'abc'));
});
