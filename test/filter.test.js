import test from 'node:test';
import assert from 'node:assert/strict';

import { getPath, parsePath, queryPath } from '../src/path.js';

const warenkorb = {
  positionen: [
    { sku: 'A1', preis: 9.99, lager: true, tags: ['sale'] },
    { sku: 'B2', preis: 24.5, lager: false, tags: [] },
    { sku: 'C3', preis: 24.5, lager: true },
  ],
};

test('Filter mit Vergleich filtert Array-Elemente', () => {
  assert.deepEqual(queryPath(warenkorb, 'positionen[?(@.preis > 10)].sku'), ['B2', 'C3']);
  assert.deepEqual(queryPath(warenkorb, 'positionen[?(@.preis <= 9.99)].sku'), ['A1']);
});

test('Filter mit Gleichheit auf Zahlen, Strings und Booleans', () => {
  assert.deepEqual(queryPath(warenkorb, 'positionen[?(@.preis == 24.5)].sku'), ['B2', 'C3']);
  assert.deepEqual(queryPath(warenkorb, 'positionen[?(@.sku == \'A1\')].sku'), ['A1']);
  assert.deepEqual(queryPath(warenkorb, 'positionen[?(@.lager == true)].sku'), ['A1', 'C3']);
});

test('Filter mit Ungleichheit', () => {
  assert.deepEqual(queryPath(warenkorb, 'positionen[?(@.sku != "A1")].sku'), ['B2', 'C3']);
});

test('Filter auf Existenz eines Feldes', () => {
  assert.deepEqual(queryPath(warenkorb, 'positionen[?(@.tags)].sku'), ['A1', 'B2']);
});

test('Filter ist mit weiteren Pfadteilen kombinierbar', () => {
  const data = { kunden: [{ name: 'Ada', bestellungen: [{ id: 1 }, { id: 2 }] }] };
  assert.deepEqual(queryPath(data, 'kunden[?(@.name == "Ada")].bestellungen[*].id'), [1, 2]);
});

test('Filter vergleicht nur kompatible Typen', () => {
  assert.deepEqual(queryPath(warenkorb, 'positionen[?(@.sku > 5)]'), []);
});

test('Filter ist im Token-Stream sichtbar', () => {
  assert.deepEqual(parsePath('a[?(@.x >= 2)]'), [
    { type: 'key', key: 'a' },
    { type: 'filter', field: 'x', op: '>=', value: 2 },
  ]);
});

test('kaputte Filter werden abgelehnt', () => {
  assert.throws(() => parsePath('a[?(@.x @ 2)]'), /Filter/);
  assert.throws(() => parsePath('a[?(@.x == foo)]'), /Ungültiger Wert/);
  assert.throws(() => parsePath('a[?]'), /Ungültiger Filter/);
});

test('getPath liefert den ersten Filtertreffer', () => {
  assert.equal(getPath(warenkorb, 'positionen[?(@.sku == "B2")].preis'), 24.5);
  assert.equal(getPath(warenkorb, 'positionen[?(@.sku == "Z9")].preis'), undefined);
});
