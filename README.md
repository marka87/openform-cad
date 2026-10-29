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

### Als Desktop-App (Windows)

Braucht zusätzlich Rust (rustup, im Benutzerordner) und LLVM-MinGW (`winget install MartinStorsjo.LLVM-MinGW.UCRT`); Admin-Rechte sind nicht nötig. Die passende Rust-Toolchain (`gnullvm`) legt `src-tauri/rust-toolchain.toml` fest und wird beim ersten Bau geholt.

```bash
npm run desktop
```

startet die App mit Live-Neuladen. `npm run desktop:build` baut den Installer nach `src-tauri/target/release/bundle/nsis/` (installiert nur für den aktuellen Benutzer; unsigniert, deshalb fragt Windows SmartScreen beim ersten Start nach).

## Bedienung

| Aktion | Eingabe |
|---|---|
| Auswählen / Fläche ziehen | `V`, Linksklick/-ziehen auf Körper |
| Rechteck / Kreis skizzieren | `R` / `C`, auf Boden oder Fläche ziehen |
| Vieleck (n-Eck) / Langloch | `N` (beim Ziehen `+`/`-` = Ecken) / `O` (Rechteck aufziehen) |
| Maße eintippen | Beim Aufziehen oder Linienzeichnen Zahl tippen, `Enter`: Rechteck/Langloch `20x10`, Kreis/n-Eck Radius, Linie Länge in Mausrichtung |
| Vieleck skizzieren | `L`, Punkte klicken; Klick auf den ersten Punkt oder `Enter` schließt, `Esc` bricht ab |
| Bogen | Im Linien-Werkzeug vom letzten Punkt aus ziehen statt klicken (schließt tangential an) – oder `A`: Anfang, Ende, Punkt auf dem Bogen klicken; `L`/`A` wechseln mitten in der Form |
| Ellipse | `I`, vom Mittelpunkt aus ziehen; Halbachsen im Seitenfeld |
| Spline | `S`, Punkte klicken – die Kurve läuft glatt hindurch; Klick auf den ersten Punkt oder `Enter` schließt |
| Bereiche | Überschneiden sich flache Skizzen, zieht man nur den angeklickten Bereich (z. B. die Schnittmenge) |
| Versatz | Flache Skizze anklicken, im Seitenfeld Abstand eingeben (minus = nach innen) → „Versatz anlegen“ |
| Muster / Spiegeln | Skizze oder Körper-Feature anklicken → Seitenfeld „Muster / Spiegeln“: Reihe entlang X/Y/Z, Kreis um eine Achse oder Spiegeln (Ebene durch den Ursprung) |
| Punkte verschieben | Vieleck oder Spline anklicken (auch als Körper) – die Punkte erscheinen und lassen sich ziehen |
| Einrasten | Beim Skizzieren zeigt ein Punkt am Zeiger, wo der Klick landet: blau Raster, orange Endpunkt/Mitte/Schnitt/Ursprung, gelb auf Linie; liegt ein Flächenraster, rasten auch Flächenmitte, Ecken, Kantenmitten und Bohrungsmitten ein (weiße Punkte); `Shift` = frei. Raster unten links „Auto“ passt sich dem Zoom an |
| Linienkette | `L`: Punkte klicken; Doppelklick, Klick auf den letzten Punkt, `Enter`, `Esc` oder Rechtsklick = offene Linie fertig; Klick auf den ersten Punkt = geschlossene Fläche |
| Auf die Fläche schauen | Raster liegt (Doppelklick auf eine Fläche): `Leertaste` = senkrecht draufschauen, nochmal = zurück |
| Ausrichten | Liegt der Zeiger waagrecht oder senkrecht zu einem Punkt, rastet er dort ein (orange Hilfslinie) |
| Bohrung / Tasche | Skizze auf einer Fläche in den Körper hineindrücken |
| Rundung / Fase | Kante anfassen: vom Körper wegziehen = Rundung, in den Körper hineinschieben = Fase; Maß im Seitenfeld |
| Export | STL (3D-Druck) oder STEP (CAD, Fertigung) |
| STEP-Import | „Öffnen“ und eine .step/.stp-Datei wählen |
| Drehen / Verschieben / Zoomen | Links ins Leere / Rechts / Mausrad |
| Rückgängig / Wiederholen | `Strg+Z` / `Strg+Y` |
| Feature-Baum | Liste „Schritte“ rechts unten: anklicken = auswählen, ziehen = umsortieren, Doppelklick = umbenennen, `⏮` = bis hier zurückspulen (neue Schritte kommen dorthin), `●`/`○` = ein-/ausschalten |
| Drehkörper / Nut | Flache Skizze anklicken → Seitenfeld „Drehen um“ x- oder y-Achse der Skizze; Winkel und „Abziehen (Nut)“ im Seitenfeld |
| Schale | `H`, Fläche des Körpers anklicken, die offen bleiben soll; nochmal `H` + Shift+Klick = weitere offene Fläche; Wandstärke im Seitenfeld |
| Werkzeugsuche | `Strg+K`, tippen, `Enter` |
| Ansichten | Kasten unten links oder Tasten `0` Iso, `1` Vorne, `2` Oben, `3` Rechts, `F` Einpassen |
| Messen | `M`, zwei Punkte anklicken (Ecken rasten ein): Abstand und ΔX/ΔY/ΔZ, bei zwei Flächen auch deren Winkel; Volumen und Oberfläche stehen über der Schrittliste |
| Darstellung | Kasten unten links: Draht, Transparent, Kanten, Schnitt (aus → X → Y → Z; Regler verschiebt die Ebene, Schnittfläche gefüllt), Render, Farbe, Einheit mm/Zoll |
| Mehrere Körper | Skizze auf dem Boden = neuer Körper, auf einer Fläche = gehört zu deren Körper. Körper in der Liste „Körper“ anklicken → Seitenfeld: Verschieben/Drehen mit Griffen oder genau per Zahl, mit anderem Körper vereinigen, abziehen, Schnittmenge; Name, Farbe, Werkstoff (→ Masse), skalieren, an einer Hilfsebene teilen; `●`/`○` blendet aus |
| Maße und Abhängigkeiten | Vieleck anklicken → Seitenfeld „Maße und Abhängigkeiten“: Länge je Seite eintippen (festgelegt = orange), `—` waagrecht, `\|` senkrecht, zwei Seiten ∥ parallel / ⟂ rechtwinklig / = gleich lang; ✕ entfernt. Die Skizze hält die Abhängigkeiten auch beim Ziehen |
| Auswahl | Fläche/Kante leuchtet beim Überfahren; Shift+Klick wählt weitere Schritte oder Kanten (mehrere Kanten auf einmal runden/fasen) |
| Rechtsklick | Menü mit den passenden Befehlen (Löschen, Ausschalten, Duplizieren, Körper wählen …); rechts ziehen = verschieben |
| Kopieren / Duplizieren | `Strg+C` / `Strg+V` / `Strg+D` – Skizzen, Features oder ganze Körper, um 10 mm versetzt |
| Maß beim Ziehen | Beim Ziehen einer Fläche Zahl tippen + `Enter` = genaue Höhe/Breite/Radius |
| Letztes Werkzeug | `Leertaste` (Maus nicht über einer Fläche) |
| Ansichtswürfel | Oben links: Seite anklicken; Mausrad zoomt zur Mausposition, Doppelklick zentriert |
| Hilfsebene | `E`, Fläche anklicken = Ebene 10 mm davor (ziehen = Abstand), darauf skizzieren |
| Zeichnung | „Zeichnung / mehr“: Blatt A4/A3 als SVG oder drucken (→ „Als PDF speichern“) mit drei Ansichten, Gesamtmaßen, Iso-Ansicht und Schriftfeld, in mm oder Zoll; Ansichten als DXF; Körper als OBJ |
| Bemaßen | „Zeichnung / mehr“ → „Zeichnung bemaßen …“: Länge (zwei Ecken, dann ablegen; Shift = schräg), ⌀ / R (Kreis anklicken), Winkel (zwei Kanten); Maße ziehen = verschieben, Entf = löschen, Toleranz als Text (±0,1, H7). Maße hängen am Modell und folgen Änderungen |
| Übergang (Loft) | Flache Skizze anklicken, zweite mit Shift dazu → Seitenfeld „Übergang (Loft)“ |
| Zug (Sweep) | Flache Skizze anklicken → „Zug: Pfad zeichnen“ (oder „quer dazu“), Pfad vom Profil weg klicken, Vorschau läuft mit; Enter = offen, Klick auf den Anfang = geschlossen; runde Ecken = Bögen im Pfad; im Seitenfeld „Abziehen“ |
| Gewinde / Senkung | Bohrung anklicken → Seitenfeld: Kernloch M3–M12, „Senkung anlegen“ |
| Hilfslinie | `G`, Punkte klicken, Enter = offen fertig: gestrichelt, bildet keine Fläche, andere Werkzeuge rasten daran ein |
| Trimmen | `T`, Hilfslinie anklicken = Stück bis zu den Schnittpunkten weg; Shift+Klick nahe einem Ende = bis zur nächsten Linie verlängern |
| Kanten projizieren | Raster auf eine Fläche legen (Doppelklick/Leertaste), dann `P`: Kanten des Körpers werden Hilfslinien in dieser Ebene |
| Fläche versetzen | Ebene Fläche ohne eigene Skizze (STEP-Import, Loft, nach Booleschen Operationen) anfassen und ziehen; Abstand im Seitenfeld |
| Fläche löschen | Rechtsklick auf Bohrung, Rundung, Fase oder Absatz → Fläche löschen, Nachbarflächen wachsen zu; Shift+Rechtsklick = weitere Fläche |
| Raster | Unten links: 0,1 bis 10 mm |
| Raster auf einer Fläche | Doppelklick auf eine Fläche oder Leertaste mit der Maus darüber: dort erscheint ein Raster, neue Skizzen landen in dieser Ebene, auch neben der Fläche; Doppelklick ins Leere oder Esc = zurück zum Boden |
| Löschen | `Entf` |
| Frei (ohne Raster) | `Shift` gedrückt halten |
