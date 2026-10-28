# ADR 0001 – Stabile Flächen- und Kantenbezüge

Status: vorgeschlagen (Spike T1.0 abgeschlossen, Entscheidung durch den Nutzer vor T1.2)

## Frage

Kommt man über replicad an die Historie der OCCT-Operationen heran
(welche Fläche wurde zu welcher, welche ist neu, welche ist weg)?

## Ergebnis des Spikes

**Über replicad: nein.** replicad baut für jede Operation einen
OCCT-Builder (`BRepAlgoAPI_Cut`, `BRepFilletAPI_MakeFillet` …), gibt nur
`builder.Shape()` zurück und wirft den Builder weg. Die Historie ist
danach verloren.

**Über opencascade.js direkt: ja, vollständig.** Die mitgelieferte
WASM-Datei (`replicad-opencascadejs`) enthält `Modified`, `Generated`
und `IsDeleted` für:

| Operation im Modell | OCCT-Klasse | geprüft |
|---|---|---|
| Hineindrücken, Bohren, Vereinigen, Schnittmenge, Teilen | `BRepAlgoAPI_Cut/Fuse/Common/Splitter` | ja |
| Extrudieren | `BRepPrimAPI_MakePrism` (+ `FirstShape`/`LastShape`) | ja |
| Rundung, Fase | `BRepFilletAPI_MakeFillet/MakeChamfer` | ja |
| Drehkörper | `BRepPrimAPI_MakeRevol` | nur Typen |
| Schale | `BRepOffsetAPI_MakeThickSolid` | nur Typen |
| Loft | `BRepOffsetAPI_ThruSections` | nur Typen |
| Verschieben, Drehen, Skalieren | `BRepBuilderAPI_Transform` | nur Typen |

Messung am Beispiel Quader 20×10×10 minus Zylinder R3:

- 5 Quaderflächen bleiben identisch (`IsSame`), die Oberseite meldet
  `Modified` → 1 Fläche (die gelochte).
- Zylindermantel und Boden melden `Modified` → Bohrungswand und
  Bohrungsgrund, der obere Deckel `IsDeleted`.
- Alle 8 Ergebnisflächen sind so einer Herkunft zuzuordnen.
- Die Historie bleibt auch nach `SimplifyResult` (Zusammenfassen
  gleicher Flächen, das replicad immer macht) gültig.
- Extrusion: jede Profilkante erzeugt genau eine Seitenfläche
  (`Generated`), dazu Boden und Deckel.
- Rundung: die Kante erzeugt eine Rundungsfläche, die beiden
  Nachbarflächen und die Stirnseiten melden `Modified`.

Probe-Code (Wegwerf, nicht im Repo): drei vitest-Fälle, je ca. 15 Zeilen.

## Was das kostet

- `buildBody` nutzt 12 replicad-Operationen. Jede davon braucht einen
  dünnen eigenen Wrapper, der den Builder selbst baut, die Historie
  ausliest und das Ergebnis wieder als replicad-Shape (`cast`) zurückgibt.
  replicad bleibt für Skizzen, Export, Netze und Zeichnung unverändert.
- Speicher: OCCT-Objekte aus WASM müssen freigegeben werden (`delete`),
  replicad macht das über seinen GC-Scope. Die Wrapper müssen das auch.
- `TopoDS`-Identität gilt nur innerhalb eines Rebuilds. Gespeichert
  wird deshalb nie ein Shape, sondern ein Name aus stabilen IDs:
  `Feature-ID` + Erzeugungsschlüssel (z. B. „Seite aus Profilkante 3“,
  „Deckel“, „Rundung an Kante X“) + Kette der ändernden Feature-IDs.
- STEP-Import hat keine Historie → dort nur Fingerabdruck.

## Entscheidung (Vorschlag)

Abstammung aus der OCCT-Historie über eigene Wrapper, verankert an
Feature-IDs. Fingerabdruck (Flächentyp, Normale, Schwerpunkt, Fläche)
nur als Prüfwert und Tiebreaker, bei Import als einziges Mittel.

Alternative ohne Historie (nur Fingerabdruck): weniger Code, aber
mehrdeutig bei gleichen Flächen (vier gleiche Eckbohrungen) und rät
bei größeren Maßänderungen falsch. Widerspricht T1.7 („niemals still
auf die falsche Fläche auflösen“).

## Folgen

- Neues Modul im Kern (`src/topo.ts`): Wrapper + Abstammungstabelle je
  Rebuild. Läuft im Worker wie bisher.
- Heutige Bezüge sind Weltkoordinaten (siehe T1.1), es gibt keine
  OCCT-Index-Bezüge, die zuerst abgelöst werden müssten.
