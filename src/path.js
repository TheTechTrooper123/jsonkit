/**
 * Pfad-Ausdrücke für JSON-Werte.
 *
 * Syntax:
 *   a.b.c            verschachtelte Schlüssel
 *   a.0 / a[-1]      Array-Index (auch negativ, vom Ende)
 *   a[*] / a.*       Wildcard: alle Elemente eines Arrays bzw. Objekts
 *   a["b.c"]         Schlüssel mit Punkten/Sonderzeichen (auch '...')
 *   $                Dokumentwurzel (optionaler Präfix)
 *
 * `queryPath` liefert immer ein Array (mehrere Treffer durch Wildcards),
 * `getPath` nur den ersten Treffer.
 */

export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findClosingBracket(expr, start) {
  let quote = null;
  let escaped = false;
  for (let i = start + 1; i < expr.length; i += 1) {
    const char = expr[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ']') return i;
  }
  throw new SyntaxError(`Fehlende schließende Klammer im Pfad "${expr}".`);
}

function unquote(raw) {
  return raw.slice(1, -1).replace(/\\(.)/g, '$1');
}

/**
 * Zerlegt einen Pfad-Ausdruck in Tokens.
 *
 * @param {string} expr
 * @returns {Array<{ type: 'key', key: string } | { type: 'index', index: number } | { type: 'wildcard' }>}
 */
export function parsePath(expr) {
  if (typeof expr !== 'string') throw new TypeError('Pfad muss ein String sein.');

  const source = expr.trim();
  const tokens = [];
  let i = 0;

  if (source.startsWith('$')) {
    i = 1;
    const next = source[i];
    if (next !== undefined && next !== '.' && next !== '[') {
      throw new SyntaxError(`"$" muss von "." oder "[" gefolgt sein, nicht von "${next}" (Pfad "${expr}").`);
    }
  }

  while (i < source.length) {
    const char = source[i];

    if (char === '.') {
      i += 1;
      continue;
    }

    if (char === '[') {
      const end = findClosingBracket(source, i);
      const inner = source.slice(i + 1, end).trim();
      if (inner === '*') tokens.push({ type: 'wildcard' });
      else if (/^-?\d+$/.test(inner)) tokens.push({ type: 'index', index: Number(inner) });
      else if (/^(["']).*\1$/s.test(inner)) tokens.push({ type: 'key', key: unquote(inner) });
      else throw new SyntaxError(`Ungültiger Ausdruck "[${inner}]" im Pfad "${expr}".`);
      i = end + 1;
      continue;
    }

    let end = i;
    while (end < source.length && source[end] !== '.' && source[end] !== '[') end += 1;
    const key = source.slice(i, end);
    if (key === '') throw new SyntaxError(`Leerer Schlüssel an Position ${i} im Pfad "${expr}".`);

    if (key === '*') tokens.push({ type: 'wildcard' });
    else if (/^\d+$/.test(key)) tokens.push({ type: 'index', index: Number(key) });
    else tokens.push({ type: 'key', key });

    i = end;
  }

  return tokens;
}

/**
 * Löst einen Pfad gegen einen Wert auf und liefert alle Treffer.
 *
 * @param {unknown} root
 * @param {string} expr
 * @returns {unknown[]}
 */
export function queryPath(root, expr) {
  let current = [root];

  for (const token of parsePath(expr)) {
    const next = [];
    for (const value of current) {
      if (token.type === 'wildcard') {
        if (Array.isArray(value)) next.push(...value);
        else if (isPlainObject(value)) next.push(...Object.values(value));
      } else if (token.type === 'index') {
        if (Array.isArray(value)) {
          const index = token.index < 0 ? value.length + token.index : token.index;
          if (index >= 0 && index < value.length) next.push(value[index]);
        }
      } else if (isPlainObject(value) && Object.hasOwn(value, token.key)) {
        next.push(value[token.key]);
      }
    }
    current = next;
    if (current.length === 0) break;
  }

  return current;
}

/**
 * Erster Treffer eines Pfades oder `undefined`.
 *
 * @param {unknown} root
 * @param {string} expr
 * @returns {unknown}
 */
export function getPath(root, expr) {
  const values = queryPath(root, expr);
  return values.length === 0 ? undefined : values[0];
}
