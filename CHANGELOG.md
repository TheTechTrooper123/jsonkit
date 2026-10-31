# Changelog

Alle nennenswerten Änderungen an jsonkit. Format orientiert sich an
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung an
[SemVer](https://semver.org/lang/de/).

## [0.2.0] - 2026-10-31

### Hinzugefügt

- `jsonkit set <pfad> <wert>` - Werte setzen, fehlende Container anlegen
  (`--string` erzwingt einen String).
- `jsonkit del <pfad>` - Schlüssel und Array-Elemente löschen.
- `jsonkit keys [pfad] [datei]` - Schlüssel bzw. Indizes auflisten (`--raw`
  für eine Zeile pro Eintrag).
- `jsonkit flatten` / `jsonkit unflatten` - flache und verschachtelte Form,
  eigener Trenner über `--separator`.
- `jsonkit diff <a> <b>` - struktureller Vergleich mit Pfadangaben, Exit-Code 1
  bei Unterschieden.
- `jsonkit merge <patch> [datei]` - Deep-Merge mit `--arrays replace|concat|merge`.
- Filter-Ausdrücke in Pfaden: `items[?(@.preis > 10)]`, `items[?(@.lager)]`.
- `--jsonc` - Kommentare und Trailing Commas in Eingaben erlauben.
- `--jsonl` - JSON Lines lesen und schreiben (`format`, `validate`).

### Behoben

- Fehlerpositionen werden jetzt unabhängig von der V8-Version selbst ermittelt
  (Node 22+ liefert in `JSON.parse` keine Position mehr).
- Negative Indizes beim Setzen unterhalb des Array-Anfangs werden sauber
  abgelehnt; entstehende Lücken werden mit `null` gefüllt.

### Geändert

- Neue Module `mutate`, `diff`, `merge`, `jsonc`, `jsonl`; die öffentliche API
  exportiert sie mit.

## [0.1.0] - 2026-10-31

### Hinzugefügt

- `format`, `get`, `map`, `validate` sowie die Bibliotheks-API.
- Eigener Serializer mit Tabs, sortierten Schlüsseln und Zyklen-Erkennung.
- Mapping-Spec mit `path`/`from`/`map`/`each`/`default`/`transform`/`value`
  und 16 Transformationen.
- Fehlermeldungen mit Zeile und Spalte.
