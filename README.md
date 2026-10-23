# OpenForm CAD

Ein 3D-CAD-Programm, so intuitiv wie Shapr3D und so frei wie FreeCAD — mit optionaler KI-Unterstützung.

**Status:** Prototyp (M0). Siehe [docs/PLAN.md](docs/PLAN.md) für Ziele und Meilensteine.

## Prototyp starten

Der Prototyp ist eine einzelne HTML-Datei und braucht einen lokalen Webserver (ES-Module):

```bash
python -m http.server 8123 --directory prototype
```

Dann <http://localhost:8123> öffnen.

## Bedienung

| Aktion | Eingabe |
|---|---|
| Auswählen / Fläche ziehen | `V`, Linksklick/-ziehen auf Körper |
| Rechteck / Kreis skizzieren | `R` / `C`, auf Boden oder Fläche ziehen |
| Drehen / Verschieben / Zoomen | Links ins Leere / Rechts / Mausrad |
| Rückgängig / Wiederholen | `Strg+Z` / `Strg+Y` |
| Löschen | `Entf` |
| Frei (ohne Raster) | `Shift` gedrückt halten |
