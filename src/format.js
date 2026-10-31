/**
 * Eigener JSON-Serializer.
 *
 * JSON.stringify kann keine Einrückung als String (Tabs), keine sortierten
 * Schlüssel und keine sprechenden Fehler bei Zyklen. Dieser Serializer deckt
 * das ab und verhält sich ansonsten wie JSON.stringify:
 *   - undefined/Function/Symbol: im Objekt weggelassen, im Array zu null
 *   - NaN/Infinity: null
 *   - Date: ISO-String
 *   - BigInt: Zahl ohne Suffix
 */

import { parseJson } from './parse.js';

const ESCAPES = {
  '"': '\\"',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

/** Zeichenkette als JSON-String-Literal inklusive Anführungszeichen. */
export function quote(value) {
  let out = '"';
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const code = value.charCodeAt(i);
    if (ESCAPES[char]) out += ESCAPES[char];
    else if (code < 0x20 || code === 0x7f) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else out += char;
  }
  return `${out}"`;
}

/** Normalisiert Formatierungsoptionen. */
export function normalizeOptions(options = {}) {
  const indent = options.indent === undefined ? 2 : options.indent;
  const pad = typeof indent === 'number' ? ' '.repeat(Math.max(0, Math.trunc(indent))) : String(indent);
  return {
    pad,
    sortKeys: options.sortKeys === true,
    trailingNewline: options.trailingNewline !== false,
  };
}

function primitiveText(value) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'number':
      return Number.isFinite(value) ? String(value) : 'null';
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return quote(value);
    case 'bigint':
      return value.toString();
    default:
      return undefined;
  }
}

function writeValue(value, options, depth, stack, compact) {
  if (value instanceof Date) return quote(value.toISOString());

  const primitive = primitiveText(value);
  if (primitive !== undefined) return primitive;

  if (typeof value !== 'object' || value === null) return undefined;

  if (typeof value.toJSON === 'function') {
    const replaced = value.toJSON();
    if (replaced !== value) return writeValue(replaced, options, depth, stack, compact);
  }

  if (stack.includes(value)) {
    throw new TypeError('Zyklische Referenz kann nicht als JSON serialisiert werden.');
  }

  const nextStack = [...stack, value];
  const separator = compact ? ':' : ': ';
  const childPad = compact ? '' : options.pad.repeat(depth + 1);
  const closePad = compact ? '' : options.pad.repeat(depth);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const parts = value.map((item) => writeValue(item, options, depth + 1, nextStack, compact) ?? 'null');
    if (compact) return `[${parts.join(',')}]`;
    return `[\n${parts.map((part) => childPad + part).join(',\n')}\n${closePad}]`;
  }

  let entries = Object.entries(value).filter(([, item]) => {
    const type = typeof item;
    return item !== undefined && type !== 'function' && type !== 'symbol';
  });
  if (options.sortKeys) entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (entries.length === 0) return '{}';

  const serializeEntry = ([key, item]) => {
    const text = writeValue(item, options, depth + 1, nextStack, compact) ?? 'null';
    return `${quote(key)}${separator}${text}`;
  };

  if (compact) return `{${entries.map(serializeEntry).join(',')}}`;
  return `{\n${entries.map((entry) => childPad + serializeEntry(entry)).join(',\n')}\n${closePad}}`;
}

/**
 * Serialisiert einen Wert als JSON-Text.
 *
 * @param {unknown} value
 * @param {{ indent?: number|string, sortKeys?: boolean, trailingNewline?: boolean }} [options]
 * @returns {string}
 */
export function stringifyJson(value, options = {}) {
  const normalized = normalizeOptions(options);
  const text = writeValue(value, normalized, 0, [], normalized.pad === '');
  if (text === undefined) throw new TypeError('Wert kann nicht als JSON dargestellt werden (undefined).');
  return normalized.trailingNewline ? `${text}\n` : text;
}

/**
 * Formatiert vorhandenen JSON-Text neu.
 *
 * @param {string} text
 * @param {{ indent?: number|string, sortKeys?: boolean, trailingNewline?: boolean }} [options]
 * @returns {string}
 */
export function formatText(text, options = {}) {
  return stringifyJson(parseJson(text), options);
}
