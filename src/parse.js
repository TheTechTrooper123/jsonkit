/**
 * Fehlertolerantes Einlesen von JSON-Text mit Zeilen-/Spaltenangabe.
 *
 * V8 liefert je nach Version keine verlässliche Position mehr ("Unexpected
 * token '}', ... is not valid JSON"), deshalb läuft im Fehlerfall ein kleiner
 * Scanner über den Text, der die erste fehlerhafte Stelle findet. Geparst wird
 * weiterhin mit JSON.parse - der Scanner dient nur der Diagnose.
 */

const POSITION_RE = /at position (\d+)/;
const LINE_COLUMN_RE = /line (\d+) column (\d+)/;

export class JsonSyntaxError extends Error {
  constructor(message, { text = '', index = null, filename = null } = {}) {
    const location = typeof index === 'number' ? locate(text, index) : null;
    const suffix = location ? ` (Zeile ${location.line}, Spalte ${location.column})` : '';
    const prefix = filename ? `${filename}: ` : '';
    super(`${prefix}Ungültiges JSON${suffix}: ${message}`);
    this.name = 'JsonSyntaxError';
    this.filename = filename;
    this.line = location ? location.line : null;
    this.column = location ? location.column : null;
    this.index = typeof index === 'number' ? index : null;
    this.exitCode = 1;
  }
}

/** Wandelt einen Zeichenindex in 1-basierte Zeile/Spalte um. */
export function locate(text, index) {
  const clamped = Math.max(0, Math.min(index, text.length));
  const before = text.slice(0, clamped);
  const lines = before.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

/** Index aus Zeile/Spalte (1-basiert) berechnen. */
function indexFromLineColumn(text, line, column) {
  const lines = text.split('\n');
  let index = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i += 1) index += lines[i].length + 1;
  return index + (column - 1);
}

/** Entfernt ein eventuell vorhandenes UTF-8-BOM. */
export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

class Scanner {
  constructor(text) {
    this.text = text;
    this.pos = 0;
  }

  fail(message) {
    const error = new Error(message);
    error.index = this.pos;
    throw error;
  }

  describe() {
    if (this.pos >= this.text.length) return 'Dateiende';
    return `"${this.text[this.pos]}"`;
  }

  skipWhitespace() {
    while (this.pos < this.text.length && WHITESPACE.has(this.text[this.pos])) this.pos += 1;
  }

  readLiteral(word, index) {
    if (!this.text.startsWith(word, index)) this.fail(`Unerwartetes Zeichen ${this.describe()}`);
  }

  readString() {
    this.pos += 1; // öffnendes "
    while (this.pos < this.text.length) {
      const char = this.text[this.pos];
      if (char === '"') {
        this.pos += 1;
        return;
      }
      if (char === '\\') {
        this.pos += 1;
        const escape = this.text[this.pos];
        if (escape === 'u') {
          const hex = this.text.slice(this.pos + 1, this.pos + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail(`Ungültige Unicode-Escape \\u${hex}`);
          this.pos += 5;
          continue;
        }
        if (escape === undefined || !'"\\/bfnrt'.includes(escape)) {
          this.fail(`Ungültige Escape-Sequenz \\${escape ?? ''}`);
        }
        this.pos += 1;
        continue;
      }
      if (char === '\n' || char === '\r') this.fail('Zeilenumbruch in einer Zeichenkette');
      this.pos += 1;
    }
    this.fail('Nicht beendete Zeichenkette');
  }

  readValue() {
    this.skipWhitespace();
    if (this.pos >= this.text.length) this.fail('Unerwartetes Dateiende, Wert erwartet');

    const char = this.text[this.pos];

    if (char === '{') {
      this.pos += 1;
      this.skipWhitespace();
      if (this.text[this.pos] === '}') {
        this.pos += 1;
        return;
      }
      for (;;) {
        this.skipWhitespace();
        if (this.text[this.pos] !== '"') this.fail(`Schlüssel in Anführungszeichen erwartet, gefunden ${this.describe()}`);
        this.readString();
        this.skipWhitespace();
        if (this.text[this.pos] !== ':') this.fail(`":" erwartet, gefunden ${this.describe()}`);
        this.pos += 1;
        this.readValue();
        this.skipWhitespace();
        if (this.text[this.pos] === ',') {
          this.pos += 1;
          continue;
        }
        if (this.text[this.pos] === '}') {
          this.pos += 1;
          return;
        }
        this.fail(`"," oder "}" erwartet, gefunden ${this.describe()}`);
      }
    }

    if (char === '[') {
      this.pos += 1;
      this.skipWhitespace();
      if (this.text[this.pos] === ']') {
        this.pos += 1;
        return;
      }
      for (;;) {
        this.readValue();
        this.skipWhitespace();
        if (this.text[this.pos] === ',') {
          this.pos += 1;
          continue;
        }
        if (this.text[this.pos] === ']') {
          this.pos += 1;
          return;
        }
        this.fail(`"," oder "]" erwartet, gefunden ${this.describe()}`);
      }
    }

    if (char === '"') {
      this.readString();
      return;
    }
    if (char === 't') {
      this.readLiteral('true', this.pos);
      this.pos += 4;
      return;
    }
    if (char === 'f') {
      this.readLiteral('false', this.pos);
      this.pos += 5;
      return;
    }
    if (char === 'n') {
      this.readLiteral('null', this.pos);
      this.pos += 4;
      return;
    }
    if (char === '-' || (char >= '0' && char <= '9')) {
      const match = NUMBER_RE.exec(this.text.slice(this.pos));
      if (!match) this.fail(`Ungültige Zahl bei ${this.describe()}`);
      this.pos += match[0].length;
      return;
    }

    this.fail(`Unerwartetes Zeichen ${this.describe()}`);
  }

  scanDocument() {
    this.readValue();
    this.skipWhitespace();
    if (this.pos < this.text.length) this.fail(`Unerwarteter Text nach dem JSON-Wert: ${this.describe()}`);
  }
}

/**
 * Sucht die erste fehlerhafte Stelle. Liefert `{ index, message }` oder `null`,
 * wenn der Text gültig ist.
 */
export function findSyntaxError(text) {
  const scanner = new Scanner(text);
  try {
    scanner.scanDocument();
    return null;
  } catch (error) {
    return { index: error.index ?? 0, message: error.message };
  }
}

/**
 * Parst JSON-Text und wirft bei Fehlern einen JsonSyntaxError mit Position.
 *
 * @param {string} text
 * @param {{ filename?: string }} [options]
 * @returns {unknown}
 */
export function parseJson(text, { filename = null } = {}) {
  if (typeof text !== 'string') {
    throw new TypeError('parseJson erwartet einen String.');
  }
  const source = stripBom(text);
  if (source.trim() === '') {
    throw new JsonSyntaxError('Eingabe ist leer', { text: source, index: 0, filename });
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    const scan = findSyntaxError(source);
    if (scan) throw new JsonSyntaxError(scan.message, { text: source, index: scan.index, filename });

    const message = String(error.message);
    const positionMatch = POSITION_RE.exec(message);
    const lineColumnMatch = LINE_COLUMN_RE.exec(message);
    const index = positionMatch
      ? Number(positionMatch[1])
      : lineColumnMatch
        ? indexFromLineColumn(source, Number(lineColumnMatch[1]), Number(lineColumnMatch[2]))
        : null;

    throw new JsonSyntaxError(message.trim(), { text: source, index, filename });
  }
}
