#!/usr/bin/env node
/**
 * jsonkit CLI
 *
 *   jsonkit format [datei] [--indent N | --tabs] [--sort-keys] [--minify] [--jsonl] [--jsonc]
 *   jsonkit get <pfad> [datei] [--raw]
 *   jsonkit map <spec.json> [datei] [--strict | --null]
 *   jsonkit validate [datei] [--jsonl]
 *   jsonkit set <pfad> <wert> [datei] [--string]
 *   jsonkit del <pfad> [datei]
 *   jsonkit keys [pfad] [datei] [--raw]
 *   jsonkit flatten [datei] [--separator .]
 *   jsonkit unflatten [datei] [--separator .]
 *   jsonkit diff <a.json> <b.json>
 *   jsonkit merge <patch.json> [datei] [--arrays replace|concat|merge]
 *
 * Ohne Datei (oder mit "-") wird von stdin gelesen.
 * Exit-Codes: 0 = ok, 1 = ungültiges JSON / Unterschied / Fehler, 2 = Bedienfehler.
 */

import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { JsonSyntaxError, parseJson } from './parse.js';
import { stringifyJson } from './format.js';
import { mapDocument } from './map.js';
import { isPlainObject, queryPath } from './path.js';
import { deletePath, flattenJson, setPath, unflattenJson } from './mutate.js';
import { diffJson } from './diff.js';
import { mergeJson } from './merge.js';
import { parseJsonc } from './jsonc.js';
import { parseJsonl, stringifyJsonl } from './jsonl.js';

const BOOLEAN_FLAGS = new Set([
  'help',
  'version',
  'sort-keys',
  'minify',
  'tabs',
  'raw',
  'strict',
  'null',
  'string',
  'jsonl',
  'jsonc',
  'no-newline',
  'quiet',
]);

const VALUE_FLAGS = new Set(['indent', 'out', 'separator', 'arrays']);

const HELP = `jsonkit - JSON formatieren, prüfen, abfragen und umbauen

Aufruf:
  jsonkit format [datei] [--indent N | --tabs] [--sort-keys] [--minify] [--jsonl] [--jsonc]
  jsonkit get <pfad> [datei] [--raw]
  jsonkit map <spec.json> [datei] [--indent N] [--sort-keys] [--strict] [--null] [-o datei]
  jsonkit validate [datei] [--jsonl]
  jsonkit set <pfad> <wert> [datei] [--string] [-o datei]
  jsonkit del <pfad> [datei] [-o datei]
  jsonkit keys [pfad] [datei] [--raw]
  jsonkit flatten [datei] [--separator .]
  jsonkit unflatten [datei] [--separator .]
  jsonkit diff <a.json> <b.json>
  jsonkit merge <patch.json> [datei] [--arrays replace|concat|merge]

Ohne Datei (oder mit "-") wird von stdin gelesen.

Optionen:
  --indent N      Einrückung in Leerzeichen (0 = kompakt)
  --tabs          Einrückung mit Tabulatoren
  --sort-keys     Objektschlüssel alphabetisch sortieren
  --minify        Kompakte Ausgabe ohne Zeilenumbrüche
  --raw           get: Strings/Zahlen ohne Anführungszeichen; keys: eine Zeile pro Schlüssel
  --strict        map: fehlender Pfad ist ein Fehler (sonst weggelassen)
  --null          map: fehlende Pfade als null ausgeben
  --string        set: Wert unverändert als String übernehmen
  --jsonl         format/validate: JSON Lines (ein Wert pro Zeile)
  --jsonc         Kommentare und Trailing Commas erlauben
  --separator S   flatten/unflatten: Trennzeichen (Standard ".")
  --arrays MODUS  merge: replace (Standard), concat oder merge
  -o, --out DATEI In Datei statt auf stdout schreiben
  --quiet         Hinweise auf stderr unterdrücken
  -v, --version   Version anzeigen
  -h, --help      Diese Hilfe

Pfade:
  user.name       verschachtelte Schlüssel
  items[0]        Array-Index, auch negativ: items[-1]
  items[*].sku    Wildcard über alle Elemente
  items[?(@.preis > 10)]   Filter über Array-Elemente
  ["a.b"]         Schlüssel mit Punkten

Beispiele:
  cat daten.json | jsonkit format --indent 4
  jsonkit get 'users[*].name' daten.json --raw
  jsonkit map mapping.json daten.json -o ziel.json
  jsonkit set user.name "Ada" daten.json -o neu.json
  jsonkit diff alt.json neu.json
  cat a.json | jsonkit merge patch.json --arrays concat
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

/** Wie loadJson, berücksichtigt aber --jsonc. */
function loadLooseJson(file, flags, fallbackName = '<stdin>') {
  const text = readInput(file);
  const filename = file ?? fallbackName;
  return flags.jsonc ? parseJsonc(text, { filename }) : parseJson(text, { filename });
}

function commandFormat(files, flags) {
  if (files.length > 1) throw usageError('format erwartet höchstens eine Datei');

  if (flags.jsonl) {
    const values = parseJsonl(readInput(files[0]), { filename: files[0] ?? '<stdin>' });
    emit(stringifyJsonl(values, { sortKeys: flags['sort-keys'] === true }), flags);
    return 0;
  }

  const data = loadLooseJson(files[0], flags);
  emit(stringifyJson(data, formatOptions(flags)), flags);
  return 0;
}

function commandGet(files, flags) {
  const [path, file] = files;
  if (path === undefined) throw usageError('get erwartet einen Pfad, z. B. jsonkit get user.name daten.json');
  if (files.length > 2) throw usageError('get erwartet einen Pfad und höchstens eine Datei');

  const data = loadLooseJson(file, flags);
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

  const spec = loadLooseJson(specFile, flags, '<spec>');
  const source = loadLooseJson(inputFile, flags);
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

  if (flags.jsonl) {
    const values = parseJsonl(readInput(files[0]), { filename: files[0] ?? '<stdin>' });
    if (!flags.quiet) process.stdout.write(`gültige JSON-Lines (${values.length} Werte)\n`);
    return 0;
  }

  const data = loadLooseJson(files[0], flags);
  if (!flags.quiet) {
    const kind = Array.isArray(data) ? 'Array' : data === null ? 'null' : typeof data;
    process.stdout.write(`gültiges JSON (${kind})\n`);
  }
  return 0;
}

function parseValue(raw, flags) {
  if (flags.string) return raw;
  try {
    return parseJson(raw);
  } catch {
    return raw;
  }
}

function commandSet(files, flags) {
  const [path, rawValue, file] = files;
  if (path === undefined || rawValue === undefined) {
    throw usageError('set erwartet einen Pfad und einen Wert, z. B. jsonkit set user.name Ada daten.json');
  }
  if (files.length > 3) throw usageError('set erwartet Pfad, Wert und höchstens eine Datei');

  const data = loadLooseJson(file, flags);
  const updated = setPath(data, path, parseValue(rawValue, flags));
  emit(stringifyJson(updated, formatOptions(flags)), flags);
  return 0;
}

function commandDel(files, flags) {
  const [path, file] = files;
  if (path === undefined) throw usageError('del erwartet einen Pfad, z. B. jsonkit del user.telefon daten.json');
  if (files.length > 2) throw usageError('del erwartet einen Pfad und höchstens eine Datei');

  const data = loadLooseJson(file, flags);
  emit(stringifyJson(deletePath(data, path), formatOptions(flags)), flags);
  return 0;
}

function commandKeys(files, flags) {
  if (files.length > 2) throw usageError('keys erwartet höchstens Pfad und Datei');

  const [first, second] = files;
  let pathExpr;
  let file;

  if (second !== undefined) {
    [pathExpr, file] = [first, second];
  } else if (first === undefined || looksLikeFile(first)) {
    file = first;
  } else {
    pathExpr = first;
  }

  const data = loadLooseJson(file, flags);
  const target = pathExpr === undefined ? data : queryPath(data, pathExpr)[0];
  if (target === undefined) {
    process.stderr.write(`jsonkit: Pfad nicht gefunden: ${pathExpr}\n`);
    return 1;
  }

  let keys;
  if (Array.isArray(target)) keys = target.map((_, index) => index);
  else if (isPlainObject(target)) keys = Object.keys(target);
  else {
    process.stderr.write('jsonkit: keys erwartet ein Objekt oder ein Array\n');
    return 1;
  }

  if (flags.raw) {
    process.stdout.write(keys.map((key) => `${key}\n`).join(''));
    return 0;
  }
  emit(stringifyJson(keys, formatOptions(flags)), flags);
  return 0;
}

function separatorOf(flags) {
  const separator = flags.separator ?? '.';
  if (separator === '') throw usageError('--separator darf nicht leer sein');
  return separator;
}

function commandFlatten(files, flags) {
  if (files.length > 1) throw usageError('flatten erwartet höchstens eine Datei');
  const data = loadLooseJson(files[0], flags);
  emit(stringifyJson(flattenJson(data, { separator: separatorOf(flags) }), formatOptions(flags)), flags);
  return 0;
}

function commandUnflatten(files, flags) {
  if (files.length > 1) throw usageError('unflatten erwartet höchstens eine Datei');
  const data = loadLooseJson(files[0], flags);
  emit(stringifyJson(unflattenJson(data, { separator: separatorOf(flags) }), formatOptions(flags)), flags);
  return 0;
}

function compact(value) {
  return value === undefined ? 'undefined' : stringifyJson(value, { indent: 0, trailingNewline: false });
}

/** Bei einem Argument entscheidet Dateiendung/Existenz, ob es ein Pfad ist. */
function looksLikeFile(candidate) {
  if (/\.(json|jsonl|jsonc|ndjson)$/i.test(candidate)) return true;
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function describeChange(change) {
  switch (change.type) {
    case 'add':
      return `+ ${change.path} = ${compact(change.after)}`;
    case 'remove':
      return `- ${change.path} = ${compact(change.before)}`;
    default:
      return `~ ${change.path}: ${compact(change.before)} -> ${compact(change.after)}`;
  }
}

function commandDiff(files, flags) {
  if (files.length !== 2) throw usageError('diff erwartet zwei Dateien, z. B. jsonkit diff alt.json neu.json');

  const left = loadLooseJson(files[0], flags);
  const right = loadLooseJson(files[1], flags);
  const changes = diffJson(left, right);

  if (changes.length === 0) {
    if (!flags.quiet) process.stderr.write('keine Unterschiede\n');
    return 0;
  }

  const lines = changes.map(describeChange);
  emit(`${lines.join('\n')}\n`, flags);
  return 1;
}

function commandMerge(files, flags) {
  const [patchFile, inputFile] = files;
  if (patchFile === undefined) throw usageError('merge erwartet eine Patch-Datei, z. B. cat base.json | jsonkit merge patch.json');
  if (files.length > 2) throw usageError('merge erwartet eine Patch-Datei und höchstens eine Basisdatei');

  const patch = loadLooseJson(patchFile, flags, '<patch>');
  const base = loadLooseJson(inputFile, flags);
  const arrays = flags.arrays ?? 'replace';
  if (!['replace', 'concat', 'merge'].includes(arrays)) {
    throw usageError(`--arrays erwartet replace, concat oder merge, nicht "${arrays}"`);
  }

  emit(stringifyJson(mergeJson(base, patch, { arrays }), formatOptions(flags)), flags);
  return 0;
}

const COMMANDS = {
  format: commandFormat,
  fmt: commandFormat,
  get: commandGet,
  map: commandMap,
  validate: commandValidate,
  check: commandValidate,
  set: commandSet,
  del: commandDel,
  remove: commandDel,
  keys: commandKeys,
  flatten: commandFlatten,
  unflatten: commandUnflatten,
  diff: commandDiff,
  merge: commandMerge,
};

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

    const handler = COMMANDS[command];
    if (!handler) throw usageError(`Unbekannter Befehl: ${command}`);
    return handler(files, flags);
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
