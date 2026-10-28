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

## Schema (T1.2, Typen in `src/topo.ts`)

- **Origin** = Feature-ID + Teil (`tag`) + Seite `i`. Die Teile sind
  dieselben Namen, die `ownerOf` heute schon liefert (`start`, `end`,
  `x0`…`y1`, `r`, `seg`/`arc` mit `i`), ergänzt um `fillet`, `chamfer`,
  `shell`, `split`, `import`. Bei Bereichs-Features zusätzlich `from` =
  ID der Original-Skizze.
- **FaceRef** = Origin + Fingerabdruck (Typ, Schwerpunkt, Normale/Achse,
  Fläche). `via` listet die ändernden Features, nur für Fehlermeldungen.
- **EdgeRef** = die zwei angrenzenden Flächen (je ein Origin) +
  Fingerabdruck der Kante. Eine Kante zwischen zwei bekannten Flächen
  bleibt eindeutig, auch wenn beide Flächen wachsen.
- **Resolved** = Treffer mit „sicher/unsicher“ oder Fehler `lost`
  (Kette gerissen) bzw. `ambiguous` (mehrere Kandidaten, Fingerabdruck
  entscheidet nicht).

Warum Kante über zwei Flächen statt eigener Abstammung: OCCT meldet für
Kanten bei Booleschen Operationen oft nur `Modified` auf Teilstücke;
über die Flächen bleibt der Name auch dann eindeutig.
Spline-Vieleck (`smooth`): wie viele Seitenflächen OCCT daraus macht, ist
noch ungeprüft; Origin `seg` mit dem Index der Profilkante (prüfen in T1.3).
