import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeJson } from '../src/merge.js';

test('Objekte werden rekursiv zusammengeführt', () => {
  assert.deepEqual(
    mergeJson({ a: { x: 1, y: 2 }, b: 1 }, { a: { y: 3 }, c: 2 }),
    { a: { x: 1, y: 3 }, b: 1, c: 2 },
  );
});

test('die Basis bleibt unverändert', () => {
  const base = { a: { x: 1 } };
  mergeJson(base, { a: { y: 2 } });
  assert.deepEqual(base, { a: { x: 1 } });
});

test('Arrays werden standardmäßig ersetzt', () => {
  assert.deepEqual(mergeJson({ l: [1, 2, 3] }, { l: [9] }), { l: [9] });
});

test('arrays: concat hängt an', () => {
  assert.deepEqual(mergeJson({ l: [1, 2] }, { l: [3] }, { arrays: 'concat' }), { l: [1, 2, 3] });
});

test('arrays: merge führt elementweise zusammen', () => {
  assert.deepEqual(
    mergeJson({ l: [{ a: 1 }, { b: 2 }] }, { l: [{ c: 3 }] }, { arrays: 'merge' }),
    { l: [{ a: 1, c: 3 }, { b: 2 }] },
  );
});

test('undefined im Patch löscht Schlüssel', () => {
  const patch = { a: undefined };
  assert.deepEqual(mergeJson({ a: 1, b: 2 }, patch), { b: 2 });
});

test('Skalare werden überschrieben', () => {
  assert.deepEqual(mergeJson({ a: 1 }, { a: 'x' }), { a: 'x' });
  assert.deepEqual(mergeJson({ a: { x: 1 } }, { a: 'x' }), { a: 'x' });
});

test('ungültige Array-Strategie wird abgelehnt', () => {
  assert.throws(() => mergeJson({}, {}, { arrays: 'quatsch' }), /arrays muss/);
});
