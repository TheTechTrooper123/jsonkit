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
