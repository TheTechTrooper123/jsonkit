/**
 * JSONC: JSON mit Kommentaren und optionalen Kommas am Ende.
 *
 * Wird z. B. von Konfigurationsdateien (VS Code, tsconfig) verwendet. Der
 * eigentliche Parser bleibt JSON.parse - hier wird nur der Text bereinigt,
 * und zwar stringbewusst: `//` innerhalb einer Zeichenkette bleibt erhalten.
 */

import { parseJson } from './parse.js';

/**
 * Entfernt //- und /* *\/-Kommentare, ohne Zeichenketten anzutasten.
 * Die Zeilenzahl bleibt erhalten (Kommentare werden durch Leerzeichen ersetzt),
 * damit Fehlerpositionen weiter stimmen.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripComments(text) {
  let out = '';
  let i = 0;
  let inString = false;

  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];

    if (inString) {
      out += char;
      if (char === '\\') {
        out += text[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (char === '"') inString = false;
      i += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      i += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }

    out += char;
    i += 1;
  }

  return out;
}

/**
 * Entfernt Kommas direkt vor `}` oder `]`, ebenfalls stringbewusst.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripTrailingCommas(text) {
  let out = '';
  let i = 0;
  let inString = false;

  while (i < text.length) {
    const char = text[i];

    if (inString) {
      out += char;
      if (char === '\\') {
        out += text[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (char === '"') inString = false;
      i += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      i += 1;
      continue;
    }

    if (char === ',') {
      let lookahead = i + 1;
      while (lookahead < text.length && /\s/.test(text[lookahead])) lookahead += 1;
      if (text[lookahead] === '}' || text[lookahead] === ']') {
        i += 1;
        continue;
      }
    }

    out += char;
    i += 1;
  }

  return out;
}

/**
 * Parst JSONC-Text (Kommentare + Trailing Commas erlaubt).
 *
 * @param {string} text
 * @param {{ filename?: string, trailingCommas?: boolean }} [options]
 * @returns {unknown}
 */
export function parseJsonc(text, { filename = null, trailingCommas = true } = {}) {
  let source = stripComments(text);
  if (trailingCommas) source = stripTrailingCommas(source);
  return parseJson(source, { filename });
}
