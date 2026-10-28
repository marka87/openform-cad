# TASKS — OpenForm CAD
Status: TODO / DOING / DONE / BLOCKED(Grund)

## Epic 1: Persistente topologische Referenzen

Ansatz (vorgeschlagen, wird in T1.0 als docs/adr/0001-topo-naming.md
festgehalten):
Identität einer Fläche/Kante = ihre Abstammung aus der Feature-Historie
(OCCT Modified/Generated/IsDeleted), verankert an stabilen Skizzen- und
Feature-IDs. Geometrischer Fingerabdruck dient nur als Plausibilitäts-
prüfung und als Tiebreaker bei Mehrdeutigkeit — und als alleinige
Notlösung bei importierter STEP-Geometrie ohne Historie.

- [ ] T1.0 TODO — SPIKE, max. 2h, Wegwerf-Code außerhalb des Repos:
      Kommt man über replicad an die Builder-Historie heran
      (Modified/Generated/IsDeleted) für einen booleschen Schnitt?
      Falls nein: an welcher Stelle muss direkt auf opencascade.js
      durchgegriffen werden, und was kostet das?
      Ergebnis als docs/adr/0001-topo-naming.md. ANHALTEN und berichten,
      bevor T1.2 beginnt.
- [ ] T1.1 TODO — Bestandsaufnahme: wo im Feature-JSON werden Flächen
      und Kanten referenziert? Welche Lookups nutzen OCCT-Indizes?
      Ergebnis nach docs/TOPO-NAMING.md. Kein Code.
- [ ] T1.1b TODO — Stabile IDs sicherstellen: jede Skizzenkurve und
      jedes Feature bekommt eine ID, die Umbenennen und Umsortieren im
      Baum übersteht. Falls heute über Index oder Name identifiziert
      wird, hier umstellen — ohne das trägt die Abstammung nicht.
      Migration bestehender Dateien mit erledigen.
- [ ] T1.2 TODO — Schema für FaceRef/EdgeRef: Abstammungspfad
      (Ursprungs-ID + Kette der verändernden Feature-IDs) plus
      Fingerabdruck-Block (Flächentyp, Normale, Schwerpunkt,
      Fläche/Länge) als Prüfwert. Nur Typen und Doku, kein Resolver.
- [ ] T1.3 TODO — Historie mitschreiben: bei jeder formverändernden
      Operation Modified/Generated/IsDeleted auswerten und die
      Abstammung fortschreiben. Lückenlos — eine ungepflegte Operation
      reißt die Kette für alles Nachfolgende.
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

## Offene Fragen