import test from 'node:test';
import assert from 'node:assert/strict';

import { mapDocument } from '../src/map.js';

const bestellung = {
  id: 'B-100',
  kunde: { vorname: '  Ada ', nachname: 'Lovelace', adresse: { stadt: 'London' } },
  positionen: [
    { sku: 'A1', preis: '9.99', menge: 2 },
    { sku: 'B2', preis: '4.50', menge: 1 },
  ],
  tags: ['neu', 'neu', 'express'],
};

test('einfache Pfad-Spec', () => {
  const { value, missing } = mapDocument(bestellung, { nummer: 'id', stadt: 'kunde.adresse.stadt' });
  assert.deepEqual(value, { nummer: 'B-100', stadt: 'London' });
  assert.deepEqual(missing, []);
});

test('verschachtelte Spec und from', () => {
  const { value } = mapDocument(bestellung, {
    id: 'id',
    kunde: { from: 'kunde', map: { vorname: 'vorname', nachname: 'nachname' } },
    stadt: { from: 'kunde.adresse', path: 'stadt' },
  });
  assert.deepEqual(value, {
    id: 'B-100',
    kunde: { vorname: '  Ada ', nachname: 'Lovelace' },
    stadt: 'London',
  });
});

test('Transformationen und Defaults', () => {
  const { value, warnings } = mapDocument(bestellung, {
    vorname: { path: 'kunde.vorname', transform: ['trim'] },
    nachname: { path: 'kunde.nachname', transform: 'upper' },
    land: { path: 'kunde.land', default: 'DE' },
    anzahl: { path: 'positionen', transform: ['length'] },
  });
  assert.deepEqual(value, { vorname: 'Ada', nachname: 'LOVELACE', land: 'DE', anzahl: 2 });
  assert.deepEqual(warnings, []);
});

test('each bildet Arrays ab', () => {
  const { value } = mapDocument(bestellung, {
    positionen: {
      from: 'positionen',
      each: { sku: 'sku', preis: { path: 'preis', transform: ['number'] }, menge: 'menge' },
    },
  });
  assert.deepEqual(value, {
    positionen: [
      { sku: 'A1', preis: 9.99, menge: 2 },
      { sku: 'B2', preis: 4.5, menge: 1 },
    ],
  });
});

test('Wildcard liefert ein Array', () => {
  const { value } = mapDocument(bestellung, { warenkorb: 'positionen[*].sku' });
  assert.deepEqual(value, { warenkorb: ['A1', 'B2'] });
});

test('fehlende Pfade werden gesammelt und weggelassen', () => {
  const { value, missing } = mapDocument(bestellung, { nummer: 'id', fehlt: 'kunde.telefon' });
  assert.deepEqual(value, { nummer: 'B-100' });
  assert.equal(missing.length, 1);
  assert.match(missing[0], /kunde\.telefon/);
});

test('onMissing: null setzt fehlende Felder auf null', () => {
  const { value } = mapDocument(bestellung, { fehlt: 'kunde.telefon' }, { onMissing: 'null' });
  assert.deepEqual(value, { fehlt: null });
});

test('onMissing: error bricht ab', () => {
  assert.throws(
    () => mapDocument(bestellung, { fehlt: 'gibt.es.nicht' }, { onMissing: 'error' }),
    /Fehlende Pfade \(strict\)/,
  );
});

test('unbekannte Transformation wird zur Warnung, nicht zum Abbruch', () => {
  const { value, warnings } = mapDocument(bestellung, { id: { path: 'id', transform: ['gibtsnicht'] } });
  assert.deepEqual(value, { id: 'B-100' });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /unbekannte Transformation/);
});

test('fehlerhafte Transformation behält den Originalwert', () => {
  const { value, warnings } = mapDocument({ a: 'keine-zahl' }, { a: { path: 'a', transform: ['number'] } });
  assert.deepEqual(value, { a: 'keine-zahl' });
  assert.match(warnings[0], /keine Zahl/);
});

test('mehrere Transformationen laufen in Reihenfolge', () => {
  const { value } = mapDocument({ a: ' 12 ' }, { a: { path: 'a', transform: ['trim', 'int'] } });
  assert.deepEqual(value, { a: 12 });
});

test('Literal-Werte in der Spec bleiben erhalten', () => {
  const { value } = mapDocument(bestellung, { version: 2, aktiv: true, quelle: { value: 'shop' } });
  assert.deepEqual(value, { version: 2, aktiv: true, quelle: 'shop' });
});

test('Array-Template in der Spec', () => {
  const { value } = mapDocument({ a: 1 }, { liste: ['a', 'gibt.es.nicht'] });
  assert.deepEqual(value, { liste: [1] });
});

test('each auf einem Nicht-Array warnt', () => {
  const { value, warnings } = mapDocument({ a: 1 }, { liste: { from: 'a', each: { x: 'x' } } });
  assert.equal(value.liste, undefined);
  assert.match(warnings[0], /"each" erwartet ein Array/);
});
