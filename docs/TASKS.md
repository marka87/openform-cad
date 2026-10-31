# OpenForm CAD — Plan und Stand

Einzige Arbeitsdatei. Die alten Dokumente (Vision, Roadmap, ausführliches Log,
Entscheidungsprotokolle) liegen in der Git-Historie, Stand Commit 0f9525a.

## Ziel
Der Nutzer arbeitet im Alltag mit Shapr3D und FreeCAD; FreeCAD braucht mehr Übung,
deshalb das eigene Programm. Ziel: das beste freie CAD für kleine Fertigungsteile
(Halter, Gehäuse, Adapter, Ersatzteile): schneller zum Ziel als FreeCAD, ohne Konto
und Abo. KI ist gerade nicht nötig.

Regel: Zuverlässigkeit vor neuen Funktionen. Neues wird nur gebaut, wenn es beim
Bauen eines echten Teils gestört hat (siehe Feldnotizen). Fehler, Abbrüche und
Datenverlust gehen immer vor.

## Plan
Status: TODO / DOING / DONE / BLOCKED(Grund)

### 1. Nie wieder kaputte Dateien — Claude
- [x] Schale, Zug und Fläche löschen prüfen ihr Ergebnis
- [x] Rundung und Fase prüfen ihr Ergebnis (0.5.0)
- [x] Schale ohne Wirkung, Bohrung und Muster ohne Treffer werden gemeldet
- [x] Fläche versetzen und Boolesche Operationen prüfen ihr Ergebnis
- [x] Gesamtprüfung vor STEP, STL, 3MF, ungültig = Warnung mit Nachfrage (OBJ läuft über
      das Anzeigenetz, ohne Prüfung; Nachfrage nicht in der Oberfläche durchgeklickt)
- [x] Zufallsprobe mit Bohrungen auf Kanten findet nichts Stilles mehr (544 Läufe)

### 2. Export wirklich belegen — zusammen
- [ ] TODO STEP in FreeCAD öffnen
- [ ] TODO STEP in Fusion öffnen (nur der Nutzer kann das)
- [ ] TODO 3MF in einem echten Slicer öffnen

### 3. Echte Teile — Nutzer, das Wichtigste
- [x] Teil 1: Gehäuse mit Lochraster
- [ ] TODO Teil 2, Feldnotizen führen
- [ ] TODO Teil 3, Feldnotizen führen
- [ ] TODO Auswerten: Was mehrfach stört, kommt hier ganz nach oben
- [ ] TODO Die drei Teile als Regressionstest ins Repo, mit „wofür brauchst du es“
- [ ] TODO Installer durchklicken: Öffnen, Speichern, Doppelklick auf `.ofc`, STEP,
      STL, 3MF, Zeichnung (0.7.1 gebaut, nicht installiert)
- [ ] TODO Messen bestätigen (in 0.4.2 behoben, Fehlerbild des Nutzers war nie genannt)

### 4. Durchgehende Bohrung — Claude, nach Punkt 1
- [x] „Durch alles“ als echte Eigenschaft (Haken im Seitenfeld). Schneidet durch den
      ganzen Körper, bei einem Gehäuse also auch durch die Gegenwand; nur durch eine
      Wand bleibt eine feste Tiefe. KI-Bohrung „durch“ bleibt feste Tiefe.

### 5. Ausmisten — Claude
- [x] Dokumente zu dieser einen Datei zusammengeführt
- [x] Offene Liste gekürzt
- [ ] TODO `src/main.ts` nur aufräumen, wo ohnehin gearbeitet wird, kein eigenes Projekt

### Pflicht bei jedem replicad-Update
Prüfen, ob sich replicad-opencascadejs geändert hat. Wenn ja, den Workflow
`.github/workflows/opencascade.yml` mit neuer REPLICAD_REF/IMAGE laufen lassen, sonst
bricht „Fläche löschen“. Danach voller Testlauf.

## Zurückgestellt
Nur anfassen, wenn ein echtes Teil es verlangt.
- Schale, die eine Fläche neben einer Rundung öffnet, bleibt rot (Kern schafft es nicht)
- Rundung an einer Muster-Quelle, die erst nach dem Muster angelegt wird (Umweg:
  Rundung vor das Muster legen)
- Offene Linien teilen Bereiche (heute teilen sie nur Körper)
- Vieleckseiten mit eigener ID (erst nötig, wenn sich Vieleck-Punkte einfügen lassen)
- Kleinigkeiten: Muster-Pfeil bei skaliertem Körper, Seitenfeld überdeckt bei
  schmalem Fenster die obere Leiste, Griffe im Zoll-Modus nicht von Hand geprüft

## Fertig
- [x] Solids: Extrudieren, Bohren, Verrunden, Fasen, Schale, Revolve, Loft, Sweep,
      Boolesche Operationen, mehrere Körper, Teilen, Fläche versetzen und löschen
- [x] Stabile Flächen- und Kantenbezüge, Feature-Baum, Zurückspulen, `.ofc`
- [x] Skizzen: alle Formen, Hilfslinien, Trimmen, Projektion, Fänge, Abhängigkeiten
- [x] Muster und Spiegeln als eigener Schritt, Text, Gewinde-Kernlöcher, Senkung
- [x] Zeichnung mit Einzelbemaßung und Toleranzen; SVG, PDF, DXF
- [x] Export und Import: STEP rein und raus, STL, 3MF
- [x] Messen, Schnittansicht, Hinweis passend zur Maus
- [x] mm und Zoll, Desktop-App mit Installer
- [x] KI-Assistent ist eingebaut, standardmäßig aus, wird nicht weiter ausgebaut

## Entscheidungen, die weiter gelten
- Flächenbezug = Herkunft aus der Feature-Historie (OCCT Modified/Generated/IsDeleted),
  verankert an Feature-IDs. Der Fingerabdruck prüft nur und entscheidet bei
  Mehrdeutigkeit. Nie still auf eine falsche Fläche rasten: rot = verloren, gelb = unsicher.
- OCCT-Builder direkt über opencascade.js, weil replicad die Historie wegwirft.
- KI: nur feste Werkzeuge, die normale Features erzeugen; eigener Schlüssel, abschaltbar.
- Fläche löschen braucht den eigenen OpenCascade-Build (vendor/).
- Installer ohne Admin: Toolchain gnullvm, `rustup set default-host x86_64-pc-windows-gnullvm`.
- DXF bleibt reine Geometrie ohne Maße.

## Feldnotizen
Beim Bauen notieren, eine Zeile je Stolperstelle, keine Lösungen:
`- [Teil] Wollte: … | Passiert: … | Umweg: … (Dauer)`
Auswertung nach drei Teilen: dreimal = Paket. Einmal = bleibt stehen. Abbruch oder
Datenverlust = sofort ein Paket.

### Teil 1: Gehäuse mit Lochraster in der Seitenwand (2026-10-30)
- [Gehäuse] Wollte: Lochraster per Muster | Passiert: lief aus dem Modell, wenn die
  erste Bohrung nicht in der passenden Ecke saß | Umweg: in der Ecke anfangen (behoben)
- [Gehäuse] Wollte: untere Reihe auf einmal vervielfältigen | Passiert: Muster wirkte
  nur auf einen Kreis | Umweg: einzeln, viele Klicks (behoben)
- [Gehäuse] Wollte: Lochraster per KI über Groq | Passiert: 429 | Umweg: von Hand
  (Wiederholung eingebaut, nicht gegen Groq geprüft)

### Teil 2: (Name, Datum, wofür)
- [Teil 2?] Wollte: Kante abrunden an einem Teil mit vielen Mustern und Löchern | Passiert: dauerte
  einige Zeit | Umweg: gewartet (behoben in 0.7.0, am Teil des Nutzers noch nicht bestätigt)

- [Zahnbürstenständer] Wollte: STEP aus FreeCAD öffnen und auf der Seite weiterarbeiten | Passiert: Löcher
  fehlten, nach Doppelklick und Leertaste alles leer, nichts ging mehr | Umweg: keiner (behoben in 0.7.1)

### Vergleich Schritt für Schritt mit Shapr3D (2026-10-31)
- [Vergleich] Wollte: Ebene XY, XZ oder YZ wählen | Passiert: nur Boden, Fläche oder eigene Ebene | Umweg: - (0.8.0)
- [Vergleich] Wollte: Rechteck aus der Mitte von 10x20 auf 20x10 | Passiert: Mitte blieb nicht stehen | Umweg: X/Y von Hand (0.8.0)
- [Vergleich] Wollte: Hilfslinie am Kantenpunkt ansetzen | Passiert: Maß lag darauf, Klick ging ins Maß | Umweg: - (0.8.0)
- [Vergleich] Wollte: Kreis an Hilfslinie spiegeln, mehrere Skizzen markieren | Passiert: Klick traf das
  Rechteck unter dem Kreis, Hilfslinie nicht wählbar | Umweg: - (0.8.0)

- [Vergleich] Wollte: zwei Kreise auf einem Rechteck nacheinander hochziehen | Passiert: erster verschwand, rot
  „umgedreht“ | Umweg: - (0.8.1)

- [Vergleich] Wollte: zwei markierte Flächen zusammen hochziehen, mehrere Kanten zusammen runden | Passiert: nur eine
  ging mit, Kanten nur übers Seitenfeld | Umweg: einzeln (0.9.0)

- [Vergleich] Wollte: überlappendes Rechteck und Kreis zu einer Form trimmen | Passiert: Trimmen ging nur bei Hilfslinien
  | Umweg: - (0.10.0)

- [Vergleich] Wollte: fast flache Sicht mit Leertaste ganz flach stellen, ohne Achse durchs Bild | Passiert: wählte
  das letzte Werkzeug | Umweg: Würfel (0.11.0)
- [Vergleich] Wollte: markierte Kanten sehen | Passiert: nur die unter der Maus war erkennbar | Umweg: - (0.11.0)

### Teil 3: (Name, Datum, wofür)

## Versionen
Steht in `package.json` und `src-tauri/Cargo.toml`. Fehlerbehebung = PATCH, neue
Funktion = MINOR, 1.0.0 erst, wenn `.ofc` als stabil gilt. Vor jedem Installer neu.

- **0.11.0** Leertaste stellt flach auf Fläche oder nächste Würfelseite; Achse längs zum Blick ausgeblendet; markierte Kanten ganz in eigener Farbe
- **0.10.0** Trimmen an Rechteck, Kreis, Vieleck und Linie, auch an Bögen; Reste verbinden sich zu einer Fläche
- **0.9.0** Markierte Skizzen gemeinsam hochziehen; markierte Kanten durch Ziehen gemeinsam runden, Radius für alle
- **0.8.1** Skizzen auf einer flachen Skizze hängen sich nicht mehr an die Unterseite eines Körpers
- **0.8.0** Ebenen XY, XZ, YZ am Ursprung; Rechteck aus der Mitte behält die Mitte; Maße neben der Skizze;
  Spiegeln an Hilfslinie; Strg/Shift nimmt Hilfslinien mit, kleinste Skizze gewinnt den Klick
- **0.7.1** STEP aus FreeCAD: Zwischenstände und Hilfsachsen werden beim Import weggelassen; leeres
  Bild nach Doppelklick und Leertaste behoben
- **0.7.0** Neue Oberfläche nach Vorlage des Nutzers; Würfel: Doppelklick, Drehknöpfe ±90°; Ändern
  und Ziehen rechnet nur noch ab dem geänderten Schritt
- **0.6.2** Leiste auf dem Modell entfernt; Muster und Spiegeln als eigene Ansicht
- **0.6.1** Großes Lochraster stürzt nicht mehr ab und rechnet ein Vielfaches schneller
- **0.6.0** Bohrung und Tasche „Durch alles“
- **0.5.1** Boolesche Operationen geprüft; Warnung vor Export ungültiger Körper; gescheiterte
  Rundung beschädigt den Körper nicht mehr; Schale mit unsinnigem Ergebnis wird rot
- **0.5.0** Rundung/Fase mit ungültigem Ergebnis wird rot; Seitenfeld aufgeräumt;
  Hinweis passend zur Maus, F1 = ganze Hilfe; Leiste neben der Auswahl
- **0.4.4** Muster meldet Kopien neben dem Körper; Druck auf flache Skizze greift nicht
  mehr die Kante daneben
- **0.4.3** Schale auf Übergang nicht mehr still massiv; Zoll durchgängig
- **0.4.2** Messen rastet an entfernten Ecken ein
- **0.4.1** Bohrung ohne Treffer wird rot; Muster-Pfeil folgt Verschieben

## Log
Eine Zeile je Paket, neueste oben. Was geändert, was gelernt.
- 2026-10-31 Ansicht und Markierung (0.11.0). Leertaste über einer Fläche legt das Raster und schaut sofort darauf, ohne
  Fläche auf die nächste Würfelseite, nochmal = zurück. Das letzte Werkzeug kommt nur noch, wenn die Ansicht schon flach ist
  und kein Zurück vorliegt. Achse wird unter rund 6° zum Blick ausgeblendet. Reine Bedienung, Tests decken das nicht ab.
- 2026-10-31 Trimmen wie in Shapr3D (0.10.0, `src/trim.ts`). Stück unter der Maus wird rot angezeigt und weggeklickt.
  Rechteck und Kreis werden dabei zu offenen Linienzügen; treffen sich Enden, werden sie eins, ein geschlossener Ring wird
  wieder Fläche. Damit gehen Breite/Tiefe und Abhängigkeiten dieser Skizze verloren. Ellipse und Spline nur als Schnittkante.
- 2026-10-31 Gemeinsam ändern (0.9.0). Ziehen an der Deckfläche nimmt markierte Skizzen gleicher Richtung mit, getippt
  gehen alle auf dasselbe Maß. Markierte Kanten: eine ziehen rundet alle, je Kante ein eigener Schritt; sie bleiben
  markiert, Radius und Art im Seitenfeld gelten für alle. Kanten mit gemeinsamer Ecke laufen weiter nacheinander durch den
  Kern, nicht in einem Zug; das kann scheitern, wo ein gemeinsamer Lauf ginge.
- 2026-10-31 Fix 0.8.1. Skizze auf einer freien flachen Skizze bekam `onFace`, der Kern band sie dann an irgendeine
  Fläche in der Ebene, auch an die Unterseite eines Körpers: „umgedreht“. Jetzt beim Anlegen kein `onFace`, im Kern nur
  Flächen gleicher Richtung; alte Skizzen ohne Bezug werden gelöst. Schon gebundene alte Skizzen bleiben rot.
- 2026-10-31 Parallelvergleich mit Shapr3D (0.8.0). Ebenen am Ursprung nutzen das Flächenraster mit `free`, keine neuen
  Modellschritte. Rechteck: `mid`, wirkt bei Eingabe und beim Ziehen der Seite. Beim Zeichnen klickt man durch Maße
  hindurch. Spiegeln schlägt die jüngste Hilfslinie derselben Ebene vor; Hilfslinie zählt als Bezug, nicht als Kopie.
  Bodenschatten schrieb Tiefe und verdeckte Skizzen unter dem Boden, behoben. Regel vom Nutzer: Installer nur auf Wunsch.
- 2026-10-31 Fix 0.7.1, Dateien des Nutzers aus FreeCAD. Der Export enthält den ganzen Baum: 5 bzw. 7 Körper
  (Rohblock deckt die Löcher zu, Volumen 2217 statt 212 cm³) und Achsen als unendliche Kanten (4e100). Die
  ergaben NaN im Kantennetz, damit im Raster und in der Kamera: Bild dauerhaft leer. Import behält nur Körper,
  von überlappenden (über 50 %) den ersten, und meldet die Zahl; `flyTo` lehnt NaN ab. Prüfung kostet beim
  Laden solcher Dateien Zeit (großes Teil 12,7 s im Worker), Dateien mit einem Körper nichts.
  „Der erste“ stimmt für FreeCAD; andere Quellen mit überlappenden Körpern nicht geprüft.
- 2026-10-30 Rückmeldung am echten Teil (0.7.0). Tempo: Der Worker behält den Stand vor dem zuletzt
  geänderten Schritt und den Stand nach dem letzten; Test vergleicht jeden Schritt mit vollem
  Neurechnen. Rundung an Platte mit 100 Löchern ziehen: Kern 63 ms statt rund 1,5 s, dazu Netz 0,65 s
  (unverändert). Eine gescheiterte Rundung verwirft den Stand (OCCT beschädigt sonst die geteilte
  Geometrie), dann wird einmal voll gerechnet. Oberfläche nach den Bildern des Nutzers; nicht gebaut:
  die symmetrischen Knöpfe neben ⇄ in der Vorlage, das Modell kennt das nicht. Drehknöpfe drehen um
  die Hochachse, weil OrbitControls kein Rollen kann; in der Draufsicht dreht das den Grundriss.
- 2026-10-30 Rückmeldung des Nutzers (0.6.2): Muster/Spiegeln/Löschen erschienen zu oft, vor
  allem auf dem Modell; das Muster-Feld soll besser und separat sein. Leiste auf dem Modell und
  Knopfreihe entfernt, Muster und Spiegeln öffnen über die Leiste links oder das Kontextmenü eine
  eigene Ansicht mit Reihe, Kreis, Spiegeln, nur mit den nötigen Feldern; gilt für Skizze und Körper.
  Geprüft im Browser, Raster 4 × 2 mit 91,98 cm³ wie gerechnet. Körper-Kopien und „Fläche anklicken“
  in der neuen Ansicht nicht durchgeklickt.
- 2026-10-30 Tempo-Messung (0.6.1), Platte 300×200, nur Kern ohne Oberfläche: 300 Löcher
  stürzten ab (memory out of bounds), 100 Löcher 6,7 s. Muster schneidet nun alle Kopien in
  einem Schnitt, wenn sie sich nicht überlappen und keine Rundung mitgeht: 100 Löcher 0,7 s,
  300 Löcher 3,2 s, dazu Anzeigenetz 0,7 s bzw. 4,4 s. Netz unverändert (0,05 / 0,2).
- 2026-10-30 Plan Punkt 4 (0.6.0): Extrude.thru; der Kern rechnet die Tiefe aus der Körperhülle
  und trägt sie in d nach, 1 mm Überstand im Schnitt. Tiefe tippen oder ziehen nimmt den Haken
  weg. Im Browser: Höhe 18,5 → 30, Bohrung folgt auf −30.
- 2026-10-30 Plan Punkt 1 (0.5.1): Zufallsprobe fand zwei schwere Fehler: gescheiterte Rundung
  beschädigt den Ausgangskörper in OCCT (Flächen weg, ungültig, Volumen falsch) → Stand davor
  wird neu gerechnet; Schale meldet Erfolg mit Volumen 1e101 und „gültig“ → Volumenprüfung.
  Danach 544 Läufe ohne Fund, 358 davon mit roten Schritten.
- 2026-10-30 Dokumente zusammengeführt; altes Log siehe Git, Commit 0f9525a.
