import test from 'node:test';
import assert from 'node:assert/strict';

import { parseJsonc, stripComments, stripTrailingCommas } from '../src/jsonc.js';
import { JsonSyntaxError } from '../src/parse.js';

test('Zeilkommentare werden entfernt', () => {
  assert.equal(stripComments('{ // hallo\n"a": 1}').replace(/\s+/g, ''), '{"a":1}');
});

test('Blockkommentare werden entfernt, Zeilen bleiben erhalten', () => {
  const result = stripComments('{\n/* a\nb */\n"a": 1}');
  assert.equal(result.split('\n').length, 4);
  assert.equal(result.replace(/\s+/g, ''), '{"a":1}');
});

test('Kommentarzeichen in Zeichenketten bleiben erhalten', () => {
  assert.equal(stripComments('{"url": "https://example.com/x"}'), '{"url": "https://example.com/x"}');
  assert.equal(stripComments('{"text": "/* kein Kommentar */"}'), '{"text": "/* kein Kommentar */"}');
});

test('escapte Anführungszeichen beenden die Zeichenkette nicht', () => {
  assert.equal(stripComments('{"a": "x\\"y // z"}'), '{"a": "x\\"y // z"}');
});

test('Trailing Commas vor } und ] werden entfernt', () => {
  assert.equal(stripTrailingCommas('{"a": 1,}'), '{"a": 1}');
  assert.equal(stripTrailingCommas('[1, 2, ,]').replace(/\s+/g, ''), '[1,2,]');
  assert.equal(stripTrailingCommas('[1, 2\n,\n]'), '[1, 2\n\n]');
});

test('Kommas in Zeichenketten bleiben erhalten', () => {
  assert.equal(stripTrailingCommas('{"a": ",}"}'), '{"a": ",}"}');
});

test('parseJsonc parst Kommentare und Trailing Commas zusammen', () => {
  const text = `{
    // Kunde
    "kunde": "Ada", /* wichtig */
    "liste": [1, 2,],
  }`;
  assert.deepEqual(parseJsonc(text), { kunde: 'Ada', liste: [1, 2] });
});

test('parseJsonc kann Trailing Commas ablehnen', () => {
  assert.throws(() => parseJsonc('{"a": 1,}', { trailingCommas: false }), JsonSyntaxError);
});

test('parseJsonc meldet Fehler mit Zeilenangabe', () => {
  try {
    parseJsonc('{\n  // x\n  "a":\n}');
    assert.fail('Fehler erwartet');
  } catch (error) {
    assert.ok(error instanceof JsonSyntaxError);
    assert.equal(error.line, 4);
  }
});
