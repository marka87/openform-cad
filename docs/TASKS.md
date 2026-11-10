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

### 0. Befunde aus dem Audit 2026-11-02 — Claude, vor allem anderen
Funde am Code gelesen und bestätigt, keiner in der laufenden App nachgestellt: erst nachstellen, dann beheben.
Last: eine Person, ein Fenster, bis einige hundert Schritte. Reihenfolge von oben nach unten.
- [x] DONE A2 Worker-Fehler nach den Schritten (Netz, Kanten, Messung) → kein `built`, App rechnet nie
      mehr neu, alte Körper schon gelöscht (kernel.worker.ts:47-71). Fix: try/catch um den ganzen Worker,
      nicht nur ums Neurechnen; beim Neurechnen immer `built` senden, nach dem Löschen `body = null; bodies = new Map()`.
- [x] DONE A3 Datenverlust: A öffnen, B öffnen, Strg+Z, Strg+S → A landet in B.ofc (main.ts:2118, :155).
      Fix: Undo-Einträge merken sich den Dateipfad. Undo nicht leeren: es ist heute die einzige Rettung nach
      versehentlichem Öffnen. Den Pfad nie aus einer geöffneten Datei übernehmen.
- [x] DONE A20 Datenverlust: `write_bytes` schreibt direkt in die Zieldatei, ein Absturz dabei zerstört sie
      (src-tauri/src/main.rs:13). Fix: in Nachbardatei schreiben, dann umbenennen.
- [x] DONE A1 (in der Exe noch bestätigen, siehe Punkt 3) Sicherheit: präparierte `.ofc` führt Skript aus: Farbe (main.ts:2426) und Schrittname
      (`nameOf`, main.ts:540, :1671 u. a.) ungeschützt im HTML, keine CSP, `write_bytes` schreibt jeden Pfad.
      Fix: Namen bei der Ausgabe schützen (`esc`), Farbe `#rrggbb` prüfen, dazu CSP
      `script-src 'self' 'wasm-unsafe-eval'`. Ohne das wasm-Recht lädt OpenCascade nicht; die WASM-Datei enthält
      auch `eval`/`new Function`, deshalb in der gebauten Exe prüfen, im Browser greift die Regel nicht.
- [x] DONE A5 Fremde/kaputte `.json` setzt `features` auf undefined, App steht; im Browser keine
      Meldung (main.ts:153, :2124), auch ein kaputtes Autosave beim Start (:2868). Fix: Prüfung als reine Funktion
      nach model.ts (`features` Liste, IDs Zahlen) mit Kern-Test, vor `pushHistory`; Browser-Öffnen mit try/catch
      und Meldung. Alte Dateien müssen lesbar bleiben.
- [x] DONE A4 Export ohne die letzte Änderung, wenn nach der laufenden Berechnung noch eine wartet
      (`pending`, main.ts:2129). Fix: Export zurückhalten, bis nichts mehr wartet. Erst nach A2, sonst wartet er
      bei einem Hänger ewig.
- [x] DONE A21 Export warnt nicht bei fehlgeschlagenen Schritten und nicht im zurückgespulten Zustand: Datei
      sieht fertig aus, ist es aber nicht (main.ts:329, kernel.worker.ts:96). Fix: Rückfrage wie bei ungültigen Körpern.
- [x] DONE A22 Keine Rückfrage bei ungespeicherten Änderungen beim Öffnen und Schließen; Doppelklick auf `.ofc`
      überschreibt das automatische Speichern (main.ts:2871). Fix: Änderungsmerker und Rückfrage.
- [x] DONE A6 Zweite `.ofc` mit gleicher Import-Nummer und gleichem Namen, aber anderer STEP, direkt danach geöffnet →
      still alte Geometrie (kernel.worker.ts:51, Schlüssel kernel.ts:179). Fix: STEP-Text mit vergleichen, bei Abweichung neu laden.
- [x] DONE A18 KI: Voreinstellung wechseln leert den Schlüssel nicht → geht an den nächsten Anbieter (ai.ts:94). Fix: Schlüssel leeren.

Danach zurück zu Teil 2 unter Punkt 3 (Zahnbürstenständer). SPÄTER = nicht von selbst nehmen, erst wenn es beim Arbeiten stört
oder ohnehin dort gearbeitet wird:
- [ ] SPÄTER A7 Speicherlecks: Hilfskörper bei Fläche versetzen bei jedem Lauf (topo.ts:450), Werkzeug nur bei
      gescheitertem Schnitt (kernel.ts:218, :286, :302, :368). replicad räumt per GC nach, Absturz nicht belegt. Fix: `finally { ….delete() }`.
- [ ] SPÄTER A8 Undo-Liste ohne Grenze, enthält ganzen STEP-Text (main.ts:152). Fix: Grenze nach Größe, nicht nach Anzahl.
- [ ] SPÄTER A9 Kaputte STEP wird bei jedem Neurechnen erneut gelesen (kernel.worker.ts:51). Fix: gescheiterte merken.
- [ ] SPÄTER A10 Muster/Übergang/Zug/Teilen suchen die Quelle in der ganzen Liste; Schritt vor seine
      Quelle gezogen → Teil-Neurechnen ≠ volles Neurechnen (kernel.ts:266 u. a.). Fix: nur frühere Schritte.
- [ ] SPÄTER A11 Drucken und SVG kurz nacheinander: beide folgen dem letzten Wunsch (`printNext`, main.ts:2138).
- [ ] SPÄTER A12 KI: Gewinde „constructor“ → Radius NaN (aiTools.ts:112). Fix: `Object.hasOwn`.
- [ ] SPÄTER A13 KI: zweimal Enter → zwei Anfragen, Modell überschrieben (ai.ts:128). Fix: Merker „läuft“.
- [ ] SPÄTER A14 KI: Zeitgrenze endet vor dem Lesen der Antwort → kann ewig hängen (ai.ts:47/62).
- [ ] SPÄTER A16 `dot` doppelt (model.ts:147, topo.ts:113), `at` doppelt (aiTools.ts:100/116).
- [ ] SPÄTER A23 STEP ohne UTF-8 (z. B. Umlaute) lässt sich in der Desktop-App nicht öffnen (`read_text`, src-tauri/src/main.rs:8).
- [ ] SPÄTER A24 Tests laufen nicht automatisch: der einzige GitHub-Workflow baut von Hand OpenCascade.
- [ ] SPÄTER A25 Undo lässt die Mehrfachauswahl stehen (`multi`, main.ts:154).
- [x] DONE A26 (Audit 2026-11-04, 0.16.3) „Öffnen“-Knopf merkte sich den Pfad nicht, Strg+S fragte danach immer „Speichern unter“ (main.ts:2142).
- [x] DONE A27 (0.16.3) Speichern ohne `sync_all` vor dem Umbenennen: Stromausfall direkt danach konnte eine leere Datei hinterlassen (src-tauri/src/main.rs).
- [x] DONE A28 (0.16.3) Gescheitertes Neurechnen gab Körper und Zwischenstände im Worker nicht frei, WASM-Speicher wuchs bei jedem Fehlschlag (kernel.worker.ts:55).
- [ ] SPÄTER A29 Wirft die Schließen-Rückfrage (`askSave`), schließt das Fenster nie (Tauri schließt erst nach dem Handler). Fix: try/catch, im Fehlerfall schließen.
- [ ] SPÄTER A30 Ändern, sofort Strg+S, sofort schließen: nachgetragene Bezüge kommen nach dem Speichern an → überflüssige Rückfrage (main.ts:332).
- [x] DONE A31 (Audit 2026-11-09, 0.17.2) Kanten-Pfeil an bestehender Rundung durchsuchte bei jeder Mausbewegung zweimal alle Dreiecke (`edgeArrowAt`), Ziehen ruckelte bei großen Modellen (vom Nutzer bemerkt).
- [x] DONE A32 (0.17.2) Muster-Pfeil hin und zurück gezogen ließ ein Muster mit Abstand 0 stehen.
- [x] DONE A33 (0.17.2) Klick auf den Kanten-Pfeil ohne Ziehen hob die Mehrfachauswahl der Kanten auf.
Nicht nachgeprüft, nur notiert: gespiegelter Teil-Drehkörper dreht falsch herum (model.ts:477),
Körperkopie mit Zug entlang Kanten/Projektion (model.ts:438), Muster nach Verschieben des Körpers
(kernel.ts:295), Muster über mehrere Körper (Anzeige/Rundung), Lecks in circleOf/cleanStep.

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
- [ ] DOING Teil 2 (Zahnbürstenständer, begonnen 2026-10-31), Feldnotizen führen
- [ ] TODO Teil 3, Feldnotizen führen
- [ ] TODO Auswerten: Was mehrfach stört, kommt hier ganz nach oben
- [ ] TODO Die drei Teile als Regressionstest ins Repo, mit „wofür brauchst du es“
- [ ] TODO Installer durchklicken: Öffnen, Speichern, Doppelklick auf `.ofc`, STEP,
      STL, 3MF, Zeichnung; Rückfrage beim Schließen (0.16.2); CSP: App startet und rechnet (A1, bestätigt 2026-11-02) (0.18.2 gebaut am 2026-11-09, 9,9 MB; Ideen I1–I8, Kante mit Vorzeichen (E2), Kugel abziehen (K1), KI über Google Agent Platform, liegt nur auf dem Arbeitsrechner unter src-tauri/target/release/bundle/nsis/; noch nicht installiert)
- [ ] TODO Messen bestätigen (in 0.4.2 behoben, Fehlerbild des Nutzers war nie genannt)

### 3a. Ziehen und Muster wie Shapr3D — Claude, Wunsch des Nutzers 2026-11-09 (mit Bildern aus Shapr3D)
- [x] DONE M1 (Fehler, zuerst; 0.17.0) Klick auf ein beliebiges Exemplar eines Musters markiert alle, Ziehen schiebt alle
      zusammen hoch oder hinein. Laut Nutzer geht das heute nicht.
- [x] DONE M2 (0.17.0) ⇕-Pfeil in der Mitte einer ausgewählten flachen Skizze bzw. Körperfläche, entlang der Normalen;
      ziehen = wie Fläche ziehen (hoch = extrudieren, runter = hineindrücken).
- [x] DONE M3 (0.17.0) Muster direkt am Modell: Skizze auswählen → „Muster“ → 4 Pfeile aus ihrer Mitte (±u, ±v);
      ziehen legt das Muster in diese Richtung an (3 Stück, Abstand folgt der Maus), Pfeil quer = Raster.
      Seitenfeld bleibt für Kreis, Spiegeln und Kante als Richtung. Dateiformat unverändert.
- [x] DONE M4 (0.17.0) Felder am Pfeil: „Abstand ▾ / Gesamt“ und „Anzahl“; gespeichert wird der Abstand,
      Gesamt = Abstand × (Anzahl − 1).
- [x] DONE E1 (0.17.0) Kante wie Shapr3D: ⇔-Pfeil an markierter Kante bzw. Rundung/Fase (wegziehen = runden, hineinschieben = fasen,
      wie bisher beim Ziehen der Kante), daneben „Rundung ▾ / Fase“ zum Umschalten und das Maß zum Tippen.

### 3b. Ideen, vom Nutzer alle 8 freigegeben 2026-11-09 — Claude, in dieser Reihenfolge
Video des Nutzers aus Shapr3D (Kante runden/fasen, 18 s): Pfeil an der Kante, Maßfeld daneben, Vorschau beim Ziehen,
an der fertigen Rundung ein Bogen-Griff mit Zahnrad (Form der Rundung). Das Ziehen selbst entspricht E1.
- [x] DONE I1 (0.18.0) Fläche füllen (Lochraster): Fläche anklicken, Lochmaß, Abstand, Randabstand → Anzahl je Richtung wird
      gerechnet, Raster sitzt mittig. Ergebnis ist ein normales Muster (bleibt bearbeitbar).
- [x] DONE I2 (0.18.0) Größtmögliche Rundung/Fase: schlägt sie fehl, das größte noch machbare Maß suchen und anbieten.
- [x] DONE I3 (0.18.0) Muster von der Mitte aus: Taste beim Ziehen = beidseitig gleich weit.
- [x] DONE I4 (0.18.0) Einzelne Exemplare weglassen: Alt+Klick (Shift+Klick ist schon Mehrfachauswahl) auf eine Kopie nimmt sie heraus (und wieder hinein).
- [x] DONE I5 (0.18.0) Durch alles beim Ziehen: Bohrung über den Boden hinaus gezogen rastet auf „durch alles“ ein.
- [x] DONE I6 (0.18.0) Bis zur Fläche ziehen: Höhe rastet beim Ziehen an anderen ebenen Flächen ein.
- [x] DONE I7 (0.18.0) Bohrungsvorlagen für den 3D-Druck: Gewindeeinsatz M3/M4, Mutternfalle, selbstschneidend.
- [x] DONE I8 (0.18.0) Zuletzt geöffnete Dateien unter „Öffnen“ (Desktop).
- [x] DONE K3 (0.19.0) Ausgeblendete Körper gehen nicht mehr in Export und Zeichnung; „Körper löschen“ (Knopf im Körper-Feld, Entf bei ausgewähltem Körper) als eigener Schritt.
- [x] DONE K2 (0.19.0) Halbkugel: Häkchen „Halbkugel“ bei der Kugel; flache Seite auf der Skizzenebene, Kuppel nach außen. Ersetzt das umständliche Teilen an einer Ebene.
- [x] DONE K1 (0.18.1) Kugel abziehen: Häkchen „Abziehen (Loch)“ im Seitenfeld der Kugel; Mitte auf der Fläche = Halbkugel-Mulde.
- [x] DONE E2 (0.18.0) Kante mit Vorzeichen (Wunsch des Nutzers): 0 = scharf, in den Körper = Rundung, raus = Fase; durch 0 wechselt die Art im selben Zug, bei 0 loslassen entfernt den Eintrag; Maßfeld: negativ = Fase, 0 = scharf.

### 3c. Fehlende Funktionen, vom Nutzer freigegeben 2026-11-09 — Claude, in dieser Reihenfolge
- [x] DONE F1 (0.19.0) Skizzen-Ecken runden/fasen: Seitenfeld „Alle Ecken“ bzw. nach Klick auf einen Eckpunkt „Ecke (Punkt n)“, Maß, „Runden“/„Fasen“.
- [x] DONE F2 (0.19.0) STL/3MF/OBJ über „Öffnen“ als Referenz: halbdurchsichtig, anklickbar zum Messen und Skizzieren, ohne Griffe; kein Körper, nicht im Export.
- [x] DONE F3 (0.19.0) Referenzbild über „Öffnen“ (PNG/JPG/WebP): auf XY/XZ/YZ-Ebene, Breite und Mitte im Seitenfeld, Maßstab mit 2 Punkten + echter Länge.
- [x] DONE F4 (0.19.0) Echtes Gewinde M3–M20 und 1/4"-20 (ISO-Profil 60°): Auswahl „Gewinde“ im Seitenfeld eines extrudierten Kreises; Bolzen = Außen-, Bohrung = Innengewinde.
- [x] DONE F5 (0.19.0) Rippe/Steg: Linie zeichnen, im Seitenfeld „Rippe“ → Wand (Dicke 3 mm, im Feld änderbar, 0 = weg) quer zur Linie bis an den Körper.
- [x] DONE F6 (0.19.0) Lippe/Falz: Seitenfeld der Schale „Rand“ = Lippe (Kiste) oder Falz (Deckel), Breite/Höhe/Spiel (Vorgabe halbe Wand, 2 mm, 0,2 mm).
- [x] DONE F7 (0.19.0) Benannte Maße: Liste „Parameter“ unter den Schritten (Name = Wert); jedes Maßfeld im Seitenfeld nimmt Namen und Rechnungen (breite/2 + 3), gebundene Maße rechnen bei Änderung neu.
- [x] DONE R1 (0.22.1) Rippe gegen Fehlbedienung: Stück, das entlang der Linie über sie hinausreicht, ablehnen (verständliche Meldung, wie man
      die Linie legt); Skizze auf einer Körperfläche: Wand von der Fläche nach innen statt mittig. Fall des Nutzers als Kern-Test.
- [x] DONE F8 (0.24.0) Zeichnung: Schnitt A–A (quer/längs/waagrecht, Linie ziehbar) und Einzelheit B (Kreis in einer Ansicht, 2× vergrößert) im Maß-Editor; Blatt, PDF und SVG zeigen beides.
- [x] DONE F9 (0.25.0) Entformungsschräge: Rechtsklick auf Seitenfläche → „Entformungsschräge …“, Shift+Rechtsklick nimmt weitere Flächen dazu, Winkel im Seitenfeld (− = oben breiter).

### 3d. Layout für alle Auflösungen, vom Nutzer freigegeben 2026-11-09 — Claude, vor F8
Vorbild: HTML-Beispiel (Raster aus Leisten, Splitter, 3D-Ansicht in der Mitte). Prüfziel: 1080p bei 100 % und 125 %, 1366×768, 4K bei 200 %.
- [x] DONE L1 (0.21.1) Seitenfeld scrollt — Seitenfeld scrollbar (hat heute keine Höhengrenze, lange Felder laufen unten aus dem Fenster).
- [x] DONE L2 (0.22.0) Feste Leisten — Feste Leisten statt schwebender: links Werkzeuge, rechts Baum + Eigenschaften mit Splitter, Breiten ziehbar und gemerkt;
      3D-Ansicht nimmt den Rest (wird kleiner statt verdeckt); bei Platzmangel schrumpfen die Leisten selbst (links nur Symbole). Mindestgröße 1024×576.
- [x] DONE L3 (geprüft, kein Code) Obere Leiste: passt bei der Mindestbreite 1024 in eine Zeile, bricht sonst um statt abzuschneiden;
      „⋯ Mehr“ würde nie erscheinen, daher nicht gebaut. Offen beim Nutzer: Prüfung in der Exe bei 1080p 100/125 %, 1366×768, 4K 200 %.
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

### Ohne Zuordnung zu einem Teil
- [?] Wollte: Kante abrunden an einem Teil mit vielen Mustern und Löchern | Passiert: dauerte
  einige Zeit | Umweg: gewartet (behoben in 0.7.0, am Teil des Nutzers noch nicht bestätigt)

### Teil 2: Zahnbürstenständer, aus FreeCAD als STEP übernommen (2026-10-31; wofür: noch offen)
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
Steht in `package.json`, `package-lock.json` (2×), `src-tauri/Cargo.toml` und `src-tauri/Cargo.lock`. Jedes Paket mit
Code-Änderung zählt hoch (Wunsch des Nutzers 2026-11-09), keine Nummer wird geteilt: klein/Fehlerbehebung = PATCH,
groß/neue Funktion = MINOR, der Agent entscheidet. 1.0.0 erst, wenn `.ofc` als stabil gilt.

- **0.25.0** Entformungsschräge: Seitenflächen um einen Winkel neigen, Kante an der Unterseite bleibt (F9)
- **0.24.0** Zeichnung: Schnittansicht A–A mit Schraffur und ziehbarer Schnittlinie, Einzelheit B doppelt vergrößert (F8)
- **0.23.0** Rippe als Knotenblech: Linie auf einer Fläche (Boden oder Wand), die an einer Wand beginnt, gibt ein Dreieck zwischen Fläche und Wand
- **0.22.2** Linke Leiste aufgeräumt: ▾ verdeckt die Taste nicht mehr, Ansichten als Raster mit zwei Spalten, Einheit und Skin je eine Zeile
- **0.22.1** Rippe: keine Riesenplatte mehr bei einer Linie auf der Wandfläche, Meldung mit Anleitung; auf einer Körperfläche gezeichnet geht die Wand bündig nach innen (R1)
- **0.22.0** Feste Leisten links und rechts mit Splittern, 3D-Ansicht nimmt den Rest, bei Platzmangel links nur Symbole; Mindestgröße 1024×576 (L2)
- **0.21.1** Seitenfeld scrollt und endet über dem Baum (L1)
- **0.21.0** Vier Skins zur Auswahl (Graphit, Hell, Nacht, Kontrast) unter den Ansichten
- **0.20.0** Leisten mit Tab (oder Knopf „Leisten aus“) ausblenden, Baum einklappbar und auf hohen Bildschirmen höher, Parameter-Zeile passt in den Baum
- **0.19.0** Benannte Maße/Parameter (F7); Lippe und Falz am Rand einer Schale (F6); Rippe aus einer Linie (F5); echtes Gewinde für Bolzen und Bohrung (F4); Halbkugel per Häkchen (K2); Skizzen-Ecken runden/fasen (F1); STL/OBJ/3MF als Referenz öffnen (F2); Referenzbild zum Nachzeichnen (F3); ausgeblendete Körper nicht mehr im Export, Körper löschen als Schritt (K3)
- **0.18.2** KI: Google Agent Platform (Vertex) mit API-Schlüssel geht über die OpenAI-kompatible Adresse (Schlüssel im Kopf x-goog-api-key)
- **0.18.1** Kugel lässt sich abziehen (Häkchen „Abziehen (Loch)“), z. B. für eine Halbkugel-Mulde (K1)
- **0.18.0** Ideen I1–I8 (siehe Plan 3b): Fläche füllen (I1); größtmögliche Rundung/Fase per Knopf (I2); Muster nach beiden Seiten (Alt beim Ziehen oder Häkchen, I3); Exemplare per Alt+Klick weglassen (I4); Bohrung rastet beim Ziehen auf „durch alles“ ein (I5); Höhe rastet an anderen Flächen ein (I6); Bohrungsvorlagen für den 3D-Druck und Mutternfalle (I7); zuletzt geöffnete Dateien unter „Öffnen“ (I8); Kante mit Vorzeichen: in den Körper = Rundung, raus = Fase, durch 0 wechselt die Art, bei 0 scharf (E2)
- **0.17.2** Audit 2026-11-09: Rundung am Pfeil ziehen ruckelt nicht mehr (A31); kein leeres Muster nach Hin-und-zurück-Ziehen (A32); Klick auf den Kanten-Pfeil behält die markierten Kanten (A33)
- **0.17.1** Pfeile kleiner und behalten beim Zoomen ihre Bildschirmgröße (vorher riesig nach dem Hineinzoomen)
- **0.17.0** Muster und Ziehen wie Shapr3D: Klick auf ein Exemplar markiert das ganze Muster samt Quelle (M1); ⇕-Pfeil an ausgewählter Skizze bzw. Fläche, bei einem Muster an der Quelle (M2); Muster direkt am Modell: 4 Pfeile aus der Skizzenmitte, Ziehen legt es an, danach 2 Pfeile quer für das Raster (M3); Felder „Abstand ▾ / Gesamt“ und Anzahl am Pfeil (M4); Kante: ⇔-Pfeil und Feld „Rundung ▾ / Fase“ mit Maß (E1)
- **0.16.3** Audit 2026-11-04: „Öffnen“ merkt sich den Pfad, Strg+S speichert wieder in die geöffnete Datei (A26); Speichern wartet, bis die Daten auf der Platte sind (A27); gescheitertes Neurechnen gibt den Speicher frei (A28)
- **0.16.2** Beim Schließen der Desktop-App: Rückfrage Speichern / Nicht speichern / Abbrechen, wenn das Modell nicht gespeichert ist
- **0.16.1** Fehler aus dem Audit (Punkt 0): Worker antwortet immer, auch wenn ein Auftrag scheitert (A2); Rückgängig über Öffnen/Neu hinweg speichert in die richtige Datei (A3); Speichern über Nachbardatei, Absturz zerstört die Datei nicht mehr (A20); Namen und Farbe aus Dateien werden nicht mehr als HTML ausgeführt, CSP sperrt fremde Skripte (A1); fremde oder kaputte Dateien werden mit Grund abgelehnt, das Modell bleibt (A5); Export wartet, bis fertig gerechnet ist (A4) und fragt bei roten Schritten oder zurückgespultem Modell nach (A21); Rückfrage vor Öffnen und Neu, wenn das Modell nicht gespeichert ist, auch beim Start per Doppelklick (A22); überarbeitete STEP mit gleichem Namen zeigt die neue Geometrie (A6); KI-Schlüssel wird beim Wechsel des Anbieters geleert (A18)
- **0.16.0** Langloch bleibt beim Ändern ein Langloch: Länge und Radius gemeinsam, Punkte und Bögen ziehen die Enden; „Freie Form“ erlaubt einzelne Seiten
- **0.15.1** Nahtkanten auf Kugeln, Zylindern und Bohrungen ausgeblendet und nicht mehr greifbar
- **0.15.0** Werkzeug Kugel (K); Vollkreis um seine Mitte wird beim Drehen zur Kugel; Skizze quer über die Drehachse meldet einen Fehler statt eines leeren Körpers
- **0.14.1** Körperraster kräftiger und 175 % der Fläche groß
- **0.14.0** Ursprungsebenen grau wie der Boden; Körperraster blau, passend zur Fläche und von deren Mitte aus; runde Flächen ohne Raster und Skizze
- **0.13.0** Raster nur noch auf der Ebene, auf der gearbeitet wird; in der Modellansicht keines
- **0.12.2** Weniger Grafikkarten-Last: gezeichnet wird nur noch, wenn sich etwas tut; Schatten nur neu, wenn sich Körper ändern
- **0.12.1** Griffe neu: schlanker Pfeil je Achse, runde Drehringe, Farben wie die Achsen, Markierung orange
- **0.12.0** Maße mit Maßlinie und Pfeilen, auch beim Zeichnen; Hilfslinien kräftig in Magenta; Skizzenlinien dicker; sanftes Zoomen und Kamerafahrt auf dem Bogen; Menü „Alle Funktionen“
- **0.11.1** Werkzeugleiste ohne Scrollbalken auf kleinen Bildschirmen: zwei Spalten unter 900 px Höhe, Ansichten kompakter, obere Leiste bleibt bei 1280 px einzeilig
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
- 2026-11-10 F9 Entformungsschräge (0.25.0, MINOR, Heimrechner; die halbe F9 vom Arbeitsrechner wurde nicht übernommen und wird dort verworfen):
  neuer Schritt `draft` {at, more, faces, a} wie „Fläche löschen“ (Flächen über anchorFaces, Bezüge überleben Rebuild). `draftFaces` in topo.ts über
  BRepOffsetAPI_DraftAngle mit Historie (carry). Zugrichtung fest nach oben (Szene +Y), neutrale Ebene = Unterseite des Körpers (shortcut-Kommentar);
  Deckel/Boden werden abgelehnt. Kern-Test: zwei Stirnseiten 5° = Trapez-Volumen, −5° = breiter, Deckel = Fehler. Browser: Quader 40×30×25, vier
  Seiten 8° = 24,26 cm³ (Pyramidenstumpf gerechnet 24,26), −4° = 33,16, Kontextmenü legt neuen Schritt an. Winkel ist zollunabhängig.
  Nicht: Zugrichtung/neutrale Ebene wählbar, Ziehen am Modell (nur Feld), runde Flächen nicht im Test (OCCT kann Zylinder → Kegel).
- 2026-11-10 F8 Schnitt und Einzelheit (0.24.0, MINOR): `SheetInfo` bekommt `cut` {ax, at} und `det` {v, c, r}; im Modell als `sheet` gespeichert (parseModel lässt Unbrauchbares still weg). `sectionOf` schneidet je Körper die Hälfte zum Betrachter weg (Kasten), Schnittfläche = Netz-Dreiecke mit allen Ecken in der Ebene, als SVG-Muster schraffiert; Ebene ohne Treffer = Blatt ohne Schnitt. Blattaufbau jetzt als Raster aus Zellen (3. Spalte für Schnitt oben, Einzelheit unten), Maßstab passt sich an. Editor: Auswahl „Schnitt …“, Linie A ziehen (0,5-mm-Raster, Shift frei), Werkzeug „Einzelheit B“ (Mitte + Rand), „Einzelheit entfernen“; Worker meldet dafür die Lage der Ansichten (`lay`). Kern-Test: Schnittflächen 76/100/176/≈171,7 mm², Ebene daneben, zwei Körper, Einzelheit, Datei. Browser: Schnitt quer durch Bohrung, Linie auf x = 10 gezogen, Einzelheit B (2:1) gesetzt und gespeichert; Schnittlinie reicht jetzt über die Gesamtmaße hinaus (überdeckte sonst die 40). Nicht: Schnitt in der Iso-Ansicht, Maße in Schnitt/Einzelheit, Zoll, Exe/PDF-Druck.
- 2026-11-09 KI Google (nur Doku, Heimrechner, curl): Nutzer hatte 403 in der App, weil die Adresse generativelanguage.googleapis.com
  eingetragen war; sein `AQ.`-Schlüssel ist dort gesperrt (API_KEY_SERVICE_BLOCKED). Richtig: Basis-URL
  `https://aiplatform.googleapis.com/v1/projects/507261852277/locations/global/endpoints/openapi` (Projektnummer statt ID genügt).
  Antworten und rufen Werkzeuge richtig auf (Quader 40 × 20 × 10): google/gemini-3.8-flash (Empfehlung), -3.5-flash, -3.5-flash-lite,
  -3.1-flash-lite, -3.1-pro-preview, -3-flash-preview. 404: 3.8/3.5/3-pro, 3-pro-preview, 3.8-flash-lite, 2.5-*, 2.0-flash.
  Schlüsseldatei geminikey_dontcommitpush.txt lokal über .git/info/exclude ausgeschlossen. Nicht in der App geprüft.
- 2026-11-09 Installer 0.23.0 gebaut (9,5 MB, Heimrechner), dem Nutzer geschickt, noch nicht installiert.
- 2026-11-09 Knotenblech (0.23.0, MINOR): Feldnotiz Nutzer (Exe 0.22.0): „als Mensch mit Maus kann ich dort keine Linie ziehen, nur auf die flache
  Fläche“ – eine Ebene quer durch das Teil ist mit der Maus kaum zu treffen. Darum: scheitert die bisherige Rippe und liegt die Linie auf einer
  Körperfläche, sucht `gusset` das Linienende an einer Wand (kleiner Würfel knapp hinter dem Ende, 1 mm über der Fläche, schneidet Material;
  Punktabstand taugt nicht, beim Verbund misst er zur Hülle) und baut dort ein Dreieck senkrecht zur Fläche, rechter Winkel an der Wand, 45°,
  oben auf die Hüllbox gekappt. Damit wird auch der erste Fall des Nutzers (Linie an der Wand entlang) zum Knotenblech statt Fehler.
  Kern-Test: Boden-Linie beide Richtungen = Dreieck 25 × 25 × 3, zu lang = gekappt, ohne Wand = Meldung. Browser: 7,50 → 8,44 cm³, Bild geschickt.
  Nicht: Exe, Linie schräg zur Wand (Dreieck steht dann schräg zur Wand), Höhe/Winkel einstellbar.
- 2026-11-09 Linke Leiste (0.22.2, PATCH, Nutzer-Screenshot Exe 0.22.0): In der festen Leiste lagen ▾ und Tastenkürzel beide float:right,
  das ▾ (margin −6 px) verdeckte die Taste (R, N, M, L). Jetzt Knopf als Flex-Zeile, ▾ und Taste in fester Spalte rechts. Ansichten-Bereich als
  Raster 2 Spalten, Überschriften/Schieber/Einheit/Skin/„Leisten aus“ über die ganze Breite, Auswahlfeld rechts. Browser 1920×990 und 1100×990 (Hell):
  keine Überdeckung ▾/Taste (gemessen), nichts abgeschnitten.
- 2026-11-09 R1 (0.22.1, PATCH): ribSolid misst, wie weit das gewählte Stück quer zur Linie reicht (Ecken der Hüllbox auf die Querrichtung);
  mehr als 2·Länge + 2·Dicke + 5 mm = Riesenplatte → abgelehnt mit Anleitung („Linie auf eine Ebene quer durch das Teil legen …“). Skizze auf einer
  Körperfläche: Wand von −Dicke bis 0 entlang n statt mittig, Probe in der Wandmitte. Kern-Test mit dem Fall des Nutzers (senkrechte Linie auf der
  Wandinnenseite: Fehler, Volumen unverändert) und Stirnfläche (Dreieck × 3 mm, bündig bei z = 10). Nicht im Browser oder in der Exe nachgestellt.
- 2026-11-09 Installer 0.22.0 gebaut (9,5 MB, Heimrechner), dem Nutzer geschickt, noch nicht installiert.
- 2026-11-09 Feldnotiz Rippe (Nutzer, 0.21.0): Linie senkrecht auf der Wandfläche eines L-Winkels gezeichnet → riesige Platte über die ganze Länge
  („Monster“). Ursache: Skizze auf einer Körperfläche statt quer durch das Profil; die Rippe liegt dann in der Wandebene und das gewählte Stück
  reicht weit über die Linie hinaus. Neu nötig: R1 unten.
- 2026-11-09 L3 ohne Code abgeschlossen: obere Leiste bei 1024, 1366, 1536 und 1920 Breite gemessen, nie übergelaufen. Menü „Mehr“ erst bauen, wenn neue Knöpfe dazukommen.
- 2026-11-09 L2 (0.22.0, MINOR): Werkzeuge+Ansichten in #dockL, Eigenschaften+Baum in #dockR (Splitter dazwischen), obere Leiste über die ganze Breite. Canvas #view nur noch zwischen den Leisten (CSS --L/--R/--T, main.ts applyDock; renderer.setSize ohne Stil, Größe aus dem CSS). Würfel, Maße (#dims), Hinweis, Maßstab rechnen relativ zur Ansicht; Klicks stimmten schon, weil alles über el.getBoundingClientRect geht. Breiten ziehbar (64–480, gemerkt in openform-dock); unter 120 px oder wenn die Ansicht unter 480 px fiele: links nur Symbole (64 px), dann rechts schmaler. Tab blendet beide Leisten aus, die Ansicht wird breiter. ResizeObserver auf Leiste und Ansicht. Tauri-Mindestgröße 1024×576. Browser: 1920×1000 Ansicht 1430×959, Klick auf den Quader trifft; 1536×824 (1080p bei 125 %) 1046×783; 1024×576 534×535, Werkzeuge scrollen; Tab 1024 breit; schmal gezogen = Symbole. Obere Leiste passt bis 1024 ohne Umbruch. Nicht: Exe, echte DPI 150/200 %.
- 2026-11-09 L1 (0.21.1, PATCH): #panel bekommt max-height (65 vh − 72 px, ab 900 px Höhe 55 vh) und scrollt; ohne Baum (Tab, eingeklappt) fast volle Höhe. Browser 1366×700: Körper-Feld mit offenen Abschnitten 672 px Inhalt, 381 px sichtbar, endet bei 395 px über dem Baum (482 px), scrollt. L1–L3 als Abschnitt 3d geplant, F8/F9 danach.
- 2026-11-09 Installer 0.21.0 gebaut (9,5 MB, Heimrechner), dem Nutzer geschickt, noch nicht installiert.
- 2026-11-09 Skins (0.21.0): Nutzer wählte nach einer HTML-Vorschau „alle zur Auswahl“. index.html: alle festen Farben auf Variablen
  (--field, --hover, --hover2, --onaccent, --cube, --shadow, --blur), je Skin ein Satz unter :root[data-skin]; Leisten bekommen Schatten/Glas,
  wo der Skin sie hat. main.ts: SKINS mit Hintergrund, Raster (Farben stecken in der GridHelper-Geometrie → bei Wechsel neu erzeugt) und
  Kantenfarbe; Auswahl „Skin“ neben „Einheit“, gemerkt in openform-view. 3D-Markierungen bleiben orange in allen Skins (einheitlich).
  Browser 1920×1000: alle vier umgeschaltet, Leistenfarben/Schatten je Skin geprüft, Hell als Bild, Kern rechnet weiter. Nicht: Exe,
  Zeichnungs-Editor und KI-Dialog bleiben dunkel/eigene Farben.
- 2026-11-09 Bedienung 1080p (0.20.0, MINOR wegen neuer Funktion Ausblenden). Nutzer-Screenshot 1920×1080: Parameter-Zeile lief aus dem Baum
  (Querbalken). Jetzt Zeile als Flex mit festen Wertfeldern, Baum ohne Querscrollen, ab 900 px Höhe 45 % statt 35 % hoch, ▾ klappt ihn auf die
  Kopfzeile ein. Tab blendet Werkzeuge, Ansichten und Baum aus (wie in Bildbearbeitungen; Tab beim Maßtippen bleibt Maß-Trenner), oben, Seitenfeld
  und Würfel bleiben; ☰ unten links bringt sie zurück. Beides merkt sich der Rechner (localStorage, nicht im Modell). Browser 1920×1000:
  Baum 220×226, keine Überbreite; Ausblenden per Knopf und Tab, Einklappen 226 → 36 px. Nicht: Exe, kleinere Fenster neu angeordnet.
- 2026-11-09 Installer 0.19.0 gebaut (9,5 MB, Heimrechner), dem Nutzer geschickt, noch nicht installiert.
- 2026-11-09 F7 Benannte Maße (0.19.0, noch kein Installer). Entscheidung Datei: `params` {Name: mm} im Modell (nur wenn vorhanden), je Schritt
  `ex` {Pfad: {e: Ausdruck, u: mm je Eingabe-Einheit}}; ältere Versionen ignorieren beides und behalten die Zahlen. Rechner `evalExpr` ohne eval
  (CSP): Zahlen (Komma geht), Namen, + − × ÷, Klammern. Bindung ohne Umbau der ~25 Feld-Handler: Seitenfeld merkt vor dem Handler den Schritt,
  danach wird die geänderte Zahl gesucht, die dem Ausdruck entspricht (`changedNumbers`), genau eine → gebunden; Zahl ohne Namen eingetippt → Bindung
  weg. Maßfelder dafür Text statt Zahl (Pfeil hoch/runter zählt weiter), gebundene Maße stehen unten im Seitenfeld („Breite = breite + 1“).
  Ausdruck rechnet immer in der Einheit, in der er getippt wurde. Kern-Test: Rechner, Fehler, Rechteck aus der Mitte, Zoll-Bindung, gelöschter
  Parameter (Maß bleibt, Meldung), Datei. Browser mm: 8 → 16 (Breite = breite 80) → 32 (Höhe = breite/4) → 12,5 (breite 50) → Zahl 30 löst die
  Breite → 6 (breite 40), Strg+Z zurück. Browser Zoll: dicke·2 = 2 in = 50,8 mm, breite+1 = 3 in = 76,2 mm, in mm breite 76,2 → Breite 101,6 mm;
  dabei gefunden und behoben: Parameter-Liste zeigte nach Umschalten der Einheit alte Werte. Nicht: Maße beim Zeichnen (HUD) und Ziehen kennen
  keine Namen, Winkel nicht bindbar, Parameter aus Parametern.
- 2026-11-09 F6 Lippe/Falz (0.19.0, gleiche Nummer, noch kein Installer): Merkmal `lip` {kind, w, h, c} an der Schale, kein neuer Schritt.
  Kern (`lipOn`): Randfläche = ebene Fläche in der Ebene der geöffneten Fläche (Normale vor dem Aushöhlen gemerkt), deren Loch = Öffnung;
  Ring = Öffnung um W nach außen versetzt (`offset2D`, runde Ecken) minus Öffnung. Lippe: W = w, h nach oben angesetzt. Falz: W = w + c,
  h + c tief abgezogen. Scheitert der Rand, bleibt die Schale und der Schritt meldet „Lippe: …“. Gelernt (replicad): `innerWires()` gibt die
  Fläche frei, `makeFace`/`offset2D` verbrauchen den Draht, `basicFaceExtrusion` den Vektor → je Aufruf eigene Kopie. Kern-Test: Kiste
  40×30×20, Wand 2: Lippe = Ring(1) × 2, Höhe 22; Falz = Ring(1,2) × 2,2; zu breiter Falz frisst in die Wand. Browser: 7,15 → 7,41 cm³ (Lippe)
  → 6,81 cm³ (Falz), Felder mit Vorgaben. Nicht: Ziehen am Ring (nur Tippen), Deckel und Kiste zusammen gedruckt, Zoll, Exe.
- 2026-11-09 F5 Rippe (0.19.0, gleiche Nummer, noch kein Installer): Merkmal `rib` (Dicke) an einer offenen Linie, kein neuer Schritt-Typ.
  Kern (`ribSolid`): Streifen von der Linie quer zur Sehne weg, mittig auf der Skizzenebene, Körper abziehen; von den Stücken bleibt das an der
  Linie (Abstand zu einem Punkt knapp neben der ersten Seite). Seite automatisch: die, auf der der Körper den Streifen begrenzt; läuft er auf
  beiden ins Leere → Fehler „trifft den Körper nicht“. Linie darf in der Luft liegen, die Wand reicht bis an den Körper. Seitenfeld der Linie:
  Knopf „Rippe“, dann Feld „Dicke“ (0 = weg), Baum heißt „Rippe“. Kern-Test: Winkel 40×5 + Wand, Rippe schräg = Dreieck × 3 mm, andersherum
  gezeichnet gleich, waagrecht in der Luft = Rechteck bis an den Körper, weit weg = Fehler. Browser: 7,50 → 8,63 cm³ (3 mm) → 9,38 (5 mm) → 7,50 (0),
  jeweils sofort. Nicht: Ziehen an der Wand (nur Tippen), stark gebogene Linienzüge (Richtung quer zur Sehne, shortcut), Zoll, Exe.
- 2026-11-09 F4 Gewinde fertig (0.19.0, gleiche Nummer, noch kein Installer). Ursache der „leeren Ansicht“: kein Hänger, sondern die verdreht
  extrudierte Nocke. Sie bestand aus 48 verdrehten Spline-Flächen; ein Bolzen M10 × 5 mm ergab 8 Mio. Dreiecke, Netz und Kantennetz je ~150 s.
  Neu: jede Ecke des ISO-Profils (Spitze P/8, Grund P/4, 60°) auf einer Schraubenlinie (`makeHelix`), dazwischen Regelflächen (`loft` ruled),
  zwei Deckel, `makeSolid`, Kern-Zylinder dazu, auf die Höhe zugeschnitten. M10 × 20: 19 Flächen, 7 000 Dreiecke, Netz 0,2 s, Körper ~3 s.
  Damit stimmt auch die Form: die alte Dreieckswelle hatte ~78° Flanken und hätte in einer Normmutter geklemmt. Bolzenkern jetzt 0,5413·P
  (Grundprofil) statt 0,6134·P. Kern-Test prüft Volumen gegen Pappus (0,1 %), Netzzeit, Dreiecke und STEP. Browser: Platte 40×20×10 mit
  Bohrung und Bolzen M10: 8,47 cm³ nach 3,5 s, mit Innengewinde 8,33 cm³ nach 5,3 s (beides nachgerechnet), keine Fehler; Gewinde sichtbar.
  Schalter `SHOW_THREADS` entfernt. Nicht geprüft: Exe, Zoll, Druck mit echter Mutter, Linksgewinde (gibt es nicht).
- 2026-11-09 `build.bat` im Projektordner: Installer per Doppelklick (setzt Node- und Cargo-Pfad, ruft `npm.cmd run desktop:build`, öffnet den Ordner mit der Setup-Datei). Grund: PowerShell-Ausführungsrichtlinie sperrt `npm.ps1`, ohne Admin nicht änderbar; cmd ist davon nicht betroffen. Pfade geprüft (npm 11.19, cargo 1.99), voller Bau damit nicht gelaufen.
- 2026-11-09 F4 Gewinde angefangen, auf Wunsch des Nutzers angehalten: Kern + Test fertig, Bedienung per `SHOW_THREADS = false` aus, weil im Browser nach Wahl eines Gewindes kein Körper mehr erscheint. Übergabe-Notiz bei F4 im Plan. F5–F9 unverändert TODO.
- 2026-11-09 F3 Referenzbild (0.19.0): neuer Schritt `image` {data = Data-URL, pl = xy/xz/yz, x, y, w}; Kern überspringt ihn, parseModel nimmt nur `data:image/…`, w > 0 und eine der drei Ebenen (sonst könnte eine präparierte Datei eine fremde Adresse laden). Ebenen als `ORIGIN` in model.ts wie die Quadrate am Ursprung. Anzeige halbdurchsichtig 0,02 mm hinter der Ebene, Höhe aus dem Seitenverhältnis nach dem Laden. Maßstab: Knopf, dann zwei Klicks (Schnitt Mausstrahl/Ebene, fängt `onDown` ab), Feld „echte Länge“ skaliert w, x, y um den Ursprung, damit das Bild deckungsgleich bleibt. Bild nicht anklickbar (Skizzieren über das Ursprungs-Quadrat). Browser: PNG 200×100 auf XY, Maßstab gemessen 36,4 → 72,8 ergibt w 200. Nicht: Exe (read_bytes + Blob), Zoll, Bild drehen.
- 2026-11-09 F2 Referenz-Netz (0.19.0): neuer Schritt `mesh` {name, data = Base64 der Float32-Dreiecke}, Kern überspringt ihn. `refmesh.ts` liest STL/OBJ (three-Loader, im Test) und 3MF (braucht DOMParser, nur im Browser, ungetestet), dreht Z-oben nach Y-oben, Einheit mm angenommen. Anzeige in `refGroup` (je Schritt einmal dekodiert, `refCache`), Treffer in `pick` ohne Griff und ohne Körper: Ziehen tut nichts, Skizzieren legt die Ebene auf die Netzfläche. Desktop: neuer Befehl `read_bytes` (Rohdaten als ArrayBuffer), Dialog-Filter um stl/obj/3mf erweitert. Entscheidung: Netz im Modell statt nur in der Sitzung, damit es mit der Datei wiederkommt; shortcut: jeder Rückgängig-Schritt kopiert den Text (wie STEP, A8). Browser: STL-Turm 20×20×30 erscheint stehend, Volumen bleibt 6 cm³, Ziehen ändert nichts, Rechteck auf der Netzfläche hat n = (0,0,1). Nicht geprüft: 3MF, Exe (read_bytes), große Netze, Messen-Werkzeug am Netz, Netz verschieben (geht nicht).
- 2026-11-09 F1 Skizzen-Ecken (0.19.0, gleiche Nummer, noch kein Installer): `roundCorners` in model.ts ersetzt einen Eckpunkt durch zwei Punkte (Abstand r/tan(α/2) bzw. r) mit Bogen (bulge über `bulge3` aus der Bogenmitte); Rechteck wird zum Vieleck. Alle oder keine: reicht eine Seite nicht, kommt null (sonst halb gerundete Formen). Abhängigkeiten an den zwei verkürzten Seiten (Länge, gleich, fest, Radius, tangential) fallen weg, die übrigen rücken um eins. Bedienung: Seitenfeld (unter „Mehr“), Klick auf Eckpunkt wählt die Ecke (orange, größer); Rechteck hat keine Punkt-Griffe, dort nur alle Ecken. Kern-Test: Volumen alle/eine/Fase, zu groß, Ecke am Bogen, Abhängigkeiten. Browser: Rechteck 30×20×10 alle R3 = 5,92 cm³; Vieleck Punkt 2 Fase 4 = 5,92 cm³. Nicht: Ziehen am Radius (nur Tippen), Zoll.
- 2026-11-09 K3 Körper ausblenden/löschen (0.19.0, gleiche Nummer, noch kein Installer): (1) Export (STEP, STL, 3MF, SVG, DXF) und Zeichnungsblatt nahmen alle Körper, auch ausgeblendete; OBJ nahm schon nur sichtbare. Jetzt schickt `exportNow` bzw. das Blatt `skip` = ausgeblendete Körper mit, der Worker baut in `shown()` den Verbund nur aus den sichtbaren und gibt ihn danach frei. (2) Neuer Schritt-Typ `drop` {body} (Entscheidung: als Schritt statt Features löschen, weil eine Hälfte aus „Teilen“ keinen eigenen Schritt hat; Zurückspulen und Strg+Z bringen den Körper wieder). Kern löscht den Körper aus `bodies`, fehlt er: Fehler „Körper nicht vorhanden“. parseModel prüft `body`. Ältere Programmversionen kennen `drop` nicht und ignorieren ihn. Kern-Test: Kugel r30 teilen, Hälfte 7 löschen = ½ Kugel, Fehlerfall, parseModel. Browser: STL 1,52 MB → 0,76 MB mit ausgeblendeter Hälfte; „Körper löschen“ lässt 56,55 cm³ (= ½ Kugel r30) und den Baum-Eintrag „Körper #7 löschen“. Nicht geprüft: STEP/3MF/Zeichnung mit ausgeblendetem Körper (gleicher Weg), Zoll.
- 2026-11-09 K2 Halbkugel (0.19.0, neue Funktion = MINOR): Nutzer kam mit Teilen an einer Ebene nicht zurecht (Ebene nicht mittig setzbar; Körper statt Schritt auswählen nicht zu finden). Kern hatte es schon: Kugel = Halbkreis um die Achse u gedreht, 180° statt 360° gibt genau die Hälfte auf der +n-Seite. Häkchen setzt `rev` 180/360; bei „Abziehen“ ausgeblendet und `rev` zurück auf 360 (die halbe Kuppel läge außerhalb, die ganze Kugel gibt die Mulde). Kern-Test: Volumen ½ Kugel, y-Bereich [0, r]. Browser: Platte 80×80×10 + Halbkugel r30 = 120,55 cm³. Gefunden, offen: ausgeblendete Körper gehen wohl trotzdem in den Export, einzelnen Körper löschen gibt es nicht.
- 2026-11-09 Installer 0.18.2 gebaut (9,9 MB), noch nicht installiert.
- 2026-11-09 KI mit Google Agent Platform (0.18.2, PATCH): Schlüssel des Nutzers (beginnt mit `AQ.`) ist ein Agent-Platform-Schlüssel, bei generativelanguage.googleapis.com gesperrt (403 API_KEY_SERVICE_BLOCKED). Die OpenAI-kompatible Adresse `https://aiplatform.googleapis.com/v1/projects/<Projekt>/locations/global/endpoints/openapi` mit Modell `google/gemini-3.8-flash` antwortet mit curl, aber nur mit dem Kopf `x-goog-api-key`; `Authorization: Bearer` wird dort als OAuth-Token gelesen (401). `chat` schickt den Schlüssel bei *aiplatform.googleapis.com jetzt so, Test in ai.test.ts. Nicht in der App selbst geprüft (Schlüssel tippt der Nutzer ein). Der Nutzer hatte geminikey.txt im Repo-Ordner: lokal über .git/info/exclude ausgeschlossen, nicht über .gitignore.
- 2026-11-09 Installer 0.18.1 gebaut (9,9 MB), noch nicht installiert.
- 2026-11-09 K1 Kugel abziehen (0.18.1, Fehlerbehebung = PATCH, da 0.18.0 schon gebaut): Nutzer wollte eine Halbkugel-Mulde, das Häkchen „Abziehen“ war bei der Kugel ausgeblendet (`f.rev && !f.ball`), der Kern konnte es schon (`isCut` = `rev ? sub`). Häkchen jetzt bei jedem Drehkörper, bei der Kugel „(Loch)“. Kern-Test: Würfel 20×20×10 minus Kugel r5 mit Mitte auf der Fläche = 4000 − ½·Kugel. Gelernt: im Test muss die Kugel im selben Körper liegen (kein `body`), sonst bleibt sie ein eigener Körper und es wird nichts abgezogen. Im Browser: 30×30×20 minus Kugel r8 = 16,93 cm³, Mulde sichtbar. Offen: eine neue Kugel ist zunächst immer aufgesetzt, Abziehen erst danach per Häkchen.
- 2026-11-09 Installer 0.18.0 gebaut (9,9 MB), noch nicht installiert; I8 und Alt+Ziehen erst darin prüfbar.
- 2026-11-09 E2 Kante mit Vorzeichen (0.18.0, gleiche Nummer, noch kein Installer): Nutzer wollte einen Wert durch 0 statt „erste Bewegung legt die Art fest“, Richtung festgelegt: in den Körper = Rundung (umgekehrt zu E1). `edgeStart` legt beim Drücken eine Achse in der Bildebene fest (Außenrichtung: an scharfer Kante `edgeOutward`, an fertiger Rundung/Fase neu `nearestNormal` = Normale der nächsten Fläche, auch für den Pfeil) und den Startwert ±r; Wert = Start − Weg entlang der Achse, also relativ, damit Greifen auf der Fasenfläche nicht sofort umschlägt. Zone um 0 ist 8 px breit (bei 0,5-mm-Raster nur ~1 px, nicht zu treffen); dort wird der Eintrag `hidden`, beim Loslassen entfernt (`dropEdgeOps`, Kanten bleiben markiert). Maßfeld: `editDim` gibt jetzt auch ≤ 0 an `apply` weiter (einziger Nutzer). Im Browser: rein 6,5 Rundung, raus durch 0 auf Fase 6, Fase 5→2→scharf→Radius 1,5→7,5, bei scharf losgelassen = weg, Strg+Z zurück, getippt 3/0/−2. Kein Kern-Test: nur Bedienung in main.ts, Kern unverändert. Nicht geprüft: Zoll, Innenkanten (konkav), Mehrfachauswahl.
- 2026-11-09 I8 Zuletzt geöffnet (0.18.0): jede Datei, die geöffnet oder gespeichert wird (`setFile`), kommt nach vorn in `openform-recent` (höchstens 8). „Öffnen“ zeigt in der Desktop-App ein Menü: „Datei wählen …“ und die Liste (Name · Ordner); nicht mehr vorhandene Dateien fliegen beim Anklicken mit Meldung heraus. Ohne Liste geht der Dialog wie bisher direkt auf. Nur in der Exe prüfbar, nicht im Browser; nicht von Hand geprüft. Damit sind I1–I8 erledigt.
- 2026-11-09 I7 3D-Druck-Vorlagen (0.18.0): Auswahl „Vorlage“ an Bohrungen jetzt mit Gruppe „3D-Druck“ (`PRINT_HOLES`: Einschmelzmutter M2–M5 mit Ø und Tiefe, M3/M4 direkt in Kunststoff, Durchgang M3–M5 nach ISO 273 mittel), dazu „Mutternfalle M3/M4/M5“ (`nutTrap`: Sechskant-Tasche ISO 4032 + 0,3 mm Luft, Mutter + 0,2 mm tief, eigene Skizze an derselben Stelle). Werte sind übliche Herstellerangaben, Drucker streuen: bei Bedarf im Feld ändern. Kern-Test für die Mutternfalle. Im Browser: Durchgang M3 gewählt, Mutternfalle M3 angelegt (6 × 3,35 mm, 2,6 tief).
- 2026-11-09 I6 Bis zur Fläche (0.18.0): `faceLevels` sammelt einmal je Ziehen die Höhen aller ebenen Flächen parallel zur Skizze (Anzeigenetz, auf 0,001 mm gerundet); näher als 8 Pixel = einrasten, HUD „bis Fläche“, Shift = frei. Nur das Maß wird übernommen, es wandert nicht mit, wenn die andere Fläche sich später ändert (echte Bindung wäre ein neuer Bezug im Modell, erst wenn ein Teil das braucht). Im Browser: Block auf 20,37 mm gezogen = Höhe des Nachbarn (krumme Zahl, also nicht das Raster).
- 2026-11-09 I5 Durch alles beim Ziehen (0.18.0): beim ersten Hineinziehen einer Skizze auf einer Körperfläche misst `bodyDepth` einmal die Tiefe des Körpers unter ihrer Mitte (fernster Treffer im Anzeigenetz entlang −n); wer weiter zieht, bekommt „durch alles“ (thru, Tiefe = Körper), mitgezogene Bohrungen ebenso; zurückziehen hebt es wieder auf (applyPush). Erster Versuch stürzte ab: Tiefe wurde an der Kopie f0 gesucht, die nicht in der Schrittliste steht → nach Nummer suchen. Kein Kern-Test (reine Bedienung, der Kern rechnet thru wie bisher). Im Browser: Bohrung 4 mm in 10-mm-Platte weit gezogen → −10, Haken gesetzt.
- 2026-11-09 I4 Exemplare weglassen (0.18.0): `skip` am Muster (Schlüssel der Exemplare, in parseModel geprüft), `patternCopies` filtert sie, Kern und Anzeige folgen. Alt+Klick statt Shift+Klick, weil Shift schon Mehrfachauswahl ist; trifft flache Kopien und Körper-Kopien (über `patternGrip`). Zurückholen: „alle zurückholen“ im Seitenfeld, einzeln nur mit Strg+Z. Kern-Test; im Browser ein Loch aus 5 per Alt+Klick entfernt.
- 2026-11-09 I3 Muster beidseitig (0.18.0): neue Eigenschaft `both` je Richtung (n Exemplare je Seite, Quelle in der Mitte, Schlüssel der bestehenden Kopien bleiben gleich), `spanOf` für die Gesamtlänge. Alt beim Ziehen eines Muster-Pfeils schaltet ein, das Häkchen „beidseitig“ im Seitenfeld ein und aus; Feld am Pfeil zeigt „3× ⇆“. Kern-Test. Im Browser über das Häkchen geprüft (3 → 5 Löcher, Quelle mittig); Alt+Ziehen nicht von Hand geprüft (Werkzeug kann beim Ziehen keine Taste halten).
- 2026-11-09 I2 Größtmögliches Maß (0.18.0): Knopf im Feld einer roten Rundung/Fase. `maxEdgeSize` (kernel.ts, Kern-Test): Halbierungssuche 0,05 mm bis gescheitertes Maß, nur Schritte bis zur Rundung, eigener Zwischenspeicher (jeder Versuch rechnet nur den einen Schritt), abgerundet auf 0,1 mm; Worker-Auftrag `maxEdge`. Ergebnis wird übernommen (Strg+Z = zurück). Im Browser: Quader 20 × 10 × 10, Rundung 12 → 9,9. Das Seitenfeld zeigt den Knopf bis zum nächsten Neuzeichnen weiter.
- 2026-11-09 I1 Fläche füllen (0.18.0): Knopf im Muster-Feld (neue Reihe und bestehendes Muster mit einer Quelle), Rand eintippen. `fillGrid` (model.ts, Kern-Test) rechnet Anzahl und Startmitte je Richtung; die Fläche kommt als Kasten aus dem Anzeigenetz des Körpers (Punkte in der Skizzenebene mit gleicher Normale), Quelle wird auf die erste Stelle verschoben, Achsen = X/Y der Skizze. shortcut: Kasten statt echtem Umriss, bei runden oder L-Flächen fallen Ecklöcher heraus. Im Browser: Platte 60 × 30, Loch R3, Rand 3, Abstand 10 → 5 × 2, Mitten 10–50 / 10–20 (mittig).
- 2026-11-09 Audit-Fixes (0.17.2): A31 bei bestehender Rundung/Fase keine Suche nach der Außenrichtung (der alte Kantenpunkt liegt nicht mehr am Körper, die Suche lief immer durch alle Dreiecke). A32 `drag.made` merkt ein neu angelegtes Muster bzw. eine neue Richtung, Abstand 0 beim Loslassen = wieder weg. A33 `arrow` am Drag: Klick ohne Ziehen setzt die Kantenauswahl nicht neu. 112 Tests grün, tsc sauber; im Browser nicht durchgeklickt, weil dort das Modell des Nutzers offen ist (eigener Speicher unter 127.0.0.1 war nicht erreichbar).
- 2026-11-09 Pfeile (0.17.1), Rückmeldung des Nutzers mit Bild: ⇕-Pfeil nach dem Hineinzoomen riesig. Ursache: Griffe wurden beim Neuzeichnen in Pixelgröße angelegt und wuchsen beim Zoomen mit. Jetzt `scaleHandles()` im Bildlauf: jeder Griff merkt sich Ankerpunkt und Pixelgröße und skaliert um den Anker; gilt auch für die alten Muster-Pfeile und Skizzenpunkte. Alle Pfeile etwa ein Drittel kleiner. Geprüft im Browser am Modell des Nutzers (nur ausgewählt und gezoomt, nichts geändert).
- 2026-11-09 E1 (0.17.0, gleiche Nummer, noch kein Installer): Wunsch des Nutzers mit Bildern aus Shapr3D. Das Verhalten (weg = Rundung, hinein = Fase) gab es schon, es fehlte das Sichtbare: Pfeil aus zwei Kegeln an der Kante, Feld am Pfeil. Ohne Rundung legt erst das getippte Maß an (`editDim` mit eigener Übernahme `apply`, sonst hätte Tippen im Seitenfeld beim Verlassen schon angelegt); Wort umschalten = Art für die nächste bzw. bestehende Rundung/Fase (mit Rückgängig). Nach dem Runden liegt der Kantenpunkt nicht mehr am Körper: Pfeil dann quer zur Kante zum Betrachter. Bei Kanten, deren Außenrichtung zum Betrachter zeigt, sieht der Pfeil wie ein Punkt aus. Im Browser: Fase 3 getippt, auf Rundung umgeschaltet, am Pfeil auf 5,5 gezogen.
- 2026-11-09 M1–M4 (0.17.0), Wunsch des Nutzers mit Bildern aus Shapr3D. M1 nachgestellt: Klick in eine kopierte Bohrung markierte nur die Quelle, Klick auf eine flache Kopie ließ die Quelle unmarkiert; jetzt `marked()`: Muster und Quellen gelten zusammen als ausgewählt (nur Anzeige, Ziehen ging schon immer auf alle). M2 Pfeil aus zwei Kegeln in Blau über der Skizzenmitte; Ziehen = wie Fläche ziehen, aber `whole` (nie nur ein Teilbereich, sonst drückte der Pfeil eines Rechtecks mit Kreis in der Mitte nur den Kreis). M3 neue Pfeile nur im Muster-Werkzeug (Reihe) bzw. bei einem Muster mit einer Richtung; Muster entsteht beim ersten Ziehen über die bestehende Abstands-Ziehlogik (`patd`), Dateiformat unverändert. Weiße Pfeile waren auf dem hellen Körper unsichtbar, deshalb orange. M4 `patTotal` gilt für Seitenfeld und Felder am Pfeil; Anzahl ändern im Gesamt-Modus hält die Gesamtlänge. Kern-Test: Muster mit umgedrehter Achse = gleiches Ergebnis. Im Browser durchgeklickt (3 × 3 per Ziehen, Gesamt, Anzahl 5 getippt); Pfeile wachsen beim Zoomen nicht mit (wie die alten Muster-Pfeile), Zoll nicht von Hand geprüft.
- 2026-11-04 Audit-Fixes (0.16.3): A26 Pfad beim Öffnen über den Knopf übergeben (seit A3 sicher, weil Rückgängig den Pfad je Eintrag mitführt; der Satz „Pfad nie aus einer geöffneten Datei übernehmen“ in A3 war zu weit gefasst). A27 `File::create` + `write_all` + `sync_all`, dann `rename`. A28 im Fehlerzweig des Workers `free` + `dropCache` vor dem Zurücksetzen. 112 Tests grün, tsc und cargo check sauber; Installer 0.16.3 auf Wunsch gebaut, nicht von Hand geprüft. A29/A30 als SPÄTER notiert.
- 2026-11-02 Schließen (0.16.2), Rückmeldung des Nutzers: die Desktop-App schloss ohne Frage, erst beim nächsten Start fiel die ungespeicherte Arbeit auf. Meine Entscheidung aus A22 („Zwischenspeicher reicht“) war falsch. Jetzt `onCloseRequested` mit Windows-Dialog Speichern / Nicht speichern / Abbrechen; Speichern-unter abgebrochen oder fehlgeschlagen = Fenster bleibt offen. Neues Recht `core:window:allow-destroy` (sonst schließt das Fenster nach der Frage nicht). `saveModel` liefert jetzt true/false. Nur in der Exe prüfbar, nicht im Browser. CSP aus A1 vom Nutzer in der Exe bestätigt. Installer 0.16.2 gebaut.
- 2026-11-02 A18 (0.16.1): Voreinstellung mit anderer Adresse leert das Schlüsselfeld (und damit den gespeicherten Schlüssel); gleicher Anbieter behält ihn. Von Hand eingetippte Adresse leert ihn bewusst nicht (Tippfehler korrigieren soll den Schlüssel nicht löschen). Im Browser: Groq + Schlüssel → Ollama = leer. Damit sind alle TODO aus Punkt 0 erledigt; offen nur die SPÄTER-Punkte und die CSP-Prüfung in der Exe.
- 2026-11-02 A6 (0.16.1): Worker merkt sich den STEP-Text je Import; anderer Text bei gleicher Nummer → alten Körper freigeben, neu einlesen, Zwischenstand verwerfen (`dropCache` jetzt exportiert, sein Schlüssel enthält den Text bewusst nicht, das wäre bei jedem Ziehen teuer). Nachgestellt im Browser-Worker: Import 1 mit Quader 1000 mm³, dann gleiche Nummer mit Quader 2000 mm³ → alt 1000 (falsch), neu 2000, auch zurück auf A richtig.
- 2026-11-02 A22 (0.16.1): Prüfsumme (FNV) des zuletzt gespeicherten oder geöffneten Stands in localStorage `openform-saved`; `discardOk` fragt vor Öffnen einer .ofc und vor Neu, wenn das Modell davon abweicht, auch beim Start per Doppelklick (dort steht noch der Zwischenspeicher der letzten Sitzung). Prüfsumme statt Kopie, weil STEP-Text sonst den Speicher doppelt füllt. Entschieden: beim Schließen keine Frage, der Zwischenspeicher behält die Arbeit; Strg+Z holt das verworfene Modell weiterhin zurück. Im Browser: ungespeichert → Frage, Nein behält; nach Speichern keine Frage.
- 2026-11-02 A21 (0.16.1): `exportNow` fragt vor jedem Export (STEP, STL, 3MF, SVG, DXF) nach, wenn Schritte rot sind oder zurückgespult ist; nennt die Schrittnummern. Bereits bestätigter Export (force) fragt nicht erneut. Im Browser: Quader mit zu großer Rundung → Frage „Schritt #2 ist fehlgeschlagen …“, Nein = keine Datei, Ja = Datei. OBJ fragt nicht (Anzeigenetz).
- 2026-11-02 A4 (0.16.1): Alle Exporte über `sendExport`: läuft eine Berechnung oder wartet eine Änderung, wird der Export gemerkt („Export wartet …“) und nach dem letzten `built` geschickt. Nachgestellt im Browser: Platte 300×200 mit 300 Löchern, Höhe 5 → 9, sofort STL. Alter Code: STL 5 mm hoch (falsch), neu: 9 mm, Export nach rund 17 s. OBJ nimmt weiter das Anzeigenetz und wartet nicht.
- 2026-11-02 A5 (0.16.1): `parseModel` in model.ts prüft Liste, Nummern und Bezüge (body, profile, plane, of, a/b bei Loft/Verrechnen, src) und ergänzt fehlende Nebenangaben alter Dateien (nextId aus der höchsten Nummer, meta, roll, dims). `opened` prüft vor `pushHistory`, Ablehnung = Meldung, Modell unverändert; `load` (auch Autosave und Undo) nutzt dieselbe Prüfung. Kern-Test: alte Datei, fremdes und kaputtes JSON, präparierte Nummern. Im Browser über das Datei-Feld: package.json abgelehnt, gültige .ofc geht auf, Undo zurück. Aufgefallen, nicht geändert: Öffnen über den Knopf in der Desktop-App übergibt keinen Pfad, Strg+S fragt danach nach dem Speicherort.
- 2026-11-02 A1 Teil 2 (0.16.1): CSP in tauri.conf.json (`script-src 'self' 'wasm-unsafe-eval'`, Stile inline erlaubt, connect-src ipc: für invoke und KI über das HTTP-Plugin; devCsp zusätzlich mit Vite-Websocket). Vorab im Browser (Chromium wie WebView2) am gebauten dist mit derselben Regel als meta: OpenCascade und Schrift laden, Quader rechnet 1,00 cm³, eval und eingeschleuster onerror gesperrt. In der Exe selbst noch nicht gesehen.
- 2026-11-02 A1 Teil 1 (0.16.1): `esc()` nach model.ts (kernel.ts hatte schon einen, jetzt eine Stelle), alle `nameOf` in HTML (Seitenfeld, Muster-Ansicht, Knöpfe, Listen) geschützt, Körperfarbe nur als `#rrggbb`, sonst Standard. Im Browser mit präparierter Datei (Name und Farbe mit `<img onerror>`): nichts ausgeführt, Name als Text sichtbar. CSP folgt getrennt, sie kann das Laden von OpenCascade verhindern.
- 2026-11-02 A20 (0.16.1): `write_bytes` schreibt nach `<datei>.tmp` und benennt dann um (Windows ersetzt dabei die Zieldatei), bei Fehler wird die .tmp entfernt. Absturz mitten im Schreiben nicht nachstellbar; `cargo check` grün, wirkt erst im nächsten Installer. Gilt für .ofc und alle Exporte der Desktop-App.
- 2026-11-02 A3 (0.16.1): Undo/Redo-Einträge tragen den Dateipfad, `step()` setzt ihn beim Zurückholen. Undo bleibt erhalten (einzige Rettung nach versehentlichem Öffnen). Nachgestellt nur am Code: der Pfad existiert nur in der Desktop-App; im Browser geprüft, dass Neu → Undo → Redo weiter stimmt. Kein Kern-Test, Oberflächenlogik.
- 2026-11-02 A2 (0.16.1): nachgestellt mit Bau-Auftrag ohne `features` → keine Antwort, App hätte für immer „busy“. Jetzt fängt `onmessage` jeden Fehler: Bauen meldet „Neurechnen fehlgeschlagen“ und schickt ein leeres `built` (Zwischenstand verworfen), Prüfen/Projektion/Export antworten leer. Gelöschte Körper werden sofort auf null gesetzt. Im Browser: kaputter Auftrag → Meldung + Antwort, nächster Auftrag rechnet normal. Kern-Test: keiner, der Worker läuft in vitest nicht (Begründung, kein Versäumnis).
- 2026-11-02 Punkt 0 überarbeitet. Fixes korrigiert: A1 auch Schrittnamen und CSP mit wasm-Recht, A3 Pfad im Undo statt Undo leeren (sonst neuer Datenverlust), A8 Grenze nach Größe. Neu: A20 atomares Speichern, A21 Export-Warnung, A22 Rückfrage, A23–A25. Gestrichen: A15 (in A5), A17, A19 (Umbau ohne Nutzen). Nur noch zehn Pakete vor Teil 2, der Rest SPÄTER: echte Teile zeigen mehr als weitere Prüfungen.
- 2026-11-02 Audit des ganzen Repos: 19 Funde, 7 davon „Muss beheben“ (Sicherheit über präparierte .ofc, Worker-Hänger, Datenverlust beim Speichern nach Undo, veralteter Export, kaputte Datei, alte STEP-Geometrie, Speicherlecks). Als Plan Punkt 0 (A1–A19) eingetragen, noch nichts behoben.
- 2026-11-02 Abgleich nach 0.16.0: Typen, 111 Tests und Build grün, App startet fehlerfrei, alte Muster-Dateien bleiben lesbar. Korrigiert: CLAUDE.md (3MF und .ofc sind da), Installer-Stand, Teil 2 = Zahnbürstenständer, unklare Notiz „ohne Zuordnung“. Installer 0.16.0 gebaut.
- 2026-10-31 Langloch (0.16.0). Abhängigkeiten im Löser taugen dafür nicht: parallel, gleich lang und tangential zusammen scheitern schon an
  einer neuen Länge. Deshalb eigene Regeln statt Löser, die Form hängt am Merkmal slot. Länge gemessen an Seite 0, das Ende bei Punkt 0 und 3
  bleibt stehen, damit die Richtung nicht davon abhängt, welche Seite man anfasst. Vorhandene Langlöcher bleiben freie Form.
- 2026-10-31 Nähte (0.15.1). Eine Naht gehört nur zu einer Fläche, jede echte Kante eines geschlossenen Körpers zu zweien; so fallen sie
  aus dem Kantennetz fürs Bild. Dazu Kanten zwischen zwei Teilen derselben runden Fläche, denn ein Kreis wird beim Hochziehen zu zwei
  Halbzylindern; Vergleich über Art und Maße der Fläche. Das B-Rep und die Exporte bleiben unberührt. Offene Flächenkörper würden ihre Randkanten verlieren, die
  gibt es aber nicht, weil beim STEP-Import nur Volumenkörper bleiben.
- 2026-10-31 Kugel (0.15.0). Kugel = Kreis mit ball: Achse läuft immer durch die Mitte, auch nach Maßänderung; gerechnet wird ein
  Halbkreis, der ganze Kreis lieferte still einen Körper mit Volumen 0. Skizzen quer über die Achse sind jetzt ein Fehler; das gilt
  auch für alte Modelle, die bisher einen leeren Körper ergaben. Beim Testen fiel auf: Klick auf einen Drehkörper griff die Rundung
  eines anderen Körpers, wenn deren Kante zufällig in die Richtung zeigte; ownerOf prüft jetzt den Körper.
- 2026-10-31 Körperraster (0.14.1). Nach Rückmeldung kräftiger und über die Kante hinaus: 175 % um die Flächenmitte. Reine Darstellung.
- 2026-10-31 Raster nach Shapr3D-Vergleich (0.14.0). Neue Skizzen auf einer Körperfläche haben ihren Ursprung in deren Mitte, damit
  Linien und Einrasten zusammenpassen; bestehende Skizzen behalten ihren. Auf runden Flächen legt ein Klick jetzt keine Skizze mehr
  auf die Tangentialebene, sondern sie fällt auf Raster oder Boden. Mehrere Flächen in derselben Ebene ergeben ein gemeinsames Rechteck.
- 2026-10-31 Raster (0.13.0). Boden-Raster nur mit Skizzenwerkzeug, bei Skizze auf dem Boden oder im leeren Modell; auf anderen
  Ebenen liegt das blaue Raster, solange dort gezeichnet wird oder die flache Skizze ausgewählt ist. Entschieden: im leeren
  Modell bleibt der Boden sichtbar, sonst fehlt jede Orientierung. Einrasten ist unabhängig vom Sichtbaren. Darstellung, kein Kern-Test.
- 2026-10-31 Grafikkarten-Last (0.12.2). Die Schleife zeichnete dauernd, auch im Ruhezustand, mit Schatten 2048² je Bild. Jetzt
  weckt jede Eingabe, Kernantwort oder Kamerabewegung für 400 ms, sonst ein Bild je Sekunde als Sicherung. Wer künftig etwas
  ohne Eingabe oder Kernantwort am Bild ändert, muss wake() bzw. wakeShadow() rufen. Darstellung, deshalb kein Kern-Test.
- 2026-10-31 Griffe (0.12.1). Die Griffe von TransformControls werden zur Laufzeit umgebaut, das greift auf dessen internes
  _gizmo zu und ist nach einem Three.js-Update zu prüfen. Die graue Kugel für freies Drehen ist weg, die Griffe in Gegenrichtung
  auch; gezogen wird weiter in beide Richtungen. Reine Darstellung, deshalb kein Kern-Test.
- 2026-10-31 Vergleich Shapr3D, Gefühl und Funktionen (0.12.0). Maßlinien liegen als SVG über dem Bild und werden je Bild neu
  gerechnet; das Mausrad läuft über mehrere Bilder an OrbitControls. Das Menü „Alle Funktionen“ zeigt, was schon da war, aber
  nur im Seitenfeld oder per Rechtsklick zu finden war. Reine Bedienung, deshalb kein Kern-Test. Offen aus der Shapr3D-Liste:
  Füllung, Fläche ersetzen, Umhüllen und Prägen.
- 2026-10-31 Kleine Bildschirme (0.11.1). Bei 1366x768 fehlten der Leiste 72 px, sie scrollte. Unter 900 px Höhe jetzt zwei
  Spalten und Ansichten ohne Überschriften, unter 640 px auch die Leiste ohne Gruppentitel. Gemessen bei 1920x1080, 1600x900,
  1366x768, 1280x720 und 1280x600: kein Scrollbalken. Reine Darstellung, deshalb kein Kern-Test.
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
