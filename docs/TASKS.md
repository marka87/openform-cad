# TASKS — OpenForm CAD
Status: TODO / DOING / DONE / BLOCKED(Grund)

Regel: DONE nur mit grünem Test oder benanntem Beleg im Log. Ein Paket,
das nur teilweise erledigt ist, bleibt TODO; der fertige Teil wird im
Text des Pakets beschrieben, nicht durch ein Häkchen.

## Arbeitsreihenfolge
Oben abarbeiten, dann nach unten. Die Epics darunter sind die fachliche
Ordnung, diese Liste ist die zeitliche.

1. T0.1 (Statusabgleich) — vor allem anderen
2. T4.3 (Installer bauen und testen) — blockiert den Alltag
3. T1.13, T1.15 — echter Datenverlust bzw. macht Epic 1 benutzbar
4. T5.6, T6.4 — die beiden falsch als erledigt geführten Punkte
5. T2.5, T3.6, T5.5, T3.5, T1.14 — Komfort, absteigend nach Nutzen
6. Epic 7 (Pflege), danach Epic 8 (KI-Assistent)

## Epic 0: Hygiene

- [ ] T0.1 TODO — Statusabgleich gegen den Code. Anlass: T5.4 und T6.3
      führten Teile als erledigt, die offen sind (siehe dort). Jedes
      DONE-Paket gegen den Code prüfen, bei Abweichung zurücksetzen und
      den offenen Teil in ein eigenes Paket schreiben. Ergebnis als
      Zeile im Log. Kein Feature-Code in diesem Paket.

## Epic 1: Persistente topologische Referenzen

Ansatz (entschieden, siehe docs/adr/0001-topo-naming.md):
Identität einer Fläche/Kante = ihre Abstammung aus der Feature-Historie
(OCCT Modified/Generated/IsDeleted), verankert an stabilen Skizzen- und
Feature-IDs. Geometrischer Fingerabdruck dient nur als Plausibilitäts-
prüfung und als Tiebreaker bei Mehrdeutigkeit — und als alleinige
Notlösung bei importierter STEP-Geometrie ohne Historie.

- [x] T1.0 DONE — SPIKE: Kommt man über replicad an die Builder-Historie
      heran (Modified/Generated/IsDeleted)? Ergebnis in
      docs/adr/0001-topo-naming.md.
- [x] T1.1 DONE — Bestandsaufnahme der Flächen-/Kantenbezüge im
      Feature-JSON, Ergebnis in docs/TOPO-NAMING.md.
- [x] T1.1b DONE — Stabile IDs für Skizzenkurven und Features, die
      Umbenennen und Umsortieren überstehen.
- [x] T1.2 DONE — Schema FaceRef/EdgeRef: Abstammungspfad plus
      Fingerabdruck-Block als Prüfwert.
- [x] T1.3a DONE — Extrudieren, Vereinigen/Abziehen/Schnittmenge über
      eigenen BRepAlgoAPI-Wrapper mit Historie.
- [x] T1.3b DONE — Rundung/Fase: Modified für Nachbarflächen, Generated
      für die neue Fläche.
- [x] T1.3c DONE — Drehkörper, Schale, Loft benennen.
- [x] T1.3d DONE — Bewegen/Skalieren, Teilen, Import. Kette lückenlos.
- [x] T1.4 DONE — Resolver (src/topo.ts): erst Abstammung, dann
      Fingerabdruck als Tiebreaker. Unit-Tests für verschoben, skaliert,
      aufgespalten, mehrdeutig, verschwunden, STEP-Import.
- [x] T1.5 DONE — Schreibpfad: neue Features schreiben Refs mit.
- [x] T1.6 DONE — Rebuild auf Resolver umgestellt.
- [x] T1.7 DONE — Fehlerfall sichtbar: rot bei verloren, gelb bei
      unsicher, nie stilles Einrasten auf eine falsche Fläche.
- [x] T1.8 DONE — Verhalten bei gelöschtem/umsortiertem Feature
      festgelegt und getestet.
- [x] T1.9 DONE — Regressionstests: Maßänderung am Grundkörper, Fase an
      einer von vier Eckbohrungen.
- [x] T1.10 DONE — Migration bestehender `.ofc`-Dateien beim Laden.
- [x] T1.12 DONE — Schale prüft ihr Ergebnis mit BRepCheck und meldet
      ungültige Körper als Fehler.

- [ ] T1.13 TODO — Skizze auf gekippter Fläche: Ebene aus der aufgelösten
      Fläche neu ableiten statt abbrechen (heute nur Verschieben entlang
      der Normalen). Datenverlust im Alltag, deshalb vorgezogen.
- [ ] T1.15 TODO — Gelb markierten Bezug bestätigen: Knopf im Seitenfeld
      „Bezug übernehmen“ schreibt die gefundene Fläche als neuen Bezug.
      Ohne das ist die gelbe Markierung aus T1.7 eine Sackgasse.
- [ ] T1.14 TODO — Schale: at/more an die aufgelöste Fläche nachführen.
      Kosmetik — gerechnet wird korrekt über den Bezug.
- [ ] T1.11 BLOCKED(Vieleck-Punkte lassen sich noch nicht einfügen oder
      löschen) — Sobald das geht: jede Vieleckseite bekommt eine eigene
      ID statt eines Index, Con.i und Refs umstellen, Migration.

## Epic 2: Sweep
- [x] T2.1 DONE — Profil + offener Pfad, mit Test.
- [x] T2.2 DONE — geschlossener Pfad, Bögen als runde Ecken.
- [x] T2.3 DONE — Pfadauswahl und Live-Vorschau im Viewport.
- [x] T2.4 DONE — Pfadpunkte nachträglich ziehen.

- [ ] T2.5 TODO — Pfad aus vorhandenen Körperkanten übernehmen (Kante
      anklicken statt zeichnen).

## Epic 3: Einzelbemaßung Zeichnung
- [x] T3.1 DONE — Maßobjekt im Zeichnungsmodell (Typ, Bezug, Position).
- [x] T3.2 DONE — Lineares Maß setzen und verschieben.
- [x] T3.3 DONE — Durchmesser, Radius, Winkel.
- [x] T3.4 DONE — Toleranzen, Export nach SVG/PDF/DXF. Entscheidung:
      DXF bleibt reine Geometrie ohne Maße.

- [ ] T3.6 TODO — Vorschau der Maßlinie beim Ablegen (heute erst nach
      dem Klick sichtbar).
- [ ] T3.5 TODO — Maße in der Iso-Ansicht und an schräg gesehenen
      Kreisen (heute nur Kreise, die von vorn zu sehen sind).

## Epic 4: Tauri-Desktop
- [x] T4.1 DONE — Tauri-Shell, WASM lädt im Build korrekt.
- [x] T4.2 DONE — Öffnen/Speichern über System-Dialog, `.ofc` verknüpft.

- [ ] T4.3 TODO — Installer neu bauen (`npm run desktop:build`; der
      vorhandene Build ist älter als Epic 5 und 6, ihm fehlen die neuen
      Funktionen), dann installieren und durchklicken: Öffnen, Speichern,
      `.ofc`-Verknüpfung, STEP-/STL-Export, Zeichnung. Die Installation
      selbst macht der Nutzer.
      Hinweis: Der Status stand auf DOING, ohne dass jemand daran
      arbeitete. DOING heißt „gerade in Arbeit“, nicht „teilweise fertig“.
- [ ] T4.4 TODO — macOS- und Linux-Build über GitHub Actions. Der Weg ist
      erprobt (.github/workflows/opencascade.yml läuft bereits), es fehlt
      nur die Entscheidung, ob es sich lohnt. Erst sinnvoll, wenn jemand
      außer dem Nutzer die App haben will. Siehe Offene Fragen.

## Epic 5: Skizzieren
- [x] T5.1 DONE — Hilfslinien (G), gestrichelt, nur zum Einrasten und
      Bemaßen.
- [x] T5.2 DONE — Trimmen und Verlängern (T) für offene Hilfslinien.
- [x] T5.3 DONE — Körperkanten in die Skizzenebene projizieren (P).
      Einschränkung: Momentaufnahme aus dem Anzeige-Netz → T5.5.
- [x] T5.4 DONE — Abhängigkeiten Winkel zwischen Seiten und fester Punkt.
      KORREKTUR 2026-10-29: Tangente Linie–Bogen und Radius eines Bogens
      waren hier fälschlich als erledigt geführt. Sie sind offen und
      leben in T5.6, weil der Löser Bögen nur als Sehne kennt.

- [ ] T5.6 TODO — Bögen im Löser als echte Kreisbögen (planegcs arc):
      Radius-Maß und Tangente Linie–Bogen.
- [ ] T5.5 TODO — Projektion aus dem B-Rep im Kern (exakte Kreise/Bögen)
      und an den Körper gebunden, damit sie bei Änderungen mitwandert.

## Epic 6: Modellieren
- [x] T6.1 DONE — Fläche versetzen für ebene Flächen, auch bei
      STEP-Import und Loft.
- [x] T6.1b DONE — Fläche löschen über eigenen OpenCascade-Build mit
      BRepAlgoAPI_Defeaturing (vendor/, GitHub-Workflow).
- [x] T6.2 DONE — Drehkörper um eine beliebige gerade Kante.
- [x] T6.3 DONE — Muster/Spiegeln an beliebiger Kante bzw. Fläche,
      Rundungen und Fasen werden mitkopiert.
      KORREKTUR 2026-10-29: „auch ganze Körper“ stand hier fälschlich.
      Das ist offen und liegt in T6.4.

- [ ] T6.4 TODO — Muster/Spiegeln für ganze Körper (Kopie + Bewegung je
      Exemplar), heute nur Kopieren mit Strg+D.

## Epic 7: Pflege
- [ ] T7.1 TODO — 3MF-Export (in CLAUDE.md als Format vorgesehen,
      bisher nicht gebaut).
- [ ] T7.2 TODO — Wiederkehrende Pflicht bei jedem replicad-Update:
      prüfen, ob sich replicad-opencascadejs geändert hat; wenn ja, den
      Workflow mit neuer REPLICAD_REF/IMAGE laufen lassen, sonst bricht
      „Fläche löschen“. Danach voller Regressionslauf.
      Zustand: Das Update auf 1.2.0 ist laut Log vom 2026-10-29 bereits
      erledigt (gleiches OCCT-Image, 47 Tests grün). Siehe Offene Fragen.

## Epic 8: KI-Assistent (M4 aus PLAN.md)
Erst beginnen, wenn Epic 1 bis 7 abgeräumt sind: Der Assistent setzt auf
dem Feature-Modell auf, jede Unsauberkeit darunter muss er umschiffen.

- [ ] T8.1 TODO — Entwurf, nur docs/, kein Code: Die KI erzeugt Features
      im bestehenden Datenmodell, niemals Meshes. Jeder Schritt landet im
      Baum, ist normal nachbearbeitbar und rückgängig zu machen.
      Schlüssel vom Nutzer, abschaltbar, kein Cloud-Zwang.
- [ ] T8.2 TODO — Text zu Teil für einen engen Fall:
      „Platte 100×60×5 mit 4 Bohrungen M5 in den Ecken“.
- [ ] T8.3 TODO — Ändern per Text an bestehender Auswahl
      („Wand 2 mm dicker“).
- [ ] T8.4 TODO — Fehler erklären: warum eine Fase scheitert und wie sie
      zu beheben ist.

## Log
(neueste oben)
- 2026-10-29 replicad 1.1.0 → 1.2.0: bringt dieselbe OpenCascade-Konfiguration
  (replicad-opencascadejs bleibt 1.1.0, gleiches Image), der eigene Build in
  vendor/ gilt also weiter; nur REPLICAD_REF im Workflow nachgezogen. 47 Tests
  grün, Fläche löschen im Browser geprüft.
- 2026-10-29 T6.1b: Eigener OpenCascade-Build per GitHub Actions
  (.github/workflows/opencascade.yml, ~15 min): replicad v1.1.0 + Bindung
  BRepAlgoAPI_Defeaturing, nur gelinkt im Image von replicad, kein Docker
  lokal nötig. Liegt in vendor/replicad-opencascadejs, package.json zeigt mit
  file: darauf (WASM +70 KB). Feature `remove` (at/more/faces wie Schale),
  Rechtsklick → „Fläche löschen“, Shift+Rechtsklick → weitere Fläche. Gelernt:
  geht es nicht (z. B. Deckel eines Quaders), liefert OCCT still den alten
  Körper → Prüfung IsDeleted je Fläche, sonst sichtbarer Fehler. Neu nötig:
  bei einem replicad-Update den Workflow mit neuer REPLICAD_REF/IMAGE laufen
  lassen, falls sich replicad-opencascadejs ändert.
- 2026-10-28 T6.3: Muster/Spiegeln mit Bezug „Kante oder Fläche anklicken“
  (Kante = Richtung durch die Kante, Fläche = Normale durch den Klickpunkt
  bzw. Spiegelebene); Rundungen/Fasen an den Flächen des Features werden
  mitkopiert (Kante findet der Kern neu). Fehler nebenbei behoben: Kopien
  trugen den Flächenbezug des Originals mit und wären auf dessen Fläche
  zurückgezogen worden; Kopien drehen jetzt auch eine freie Drehachse mit.
  Gelernt: ein Klick genau auf den Nahtpunkt eines Kreises trifft zwei
  Kantenstücke, dann gibt es bewusst keinen Einzelbezug (Fase bleibt rund).
  Ganze Körper als Muster: noch nicht (T6.4). Im Browser geprüft.
- 2026-10-28 T6.2: Drehkörper um eine beliebige Gerade in der
  Skizzenebene (`axisLine`), im Seitenfeld „Drehen um → Kante anklicken“;
  die Kante muss in der Skizzenebene liegen (sonst Hinweis). revAxis() in
  model.ts fasst x-/y-Achse und Gerade zusammen, die Flächenbenennung des
  Drehkörpers rechnet jetzt allgemein (Test: Achse bei x = 2 → Rohr
  3/8 mm, Seiten und Anfang/Ende benannt). Abkürzung: die Achse ist eine
  feste Gerade, nicht an die Kante gebunden. Im Browser geprüft.
- 2026-10-28 T6.1: Feature `offset` (Fläche versetzen): Ziehen an einer
  Fläche ohne eigenes Feature (STEP-Import, Loft, nach Booleschen
  Operationen) versetzt sie entlang der Normalen; Kern legt das Prisma der
  Fläche an bzw. zieht es ab, die versetzte Fläche behält ihren Namen
  (Skizzen darauf wandern mit, Test). Bezug wird nachgetragen. Gelernt:
  ebene Loft-Seiten sind in OCCT B-Splines und liefern die Normale nicht
  normiert → Ebenheit geometrisch prüfen, Normale normieren. Gekrümmte
  Flächen: sichtbarer Fehler. Fläche löschen ist BLOCKED (T6.1b).
  Im Browser geprüft: Loft-Seite +5 mm = +4,74 cm³.
- 2026-10-28 T5.4: Winkel zwischen zwei Seiten (planegcs l2l_angle_ll,
  Drehsinn aus der aktuellen Form, damit nichts umklappt) und fester Punkt
  (Lage im Con gespeichert, hält auch beim Ziehen). Panel: ∠ mit Winkelfeld
  (zeigt den aktuellen Winkel), „fest“ je Punkt. Tangente und Bogenradius
  verschoben: der Löser kennt Bögen nur als Sehne → T5.6.
- 2026-10-28 T5.3: P bei aktivem Flächenraster projiziert alle Kanten des
  Körpers als Hilfslinien „Projektion“ in diese Ebene (deckungsgleiche nur
  einmal, von der Seite gesehene Kreise als eine Strecke). Abweichung vom
  Plan: Momentaufnahme aus dem Anzeige-Netz, nicht an den Körper gebunden
  und Kreise nur auf ~0,01 mm genau → T5.5. Im Browser geprüft.
- 2026-10-28 T5.2: Werkzeug Trimmen (T) für offene Hilfslinien: Klick
  entfernt das Stück bis zu den nächsten Schnittpunkten mit allen Linien
  und Körperkanten der Ebene (Mitte raus = zwei Linien), Shift+Klick
  verlängert das nahe Ende bis zur nächsten Linie. Entscheidung: nur für
  Hilfslinien – geschlossene Skizzen bilden ihre Bereiche ohnehin selbst,
  Trimmen dort wäre eine 2D-Boolesche Operation mit eigenem Paket.
  Bögen werden nicht getrimmt. Im Browser geprüft.
- 2026-10-28 T5.1: Werkzeug Hilfslinie (G): Vieleck mit `aux` (und `open`
  bei Enter), gestrichelt, nie extrudiert, nicht in Bereichen/Loft/Zug,
  aber Rastpunkte und -linien für alle anderen Werkzeuge. Anklicken wählt
  sie aus (keine Verwechslung mit Körperkanten mehr), Punkte ziehbar,
  Längen ohne Schlusssegment. Im Browser geprüft.
- 2026-10-28 T2.4: ausgewählter Zug zeigt seinen Pfad als Linie und die
  Pfadpunkte als Griffe (wie Vieleck-Punkte); Ziehen versetzt den Punkt,
  der Zug rechnet live nach. Punkt 0 hängt am Profil und hat keinen Griff.
  Im Browser geprüft: Endpunkt (30,30) → (18,52), Rohr folgt.
- 2026-10-28 T1.12: Schale prüft ihr Ergebnis mit BRepCheck (wie der Zug);
  der Fall Sacklochbohrung war tatsächlich ungültig und schlägt jetzt rot
  mit Grund fehl, der Körper davor bleibt. Prüfung nur nach Schale und Zug,
  weil sie teuer ist.
- 2026-10-28 Wunsch des Nutzers: Doppelklick auf eine Fläche legt dort ein
  Raster (Arbeitsebene) an; Skizzen ins Leere landen in dieser Ebene statt
  auf dem Boden, gehören zum Körper der Fläche und hängen per Bezug an ihr
  (wandern mit). Doppelklick ins Leere oder Esc hebt es auf. Leertaste
  bleibt „letztes Werkzeug“. Im Browser geprüft: Raster auf der
  Vorderseite, Rechteck daneben liegt in z = 15 mit Normale (0,0,1).
- 2026-10-28 T4.2: .ofc = dasselbe JSON wie der Autosave (Features, Körper,
  Maße). Desktop: Öffnen/Speichern/Exporte über den Windows-Dialog
  (tauri-plugin-dialog), Lesen/Schreiben über zwei kleine Rust-Befehle
  statt fs-Plugin (Pfade kommen aus dem Dialog oder vom Doppelklick),
  Strg+S speichert in die geöffnete Datei, Strg+Umschalt+S = unter,
  Strg+O = öffnen, Fenstertitel zeigt den Dateinamen. Dateiverknüpfung
  .ofc im Installer; Start mit Datei öffnet sie. Browser: Speichern lädt
  jetzt modell.ofc herunter, .json öffnet weiterhin. Geprüft in der
  gebauten App: Start mit probe.ofc lädt das Modell (3,00 cm³), Titel
  „probe.ofc – OpenForm CAD“, Schreiben/Lesen ok. Nicht automatisch
  prüfbar: die Windows-Dialoge selbst. Nebenbei: Vite beobachtet src-tauri
  nicht mehr (der Rust-Build löste sonst Neuladen aus).
- 2026-10-28 T4.1: src-tauri/ (Tauri 2), `npm run desktop` = Entwicklung,
  `npm run desktop:build` = App + Installer. Entscheidungen des Nutzers:
  Toolchain gnullvm ohne Admin (Rust lag schon im Benutzerordner, LLVM-
  MinGW über winget), Installer pro Benutzer (NSIS, unsigniert →
  SmartScreen-Hinweis beim ersten Start), Kennung org.openform.cad,
  Dateien .ofc + Autosave. Gelernt: die gnu-Toolchain mit LLVM-MinGW im
  PATH stürzt in Build-Skripten ab (Zugriffsverletzung) → gnullvm über
  src-tauri/rust-toolchain.toml. Geprüft in der echten App (WebView2-
  Debugprotokoll): Kern-WASM lädt im Worker, Quader 2,00 cm³. Größe:
  App 11,7 MB, Installer 7,5 MB. Symbol: eigener Würfel (icons/app-icon.png).
- 2026-10-28 T3.1–T3.4 (ein Commit, Maßobjekt, Darstellung und Editor
  hängen eng zusammen): `Dim` im Modell (model.ts), gespeichert mit dem
  Modell (`dims`, nicht im Verlauf der Features). Bezug: Längen über
  Eckpunkte (PointRef = die ≥3 Flächen, die sich dort treffen),
  ⌀/R/Winkel über EdgeRefs – damit folgen Maße Modelländerungen wie die
  Features (Test: Quader breiter, Bohrung größer → 40, ⌀8). PROJ bildet
  Modellpunkte wie drawProjection ab (gegen die Ansichtsgrenzen getestet).
  Editor (src/sheetEditor.ts): Blatt im Vordergrund, Kern liefert die
  anklickbaren Punkte/Kreise/Kanten in Blattkoordinaten. Länge h/v aus der
  Mausrichtung, Shift = schräg; Maße ziehen, Entf löscht, Toleranz als
  freier Text. Blatt jetzt auch in Zoll (Einheit aus der Anzeige).
  Entscheidung: DXF bleibt reine Geometrie 1:1 ohne Maße (für Laser/CNC
  stören Maßlinien); Maße gehen in SVG und PDF. Im Browser geprüft: Länge,
  ⌀ mit H7, Winkel, Verschieben. Nicht auflösbare Maße stehen im Editor-
  Hinweis mit Grund und werden nicht gezeichnet.
- 2026-10-28 T2.3: Seitenfeld einer flachen Skizze: „Zug: Pfad zeichnen“
  bzw. „quer dazu“ (Pfadebene = Profilnormale + x- bzw. y-Achse der Skizze,
  Start in der Profilmitte). Gezeichnet wird mit dem Linien-Werkzeug
  (Einrasten, getippte Längen, Bögen durch Ziehen); jede Mausbewegung
  rechnet den Zug als Vorschau im Kern mit. Enter = offen, Klick auf den
  Anfang = geschlossen. Seitenfeld des Zugs: Abziehen, Löschen. Gelernt:
  im Browser räumt replicads GC die temporäre Skizze weg, während ihr
  Draht noch gebraucht wird („object has been deleted“) – in Node nicht
  sichtbar. Skizzen jetzt bis zum Ende festhalten und danach freigeben.
  Im Browser geprüft: Kreisprofil, Pfad hoch/quer, Vorschau, Enter.
  STEP hin und zurück ergibt das gleiche Volumen (Test).
- 2026-10-28 T2.2: geschlossener Pfad (Rahmen, keine Deckel) und Bögen im
  Pfad als runde Ecken funktionieren, Volumen exakt (Tests). Gelernt:
  OCCTs RoundCorner ergibt hier ungültige Körper (BRepCheck), offen wie
  geschlossen, mit und ohne Korrektur → Option `round` entfernt, runde
  Knicke = Bogen im Pfad. Neu: Sweep prüft das Ergebnis mit BRepCheck und
  schlägt sonst mit Grund fehl (z. B. Profil größer als der Rahmen).
- 2026-10-28 T2.1: Feature `sweep` (model.ts): Profil = ID einer flachen
  Skizze, Pfad = Linienzug [x, y, bulge?] in eigener Ebene, offen oder
  geschlossen, Knicke auf Gehrung (Standard) oder rund, auch als Abzug.
  Kern: eigener MakePipeShell-Wrapper (wie replicads genericSweep) mit
  Namen: Seite = Profilseite + Pfadabschnitt j, Deckel start/end.
  Gelernt: replicads Kreis besteht aus zwei Bögen → zwei Mantelflächen je
  Abschnitt, unterschieden über die Profilkante i. Volumen L-Pfad mit
  Gehrung = π r² × Mittellinie (Test).
- 2026-10-28 T1.7/T1.8: buildBody liefert `errors` (Grund je Feature),
  der Baum markiert fehlgeschlagene Schritte rot mit ⚠, unsicher aufgelöste
  gelb; Grund beim Überfahren und im Hinweis („Schritt #3: Kante nicht mehr
  vorhanden“). Entscheidung T1.8: zeigt die Abstammung ins Leere
  (Feature gelöscht, neu gezeichnet), entscheidet der Fingerabdruck und das
  Feature baut, bleibt aber gelb markiert; der Bezug wird nicht still
  umgeschrieben. Findet auch der Fingerabdruck nichts Passendes
  (z. B. Fase vor ihre Bohrung geschoben), schlägt das Feature rot fehl.
  Im Browser geprüft: Fase per Ziehen im Baum vor die Bohrung → rot.
- 2026-10-28 T1.5/T1.6/T1.9/T1.10 (ein Commit, weil Schreib- und Lesepfad
  nur zusammen testbar sind): Skizze auf Fläche (`face`), Rundung/Fase
  (`edge`) und Schale (`faces`) tragen Bezüge. Entscheidung: nicht die
  Oberfläche legt sie an, sondern der Kern beim ersten Bau aus der
  gespeicherten Lage (at, Skizzenebene) und meldet sie als `fixes`;
  main.ts übernimmt sie ohne Rückgängig-Schritt. Vorteil: kein neuer
  Weg Oberfläche→Worker, und alte Modelle bekommen ihre Bezüge beim Laden
  von selbst (T1.10, im Browser mit einem alten Modell geprüft). Mit Bezug
  löst der Kern auf und führt die Lage nach (Skizzenebene entlang der
  Normalen, at/dir auf die Kante). Verloren/mehrdeutig = Feature schlägt
  fehl (Meldung wie bisher), unsicher = Liste `unsure` (Anzeige T1.7).
  Regressionstest T1.9: Quader höher → Bohrungsskizze und Rundung wandern
  mit; vier Eckbohrungen, Fase an einer, Platte höher → Fase bleibt dort.
  Im Browser: Höhe 10→20 über das Seitenfeld, Skizze und Rundung folgen,
  Rückgängig/Wiederholen stimmen.
- 2026-10-28 T1.4: Resolver in src/topo.ts (faceRef/edgeRef anlegen,
  resolveFace/resolveEdge auflösen), buildBody liefert dazu `names`.
  Fingerabdruck-Abstand = Schwerpunktabstand + Unterschied √Fläche,
  anderer Typ oder andere Richtung = passt nicht; zwei fast gleich gute
  Kandidaten = mehrdeutig. Tests: verschoben, skaliert, aufgespalten,
  vier Eckbohrungen, ohne Abstammung mehrdeutig, verschwunden, STEP-Import,
  Kante. Gelernt: Nut genau mittig über den Deckel ergibt zwei gleich gute
  Hälften → korrekt „mehrdeutig“, nicht geraten.
- 2026-10-28 T1.3d: Bewegen/Drehen/Skalieren übertragen die Namen über
  die Flächenreihenfolge (Topologie bleibt gleich, IsSame greift wegen der
  neuen Location nicht), Teilen über boolean mit dem Halbraum (Schnitt-
  fläche tag split, beide Teile benannt), Import Fläche i in Dateireihen-
  folge. Damit hat jede Operation in buildBody Namen; Kette lückenlos.
  Im Browser geprüft: Quader+Bohrung+Rundung+Schale+Bewegen baut ohne
  Fehler, Volumen identisch zum alten Kern. Dabei gefunden (schon vorher
  so): Schale über einer Sacklochbohrung ergibt mehr Volumen als der
  Vollkörper → T1.12.
- 2026-10-28 T1.3c: Drehkörper geometrisch benannt (Punkt um die Achse
  zurück in die Skizze, Anfang/Ende = Ebenen durch die Achse), Loft über
  die Kante der Seitenfläche, die in Skizze A liegt, Schale über eigenen
  MakeThickSolid-Wrapper. Gelernt: bei der Schale bleiben Außenflächen
  identisch, Innenwand = Generated(Außenfläche), die geöffnete Fläche
  meldet Modified → Rand. Neu im Schema: Origin.of (Innenwand → Außenfläche).
- 2026-10-28 T1.3b: edgeOp in src/topo.ts ersetzt replicads fillet/chamfer
  (gleiche Kantensuche über EdgeFinder, gleiche OCCT-Klassen). Neue Fläche
  = Generated(Kante) mit tag fillet/chamfer, Nachbarn über Modified. Der
  Fortschreib-Teil (carry) ist jetzt für alle Builder gemeinsam.
- 2026-10-28 T1.3a: src/topo.ts nameSolid + boolean, buildBody liefert
  `origins` (Herkunft je Fläche, null = unbekannt). Neue Prismen werden
  geometrisch benannt (Boden/Deckel über Höhe, Seite über sideOf in
  model.ts) statt über MakePrism-Generated: gleich sicher, weil der Körper
  frisch ist, und replicad baut die Extrusion weiter. Gelernt: der
  IndexedMap-Hasher ist in der WASM nicht gebunden → replicads
  ReplicadShapeHasher + IsSame. Spline: eine Seitenfläche je Bézier-Stück.
  Kosten: 40 Bohrungen 608 → 702 ms (+15 %), alle 86 Flächen benannt.
  Nach nicht umgestellten Operationen sind die Namen des Körpers vorerst
  unbekannt (T1.3b–d).
- 2026-10-28 T1.2: src/topo.ts (nur Typen) und Schema-Abschnitt in
  docs/TOPO-NAMING.md. Origin nutzt die Teil-Namen, die ownerOf schon
  kennt, damit Klick-Auswahl und Bezug dieselbe Sprache sprechen. Kante =
  zwei angrenzende Flächen + Fingerabdruck. `via` nur zur Diagnose.
- 2026-10-28 T1.1b: kein Umbau nötig. Jede ID kommt aus `nextId` (mit
  dem Modell gespeichert), Kopien/Muster/Spiegeln/Einfügen holen neue IDs,
  Umbenennen ändert nur `name`, Umsortieren nur die Reihenfolge.
  Skizzenkurven: Rechteckseiten heißen x0/x1/y0/y1, Kreis/Ellipse haben
  eine, Vieleck-Seiten Index i – stabil, weil Punkte weder eingefügt noch
  gelöscht werden können. Bereichs-Features (`and`/`not`) tragen Kopien
  mit den IDs der Original-Skizzen; die sind innerhalb des Bereichs
  eindeutig. Keine Migration. ADR 0001 vom Nutzer freigegeben.
- 2026-10-28 T1.1: docs/TOPO-NAMING.md. Keine OCCT-Index-Bezüge; Skizze
  auf Fläche, Rundung/Fase und Schale hängen an kopierten Weltkoordinaten.
  Feature-, Körper-, Loft- und Split-Bezüge laufen über stabile IDs.
  Vieleck-Seiten über Index – stabil, solange man keine Punkte einfügen kann.
- 2026-10-28 T1.0: docs/adr/0001-topo-naming.md. replicad verwirft die
  Builder; opencascade.js (gleiche WASM) liefert Modified/Generated/
  IsDeleted für Schnitt, Extrusion, Rundung, auch nach SimplifyResult.
  Nötig: eigene Wrapper für die 12 Operationen in buildBody.
  Angehalten vor T1.2 wie verlangt.

## Offene Fragen
- 2026-10-29 macOS- und Linux-Builds (T4.4): bauen oder weglassen? Der Weg
  über GitHub Actions ist durch .github/workflows/opencascade.yml schon
  erprobt, es kostet also vor allem Zeit, nicht Risiko. Ohne Testgeräte
  bleibt es aber ungeprüftes Binärpaket. Vorschlag: zurückstellen, bis
  jemand außer dem Nutzer die App haben will.
- 2026-10-29 replicad 1.2.0 (T7.2): Das Log trägt das Update am 2026-10-29
  als erledigt ein (gleiches OCCT-Image, 47 Tests grün), der Nutzer führt
  es als offen. Einmal in package.json nachsehen und T7.2 schließen oder
  offen lassen. Fällt mit unter T0.1.