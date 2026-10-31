#!/usr/bin/env node
/**
 * jsonkit CLI
 *
 *   jsonkit format [datei] [--indent N | --tabs] [--sort-keys] [--minify] [-o datei]
 *   jsonkit get <pfad> [datei] [--raw] [--minify]
 *   jsonkit map <spec.json> [datei] [--indent N] [--sort-keys] [--strict] [-o datei]
 *   jsonkit validate [datei]
 *
 * Ohne Datei (oder mit "-") wird von stdin gelesen.
 * Exit-Codes: 0 = ok, 1 = ungültiges JSON / Fehler, 2 = Bedienfehler.
 */

import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { JsonSyntaxError, parseJson } from './parse.js';
import { stringifyJson } from './format.js';
import { mapDocument } from './map.js';
import { queryPath } from './path.js';

const BOOLEAN_FLAGS = new Set([
  'help',
  'version',
  'sort-keys',
  'minify',
  'tabs',
  'raw',
  'strict',
  'no-newline',
  'quiet',
]);

const VALUE_FLAGS = new Set(['indent', 'out']);

const HELP = `jsonkit - JSON formatieren, prüfen und umbauen

Aufruf:
  jsonkit format [datei] [--indent N | --tabs] [--sort-keys] [--minify] [-o datei]
  jsonkit get <pfad> [datei] [--raw] [--minify]
  jsonkit map <spec.json> [datei] [--indent N] [--sort-keys] [--strict] [--null] [-o datei]
  jsonkit validate [datei]

Ohne Datei (oder mit "-") wird von stdin gelesen.

Optionen:
  --indent N      Einrückung in Leerzeichen (0 = kompakt)
  --tabs          Einrückung mit Tabulatoren
  --sort-keys     Objektschlüssel alphabetisch sortieren
  --minify        Kompakte Ausgabe ohne Zeilenumbrüche
  --raw           get: Strings/Zahlen ohne JSON-Anführungszeichen
  --strict        map: fehlender Pfad ist ein Fehler (sonst weggelassen)
  --null          map: fehlende Pfade als null ausgeben
  -o, --out DATEI In Datei statt auf stdout schreiben
  --quiet         Hinweise auf stderr unterdrücken
  -v, --version   Version anzeigen
  -h, --help      Diese Hilfe

Pfade:
  user.name       verschachtelte Schlüssel
  items[0]        Array-Index, auch negativ: items[-1]
  items[*].sku    Wildcard über alle Elemente
  ["a.b"]         Schlüssel mit Punkten

Beispiele:
  cat daten.json | jsonkit format --indent 4
  jsonkit get 'users[*].name' daten.json --raw
  jsonkit map mapping.json daten.json -o ziel.json
`;

function usageError(message) {
  const error = new Error(message);
  error.exitCode = 2;
  error.usage = true;
  return error;
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '-h') {
      flags.help = true;
      continue;
    }
    if (arg === '-v') {
      flags.version = true;
      continue;
    }
    if (arg === '-o') {
      const value = argv[i + 1];
      if (value === undefined) throw usageError('Option -o benötigt einen Dateinamen');
      flags.out = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      const inline = eq === -1 ? undefined : arg.slice(eq + 1);

      if (VALUE_FLAGS.has(name)) {
        const value = inline ?? argv[i + 1];
        if (value === undefined) throw usageError(`Option --${name} benötigt einen Wert`);
        if (inline === undefined) i += 1;
        flags[name] = value;
        continue;
      }
      if (BOOLEAN_FLAGS.has(name)) {
        flags[name] = inline === undefined ? true : inline !== 'false';
        continue;
      }
      throw usageError(`Unbekannte Option: --${name}`);
    }
    if (arg.startsWith('-') && arg.length > 1) throw usageError(`Unbekannte Option: ${arg}`);

    positional.push(arg);
  }

  return { flags, positional };
}

function readInput(file) {
  if (file === undefined || file === '-') return readFileSync(0, 'utf8');
  return readFileSync(file, 'utf8');
}

function emit(text, flags) {
  if (flags.out) {
    writeFileSync(flags.out, text);
    if (!flags.quiet) process.stderr.write(`geschrieben: ${flags.out} (${Buffer.byteLength(text)} Bytes)\n`);
    return;
  }
  process.stdout.write(text);
}

function indentOf(flags) {
  if (flags.tabs) return '\t';
  if (flags.indent !== undefined) {
    const value = Number(flags.indent);
    if (!Number.isInteger(value) || value < 0 || value > 16) {
      throw usageError(`--indent erwartet eine Ganzzahl zwischen 0 und 16, nicht "${flags.indent}"`);
    }
    return value;
  }
  return 2;
}

function formatOptions(flags, overrides = {}) {
  const minify = flags.minify === true;
  return {
    indent: minify ? 0 : indentOf(flags),
    sortKeys: flags['sort-keys'] === true,
    trailingNewline: minify || flags['no-newline'] === true ? false : true,
    ...overrides,
  };
}

function loadJson(file, fallbackName = '<stdin>') {
  return parseJson(readInput(file), { filename: file ?? fallbackName });
}

function commandFormat(files, flags) {
  if (files.length > 1) throw usageError('format erwartet höchstens eine Datei');
  const data = loadJson(files[0]);
  emit(stringifyJson(data, formatOptions(flags)), flags);
}

function commandGet(files, flags) {
  const [path, file] = files;
  if (path === undefined) throw usageError('get erwartet einen Pfad, z. B. jsonkit get user.name daten.json');
  if (files.length > 2) throw usageError('get erwartet einen Pfad und höchstens eine Datei');

  const data = loadJson(file);
  const values = queryPath(data, path);
  if (values.length === 0) {
    process.stderr.write(`jsonkit: Pfad nicht gefunden: ${path}\n`);
    return 1;
  }

  const result = values.length === 1 ? values[0] : values;
  const isPrimitive = result === null || ['string', 'number', 'boolean'].includes(typeof result);

  if (flags.raw && isPrimitive) {
    process.stdout.write(`${result === null ? 'null' : result}\n`);
    return 0;
  }
  emit(stringifyJson(result, formatOptions(flags)), flags);
  return 0;
}

function commandMap(files, flags) {
  const [specFile, inputFile] = files;
  if (specFile === undefined) throw usageError('map erwartet eine Spec-Datei, z. B. jsonkit map spec.json daten.json');
  if (files.length > 2) throw usageError('map erwartet eine Spec-Datei und höchstens eine Eingabedatei');

  const spec = loadJson(specFile, '<spec>');
  const source = loadJson(inputFile);
  const onMissing = flags.strict ? 'error' : flags.null ? 'null' : 'omit';

  const { value, missing, warnings } = mapDocument(source, spec, { onMissing });

  for (const warning of warnings) process.stderr.write(`warnung: ${warning}\n`);
  if (missing.length > 0 && !flags.quiet) {
    process.stderr.write(`hinweis: ${missing.length} Pfad(e) ohne Treffer\n`);
  }

  emit(stringifyJson(value, formatOptions(flags, { trailingNewline: true })), flags);
  return 0;
}

function commandValidate(files, flags) {
  if (files.length > 1) throw usageError('validate erwartet höchstens eine Datei');
  const data = loadJson(files[0]);
  if (!flags.quiet) {
    const kind = Array.isArray(data) ? 'Array' : data === null ? 'null' : typeof data;
    process.stdout.write(`gültiges JSON (${kind})\n`);
  }
  return 0;
}

/**
 * Führt die CLI aus und liefert den Exit-Code.
 *
 * @param {string[]} argv
 * @returns {number}
 */
export function main(argv = process.argv.slice(2)) {
  try {
    const { flags, positional } = parseArgs(argv);

    if (flags.version) {
      const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
      process.stdout.write(`jsonkit ${pkg.version}\n`);
      return 0;
    }

    const [command = 'help', ...files] = positional;
    if (flags.help || command === 'help') {
      process.stdout.write(HELP);
      return 0;
    }

    switch (command) {
      case 'format':
      case 'fmt':
        commandFormat(files, flags);
        return 0;
      case 'get':
        return commandGet(files, flags);
      case 'map':
        return commandMap(files, flags);
      case 'validate':
      case 'check':
        return commandValidate(files, flags);
      default:
        throw usageError(`Unbekannter Befehl: ${command}`);
    }
  } catch (error) {
    if (error instanceof JsonSyntaxError || error.exitCode !== undefined) {
      process.stderr.write(`jsonkit: ${error.message}\n`);
      if (error.usage) process.stderr.write('Hilfe: jsonkit --help\n');
      return error.exitCode ?? 1;
    }
    if (error.code === 'ENOENT') {
      process.stderr.write(`jsonkit: Datei nicht gefunden: ${error.path}\n`);
      return 1;
    }
    process.stderr.write(`jsonkit: ${error.message}\n`);
    return 1;
  }
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  process.exitCode = main();
}
