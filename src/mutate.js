/**
 * Mutationen: Werte setzen/löschen und flach/verschachtelt umwandeln.
 *
 * Alle Funktionen sind rein: die Eingabe wird nicht verändert, es entsteht
 * eine Kopie entlang des Pfades. Wildcards sind bei Mutationen nicht erlaubt,
 * weil ein Schreibziel eindeutig sein muss.
 */

import { isPlainObject, parsePath } from './path.js';

function cloneContainer(value, token) {
  if (token.type === 'index') return Array.isArray(value) ? [...value] : [];
  return isPlainObject(value) ? { ...value } : {};
}

function setAt(container, tokens, index, value) {
  const token = tokens[index];
  const last = index === tokens.length - 1;

  if (token.type === 'index') {
    const base = cloneContainer(container, token);
    const target = token.index < 0 ? base.length + token.index : token.index;
    if (target < 0) {
      throw new RangeError(`Negativer Index ${token.index} liegt vor dem Array-Anfang.`);
    }
    const child = last ? value : setAt(base[target], tokens, index + 1, value);
    if (target >= base.length) {
      while (base.length < target) base.push(null);
    }
    base[target] = child;
    return base;
  }

  const base = cloneContainer(container, token);
  base[token.key] = last ? value : setAt(base[token.key], tokens, index + 1, value);
  return base;
}

/**
 * Setzt einen Wert an einem Pfad und legt fehlende Container an.
 *
 * @param {unknown} root
 * @param {string} expr
 * @param {unknown} value
 * @returns {unknown}
 */
export function setPath(root, expr, value) {
  const tokens = parsePath(expr);
  if (tokens.some((token) => token.type !== 'key' && token.type !== 'index')) {
    throw new SyntaxError(`Beim Setzen ist keine Wildcard erlaubt: "${expr}".`);
  }
  if (tokens.length === 0) return value;
  return setAt(root, tokens, 0, value);
}

function deleteAt(container, tokens, index) {
  const token = tokens[index];
  const last = index === tokens.length - 1;

  if (token.type === 'index') {
    if (!Array.isArray(container)) return container;
    const base = [...container];
    const target = token.index < 0 ? base.length + token.index : token.index;
    if (target < 0 || target >= base.length) return container;
    if (last) base.splice(target, 1);
    else base[target] = deleteAt(base[target], tokens, index + 1);
    return base;
  }

  if (!isPlainObject(container) || !Object.hasOwn(container, token.key)) return container;
  const base = { ...container };
  if (last) delete base[token.key];
  else base[token.key] = deleteAt(base[token.key], tokens, index + 1);
  return base;
}

/**
 * Löscht einen Wert an einem Pfad. Fehlende Pfade bleiben wirkungslos.
 *
 * @param {unknown} root
 * @param {string} expr
 * @returns {unknown}
 */
export function deletePath(root, expr) {
  const tokens = parsePath(expr);
  if (tokens.length === 0) return undefined;
  if (tokens.some((token) => token.type !== 'key' && token.type !== 'index')) {
    throw new SyntaxError(`Beim Löschen ist keine Wildcard erlaubt: "${expr}".`);
  }
  return deleteAt(root, tokens, 0);
}

/**
 * Wandelt verschachteltes JSON in ein flaches Objekt um.
 * Schlüssel werden mit `separator` verbunden, Array-Indizes sind Zahlen.
 *
 * @param {unknown} value
 * @param {{ separator?: string }} [options]
 * @returns {Record<string, unknown>}
 */
export function flattenJson(value, { separator = '.' } = {}) {
  const out = {};

  const walk = (node, path) => {
    if (Array.isArray(node)) {
      if (node.length === 0) {
        out[path] = [];
        return;
      }
      node.forEach((item, index) => walk(item, path === '' ? String(index) : `${path}${separator}${index}`));
      return;
    }
    if (isPlainObject(node)) {
      const keys = Object.keys(node);
      if (keys.length === 0) {
        out[path] = {};
        return;
      }
      for (const key of keys) walk(node[key], path === '' ? key : `${path}${separator}${key}`);
      return;
    }
    out[path] = node;
  };

  walk(value, '');
  return out;
}

function toArrays(node) {
  if (Array.isArray(node)) return node.map(toArrays);
  if (!isPlainObject(node)) return node;

  const keys = Object.keys(node);
  if (keys.length > 0 && keys.every((key) => /^\d+$/.test(key))) {
    const indices = keys.map(Number).sort((a, b) => a - b);
    return indices.map((index) => toArrays(node[String(index)]));
  }

  const out = {};
  for (const key of keys) out[key] = toArrays(node[key]);
  return out;
}

/**
 * Baut aus einem flachen Objekt wieder verschachteltes JSON.
 * Numerische Schlüssel, die vollständig sind, werden zu Arrays.
 *
 * @param {Record<string, unknown>} flat
 * @param {{ separator?: string }} [options]
 * @returns {unknown}
 */
export function unflattenJson(flat, { separator = '.' } = {}) {
  if (!isPlainObject(flat)) throw new TypeError('unflattenJson erwartet ein Objekt.');

  const root = {};
  for (const [key, value] of Object.entries(flat)) {
    const segments = key.split(separator);
    let node = root;

    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      const last = i === segments.length - 1;

      if (last) {
        if (Object.hasOwn(node, segment) && (isPlainObject(node[segment]) || Array.isArray(node[segment]))) {
          throw new Error(`Konflikt beim Unflatten: "${segments.slice(0, i + 1).join(separator)}" ist bereits verschachtelt.`);
        }
        node[segment] = value;
        break;
      }

      if (!Object.hasOwn(node, segment)) node[segment] = {};
      else if (!isPlainObject(node[segment])) {
        throw new Error(`Konflikt beim Unflatten: "${segments.slice(0, i + 1).join(separator)}" ist bereits ein Wert.`);
      }
      node = node[segment];
    }
  }

  return toArrays(root);
}
