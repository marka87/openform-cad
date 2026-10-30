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
      STL, 3MF, Zeichnung (0.5.0 gebaut, nicht installiert)
- [ ] TODO Messen bestätigen (in 0.4.2 behoben, Fehlerbild des Nutzers war nie genannt)

### 4. Durchgehende Bohrung — Claude, nach Punkt 1
- [ ] TODO „Durch alles“ als echte Eigenschaft statt fester Tiefe. Heute wird eine
      Bohrung still zum Sackloch, wenn das Teil dicker wird. Einzige neue Funktion
      ohne Feldnotiz, weil sonst das gefertigte Teil nicht stimmt.

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
- [x] Messen, Schnittansicht, Hinweis passend zur Maus, Auswahlleiste
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

### Teil 3: (Name, Datum, wofür)

## Versionen
Steht in `package.json` und `src-tauri/Cargo.toml`. Fehlerbehebung = PATCH, neue
Funktion = MINOR, 1.0.0 erst, wenn `.ofc` als stabil gilt. Vor jedem Installer neu.

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
- 2026-10-30 Plan Punkt 1 (0.5.1): Zufallsprobe fand zwei schwere Fehler: gescheiterte Rundung
  beschädigt den Ausgangskörper in OCCT (Flächen weg, ungültig, Volumen falsch) → Stand davor
  wird neu gerechnet; Schale meldet Erfolg mit Volumen 1e101 und „gültig“ → Volumenprüfung.
  Danach 544 Läufe ohne Fund, 358 davon mit roten Schritten.
- 2026-10-30 Dokumente zusammengeführt; altes Log siehe Git, Commit 0f9525a.
