/**
 * Deep-Merge zweier JSON-Werte.
 *
 * Objekte werden rekursiv zusammengeführt (Patch gewinnt bei Konflikten),
 * Arrays standardmäßig ersetzt. Mit `arrays: 'concat'` werden sie
 * aneinandergereiht, mit `arrays: 'merge'` elementweise zusammengeführt.
 */

import { isPlainObject } from './path.js';

const ARRAY_STRATEGIES = new Set(['replace', 'concat', 'merge']);

function mergeValues(base, patch, strategy) {
  if (Array.isArray(base) && Array.isArray(patch)) {
    if (strategy === 'concat') return [...base, ...patch];
    if (strategy === 'merge') {
      const length = Math.max(base.length, patch.length);
      const result = [];
      for (let i = 0; i < length; i += 1) {
        if (i >= patch.length) result.push(base[i]);
        else if (i >= base.length) result.push(patch[i]);
        else result.push(mergeValues(base[i], patch[i], strategy));
      }
      return result;
    }
    return patch;
  }

  if (isPlainObject(base) && isPlainObject(patch)) {
    const result = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        delete result[key];
        continue;
      }
      result[key] = Object.hasOwn(base, key) ? mergeValues(base[key], value, strategy) : value;
    }
    return result;
  }

  return patch;
}

/**
 * Führt `patch` in `base` ein (base bleibt unverändert).
 *
 * @param {unknown} base
 * @param {unknown} patch
 * @param {{ arrays?: 'replace'|'concat'|'merge' }} [options]
 * @returns {unknown}
 */
export function mergeJson(base, patch, { arrays = 'replace' } = {}) {
  if (!ARRAY_STRATEGIES.has(arrays)) {
    throw new TypeError(`arrays muss "replace", "concat" oder "merge" sein, nicht "${arrays}".`);
  }
  return mergeValues(base, patch, arrays);
}
