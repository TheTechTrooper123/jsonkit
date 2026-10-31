# jsonkit

[![CI](https://github.com/TheTechTrooper123/jsonkit/actions/workflows/ci.yml/badge.svg)](https://github.com/TheTechTrooper123/jsonkit/actions/workflows/ci.yml)

JSON **formatieren**, **validieren**, **abfragen** und über eine Mapping-Spec
in eine andere Struktur **umbauen** - ein einziges CLI-Werkzeug, **0
Abhängigkeiten**, nur Node.js (>= 18).

```
$ jsonkit map examples/mapping.json examples/sample.json
{
  "orderId": "B-2026-0042",
  "customer": {
    "firstName": "Ada",
    "lastName": "LOVELACE",
    "email": "ada@example.com",
    "city": "London"
  },
  "items": [
    { "sku": "TEA-01", "label": "Earl Grey", "price": 7.5, "total": 7.5 },
    { "sku": "MUG-07", "label": "Porzellantasse", "price": 12, "total": 12 }
  ],
  "tags": ["express", "geschenk"],
  "createdAt": "2026-10-31T09:15:00.000Z",
  "channel": "web"
}
```

## Installation

```sh
git clone https://github.com/TheTechTrooper123/jsonkit.git
cd jsonkit
npm test          # 45 Tests, keine Abhängigkeiten nötig
npm link          # optional: `jsonkit` global verfügbar machen
```

Ohne `npm link` läuft alles auch direkt: `node src/cli.js ...`

## Befehle

| Befehl | Zweck |
| --- | --- |
| `jsonkit format [datei]` | JSON einrücken, sortieren, minifizieren |
| `jsonkit get <pfad> [datei]` | Wert(e) per Pfad-Ausdruck holen |
| `jsonkit map <spec.json> [datei]` | Quell-JSON über eine Spec umbauen |
| `jsonkit validate [datei]` | Nur prüfen, Exit-Code sagt alles |

Ohne Datei (oder mit `-`) wird von **stdin** gelesen, Ausgabe geht auf stdout
oder per `-o/--out` in eine Datei.

```sh
cat daten.json | jsonkit format --indent 4 --sort-keys
jsonkit get 'users[*].name' daten.json --raw
jsonkit map mapping.json daten.json -o ziel.json
jsonkit validate kaputt.json; echo $?
```

### Optionen

| Option | Bedeutung |
| --- | --- |
| `--indent N` | Einrückung in Leerzeichen (0 = kompakt) |
| `--tabs` | Einrückung mit Tabulatoren |
| `--sort-keys` | Objektschlüssel rekursiv alphabetisch sortieren |
| `--minify` | Kompakte Ausgabe in einer Zeile |
| `--raw` | `get`: Strings/Zahlen ohne JSON-Anführungszeichen |
| `--strict` | `map`: fehlender Pfad ist ein Fehler |
| `--null` | `map`: fehlende Pfade als `null` ausgeben |
| `-o, --out DATEI` | In Datei schreiben statt stdout |
| `--quiet` | Hinweise auf stderr unterdrücken |
| `-v, --version` / `-h, --help` | Version / Hilfe |

**Exit-Codes:** `0` = ok, `1` = ungültiges JSON / Fehler, `2` = Bedienfehler.

## Pfad-Ausdrücke

| Ausdruck | Bedeutung |
| --- | --- |
| `user.name` | verschachtelte Schlüssel |
| `items[0]`, `items[-1]` | Array-Index, negativ vom Ende |
| `items[*].sku`, `items.*.sku` | Wildcard über alle Elemente |
| `["a.b"]` | Schlüssel mit Punkten/Sonderzeichen |
| `$` | Dokumentwurzel (optionaler Präfix) |

`get` liefert bei mehreren Treffern ein Array, bei einem Treffer den Wert.

## Mapping-Spec

Die Spec ist selbst JSON. Jeder Wert ist entweder ein **Pfad**, ein
**verschachteltes Template**, ein **Feld mit Metadaten** oder ein **Literal**.

```json
{
  "orderId": "bestellung",
  "customer": {
    "from": "kunde",
    "map": {
      "firstName": { "path": "vorname", "transform": ["trim"] },
      "email": { "path": "email", "transform": "lower" },
      "city": "adresse.stadt"
    }
  },
  "items": {
    "from": "positionen",
    "each": { "sku": "sku", "price": { "path": "preis", "transform": ["number"] } }
  },
  "tags": { "path": "tags", "transform": ["unique", "sort"] },
  "channel": { "path": "quelle", "default": "web" },
  "version": 2,
  "quelle": { "value": "shop" }
}
```

| Spec-Form | Ergebnis |
| --- | --- |
| `"a.b"` | Wert am Pfad |
| `{ "path": "...", "default": ..., "transform": [...] }` | Feld mit Default und Transformationen |
| `{ "id": "...", "name": "..." }` | verschachteltes Objekt-Template |
| `{ "from": "kunde", "map": {...} }` | Template auf einen Teilbaum anwenden |
| `{ "from": "items", "each": {...} }` | jedes Array-Element abbilden |
| `{ "value": ... }` | Literal (Strings wären sonst Pfade) |
| `2`, `true`, `null` | Literal |

Fehlende Pfade werden **gesammelt** und als Hinweis auf stderr gemeldet -
nichts verschwindet still. Mit `--strict` bricht der Lauf ab, mit `--null`
werden fehlende Felder explizit `null`.

### Transformationen

`string`, `number`, `int`, `boolean`, `trim`, `upper`, `lower`, `length`,
`keys`, `values`, `unique`, `compact`, `reverse`, `sort`, `isodate`

Transformationen laufen in der angegebenen Reihenfolge. Schlägt eine fehl
(z. B. `number` auf `"abc"`), bleibt der Originalwert stehen und es gibt eine
Warnung - kein stiller Datenverlust, kein Abbruch.

## Bibliothek

```js
import { formatText, mapDocument, parseJson, queryPath } from 'jsonkit';

const text = formatText('{"b":1,"a":2}', { sortKeys: true, indent: 4 });
const { value, missing, warnings } = mapDocument(parseJson(text), {
  erste: 'a',
  namen: 'users[*].name',
});
```

### Fehler mit Position

`parseJson` liefert bei kaputtem JSON Zeile und Spalte statt einer rohen
V8-Meldung:

```
$ echo '{"a": 1,}' | jsonkit validate
jsonkit: <stdin>: Ungültiges JSON (Zeile 1, Spalte 9): Schlüssel in Anführungszeichen erwartet, gefunden "}"
```

## Projektstruktur

```
src/parse.js   JSON lesen, Fehler mit Zeile/Spalte
src/path.js    Pfad-Ausdrücke (Punkte, Indizes, Wildcards)
src/format.js  eigener Serializer (Tabs, sortierte Schlüssel, Zyklen-Erkennung)
src/map.js     Mapping-Engine mit Transformationen
src/cli.js     CLI (Argumente, stdin/stdout, Exit-Codes)
test/          node:test-Suites für alle Module
examples/      Beispieldaten und Mapping-Spec
```

Bewusst **ohne** externe Abhängigkeiten: der eigene Serializer ist nötig, weil
`JSON.stringify` keine Tabulatoren, keine sortierten Schlüssel und keine
brauchbare Zyklus-Meldung kann.

## Entwicklung

```sh
npm test                       # alle Tests
node --test test/map.test.js   # einzelne Suite
node --check src/cli.js        # Syntaxcheck
```

CI läuft über GitHub Actions auf Node 20 und 22 (`.github/workflows/ci.yml`).

## Lizenz

MIT - siehe [LICENSE](LICENSE).
