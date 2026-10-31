/**
 * Mapping: baut aus einem Quell-JSON mithilfe einer Spec ein Ziel-JSON.
 *
 * Spec-Formen (beliebig verschachtelbar):
 *   "user.name"                          Pfad -> Wert
 *   { "path": "user.name",
 *     "default": "unbekannt",
 *     "transform": ["trim", "upper"] }   Feld mit Default und Transformationen
 *   { "id": "user.id",                  verschachteltes Objekt-Template
 *     "name": "user.name" }
 *   { "from": "user",                   Teilbaum als neue Quelle
 *     "id": "id",
 *     "name": "name" }
 *   { "from": "items",                  Array-Abbildung
 *     "each": { "sku": "sku", "preis": "price" } }
 *   "tags[*]"                            Wildcard -> Array
 *   { "value": "fest" }                 Literal (Strings sind sonst Pfade)
 *
 * Fehlende Pfade werden gesammelt (siehe `missing`), nicht still verschluckt.
 */

import { isPlainObject, queryPath } from './path.js';

const META_KEYS = new Set(['path', 'from', 'map', 'each', 'default', 'transform', 'value']);

const TRANSFORMS = {
  string: (value) => String(value),
  number: (value) => {
    const result = Number(value);
    if (!Number.isFinite(result)) throw new Error(`"${String(value)}" ist keine Zahl`);
    return result;
  },
  int: (value) => {
    const result = Number.parseInt(value, 10);
    if (!Number.isFinite(result)) throw new Error(`"${String(value)}" ist keine Ganzzahl`);
    return result;
  },
  boolean: (value) => {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1' || value === 'true') return true;
    if (value === 0 || value === '0' || value === 'false') return false;
    throw new Error(`"${String(value)}" ist kein Wahrheitswert`);
  },
  trim: (value) => String(value).trim(),
  upper: (value) => String(value).toUpperCase(),
  lower: (value) => String(value).toLowerCase(),
  length: (value) => (Array.isArray(value) || typeof value === 'string' ? value.length : Object.keys(value ?? {}).length),
  keys: (value) => Object.keys(value ?? {}),
  values: (value) => Object.values(value ?? {}),
  unique: (value) => (Array.isArray(value) ? [...new Set(value)] : value),
  compact: (value) => (Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : value),
  reverse: (value) => (Array.isArray(value) ? [...value].reverse() : value),
  sort: (value) => (Array.isArray(value) ? [...value].sort() : value),
  isodate: (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`"${String(value)}" ist kein Datum`);
    return date.toISOString();
  },
};

const TRANSFORM_NAMES = Object.keys(TRANSFORMS);

function pick(source, expr, path, stats) {
  if (source === undefined || source === null) {
    stats.missing.push(`${path} <- ${expr} (Quelle fehlt)`);
    return undefined;
  }
  const values = queryPath(source, expr);
  if (values.length === 0) {
    stats.missing.push(`${path} <- ${expr}`);
    return undefined;
  }
  return values.length === 1 ? values[0] : values;
}

function applyTransform(value, name, path, warnings) {
  const transform = TRANSFORMS[name];
  if (!transform) {
    warnings.push(`${path}: unbekannte Transformation "${name}" ignoriert (erlaubt: ${TRANSFORM_NAMES.join(', ')})`);
    return value;
  }
  try {
    return transform(value);
  } catch (error) {
    warnings.push(`${path}: Transformation "${name}" fehlgeschlagen (${error.message})`);
    return value;
  }
}

function isFieldSpec(spec) {
  return typeof spec.path === 'string' && Object.keys(spec).every((key) => META_KEYS.has(key));
}

function buildField(source, spec, path, stats, onMissing) {
  const base = typeof spec.from === 'string' ? pick(source, spec.from, path, stats) : source;
  let value = pick(base, spec.path, path, stats);

  if (value === undefined && Object.hasOwn(spec, 'default')) value = spec.default;

  const transforms = spec.transform === undefined
    ? []
    : Array.isArray(spec.transform) ? spec.transform : [spec.transform];

  for (const transform of transforms) {
    if (value === undefined) break;
    if (typeof transform !== 'string') {
      stats.warnings.push(`${path}: Transformation muss ein String sein, "${typeof transform}" ignoriert`);
      continue;
    }
    value = applyTransform(value, transform, path, stats.warnings);
  }

  if (value === undefined && onMissing === 'null') return null;
  return value;
}

function build(source, spec, path, stats, onMissing) {
  if (typeof spec === 'string') return pick(source, spec, path, stats);
  if (Array.isArray(spec)) {
    return spec
      .map((item, index) => build(source, item, `${path}[${index}]`, stats, onMissing))
      .filter((item) => item !== undefined);
  }
  if (!isPlainObject(spec)) return spec;

  if (Object.hasOwn(spec, 'value') && Object.keys(spec).every((key) => key === 'value')) return spec.value;

  if (isFieldSpec(spec)) return buildField(source, spec, path, stats, onMissing);

  if (Object.hasOwn(spec, 'each')) {
    const list = typeof spec.from === 'string' ? pick(source, spec.from, path, stats) : source;
    if (!Array.isArray(list)) {
      if (list !== undefined) stats.warnings.push(`${path}: "each" erwartet ein Array`);
      return undefined;
    }
    return list
      .map((item, index) => build(item, spec.each, `${path}[${index}]`, stats, onMissing))
      .filter((item) => item !== undefined);
  }

  const nestedSource = typeof spec.from === 'string' ? pick(source, spec.from, path, stats) : source;
  const shape = isPlainObject(spec.map)
    ? spec.map
    : Object.fromEntries(Object.entries(spec).filter(([key]) => key !== 'from'));

  if (nestedSource === undefined || nestedSource === null) {
    return onMissing === 'null' ? null : undefined;
  }
  if (typeof nestedSource !== 'object') {
    stats.warnings.push(`${path}: Wert ist kein Objekt, verschachtelte Spec übersprungen`);
    return undefined;
  }

  const output = {};
  for (const [key, subSpec] of Object.entries(shape)) {
    const result = build(nestedSource, subSpec, `${path}.${key}`, stats, onMissing);
    if (result !== undefined) output[key] = result;
    else if (onMissing === 'null') output[key] = null;
  }
  return output;
}

/**
 * Bildet `source` gemäß `spec` auf eine neue Struktur ab.
 *
 * @param {unknown} source
 * @param {Record<string, unknown>} spec
 * @param {{ onMissing?: 'omit' | 'null' | 'error' }} [options]
 * @returns {{ value: unknown, missing: string[], warnings: string[] }}
 */
export function mapDocument(source, spec, options = {}) {
  const onMissing = options.onMissing ?? 'omit';
  if (!['omit', 'null', 'error'].includes(onMissing)) {
    throw new TypeError(`onMissing muss "omit", "null" oder "error" sein, nicht "${onMissing}".`);
  }

  const stats = { missing: [], warnings: [] };
  const value = build(source, spec, '$', stats, onMissing);

  if (onMissing === 'error' && stats.missing.length > 0) {
    const error = new Error(`Fehlende Pfade (strict): ${stats.missing.join(', ')}`);
    error.missing = [...stats.missing];
    error.exitCode = 1;
    throw error;
  }

  return { value, missing: stats.missing, warnings: stats.warnings };
}

export { TRANSFORMS, TRANSFORM_NAMES };
