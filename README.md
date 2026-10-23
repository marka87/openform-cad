# OpenForm CAD

Ein 3D-CAD-Programm, so intuitiv wie Shapr3D und so frei wie FreeCAD — mit optionaler KI-Unterstützung.

**Status:** M1 fertig (echter CAD-Kern: OpenCascade über replicad), M2 (Skizzieren) läuft. Ziele in [docs/PLAN.md](docs/PLAN.md), Aufgaben in [docs/ROADMAP.md](docs/ROADMAP.md).

## Starten

Braucht Node.js 20 oder neuer.

```bash
npm install
npm run dev
```

Dann <http://localhost:5173> öffnen. Tests laufen mit `npm test`, den Build erzeugt `npm run build`.

## Bedienung

| Aktion | Eingabe |
|---|---|
| Auswählen / Fläche ziehen | `V`, Linksklick/-ziehen auf Körper |
| Rechteck / Kreis skizzieren | `R` / `C`, auf Boden oder Fläche ziehen |
| Vieleck skizzieren | `L`, Punkte klicken; Klick auf den ersten Punkt oder `Enter` schließt, `Esc` bricht ab |
| Bogen | Im Linien-Werkzeug vom letzten Punkt aus ziehen statt klicken (schließt tangential an) |
| Bohrung / Tasche | Skizze auf einer Fläche in den Körper hineindrücken |
| Rundung / Fase | Kante anfassen und vom Körper wegziehen; Art und Maß im Seitenfeld |
| Export | STL (3D-Druck) oder STEP (CAD, Fertigung) |
| STEP-Import | „Öffnen“ und eine .step/.stp-Datei wählen |
| Drehen / Verschieben / Zoomen | Links ins Leere / Rechts / Mausrad |
| Rückgängig / Wiederholen | `Strg+Z` / `Strg+Y` |
| Löschen | `Entf` |
| Frei (ohne Raster) | `Shift` gedrückt halten |
