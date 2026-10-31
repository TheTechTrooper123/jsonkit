import test from 'node:test';
import assert from 'node:assert/strict';

import { deletePath, flattenJson, setPath, unflattenJson } from '../src/mutate.js';

test('setPath setzt einen vorhandenen Schlüssel', () => {
  const source = { a: { b: 1, c: 2 } };
  assert.deepEqual(setPath(source, 'a.b', 99), { a: { b: 99, c: 2 } });
  assert.deepEqual(source, { a: { b: 1, c: 2 } }, 'Eingabe bleibt unverändert');
});

test('setPath legt fehlende Container an', () => {
  assert.deepEqual(setPath({}, 'a.b.c', 1), { a: { b: { c: 1 } } });
  assert.deepEqual(setPath({ a: 1 }, 'a.b', 2), { a: { b: 2 } });
});

test('setPath arbeitet mit Array-Indizes inklusive negativer', () => {
  assert.deepEqual(setPath({ a: [1, 2] }, 'a[0]', 9), { a: [9, 2] });
  assert.deepEqual(setPath({ a: [1, 2] }, 'a[-1]', 9), { a: [1, 9] });
  assert.deepEqual(setPath({}, 'a[1]', 'x'), { a: [null, 'x'] });
});

test('setPath ersetzt die Wurzel bei leerem Pfad', () => {
  assert.deepEqual(setPath({ a: 1 }, '$', { neu: true }), { neu: true });
});

test('setPath lehnt Wildcards ab', () => {
  assert.throws(() => setPath({ a: [1] }, 'a[*]', 2), /keine Wildcard/);
});

test('setPath lehnt negative Indizes unterhalb des Anfangs ab', () => {
  assert.throws(() => setPath({ a: [1] }, 'a[-3]', 2), /Negativer Index/);
});

test('deletePath entfernt Schlüssel und Array-Elemente', () => {
  assert.deepEqual(deletePath({ a: 1, b: 2 }, 'a'), { b: 2 });
  assert.deepEqual(deletePath({ a: [1, 2, 3] }, 'a[1]'), { a: [1, 3] });
  assert.deepEqual(deletePath({ a: [1, 2] }, 'a[-1]'), { a: [1] });
});

test('deletePath ignoriert fehlende Pfade', () => {
  const source = { a: 1 };
  assert.deepEqual(deletePath(source, 'x.y'), source);
  assert.deepEqual(deletePath(source, 'a.b'), source);
});

test('deletePath verändert die Eingabe nicht', () => {
  const source = { a: { b: 1 } };
  deletePath(source, 'a.b');
  assert.deepEqual(source, { a: { b: 1 } });
});

test('flattenJson macht aus verschachtelten Strukturen flache Schlüssel', () => {
  assert.deepEqual(flattenJson({ a: { b: 1, c: [2, { d: 3 }] } }), {
    'a.b': 1,
    'a.c.0': 2,
    'a.c.1.d': 3,
  });
});

test('flattenJson behält leere Container', () => {
  assert.deepEqual(flattenJson({ a: {}, b: [], c: 1 }), { a: {}, b: [], c: 1 });
});

test('flattenJson unterstützt eigene Trenner', () => {
  assert.deepEqual(flattenJson({ a: { b: 1 } }, { separator: '/' }), { 'a/b': 1 });
});

test('unflattenJson baut die Struktur wieder auf, inklusive Arrays', () => {
  assert.deepEqual(
    unflattenJson({ 'a.b': 1, 'a.c.0': 2, 'a.c.1.d': 3 }),
    { a: { b: 1, c: [2, { d: 3 }] } },
  );
});

test('flatten und unflatten sind zueinander invers', () => {
  const value = { a: { b: 1 }, liste: [{ x: 1 }, { y: [true, null] }] };
  assert.deepEqual(unflattenJson(flattenJson(value)), value);
});

test('unflattenJson erkennt Konflikte', () => {
  assert.throws(() => unflattenJson({ a: 1, 'a.b': 2 }), /Konflikt beim Unflatten/);
});

test('unflattenJson arbeitet mit eigenem Trenner', () => {
  assert.deepEqual(unflattenJson({ 'a/b': 1 }, { separator: '/' }), { a: { b: 1 } });
});
