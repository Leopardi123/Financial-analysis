import test from 'node:test';
import assert from 'node:assert/strict';
import { introspectSnapshot } from '../introspect.ts';

test('introspectSnapshot handles scalar, array, and object keys', () => {
  const shape = introspectSnapshot({
    zString: 'x',
    aNumber: 10,
    bObject: { nested: true },
    cArray: [1, null, 3],
    dBool: false,
    eNull: null,
  });

  assert.deepEqual(shape.scalarKeys, ['aNumber', 'bObject.nested', 'dBool', 'eNull', 'zString']);
  assert.deepEqual(shape.objectKeys, ['bObject']);
  assert.deepEqual(shape.arrayKeys, ['cArray']);
  assert.equal(shape.arrayValueTypes.cArray, 'number|null');
});

test('introspectSnapshot classifies non-finite numbers as null', () => {
  const shape = introspectSnapshot({
    finite: 1,
    infinity: Number.POSITIVE_INFINITY,
    notANumber: Number.NaN,
  });

  assert.deepEqual(shape.scalarKeys, ['finite', 'infinity', 'notANumber']);
  assert.equal(shape.notes.length, 2);
  assert.match(shape.notes[0], /non-finite number/);
});

test('introspectSnapshot output is stable and sorted alphabetically', () => {
  const shape = introspectSnapshot({
    zebra: [1, 2],
    alpha: { ok: true },
    middle: 'value',
  });

  assert.deepEqual(shape.scalarKeys, ['alpha.ok', 'middle']);
  assert.deepEqual(shape.objectKeys, ['alpha']);
  assert.deepEqual(shape.arrayKeys, ['zebra']);
});
