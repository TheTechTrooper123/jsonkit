/**
 * JSON Lines (JSONL / NDJSON): ein JSON-Wert pro Zeile.
 */

import { parseJson } from './parse.js';
import { stringifyJson } from './format.js';

/**
 * Liest JSON Lines. Leere Zeilen werden übersprungen.
 *
 * @param {string} text
 * @param {{ filename?: string }} [options]
 * @returns {unknown[]}
 */
export function parseJsonl(text, { filename = null } = {}) {
  const values = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.trim() === '') return;
    try {
      values.push(parseJson(line, { filename: filename ? `${filename}:${index + 1}` : `Zeile ${index + 1}` }));
    } catch (error) {
      if (typeof error.index === 'number' && filename === null) {
        error.message = `Zeile ${index + 1}: ${error.message.replace(/^Ungültiges JSON[^:]*: /, '')}`;
      }
      throw error;
    }
  });

  return values;
}

/**
 * Schreibt Werte als JSON Lines (ein kompakter Wert pro Zeile).
 *
 * @param {unknown[]} values
 * @param {{ sortKeys?: boolean }} [options]
 * @returns {string}
 */
export function stringifyJsonl(values, { sortKeys = false } = {}) {
  if (!Array.isArray(values)) throw new TypeError('stringifyJsonl erwartet ein Array.');
  if (values.length === 0) return '';
  const lines = values.map((value) => stringifyJson(value, { indent: 0, sortKeys, trailingNewline: false }));
  return `${lines.join('\n')}\n`;
}
