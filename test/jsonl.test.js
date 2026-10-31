import test from 'node:test';
import assert from 'node:assert/strict';

import { parseJsonl, stringifyJsonl } from '../src/jsonl.js';

test('parseJsonl liest einen Wert pro Zeile', () => {
  assert.deepEqual(parseJsonl('{"a":1}\n{"a":2}\n'), [{ a: 1 }, { a: 2 }]);
});

test('parseJsonl überspringt Leerzeilen und versteht CRLF', () => {
  assert.deepEqual(parseJsonl('{"a":1}\r\n\r\n{"a":2}'), [{ a: 1 }, { a: 2 }]);
});

test('parseJsonl liefert bei leerer Eingabe ein leeres Array', () => {
  assert.deepEqual(parseJsonl('  \n\n'), []);
});

test('Fehler nennen die betroffene Zeile', () => {
  try {
    parseJsonl('{"a":1}\n{"a":\n');
    assert.fail('Fehler erwartet');
  } catch (error) {
    assert.match(error.message, /Zeile 2/);
  }
});

test('stringifyJsonl schreibt kompakte Zeilen', () => {
  assert.equal(stringifyJsonl([{ a: 1 }, [1, 2]]), '{"a":1}\n[1,2]\n');
});

test('stringifyJsonl kann Schlüssel sortieren', () => {
  assert.equal(stringifyJsonl([{ b: 1, a: 2 }], { sortKeys: true }), '{"a":2,"b":1}\n');
});

test('stringifyJsonl mit leerem Array ergibt leeren String', () => {
  assert.equal(stringifyJsonl([]), '');
});

test('Roundtrip über JSONL', () => {
  const values = [{ a: 1 }, { b: [true, null] }];
  assert.deepEqual(parseJsonl(stringifyJsonl(values)), values);
});
