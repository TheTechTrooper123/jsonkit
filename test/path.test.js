import test from 'node:test';
import assert from 'node:assert/strict';

import { getPath, parsePath, queryPath } from '../src/path.js';

test('parsePath zerlegt einfache und verschachtelte Schlüssel', () => {
  assert.deepEqual(parsePath('a.b.c'), [
    { type: 'key', key: 'a' },
    { type: 'key', key: 'b' },
    { type: 'key', key: 'c' },
  ]);
});

test('parsePath unterstützt Wurzelpräfix, Indizes und Wildcards', () => {
  assert.deepEqual(parsePath('$.items[0].sku'), [
    { type: 'key', key: 'items' },
    { type: 'index', index: 0 },
    { type: 'key', key: 'sku' },
  ]);
  assert.deepEqual(parsePath('items[-1]'), [
    { type: 'key', key: 'items' },
    { type: 'index', index: -1 },
  ]);
  assert.deepEqual(parsePath('items[*].id'), [
    { type: 'key', key: 'items' },
    { type: 'wildcard' },
    { type: 'key', key: 'id' },
  ]);
  assert.deepEqual(parsePath('items.*.id'), [
    { type: 'key', key: 'items' },
    { type: 'wildcard' },
    { type: 'key', key: 'id' },
  ]);
});

test('parsePath unterstützt Schlüssel mit Punkten in Klammern', () => {
  assert.deepEqual(parsePath('a["b.c"]'), [
    { type: 'key', key: 'a' },
    { type: 'key', key: 'b.c' },
  ]);
});

test('parsePath lehnt kaputte Ausdrücke ab', () => {
  assert.throws(() => parsePath('a['), /Fehlende schließende Klammer/);
  assert.throws(() => parsePath('a[]'), /Ungültiger Ausdruck/);
  assert.throws(() => parsePath('a[?]'), /Ungültiger Filter/);
  assert.throws(() => parsePath('$x'), /"\$" muss/);
});

test('queryPath findet verschachtelte Werte und Wildcards', () => {
  const data = {
    user: { name: 'Ada', tags: ['a', 'b'] },
    items: [{ sku: 'A1' }, { sku: 'B2' }, {}],
  };

  assert.deepEqual(queryPath(data, 'user.name'), ['Ada']);
  assert.deepEqual(queryPath(data, 'items[*].sku'), ['A1', 'B2']);
  assert.deepEqual(queryPath(data, 'user.tags[-1]'), ['b']);
  assert.deepEqual(queryPath(data, 'unbekannt.pfad'), []);
});

test('Wildcard auf Objekten liefert alle Werte', () => {
  assert.deepEqual(queryPath({ a: 1, b: 2 }, '*'), [1, 2]);
});

test('getPath liefert den ersten Treffer oder undefined', () => {
  const data = { a: { b: [10, 20] } };
  assert.equal(getPath(data, 'a.b[1]'), 20);
  assert.equal(getPath(data, 'a.b[5]'), undefined);
  assert.equal(getPath(data, 'a.c'), undefined);
  assert.equal(getPath(null, 'a'), undefined);
});
