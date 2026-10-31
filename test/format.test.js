import test from 'node:test';
import assert from 'node:assert/strict';

import { formatText, quote, stringifyJson } from '../src/format.js';
import { parseJson } from '../src/parse.js';

test('stringifyJson rückt mit zwei Leerzeichen ein', () => {
  assert.equal(stringifyJson({ a: 1, b: [2, 3] }), '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}\n');
});

test('stringifyJson unterstützt Tabulatoren und eigene Einrückung', () => {
  assert.equal(stringifyJson({ a: 1 }, { indent: '\t' }), '{\n\t"a": 1\n}\n');
  assert.equal(stringifyJson({ a: 1 }, { indent: 4 }), '{\n    "a": 1\n}\n');
});

test('indent 0 erzeugt kompakte Ausgabe', () => {
  assert.equal(stringifyJson({ a: [1, 2], b: {} }, { indent: 0, trailingNewline: false }), '{"a":[1,2],"b":{}}');
});

test('sortKeys sortiert Schlüssel rekursiv', () => {
  const value = { z: 1, a: { d: 4, c: 3 }, m: 2 };
  const text = stringifyJson(value, { sortKeys: true, trailingNewline: false });
  assert.equal(text, '{\n  "a": {\n    "c": 3,\n    "d": 4\n  },\n  "m": 2,\n  "z": 1\n}');
});

test('trailingNewline lässt sich abschalten', () => {
  assert.equal(stringifyJson({ a: 1 }, { trailingNewline: false }), '{\n  "a": 1\n}');
});

test('quote maskiert Steuerzeichen und Anführungszeichen', () => {
  assert.equal(quote('a"b\\c\nd'), '"a\\"b\\\\c\\nd"');
  assert.equal(quote('\u0001'), '"\\u0001"');
});

test('Sonderfälle verhalten sich wie JSON.stringify', () => {
  const value = { fehlt: undefined, fn: () => {}, sym: Symbol('x'), nan: Number.NaN, inf: Infinity };
  assert.equal(stringifyJson(value, { indent: 0, trailingNewline: false }), '{"nan":null,"inf":null}');
  assert.equal(stringifyJson([undefined, () => {}], { indent: 0, trailingNewline: false }), '[null,null]');
  assert.equal(stringifyJson(new Date('2020-01-02T03:04:05.000Z'), { indent: 0, trailingNewline: false }), '"2020-01-02T03:04:05.000Z"');
  assert.equal(stringifyJson(10n, { indent: 0, trailingNewline: false }), '10');
});

test('Zyklen werden mit klarer Meldung abgelehnt', () => {
  const value = { name: 'x' };
  value.self = value;
  assert.throws(() => stringifyJson(value), /Zyklische Referenz/);
});

test('Wiederholte, aber nicht zyklische Referenzen sind erlaubt', () => {
  const shared = { x: 1 };
  assert.equal(stringifyJson({ a: shared, b: shared }, { indent: 0, trailingNewline: false }), '{"a":{"x":1},"b":{"x":1}}');
});

test('formatText formatiert vorhandenen Text neu und ist verlustfrei', () => {
  const text = '{"b":1,"a":[true,null,"x"]}';
  const formatted = formatText(text, { indent: 2, sortKeys: true });
  assert.equal(formatted, '{\n  "a": [\n    true,\n    null,\n    "x"\n  ],\n  "b": 1\n}\n');
  assert.deepEqual(parseJson(formatted), parseJson(text));
});

test('Roundtrip mit Umlauten und Emoji', () => {
  const value = { grüße: '👋 Ümlaut', liste: ['ä', 'ö'] };
  assert.deepEqual(parseJson(stringifyJson(value)), value);
});
