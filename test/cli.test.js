import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

function run(args, input) {
  return spawnSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8' });
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'jsonkit-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('format liest von stdin und schreibt formatiert', () => {
  const result = run(['format'], '{"b":1,"a":2}');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{\n  "b": 1,\n  "a": 2\n}\n');
});

test('format --indent 4 und --tabs', () => {
  assert.equal(run(['format', '--indent', '4'], '{"a":1}').stdout, '{\n    "a": 1\n}\n');
  assert.equal(run(['format', '--tabs'], '{"a":1}').stdout, '{\n\t"a": 1\n}\n');
});

test('format --sort-keys und --minify', () => {
  assert.equal(run(['format', '--sort-keys'], '{"b":1,"a":2}').stdout, '{\n  "a": 2,\n  "b": 1\n}\n');
  assert.equal(run(['format', '--minify'], '{"b":1,"a":2}').stdout, '{"b":1,"a":2}');
});

test('ungültiges JSON endet mit Exit-Code 1 und Zeilenangabe', () => {
  const result = run(['format'], '{"a":}');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Ungültiges JSON/);
  assert.match(result.stderr, /Zeile 1, Spalte 6/);
});

test('leere Eingabe wird als Fehler gemeldet', () => {
  const result = run(['format'], '   ');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Eingabe ist leer/);
});

test('get liefert Wert, --raw ohne Anführungszeichen', () => {
  const input = '{"user":{"name":"Ada","alter":36}}';
  assert.equal(run(['get', 'user.name'], input).stdout, '"Ada"\n');
  assert.equal(run(['get', 'user.name', '--raw'], input).stdout, 'Ada\n');
  assert.equal(run(['get', 'user.alter', '--raw'], input).stdout, '36\n');
  assert.equal(run(['get', 'user', '--minify'], input).stdout, '{"name":"Ada","alter":36}');
});

test('get mit unbekanntem Pfad endet mit Exit-Code 1', () => {
  const result = run(['get', 'user.fehlt'], '{"user":{}}');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Pfad nicht gefunden/);
});

test('map wendet eine Spec-Datei an und schreibt in --out', () => withTempDir((dir) => {
  const specFile = join(dir, 'spec.json');
  const outFile = join(dir, 'out.json');
  writeFileSync(specFile, JSON.stringify({ name: 'user.name', stadt: 'user.adresse.stadt' }));

  const result = run(['map', specFile, '--out', outFile], '{"user":{"name":"Ada","adresse":{"stadt":"London"}}}');
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(readFileSync(outFile, 'utf8')), { name: 'Ada', stadt: 'London' });
  assert.match(result.stderr, /geschrieben/);
}));

test('map --strict scheitert bei fehlendem Pfad', () => withTempDir((dir) => {
  const specFile = join(dir, 'spec.json');
  writeFileSync(specFile, JSON.stringify({ fehlt: 'user.telefon' }));
  const result = run(['map', specFile, '--strict'], '{"user":{}}');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Fehlende Pfade/);
}));

test('validate meldet gültiges JSON', () => {
  const result = run(['validate'], '[1,2,3]');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /gültiges JSON \(Array\)/);
});

test('unbekannter Befehl endet mit Exit-Code 2', () => {
  const result = run(['quatsch'], '');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unbekannter Befehl/);
  assert.match(result.stderr, /Hilfe: jsonkit --help/);
});

test('--help und --version funktionieren', () => {
  const help = run(['--help'], '');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /jsonkit - JSON formatieren/);

  const version = run(['--version'], '');
  assert.equal(version.status, 0);
  assert.match(version.stdout, /^jsonkit \d+\.\d+\.\d+$/m);
});

test('fehlende Datei wird verständlich gemeldet', () => {
  const result = run(['format', '/gibt/es/nicht.json'], '');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Datei nicht gefunden/);
});

test('set schreibt Werte im JSON-Typ und legt Pfade an', () => {
  assert.equal(run(['set', 'a.b', '42', '--minify'], '{"a":{}}').stdout, '{"a":{"b":42}}');
  assert.equal(run(['set', 'a.b', 'true', '--minify'], '{}').stdout, '{"a":{"b":true}}');
  assert.equal(run(['set', 'a.b', 'Ada', '--minify'], '{}').stdout, '{"a":{"b":"Ada"}}');
  assert.equal(run(['set', 'liste[1]', 'x', '--minify'], '{"liste":[1,2]}').stdout, '{"liste":[1,"x"]}');
});

test('set --string erhält den Wert als String', () => {
  assert.equal(run(['set', 'a', '42', '--string', '--minify'], '{}').stdout, '{"a":"42"}');
});

test('del entfernt Schlüssel und Array-Elemente', () => {
  assert.equal(run(['del', 'a.b', '--minify'], '{"a":{"b":1,"c":2}}').stdout, '{"a":{"c":2}}');
  assert.equal(run(['del', 'a[0]', '--minify'], '{"a":[1,2]}').stdout, '{"a":[2]}');
});

test('keys listet Schlüssel und Indizes', () => {
  assert.equal(run(['keys', '--minify'], '{"b":1,"a":2}').stdout, '["b","a"]');
  assert.equal(run(['keys', 'liste', '--raw'], '{"liste":["x","y"]}').stdout, '0\n1\n');
  assert.equal(run(['keys', 'skalar'], '{"skalar":1}').status, 1);
});

test('get unterstützt Filter-Ausdrücke', () => {
  const input = '{"p":[{"sku":"A","n":2},{"sku":"B","n":1}]}';
  assert.equal(run(['get', 'p[?(@.n > 1)].sku', '--raw'], input).stdout, 'A\n');
});

test('flatten und unflatten sind über die CLI invers', () => {
  const input = '{"a":{"b":[1,2]}}';
  const flat = run(['flatten', '--minify'], input).stdout;
  assert.equal(flat, '{"a.b.0":1,"a.b.1":2}');
  assert.equal(run(['unflatten', '--minify'], flat).stdout, input);
});

test('flatten akzeptiert ein eigenes Trennzeichen', () => {
  assert.equal(run(['flatten', '--separator', '/', '--minify'], '{"a":{"b":1}}').stdout, '{"a/b":1}');
});

test('diff meldet Unterschiede und liefert Exit-Code 1', () => withTempDir((dir) => {
  const left = join(dir, 'links.json');
  const right = join(dir, 'rechts.json');
  writeFileSync(left, '{"a":1,"b":2}');
  writeFileSync(right, '{"a":1,"b":3,"c":true}');

  const result = run(['diff', left, right], '');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /~ \$\.b: 2 -> 3/);
  assert.match(result.stdout, /\+ \$\.c = true/);
}));

test('diff ohne Unterschiede liefert Exit-Code 0', () => withTempDir((dir) => {
  const left = join(dir, 'links.json');
  const right = join(dir, 'rechts.json');
  writeFileSync(left, '{"a":1,"b":[1,2]}');
  writeFileSync(right, '{"b":[1,2],"a":1}');

  const result = run(['diff', left, right], '');
  assert.equal(result.status, 0);
  assert.match(result.stderr, /keine Unterschiede/);
}));

test('merge führt Basis und Patch zusammen', () => {
  return withTempDir((dir) => {
    const patchFile = join(dir, 'patch.json');
    writeFileSync(patchFile, '{"b":"neu","liste":[3]}');
    const result = run(['merge', patchFile, '--arrays', 'concat', '--minify'], '{"a":1,"liste":[1,2]}');
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '{"a":1,"liste":[1,2,3],"b":"neu"}');
  });
});

test('format --jsonc erlaubt Kommentare und Trailing Commas', () => {
  const input = '{ // x\n "a": 1, /* y */\n}\n';
  const result = run(['format', '--jsonc', '--minify'], input);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{"a":1}');
});

test('format --jsonl schreibt eine Zeile pro Wert', () => {
  const result = run(['format', '--jsonl', '--sort-keys'], '{"b":1,"a":2}\n{"a":3}');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{"a":2,"b":1}\n{"a":3}\n');
});

test('validate --jsonl zählt die Werte', () => {
  const result = run(['validate', '--jsonl'], '{"a":1}\n{"a":2}\n');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /2 Werte/);
});
