/**
 * Struktureller Vergleich zweier JSON-Werte.
 *
 * Liefert eine flache Liste von Änderungen mit Pfadangabe. Schlüsselreihen-
 * folge in Objekten spielt keine Rolle, Reihenfolge in Arrays schon.
 */

import { isPlainObject } from './path.js';

function compare(left, right, path, changes) {
  if (Object.is(left, right)) return;

  const leftObject = isPlainObject(left);
  const rightObject = isPlainObject(right);

  if (leftObject && rightObject) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      const childPath = `${path}.${key}`;
      const inLeft = Object.hasOwn(left, key);
      const inRight = Object.hasOwn(right, key);
      if (!inRight) changes.push({ path: childPath, type: 'remove', before: left[key] });
      else if (!inLeft) changes.push({ path: childPath, type: 'add', after: right[key] });
      else compare(left[key], right[key], childPath, changes);
    }
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    for (let i = 0; i < length; i += 1) {
      const childPath = `${path}[${i}]`;
      if (i >= right.length) changes.push({ path: childPath, type: 'remove', before: left[i] });
      else if (i >= left.length) changes.push({ path: childPath, type: 'add', after: right[i] });
      else compare(left[i], right[i], childPath, changes);
    }
    return;
  }

  changes.push({ path, type: 'change', before: left, after: right });
}

/**
 * Vergleicht zwei Werte.
 *
 * @param {unknown} left
 * @param {unknown} right
 * @returns {Array<{ path: string, type: 'add'|'remove'|'change', before?: unknown, after?: unknown }>}
 */
export function diffJson(left, right) {
  const changes = [];
  compare(left, right, '$', changes);
  return changes;
}

/** true, wenn sich beide Werte unterscheiden. */
export function hasDiff(left, right) {
  return diffJson(left, right).length > 0;
}
