# Bestandsaufnahme: Bezüge auf Flächen, Kanten und Features (T1.1)

Stand: Commit nach 4fb3a83. Ziel des Epics siehe docs/adr/0001-topo-naming.md.

## Kurzfassung

Es gibt **keine** Bezüge über OCCT-Indizes (keine „Fläche Nr. 5“).
Alles, was heute an einer Fläche oder Kante hängt, hängt an
**Weltkoordinaten**, die beim Anlegen kopiert werden. Deshalb wandert
nichts mit, wenn sich der Körper darunter ändert, aber es bricht auch
nichts still auf eine falsche Nummer um.

## Bezüge auf Geometrie (instabil, Ziel von Epic 1)

| Feature | Feld | Bedeutung | Auflösung im Kern |
|---|---|---|---|
| Skizze (`Extrude`) mit `onFace` | `o, n, u, v` | Ebene der Fläche, beim Klick kopiert | keine, die Ebene steht fest im Raum |
| Rundung/Fase (`EdgeOp`) | `at`, `dir` | Punkt auf der Kante und Kantenrichtung | `EdgeFinder.withinDistance(0.1, at)` in `buildBody` |
| Schale (`Shell`) | `at`, `more[]` | je ein Punkt auf jeder offenen Fläche | `FaceFinder.either(withinDistance(0.1, p))` |
| Bereich (`Extrude.and/not`) | Kopien flacher Skizzen | Bereichsgrenzen | als eigene Profile, nicht an Flächen |

Folge: Wird der Grundkörper höher, bleibt die Skizze auf der alten
Höhe stehen; eine Rundung findet ihre Kante nicht mehr (Fehler) oder
eine andere, die zufällig durch `at` läuft (still falsch).

## Bezüge auf Features und Körper (stabil)

| Feld | zeigt auf | stabil, weil |
|---|---|---|
| `Feature.id` | – | fortlaufend aus `nextId`, ändert sich weder beim Umbenennen (`name`) noch beim Umsortieren im Baum |
| `body` (Extrude, EdgeOp, Import, Shell, Loft), `Move.body`, `Split.body` | Körpernummer | Körpernummer = Feature-ID, die ihn angelegt hat; nach `Combine` Weiterleitung über Alias |
| `Combine.a/b` | Körpernummern | wie oben |
| `Split.plane` | ID einer Hilfsebene | Feature-ID |
| `Loft.a/b` | IDs flacher Skizzen | Feature-ID |
| `Con.i/j` | Seite i eines Vielecks (Punkt i → i+1) | Punkte lassen sich heute weder einfügen noch löschen; die Seitennummer ändert sich also nicht |

Offen für T1.1b: Wenn später Punkte eingefügt oder gelöscht werden
können, verschieben sich `Con.i` und jede künftige Referenz „Seite aus
Profilkante i“. Dann braucht jede Vieleck-Seite eine eigene ID.

## Interaktion (main.ts)

- `ownerOf(features, P, N)` ordnet eine angeklickte Fläche über
  Koordinaten dem Feature zu, das sie erzeugt hat (Deckel, Seite,
  Bohrungswand …). Das ist die einzige Stelle, die heute „Fläche →
  Herkunft“ beantwortet, rein geometrisch. Sie ist der natürliche
  Abnehmer des künftigen Resolvers.
- Ziehen an einer Fläche ändert nur das eigene Feature (`applyPush`).
  Abhängige Features (Skizze darauf, Rundung daran) werden nicht
  angefasst.
