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
| Vieleck (n-Eck) / Langloch | `N` (beim Ziehen `+`/`-` = Ecken) / `O` (Rechteck aufziehen) |
| Maße eintippen | Beim Aufziehen oder Linienzeichnen Zahl tippen, `Enter`: Rechteck/Langloch `20x10`, Kreis/n-Eck Radius, Linie Länge in Mausrichtung |
| Vieleck skizzieren | `L`, Punkte klicken; Klick auf den ersten Punkt oder `Enter` schließt, `Esc` bricht ab |
| Bogen | Im Linien-Werkzeug vom letzten Punkt aus ziehen statt klicken (schließt tangential an) |
| Spline | `S`, Punkte klicken – die Kurve läuft glatt hindurch; Klick auf den ersten Punkt oder `Enter` schließt |
| Bereiche | Überschneiden sich flache Skizzen, zieht man nur den angeklickten Bereich (z. B. die Schnittmenge) |
| Versatz | Flache Skizze anklicken, im Seitenfeld Abstand eingeben (minus = nach innen) → „Versatz anlegen“ |
| Muster / Spiegeln | Skizze oder Körper-Feature anklicken → Seitenfeld „Muster / Spiegeln“: Reihe entlang X/Y/Z, Kreis um eine Achse oder Spiegeln (Ebene durch den Ursprung) |
| Punkte verschieben | Vieleck oder Spline anklicken (auch als Körper) – die Punkte erscheinen und lassen sich ziehen |
| Einrasten | Beim Skizzieren rastet der Mauszeiger an Ecken, Kantenmitten, Schnittpunkten, Mittelpunkten, dem Ursprung und an Kanten/Linien ein (oranger Punkt); `Shift` schaltet Einrasten und Raster ab |
| Ausrichten | Liegt der Zeiger waagrecht oder senkrecht zu einem Punkt, rastet er dort ein (orange Hilfslinie) |
| Bohrung / Tasche | Skizze auf einer Fläche in den Körper hineindrücken |
| Rundung / Fase | Kante anfassen: vom Körper wegziehen = Rundung, in den Körper hineinschieben = Fase; Maß im Seitenfeld |
| Export | STL (3D-Druck) oder STEP (CAD, Fertigung) |
| STEP-Import | „Öffnen“ und eine .step/.stp-Datei wählen |
| Drehen / Verschieben / Zoomen | Links ins Leere / Rechts / Mausrad |
| Rückgängig / Wiederholen | `Strg+Z` / `Strg+Y` |
| Feature-Baum | Liste „Schritte“ rechts unten: anklicken = auswählen, `↑` = früher ausführen, `●`/`○` = ein-/ausschalten |
| Drehkörper / Nut | Flache Skizze anklicken → Seitenfeld „Drehen um“ x- oder y-Achse der Skizze; Winkel und „Abziehen (Nut)“ im Seitenfeld |
| Schale | `H`, Fläche des Körpers anklicken, die offen bleiben soll; Wandstärke im Seitenfeld |
| Werkzeugsuche | `Strg+K`, tippen, `Enter` |
| Ansichten | Kasten unten links oder Tasten `0` Iso, `1` Vorne, `2` Oben, `3` Rechts, `F` Einpassen |
| Messen | `M`, zwei Punkte anklicken (Ecken rasten ein): Abstand und ΔX/ΔY/ΔZ; Volumen und Oberfläche stehen über der Schrittliste |
| Darstellung | Kasten unten links: Draht, Transparent, Kanten, Schnitt (aus → X → Y → Z, durch die Mitte), Render, Farbe |
| Mehrere Körper | Skizze auf dem Boden = neuer Körper, auf einer Fläche = gehört zu deren Körper. Körper in der Liste „Körper“ anklicken → Seitenfeld: Verschieben/Drehen mit Griffen oder genau per Zahl, mit anderem Körper vereinigen, abziehen, Schnittmenge |
| Löschen | `Entf` |
| Frei (ohne Raster) | `Shift` gedrückt halten |
