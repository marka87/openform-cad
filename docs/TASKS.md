# TASKS — OpenForm CAD
Status: TODO / DOING / DONE / BLOCKED(Grund)

## Epic 1: Persistente topologische Referenzen

Ansatz (entschieden, siehe docs/adr/0001-topo-naming.md):
Identität einer Fläche/Kante = ihre Abstammung aus der Feature-Historie
(OCCT Modified/Generated/IsDeleted), verankert an stabilen Skizzen- und
Feature-IDs. Geometrischer Fingerabdruck dient nur als Plausibilitäts-
prüfung und als Tiebreaker bei Mehrdeutigkeit — und als alleinige
Notlösung bei importierter STEP-Geometrie ohne Historie.

- [x] T1.0 DONE — SPIKE, max. 2h, Wegwerf-Code außerhalb des Repos:
      Kommt man über replicad an die Builder-Historie heran
      (Modified/Generated/IsDeleted) für einen booleschen Schnitt?
      Falls nein: an welcher Stelle muss direkt auf opencascade.js
      durchgegriffen werden, und was kostet das?
      Ergebnis als docs/adr/0001-topo-naming.md. ANHALTEN und berichten,
      bevor T1.2 beginnt.
- [x] T1.1 DONE — Bestandsaufnahme: wo im Feature-JSON werden Flächen
      und Kanten referenziert? Welche Lookups nutzen OCCT-Indizes?
      Ergebnis nach docs/TOPO-NAMING.md. Kein Code.
- [x] T1.1b DONE — Stabile IDs sicherstellen: jede Skizzenkurve und
      jedes Feature bekommt eine ID, die Umbenennen und Umsortieren im
      Baum übersteht. Falls heute über Index oder Name identifiziert
      wird, hier umstellen — ohne das trägt die Abstammung nicht.
      Migration bestehender Dateien mit erledigen.
- [x] T1.2 DONE — Schema für FaceRef/EdgeRef: Abstammungspfad
      (Ursprungs-ID + Kette der verändernden Feature-IDs) plus
      Fingerabdruck-Block (Flächentyp, Normale, Schwerpunkt,
      Fläche/Länge) als Prüfwert. Nur Typen und Doku, kein Resolver.
- [x] T1.3a DONE — Extrudieren (inkl. Bereiche) benennen, Vereinigen/
      Abziehen/Schnittmenge und Körper verrechnen über eigenen
      BRepAlgoAPI-Wrapper mit Historie.
- [x] T1.3b DONE — Rundung/Fase: Modified für Nachbarflächen, Generated
      für die neue Fläche (tag fillet/chamfer).
- [x] T1.3c DONE — Drehkörper, Schale, Loft benennen (Seiten aus
      Profilkanten, Innenwand shell).
- [x] T1.3d DONE — Bewegen/Skalieren (BRepBuilderAPI_Transform), Teilen
      (Schnittfläche split), Import (Fläche i). Danach ist die Kette
      lückenlos; shortcut-Kommentar in buildBody entfernen.
- [ ] T1.4 TODO — Resolver: Ref + Shape → Fläche/Kante.
      Erst Abstammung. Genau ein Treffer → übernehmen, Fingerabdruck
      nur als Warnung prüfen. Mehrere Treffer (aufgespaltene Fläche)
      oder keiner (Kette gerissen) → Fingerabdruck entscheidet unter den
      Kandidaten, Ergebnis gilt als unsicher.
      Unit-Tests: verschoben, skaliert, aufgespalten, mehrdeutig
      (vier gleiche Eckbohrungen), verschwunden, STEP-Import ohne
      Historie.
- [ ] T1.5 TODO — Schreibpfad: neue Features schreiben Refs mit, alte
      Index-Referenzen bleiben vorerst parallel bestehen.
- [ ] T1.6 TODO — Rebuild auf Resolver umstellen, Feature für Feature.
      Reihenfolge: Fase/Rundung zuerst, dann Skizze-auf-Fläche.
- [ ] T1.7 TODO — Fehlerfall sichtbar machen: unsichere oder verlorene
      Referenz markiert das Feature im Baum als defekt und bricht
      sichtbar ab. Niemals still auf die falsche Fläche auflösen.
- [ ] T1.8 TODO — Gelöschtes oder umsortiertes Feature: Abstammung
      zeigt ins Leere. Verhalten festlegen (Rückfall auf Fingerabdruck
      vs. Feature als defekt markieren) und testen.
- [ ] T1.9 TODO — Regressionstest: Grundkörper mit Skizze auf einer
      Fläche, Grundkörper-Maß deutlich ändern, Rebuild → Skizze und
      Folgefeatures wandern mit. Zusätzlich: Platte mit vier
      Eckbohrungen, Fase an genau einer davon, Breite ändern → Fase
      bleibt an derselben Bohrung.
- [ ] T1.10 TODO — Migration bestehender `.ofc`-Dateien: beim Laden
      Refs nachrüsten, alte Dateien dürfen nicht brechen.

- [ ] T1.11 TODO — Sobald Vieleck-Punkte eingefügt/gelöscht werden können:
      jede Seite bekommt eine eigene ID (statt Index), Con.i und Refs
      darauf umstellen, Migration.

- [ ] T1.12 TODO — Schale über Sacklochbohrung: Volumen 2024 mm³ statt
      < 2000 (Quader 20×10×10, Bohrung R3 tief 4 von oben, Schale 1 mm,
      Boden offen). Prüfen, ob der Körper gültig ist (BRepCheck), sonst
      Feature als fehlgeschlagen melden.

## Epic 2: Sweep
- [ ] T2.1 TODO — Profil + offener Pfad, ohne UI, mit Test.
- [ ] T2.2 TODO — geschlossener Pfad, Ecken/Verrundung am Knick.
- [ ] T2.3 TODO — Pfadauswahl und Live-Vorschau im Viewport.

## Epic 3: Einzelbemaßung Zeichnung
- [ ] T3.1 TODO — Maßobjekt im Zeichnungsmodell (Typ, Bezug, Position).
- [ ] T3.2 TODO — Lineares Maß setzen und verschieben.
- [ ] T3.3 TODO — Durchmesser, Radius, Winkel.
- [ ] T3.4 TODO — Toleranzen, Export nach SVG/PDF/DXF prüfen.

## Epic 4: Tauri-Desktop
- [ ] T4.1 TODO — Tauri-Shell, WASM lädt im Build korrekt.
- [ ] T4.2 TODO — Datei öffnen/speichern über System-Dialog, `.ofc`
      verknüpfen.
- [ ] T4.3 TODO — Installer Windows, danach macOS/Linux.

## Log
(neueste oben)
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
