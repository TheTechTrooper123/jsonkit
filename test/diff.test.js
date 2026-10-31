import test from 'node:test';
import assert from 'node:assert/strict';

import { diffJson, hasDiff } from '../src/diff.js';

test('identische Werte ergeben keine Änderungen', () => {
  assert.deepEqual(diffJson({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), []);
  assert.equal(hasDiff({ a: 1 }, { a: 1 }), false);
});

test('geänderte, neue und entfernte Schlüssel werden erkannt', () => {
  const changes = diffJson({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
  assert.deepEqual(changes, [
    { path: '$.b', type: 'change', before: 2, after: 3 },
    { path: '$.c', type: 'add', after: 4 },
  ]);

  assert.deepEqual(diffJson({ a: 1 }, {}), [{ path: '$.a', type: 'remove', before: 1 }]);
});

test('verschachtelte Pfade werden korrekt benannt', () => {
  const changes = diffJson({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } });
  assert.deepEqual(changes, [{ path: '$.a.b.c', type: 'change', before: 1, after: 2 }]);
});

test('Arrays vergleichen nach Index und erkennen Längenunterschiede', () => {
  assert.deepEqual(diffJson([1, 2, 3], [1, 3]), [
    { path: '$[1]', type: 'change', before: 2, after: 3 },
    { path: '$[2]', type: 'remove', before: 3 },
  ]);
  assert.deepEqual(diffJson([1], [1, 2]), [{ path: '$[1]', type: 'add', after: 2 }]);
});

test('Objekt gegen Array ist eine Änderung, kein struktureller Vergleich', () => {
  assert.deepEqual(diffJson({ a: 1 }, [1]), [{ path: '$', type: 'change', before: { a: 1 }, after: [1] }]);
});

test('null und fehlender Schlüssel werden unterschieden', () => {
  assert.deepEqual(diffJson({ a: null }, {}), [{ path: '$.a', type: 'remove', before: null }]);
  assert.deepEqual(diffJson({ a: null }, { a: 0 }), [{ path: '$.a', type: 'change', before: null, after: 0 }]);
});

test('hasDiff erkennt Unterschiede', () => {
  assert.equal(hasDiff({ a: 1 }, { a: 2 }), true);
  assert.equal(hasDiff([1, 2], [1, 2]), false);
});
