import test from 'node:test';
import assert from 'node:assert/strict';

import { rowHasDisplayValue } from '../rowDisplayValue.ts';

test('row with at least one positive number is displayed', () => {
  assert.equal(rowHasDisplayValue([0, 0, 125000, 0]), true);
});

test('row with at least one negative number is displayed', () => {
  assert.equal(rowHasDisplayValue([0, null, -17.5, 0]), true);
});

test('row with only zeros is hidden', () => {
  assert.equal(rowHasDisplayValue([0, 0, 0, 0]), false);
});

test('row with mixed null and zero is hidden', () => {
  assert.equal(rowHasDisplayValue([0, null, 0, null]), false);
});

test('row with text value is displayed', () => {
  assert.equal(rowHasDisplayValue(['', '', 'PEA', '']), true);
});

test('row with only empty strings is hidden', () => {
  assert.equal(rowHasDisplayValue(['', '   ', '']), false);
});
