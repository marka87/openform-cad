# TASKS — OpenForm CAD
Status: TODO / DOING / DONE / BLOCKED(Grund)

Regel: DONE nur mit grünem Test oder benanntem Beleg im Log. Ein Paket,
das nur teilweise erledigt ist, bleibt TODO; der fertige Teil wird im
Text des Pakets beschrieben, nicht durch ein Häkchen.

Zweite Regel (seit 2026-10-29): Neue Funktionswünsche kommen aus
docs/FELDNOTIZEN.md, nicht aus Vermutungen. Was beim Bauen echter Teile
dreimal stört, wird ein Paket. Was einmal stört, bleibt Notiz. Die
Pakete T5.7 bis T5.18 sind vor dieser Regel entstanden und daher
Vermutungen — sie gelten, bis die Feldnotizen etwas anderes zeigen.

## Arbeitsreihenfolge
Oben abarbeiten, dann nach unten. Die Epics darunter sind die fachliche
Ordnung, diese Liste ist die zeitliche.

1. T0.2, T4.3 — Installer installieren und dabei ein echtes Teil bauen,
   Stolperstellen mitschreiben. Erledigt beides in einem Durchlauf.
2. T0.3 — zwei weitere echte Teile, dann Feldnotizen auswerten.
   DANACH kann sich alles darunter ändern.
3. T5.7, T5.8 — kleine Fehler aus dem Weg räumen
4. T5.17 — Messen, sobald das Fehlerbild aus den Feldnotizen da ist
5. T5.9 — Ansicht auf die Fläche
6. T5.10 — sichtbarer Punkt und Auto-Raster
7. T5.11 — Flächenpunkte und Fluchtlinien
8. T5.12 — Linienkette, Weg A, mit eigenem Linientyp
9. T5.18 — Körper an einer Linie teilen
10. T5.6 — echte Bögen im Löser
11. T5.13, T5.14 — Fänge, gerade zuerst, tangential nach T5.6
12. T5.15, T5.16 — Winkel tippen, Esc stufenweise
13. Epic 10 (Werkzeuge wie Shapr3D, Wunsch des Nutzers 2026-10-29):
    T10.2, T10.6, T10.7, T10.1, T10.3 (erledigt T6.4 mit), T10.5, T10.4
14. T1.14, T2.5, T3.6, T5.5, T3.5 — restliche Nacharbeiten (erledigt 2026-10-29)
15. Epic 7 (Pflege), Epic 8 (KI-Assistent), Epic 9 (Weg B)

## Epic 0: Hygiene und Anforderungen

- [x] T0.1 DONE — Statusabgleich gegen den Code (Commit 4a77bbf).
      Kein Paket musste zurückgesetzt werden. Zwei DONE-Pakete hatten
      keinen Beleg und haben jetzt je einen Test: Radius-Maß (T3.3) und
      Mitkopieren von Fasen beim Spiegeln (T6.3). 48 Tests grün.
      replicad steht in package.json auf 1.2.0, die offene Frage dazu
      ist damit erledigt.

- [ ] T0.2 TODO — docs/FELDNOTIZEN.md anlegen und beim Bauen des ersten
      echten Teils führen. Eine Zeile je Stolperstelle: was wolltest du
      tun, was ist passiert, wie lange dauerte der Umweg.
      WICHTIG: keine Lösungsvorschläge notieren. „Wollte an der
      Bohrungsmitte anfangen, musste Koordinaten im Kopf rechnen" ist
      brauchbar; „brauche Hilfspunkte" ist schon eine Lösung und
      verdeckt, was sonst geholfen hätte.
      Läuft zusammen mit T4.3 in einem Durchlauf.
- [ ] T0.3 TODO — Zwei weitere echte Teile bauen (zusammen mit dem aus
      T0.2: ein Halter, ein Gehäuse, ein Adapter — Dinge, die der Nutzer
      wirklich gebraucht hat, nichts Erfundenes). Danach Feldnotizen
      auswerten: Was dreimal vorkommt, wird ein Paket und bestimmt die
      Arbeitsreihenfolge neu. Was einmal vorkommt, bleibt Notiz.
      Die drei Teile wandern anschließend als Regressionstest ins Repo.

## Epic 1: Persistente topologische Referenzen

Ansatz (entschieden, siehe docs/adr/0001-topo-naming.md):
Identität einer Fläche/Kante = ihre Abstammung aus der Feature-Historie
(OCCT Modified/Generated/IsDeleted), verankert an stabilen Skizzen- und
Feature-IDs. Geometrischer Fingerabdruck dient nur als Plausibilitäts-
prüfung und als Tiebreaker bei Mehrdeutigkeit — und als alleinige
Notlösung bei importierter STEP-Geometrie ohne Historie.

- [x] T1.0 DONE — SPIKE: Kommt man über replicad an die Builder-Historie
      heran? Ergebnis in docs/adr/0001-topo-naming.md.
- [x] T1.1 DONE — Bestandsaufnahme der Bezüge, docs/TOPO-NAMING.md.
- [x] T1.1b DONE — Stabile IDs für Skizzenkurven und Features.
- [x] T1.2 DONE — Schema FaceRef/EdgeRef.
- [x] T1.3a DONE — Extrudieren und Boolesche Operationen mit Historie.
- [x] T1.3b DONE — Rundung/Fase benennen.
- [x] T1.3c DONE — Drehkörper, Schale, Loft benennen.
- [x] T1.3d DONE — Bewegen/Skalieren, Teilen, Import. Kette lückenlos.
- [x] T1.4 DONE — Resolver (src/topo.ts) mit Unit-Tests.
- [x] T1.5 DONE — Schreibpfad: neue Features schreiben Refs mit.
- [x] T1.6 DONE — Rebuild auf Resolver umgestellt.
- [x] T1.7 DONE — Fehlerfall sichtbar: rot bei verloren, gelb bei
      unsicher, nie stilles Einrasten auf eine falsche Fläche.
- [x] T1.8 DONE — Verhalten bei gelöschtem/umsortiertem Feature.
- [x] T1.9 DONE — Regressionstests Maßänderung und Eckbohrung.
- [x] T1.10 DONE — Migration bestehender `.ofc`-Dateien.
- [x] T1.12 DONE — Schale prüft ihr Ergebnis mit BRepCheck.
- [x] T1.13 DONE — Skizze auf gekippter Fläche dreht mit, statt
      abzubrechen. Gedreht wird um die Schnittlinie von alter und neuer
      Ebene. Im Browser geprüft (17,49 cm³).
- [x] T1.15 DONE — Knopf „Bezug übernehmen" im Seitenfeld für gelb
      markierte Schritte. Nur auf Knopfdruck, nie automatisch,
      rückgängig möglich.

- [x] T1.14 DONE — Schale: at/more wandern auf die aufgelöste Fläche
      (Mitte, sonst Kantenmitte), wenn sie nicht mehr darauf liegen.
- [ ] T1.11 BLOCKED(Vieleck-Punkte lassen sich noch nicht einfügen oder
      löschen) — Sobald das geht: jede Vieleckseite bekommt eine eigene
      ID statt eines Index, Con.i und Refs umstellen, Migration.

## Epic 2: Sweep
- [x] T2.1 DONE — Profil + offener Pfad, mit Test.
- [x] T2.2 DONE — geschlossener Pfad, Bögen als runde Ecken.
- [x] T2.3 DONE — Pfadauswahl und Live-Vorschau im Viewport.
- [x] T2.4 DONE — Pfadpunkte nachträglich ziehen.

- [x] T2.5 DONE — Pfad aus vorhandenen Körperkanten: nach „Zug: Pfad
      zeichnen“ Kanten nacheinander anklicken, Enter. Kanten mit Bezug,
      Vorschau läuft mit. Einschränkung: das Profil wandert nicht mit,
      wenn sich die Kanten verschieben (wie beim gezeichneten Pfad).

## Epic 3: Einzelbemaßung Zeichnung
- [x] T3.1 DONE — Maßobjekt im Zeichnungsmodell (Typ, Bezug, Position).
- [x] T3.2 DONE — Lineares Maß setzen und verschieben.
- [x] T3.3 DONE — Durchmesser, Radius, Winkel. Test für das Radius-Maß
      in T0.1 nachgetragen.
- [x] T3.4 DONE — Toleranzen, Export nach SVG/PDF/DXF. Entscheidung:
      DXF bleibt reine Geometrie ohne Maße.

- [x] T3.6 DONE — Vorschau der Maßlinie beim Ablegen (Länge, ⌀, R), gestrichelt.
- [x] T3.5 DONE — Maße in der Iso-Ansicht (Länge immer schräg mit wahrer
      Länge, ⌀/R; Winkel dort gesperrt) und an schräg gesehenen Kreisen
      (als Ellipse anklickbar, Wert = echter Durchmesser).

## Epic 4: Tauri-Desktop
- [x] T4.1 DONE — Tauri-Shell, WASM lädt im Build korrekt.
- [x] T4.2 DONE — Öffnen/Speichern über System-Dialog, `.ofc` verknüpft.

- [ ] T4.3 TODO — Installer ist neu gebaut (Stand T10.8, 7,99 MB,
      src-tauri/target/release/bundle/nsis/) und startet jetzt auch ohne
      LLVM-MinGW auf dem Rechner (siehe Log 2026-10-29 T4.3).
      Offen beim Nutzer: installieren und durchklicken — Öffnen,
      Speichern, Doppelklick auf eine `.ofc`-Datei, STEP- und
      STL-Export, Zeichnung. Dabei gleich T0.2 mitführen.
- [ ] T4.4 TODO — macOS- und Linux-Build über GitHub Actions. Der Weg
      ist erprobt (.github/workflows/opencascade.yml läuft bereits), es
      fehlt nur die Entscheidung, ob es sich lohnt. Erst sinnvoll, wenn
      jemand außer dem Nutzer die App haben will.

## Epic 5: Skizzieren
- [x] T5.1 DONE — Hilfslinien (G), gestrichelt.
- [x] T5.2 DONE — Trimmen und Verlängern (T) für offene Hilfslinien.
- [x] T5.3 DONE — Körperkanten projizieren (P). Einschränkung:
      Momentaufnahme aus dem Anzeige-Netz → T5.5.
- [x] T5.4 DONE — Abhängigkeiten Winkel zwischen Seiten und fester Punkt.
      KORREKTUR 2026-10-29: Tangente Linie–Bogen und Radius eines Bogens
      waren hier fälschlich als erledigt geführt. Sie sind offen und
      leben in T5.6, weil der Löser Bögen nur als Sehne kennt.

- [x] T5.6 DONE — Bögen im Löser als echte Kreisbögen (planegcs arc), sobald
      ein Radius- oder Tangenten-Maß daran hängt: Seitenfeld „Bogen n R“
      und Knöpfe „tangential an Seite k“ (◠k). Bögen ohne solches Maß
      verhalten sich wie bisher (Sehne mit festem Winkel).
- [x] T5.5 DONE — Projektion (P) aus dem B-Rep im Kern: Strecken und von
      vorn gesehene Kreise/Bögen exakt, sonst abgetastet; jede Linie hat
      einen Kantenbezug (src) und wandert mit dem Körper. Von Hand
      getrimmt, verlängert oder gezogen = Bezug weg, Linie bleibt fest.

### Skizzieren wie in Shapr3D (Wunsch des Nutzers, 2026-10-29)
Entstanden vor der Feldnotizen-Regel, also Vermutungen. Nach T0.3
gegen die Notizen prüfen und gegebenenfalls umsortieren oder streichen.

- [x] T5.7 DONE — Leerer Bereich über (und unter) der Werkzeugliste:
      das Panel war oben und unten am Fenster festgemacht und hat die
      Werkzeuge mittig gesetzt. Jetzt nur so hoch wie die Werkzeuge.
- [x] T5.8 DONE — Rechtsklick während des Zeichnens beendet den Zug wie
      Enter, statt das Kontextmenü zu öffnen. Ergibt der Zug keine
      Fläche, bleiben die Punkte stehen (Hinweis), statt zu verschwinden.
- [ ] T5.17 TODO — Messen überarbeiten. Der Nutzer meldet, dass es nicht
      richtig funktioniert; das genaue Fehlerbild steht noch aus und
      soll aus T0.2 kommen. Erst reproduzieren und beschreiben, dann
      umsetzen. Messen gehört zu den am häufigsten benutzten Werkzeugen
      des Nutzers, deshalb vorgezogen.
- [x] T5.9 DONE — Ansicht auf die Fläche: Leertaste bei liegendem Raster
      fliegt die Kamera senkrecht auf die Fläche (Bauteil füllt das Bild),
      nochmal Leertaste = zurück. Über einer anderen Fläche setzt die
      Leertaste weiter das Raster dorthin; ohne Raster „letztes Werkzeug“.
      Abweichung: bei liegenden Flächen ist „oben“ −z wie in der
      Draufsicht, nicht die y-Achse der Skizze (siehe Log).
- [x] T5.10 DONE — Sichtbarer Punkt am Zeiger beim Skizzieren (auch vor
      dem ersten Linienpunkt): blau = Raster, weiß = frei (Shift),
      orange = Punkt mit Wort „Endpunkt“, „Mitte“, „Ursprung“, „Schnitt“,
      gelb = „auf Linie“. Raster „Auto“ nach Zoom, neu Standard.
- [x] T5.11 DONE — Rastpunkte auf der Fläche unter dem Raster: Mitte,
      Ecken, Kantenmitten, Bohrungs-/Bogenmitten, als weiße Punkte
      sichtbar und einrastbar; Fluchtlinien über das vorhandene
      Ausrichten. Im Bereich der Fläche gilt das Raster auch über einer
      Bohrung (Mitte der Bohrung erreichbar).
- [x] T5.12 DONE — Linienkette (Weg A): Punkte klicken; Doppelklick,
      Klick auf den letzten Punkt, Enter, Esc oder Rechtsklick beenden
      offen, Klick auf den Anfangspunkt schließt zur Fläche. Offene Linien
      sind eigene Art `type: 'line'` (nicht `aux`), durchgezogen, bilden
      keine Bereiche.
- [x] T5.18 DONE — Körper an einer geraden offenen Linie teilen:
      Seitenfeld der Linie → „Körper hier teilen“. Senkrechte
      Schnittebene durch die Linie (ausgeblendet im Baum) + vorhandenes
      Teilen; beide Hälften eigene Körper. Teilt KÖRPER, keine
      Skizzenbereiche (das bleibt Epic 9).
- [x] T5.13 DONE — Fänge beim Linienzeichnen: waagrecht, senkrecht,
      parallel und rechtwinklig (eigene Seiten und gerade Kanten ≥ 5 mm
      in der Ebene), 3° Fangbereich, Wort am Zeiger. Zu eigenen Seiten
      entsteht beim Absetzen ∥/⟂ als Abhängigkeit (hält beim Ziehen),
      waagrecht/senkrecht wie bisher. Shift = frei.
- [x] T5.14 DONE — Tangential an Bögen: nach einem Bogen rastet die
      nächste Strecke tangential ein („tangential an Bogen n“), ein
      gezogener Bogen schließt tangential an; beides wird als
      Abhängigkeit gemerkt und hält beim Ziehen (über T5.6).
- [x] T5.15 DONE — Winkel tippen: beim Linienzeichnen Länge tippen, Tab,
      Winkel (Grad zur x-Achse der Skizze, gegen den Uhrzeigersinn,
      Minus erlaubt), Enter. Nur Winkel (Tab zuerst) = Länge bis zur Maus.
- [x] T5.16 DONE — Esc stufenweise, je Druck eine Stufe: Laufendes
      abbrechen (getippte Zahl, Kanten-/Bezugswahl, Zug, Ziehen; Linienkette
      ab zwei Punkten endet offen) → Werkzeug verlassen → Auswahl aufheben
      → Flächenraster aufheben.

## Epic 6: Modellieren
- [x] T6.1 DONE — Fläche versetzen für ebene Flächen.
- [x] T6.1b DONE — Fläche löschen über eigenen OpenCascade-Build.
- [x] T6.2 DONE — Drehkörper um eine beliebige gerade Kante.
- [x] T6.3 DONE — Muster/Spiegeln an beliebiger Kante bzw. Fläche,
      Rundungen und Fasen werden mitkopiert (Test in T0.1 nachgetragen).
      KORREKTUR 2026-10-29: „auch ganze Körper" stand hier fälschlich.
      Das ist offen und liegt in T6.4.

- [x] T6.4 DONE — Muster/Spiegeln für ganze Körper, mit T10.3 erledigt.

## Epic 7: Pflege
- [x] T7.1 DONE — 3MF-Export: „Zeichnung / mehr“ → „Körper als 3MF“, ein Objekt je Körper, mm, Z oben.
- [ ] T7.2 TODO — Wiederkehrende Pflicht bei jedem replicad-Update:
      prüfen, ob sich replicad-opencascadejs geändert hat; wenn ja, den
      Workflow mit neuer REPLICAD_REF/IMAGE laufen lassen, sonst bricht
      „Fläche löschen". Danach voller Regressionslauf.
      Stand: 1.2.0 ist erledigt, gleiches OCCT-Image.

## Epic 8: KI-Assistent (M4 aus PLAN.md)
Erst beginnen, wenn das Skizzieren im Alltag steht. Der Assistent setzt
auf dem Feature-Modell auf, jede Unsauberkeit darunter muss er umschiffen.

Entschieden (2026-10-29): Kein fest eingebauter Anbieter. Adapter gegen
die OpenAI-kompatible Chat-Completions-Schnittstelle, drei Felder in den
Einstellungen (Basis-URL, Modell, Schlüssel). Damit laufen Groq, Mistral,
OpenRouter, OpenAI und jedes lokale Ollama über denselben Code.
Grund gegen eine feste Gratis-Stufe: Die Gratis-Stufen verlangen meist
die Zustimmung zur Nutzung der Daten fürs Training — bei CAD-Geometrie
inakzeptabel als Standard. KI bleibt abschaltbar und ist standardmäßig
aus.

- [x] T8.1 DONE (Freigabe offen, siehe docs/adr/0002-ki-assistent.md) — Entwurf, nur docs/, kein Code: Die KI erzeugt Features
      im bestehenden Datenmodell über Tool-Calls mit festem Schema,
      niemals replicad-Code, der ausgeführt wird, und niemals Meshes.
      Jeder Schritt landet im Baum, ist nachbearbeitbar und rückgängig.
      Folge: Anforderung ans Modell ist zuverlässiges Befolgen eines
      JSON-Schemas, nicht Geometrieverständnis — kleinere Modelle
      genügen.
- [x] T8.2 DONE — Adapter plus Einstellungen, mit drei Voreinstellungen
      zum Anklicken (Groq, lokal über Ollama, eigener Anbieter) und
      einem Hinweis, dass Gratis-Stufen in der Regel mitlesen.
- [x] T8.3 DONE — Text zu Teil für einen engen Fall:
      „Platte 100×60×5 mit 4 Bohrungen M5 in den Ecken".
- [x] T8.4 DONE — Ändern per Text an bestehender Auswahl
      („Wand 2 mm dicker").
- [x] T8.5 DONE — Fehler erklären: warum eine Fase scheitert und wie sie
      zu beheben ist.
- [x] T8.6 DONE — Kernfehler an die KI zurückgeben (ADR 0002, Abschnitt 4):
      scheitert ein KI-Schritt erst im Kern (z. B. Rundung zu groß), den
      Grund bis zu zweimal zurückschicken. Braucht ein Warten auf das
      Ergebnis des Kernlaufs (inkl. zweitem Lauf nach Bezugsnachträgen).

## Epic 9: Skizzieren, Bereiche aus offenen Linien (Weg B)
Große Architekturänderung, bewusst ans Ende. Erst sinnvoll, wenn Weg A
(T5.12) im Alltag steht und die Feldnotizen zeigen, dass es fehlt.
Der Nutzer verwendet die Linie heute vor allem zum Messen und als
Baulinie, dafür genügt Weg A.

- [ ] T9.1 TODO — Alle Linien einer Ebene bilden gemeinsam Bereiche:
      Rechteck plus Linie quer ergibt zwei einzeln herausziehbare
      Flächen. Offene Linien teilen Bereiche zusätzlich.
- [ ] T9.2 TODO — Migration: offene Linien aus Weg A bewusst und pro
      Datei sichtbar nach Weg B überführen, nie still beim Laden.

## Epic 10: Werkzeuge wie Shapr3D (Wunsch des Nutzers, 2026-10-29)
Vom Nutzer mit Screenshots aus Shapr3D gewünscht und freigegeben
(Reihenfolge und Umsetzung nach eigenem Ermessen, „sie sollen am Ende
funktionieren“). Nach T0.3 gegen die Feldnotizen prüfen.

- [x] T10.1 DONE — Linksziehen ins Leere = Auswahlrahmen (Shift = dazu),
      Ansicht drehen = rechte Maustaste, verschieben = mittlere, Rad =
      zoomen, Rechtsklick ohne Ziehen = Menü. Ausgewählte Skizzen zeigen
      ihre Maße am Element (Rechteck B/T, Kreis R, Seitenlängen, Bogen R);
      Klick auf ein Maß = Wert tippen, Enter.
- [x] T10.2 DONE — Aufklappmenü (▸) an Rechteck (Diagonal, Mitte,
      3 Punkte) und Vieleck (3, 5, 6, 8 Ecken), gewählte Art steht neben
      dem Namen.
- [x] T10.3 DONE — Leiste: „Verschieben / Drehen“, „Muster“, „Spiegeln“
      wirken auf die Auswahl. Körper: Griffe bzw. neues Feld „Muster /
      Spiegeln (ganzer Körper)“ – Reihe, Kreis, Spiegeln an X/Y/Z oder
      angeklickter Kante/Fläche. Skizze/Schritt: öffnet deren Muster/
      Spiegeln wie bisher. Erledigt damit auch T6.4.
- [x] T10.8 DONE — Formen per Klick-Klick (Wunsch des Nutzers): Rechteck,
      Kreis, Ellipse, Vieleck, Langloch: einmal klicken, die Form folgt der
      Maus, nochmal klicken = fertig; oder Maß tippen + Enter, oder Ende =
      an der Maus fertig. Ziehen geht weiter wie bisher.
- [x] T10.4 DONE — Text (Werkzeug „Text“): Klick auf Boden oder Fläche,
      auf einer Fläche graviert (−1 mm), sonst erhaben (2 mm); Text,
      Schrifthöhe und Höhe im Seitenfeld. Schrift DejaVu Sans 2.37
      (vendor/fonts, Lizenz liegt bei).
- [x] T10.5 DONE — Transformieren-Menü (▸ an „Verschieben / Drehen“):
      Griffe, Werte (verschieben/drehen/skalieren), Drehen um Achse
      (Kante anklicken, Winkel aus dem Feld), Ausrichten (Fläche des
      Körpers, dann Zielfläche: liegt flach darauf), Muster, Spiegeln.
- [x] T10.6 DONE — Einrasten-Menü (Knopf „Einrasten ▸“ unten links):
      Raster, Hilfslinien, Punkte der Skizzen, Punkte am Körper,
      Körperkanten einzeln schaltbar; Rastpunkte und Hinweise ein/aus;
      Rastergröße im selben Menü. Wird mit der Darstellung gemerkt.
- [x] T10.7 DONE — Messen in drei Arten (▸ am Werkzeug): Objekt (Kante =
      Länge, Kreis = ⌀/R/Umfang, Bogen = R und Bogenlänge, Fläche =
      Flächeninhalt), Punkt zu Punkt, Winkel über drei Punkte. Ergebnis als
      Beschriftung im Modell, Einrastpunkt (Endpunkt, Mitte, Kreismitte)
      schon vor dem Klick sichtbar. T5.17 (Fehlerbild des Nutzers) bleibt
      offen, bis die Feldnotizen da sind.

### Rückmeldung des Nutzers nach dem Installer (2026-10-29)
- [x] T10.9 DONE — Strg oder Shift + Klick nimmt Schritte einzeln in die
      Auswahl auf oder wieder heraus (auch den zuerst gewählten), im
      Modell, in der Schrittliste und bei Kanten; Rahmen mit Strg/Shift = dazu.
- [x] T10.10 DONE — Alles auswählen (Strg+A) und „Alle Kreise auswählen“
      (allgemein: alle Skizzen/Features gleicher Art) im Rechtsklickmenü.
- [x] T10.11 DONE — Boden-Raster wächst mit dem Modell (bisher fest
      400 × 400 mm), Zellen bleiben 10 mm bzw. 1 mm.

## Log
(neueste oben)
- 2026-10-30 T8.5: Roter Schritt bekommt im Baum einen Knopf „?“, wenn
  die KI eingeschaltet ist. Gesendet werden Meldung des Kerns, der Schritt
  und bis zu 3 Schritte davor und 1 danach mit Maßen (explainMsgs), ohne
  Werkzeuge; die Antwort steht in der KI-Zeile, lange Texte in eigener
  Zeile über der Eingabe (#aiBar.long). Die Zeile bleibt danach für einen
  Auftrag offen („Rundung kleiner machen“ geht über aendern aus T8.4).
  Gelernt: die Meldungen des Kerns sind knapp („Rundung fehlgeschlagen“),
  die KI muss den Grund aus den Maßen der Nachbarn ableiten. Im Browser
  geprüft (Knopf erscheint, Anfrage läuft, Fehlermeldung bei nicht
  erreichbarem Anbieter); mit echtem Sprachmodell noch nicht geprüft.
- 2026-10-30 Fix Installer-Bau auf frischem Checkout: tauri.conf.json
  verlangt target/release/WebView2Loader.dll als Ressource, die legt aber
  niemand dort ab (webview2-com-sys kopiert sie nur in sein OUT_DIR); auf
  dem ersten Rechner lag sie zufällig schon da. build.rs kopiert sie jetzt
  aus der Cargo-Registry (Version aus Cargo.lock). Installer gebaut:
  src-tauri/target/release/bundle/nsis/, 9,9 MB.
- 2026-10-30 T8.4: Werkzeug `aendern` (schritt + breite/tiefe/radius/
  hoehe/dicke, absolute Werte) für Rechteck, Kreis, Skizzenhöhe, Rundung,
  Fase und Schale; was nicht zum Typ passt, wird mit der erlaubten Liste
  abgelehnt. Kontext trägt jetzt `auswahl` (markierte Schritte) und die
  Maße unter denselben Namen wie die Werkzeuge (breite statt p.w, dicke,
  radius), damit kleine Modelle sie direkt übernehmen. Kantenauswahl
  (edgeSel) geht noch nicht mit, nur Schritte. Geprüft: Kern-Check im
  Browser-Worker liefert für eine zu große Rundung „Rundung
  fehlgeschlagen“; mit echtem Sprachmodell noch nicht geprüft.
- 2026-10-30 T8.6: Sagt die KI „fertig“, rechnet der Worker den Stand
  einmal still (Nachricht `check`, inkl. zweitem Lauf nach nachgetragenen
  Bezügen, Anzeige bleibt). Scheitern dabei Schritte, die die KI in diesem
  Auftrag angelegt oder geändert hat, geht der Grund als Nutzer-Nachricht
  zurück, höchstens zweimal; danach bleibt der Fehler im Baum sichtbar.
  Fehler an älteren Schritten des Nutzers werden nicht gemeldet. Neues
  Werkzeug `schritt_entfernen`, nur für Schritte dieses Auftrags (ab
  firstId), damit die KI einen abgelehnten Schritt ersetzen kann. Mit
  echtem Modell noch nicht geprüft (kein LLM auf diesem Rechner).
- 2026-10-29 T8.3 mit echtem Modell (Ollama qwen2.5:7b, RTX 4070): erst
  0 von 1 – das Modell verschachtelte „ebene“ falsch, schickte einen Aufruf
  je Antwort, ließ x/y weg und schrieb ein JSON-Beispiel aus der Anweisung
  als Text ab. Geändert: flache Parameter (auf_schritt weglassen = Boden,
  bohrung.schritt), x/y bei Skizzen Standard 0, Fehlermeldungen sagen, was
  stattdessen richtig ist, Beispiel als Fließtext, Ablauf runRequest
  (aiTools.ts) fragt bis zu 12 Runden weiter, bis die KI ohne Werkzeug
  antwortet (Abbruch nach 3 Fehlerrunden in Folge), Meldung zählt neue
  Schritte. Danach 3 von 3 Läufen richtig: Platte 100 × 60 × 5, vier M5 mit
  7,5 bzw. 10 mm Randabstand, Volumen exakt, 6–8 s je Anfrage (erster Aufruf
  nach dem Laden des Modells ~90 s). Test für den Ablauf mit vorgetäuschtem
  Modell (ai.test.ts). docs/CHANGELOG.md angelegt, README-Status aktualisiert.
- 2026-10-29 Fix T8.2 (Rückmeldung des Nutzers, Ollama): Ollama lehnte die
  Anfragen der Desktop-App mit 403 ab – geprüft gegen das laufende Ollama:
  Origin http://tauri.localhost → 403, http://localhost / tauri://localhost
  / ohne Origin → durch. Die App meldete fälschlich „Schlüssel abgelehnt“.
  Jetzt: für localhost/127.0.0.1 setzt die Desktop-App Origin
  http://localhost (tauri-plugin-http mit Feature unsafe-headers); 403 =
  „Zugriff verweigert“, bei lokaler Adresse mit Hinweis auf OLLAMA_ORIGINS;
  404 mit Hinweis „ollama pull“. Tests ergänzt. Nicht geprüft: dass das
  Plugin den gesetzten Origin tatsächlich sendet (braucht einen Klick in
  der Desktop-App; im Ollama-Protokoll nachsehen, ob danach 404/200 statt
  403 kommt).
- 2026-10-29 T8.3: src/aiTools.ts – Werkzeuge skizze_rechteck, skizze_kreis,
  extrudieren, bohrung (Durchmesser oder M3–M12 als Kernloch mit Namen
  „Gewinde Mx“, Tiefe oder „durch“); Flächen vorerst nur „oben“ auf einem
  nach oben extrudierten Schritt (dieselben x/y wie dessen Skizze). Von den
  7 Werkzeugen aus ADR 0002 sind 4 da; runden/fasen, muster, wert_setzen
  kommen mit T8.4. applyCalls prüft jeden Aufruf einzeln (Wertebereich,
  Richtung, vorhandener Schritt); fehlerhafte ändern nichts und gehen mit
  Grund als Werkzeugergebnis zurück, höchstens zwei Korrekturrunden. Alles
  zusammen = ein Rückgängig-Schritt; Leiste „Übernehmen / Verwerfen“.
  THREADS nach model.ts verschoben (eine Tabelle für App und KI). Gefunden
  beim Testen: Ebene als Kopie der ganzen Elternskizze überschrieb id und
  onFace der Bohrung → nur o/n/u/v. Abnahme als Kern-Test mit
  aufgezeichneten Aufrufen: 5 Schritte, Volumen exakt, STEP hin und zurück
  gleich. Browser mit vorgetäuschtem fetch: falsche Bohrung (Schritt 7) →
  Korrekturrunde → 5 Schritte, Verwerfen nimmt alle zurück. Nicht geprüft:
  ein echtes Sprachmodell (kein Anbieter eingerichtet). Neu nötig: T8.6.
- 2026-10-29 T8.2: src/ai.ts – chat() gegen /chat/completions (temperature 0,
  tools optional), Werkzeugaufrufe mit geparsten args (kaputtes JSON = null,
  nicht geraten), Fehler als Klartext (401/403, 404, 429, nicht erreichbar,
  Zeitüberschreitung). Einstellungen: „Zeichnung / mehr“ → „KI-Assistent
  einrichten …“, aus per Standard, Voreinstellungen Groq / Ollama / eigener
  Anbieter, Hinweis zum Mitlesen der Gratis-Stufen, „Verbindung testen“.
  Desktop: tauri-plugin-http (Rust + npm), Berechtigung https://* und
  localhost/127.0.0.1 (Ollama); Browser nimmt normales fetch. Tests mit
  vorgetäuschtem fetch (src/ai.test.ts, 2 Tests). Geprüft: Browser-Fenster,
  Ollama-Test meldet „nicht erreichbar“ (läuft hier nicht); Desktop-Build
  startet, keine neuen Fremd-DLLs, Installer 9,41 MB (+1,4 MB durch das
  Plugin). Nicht geprüft: eine echte Anfrage an einen Anbieter (kein
  Schlüssel hier) und die Anfrage über das Plugin in der Desktop-App.
  Die Modellnamen der Voreinstellungen sind nicht gegen die aktuellen
  Listen der Anbieter geprüft, deshalb editierbar.
- 2026-10-29 T8.1: docs/adr/0002-ki-assistent.md. Kern des Entwurfs: KI
  ruft nur Werkzeuge mit festem Schema auf (7 Werkzeuge in Stufe 1), die
  App prüft und setzt sie in normale Features um, ein Rückgängig-Schritt
  je Anfrage, höchstens zwei Korrekturrunden bei Kernfehlern. Bezüge über
  die vorhandenen Origin-Namen ({f, tag}) und die aktuelle Auswahl.
  Gesendet: Feature-JSON, Hüllquader, Auswahl, Einheit – keine STEP-Daten
  oder Pfade. Drei Fragen an den Nutzer unter „Offene Fragen“. T8.2 wartet
  auf die Freigabe (Frage 3 betrifft eine neue Abhängigkeit).
- 2026-10-29 T7.1: to3MF + zipStore (kernel.ts), keine neue Abhängigkeit:
  ZIP ohne Kompression (Slicer lesen das), CRC32 selbst. OCCT vernetzt je
  Fläche mit doppelten Eckpunkten → zusammengelegt (auf 1e-6 mm gerundet),
  entartete Dreiecke verworfen. Test: jede Kante genau einmal je Richtung
  (dicht und einheitlich ausgerichtet), Höhe in Z. ZIP einmalig mit
  Pythons zipfile geprüft (CRC ok, 3 Einträge). Browser: modell.3mf,
  260 Eckpunkte / 520 Dreiecke für Quader mit Durchgangsbohrung
  (Euler-Charakteristik 0 wie erwartet). Nicht geprüft: Öffnen in einem
  echten Slicer (PrusaSlicer, Bambu Studio, Cura) — liegt beim Nutzer.
  Körpernamen und Farben aus dem Modell werden noch nicht mitgegeben.
- 2026-10-29 T3.5: PROJ[3] = Iso-Projektion, aus den Achsen der
  ProjectionCamera abgeleitet und im Test gegen drawProjection geprüft
  (Hülle der Ecken = Hülle der Zeichnung). Dim.v um 3 erweitert. Iso:
  Längen zeigen die wahre 3D-Länge (Iso verkürzt um √(2/3)), der Editor
  legt sie immer schräg an; Winkel in Iso werden abgelehnt (projizierter
  Winkel wäre falsch). Kreise: Ansatzpunkt der Hinweislinie ist der Punkt
  oben rechts am projizierten Rand (pts[1], rv = Abstand in der Ansicht),
  bei frontalen Kreisen derselbe Punkt wie bisher (−45°). Genau von der
  Seite gesehene Kreise (|n·Blick| < 0,1) sind nicht anklickbar bzw. als
  Fehler gemeldet. Editor: Ellipsen als Punktfolge angeklickt und
  hervorgehoben. Browser: Iso ⌀20 an einer Bohrung, Kante 50 schräg.
- 2026-10-29 T5.5 (Entscheidung des Nutzers: mitwandern): Hilfslinie
  bekommt `src?: EdgeRef`. Kern: projectEdge/projectBody (kernel.ts),
  Worker-Nachricht `project` → `projected`; im Kernlauf rechnet eine
  Hilfslinie mit src ihre pts aus der aufgelösten Kante neu und trägt sie
  über fixes nach (kein neuer Mechanismus). Kante weg/mehrdeutig/senkrecht
  = sichtbarer Fehler am Schritt. Kanten ohne eindeutigen Bezug werden
  fest angelegt (Hinweis nennt die Zahl). Trimmen, Verlängern, Punkt
  ziehen löschen src. Nebenbei: Meldungen (showNotice) überlebten den
  zweiten Kernlauf nach nachgetragenen Bezügen nicht – jetzt bleiben sie
  bis dahin stehen (betraf auch die Rahmenauswahl). Test: Quader mit
  Bohrung auf die Oberseite projiziert (4 Strecken + Ring aus 2
  Halbbögen), Quader 20 → 30 breit, Kante wandert, Ring nicht. Browser:
  80 → 100 mm, alle 5 Linien ohne Fehler, Meldung bleibt stehen.
- 2026-10-29 T3.6: sheetEditor.ts preview(): sobald nur noch die Lage
  fehlt, zeichnet die Mausbewegung Hilfs- und Maßlinie gestrichelt in die
  vorhandene Hervorhebungsebene, Lage aus demselben offFor wie beim
  Ablegen (Shift = schräg wirkt auch in der Vorschau). Geprüft im Browser:
  Länge 80 in der Draufsicht, abgelegtes Maß liegt auf y = 60,85 wie die
  Vorschau; ⌀ an einer Bohrung. Gelernt beim Testen: Kreise mit `ry`
  (auch r = ry) baut der Kern als Ellipse, die sind als ⌀/R nicht
  anklickbar — betrifft nur Ellipsen-Features, das Kreis-Werkzeug setzt
  kein ry. Kein Kern-Test: reine Editor-Anzeige.
- 2026-10-29 T2.5: Sweep.edges (at/dir/edge je Kante, wie EdgeOp) und
  Sweep.of (Körper der Kanten). Kern: anchorEdges je Kante, Patches und
  Bestätigungen kantenweise zusammengeführt, assembleWire → vorhandenes
  sweep(). UI: im Pfadmodus nimmt der erste Klick auf eine Kante statt
  eines Punkts den Kantenmodus an (danach nur Kanten, alle vom selben
  Körper); Hinweis zählt die Kanten (pathHint, übersteht den zweiten
  Kernlauf nach dem Nachtragen der Bezüge). Test: Rundstab an einer
  Quaderkante (Volumen exakt), zweite Kante um die Ecke. Im Browser:
  Quader 100 × 50 × 50, R 5 an zwei Kanten, Feature mit beiden Bezügen
  gespeichert. Nicht geprüft: geschlossene Kantenzüge (Ring um eine
  Fläche) und Kanten in beliebiger Klickreihenfolge.
- 2026-10-29 T1.14: anchorFaces (topo.ts) liefert patch at/more, wenn ein
  Punkt nicht mehr auf seiner über den Bezug gefundenen Fläche liegt.
  Ersatzpunkt: Flächenmitte, falls sie auf der Fläche liegt (bei Ringen
  nicht), sonst Mitte der ersten Kante — liegt immer darauf, also kein
  endloses Nachführen. Test: Quader 10 → 15 hoch, Punkt landet auf y = 15,
  zweiter Lauf führt nichts mehr nach. shortcut-Kommentar entfernt.
- 2026-10-29 T10.9–T10.11 (Rückmeldung des Nutzers, ein Commit, alles
  Auswahl/Anzeige in main.ts): toggleSel() für Strg/Shift+Klick im Modell
  und in der Schrittliste (der erste Schritt lässt sich jetzt auch
  abwählen, der nächste rückt nach), Kanten und Rahmen nehmen Strg wie
  Shift. selectWhere() bündelt Rahmen, Strg+A und den Menüeintrag „Alle
  Kreise (Skizzen) auswählen“ (gleiche Art und gleich flach/extrudiert,
  damit Bohrungsskizzen nicht mit Zylindern gemischt werden). fitGrid():
  Bodenraster mindestens 400 mm, sonst 1,25 × größte Ausdehnung, auf
  200 mm gerundet; läuft nach jedem Kernlauf. Geprüft im Browser mit
  Testmodell (3 Kreis-Skizzen, extrudierter Kreis, Rechtecke, Quader bei
  300 mm): Raster reicht über den Quader, Strg+A = 6, Strg-Klick ab/an,
  Shift-Klick auf den ersten, Menü wählt genau die 3 Kreis-Skizzen. Kein
  Kern-Test: reine Oberflächenlogik ohne Kernanteil.
- 2026-10-29 T4.3 (Installer neu gebaut, Durchklicken beim Nutzer offen):
  Rust und LLVM-MinGW fehlten auf dem Rechner, per winget nachinstalliert.
  rustup 1.29 lehnt `stable-x86_64-pc-windows-gnullvm` als Kanal ab →
  rust-toolchain.toml auf `stable`, einmalig `rustup set default-host
  x86_64-pc-windows-gnullvm` (README). Gefunden: die App brauchte
  libunwind.dll (nur aus LLVM-MinGW im PATH) und WebView2Loader.dll, die
  der Installer nicht mitlieferte → auf fremden Rechnern Absturz
  0xC0000135, betraf vermutlich auch die älteren Installer. Behoben:
  libunwind statisch (src-tauri/.cargo/config.toml, +crt-static),
  WebView2Loader.dll über bundle.resources neben die exe. Geprüft: exe
  startet ohne LLVM-MinGW im PATH (Fenster „OpenForm CAD“), 7z-Liste des
  Installers zeigt openform-cad.exe und WebView2Loader.dll.
- 2026-10-29 T10.8: Klick ohne Bewegung (< 4 px zwischen Drücken und
  Loslassen) „schärft“ die Form (drag.armed): sie bleibt aktiv, folgt der
  Maus, der nächste Klick beendet sie über denselben Weg wie das Ziehen.
  Getippte Maße und Esc wirken wie beim Ziehen, Ende (Taste) beendet an
  der Maus, auch Linienketten (wie Enter). Werkzeugwechsel verwirft eine
  halb gesetzte Form. Im Browser: Rechteck Klick-Klick 33 × 19, Kreis
  Klick + „15“ Enter = R 15, Rechteck gezogen, Langloch mit Ende.
  Kein Kern-Test (Oberfläche), 57 Tests grün.
- 2026-10-29 T10.4: Feature `text` (model.ts TextFeature): Kern baut mit
  replicad drawText aus der beim Start des Workers geladenen Schrift
  (loadFont, vendor/fonts/DejaVuSans.ttf, offizielles Release 2.37,
  418 KB-Zip, nur die Normalschrift übernommen) eine Skizze in der Ebene
  des Features und extrudiert sie; d < 0 schneidet (Gravur), d > 0
  vereinigt bzw. ist eigener Körper. Flächen heißen tag 'text'. Die
  Ebene richtet main.ts lesbar aus (liegend entlang Welt-X, stehend
  waagrecht). Abkürzung: Text wandert nicht mit seiner Fläche (Ebene beim
  Anlegen kopiert). Test: „OF“ erhaben, „A“ graviert, leerer Text =
  sichtbarer Fehler. Im Browser: „OpenForm“ graviert, lesbar, 32,00 →
  31,89 cm³. Leiste wieder ohne Scrollen (18 Einträge). 57 Tests grün.
- 2026-10-29 T10.5: transformAct() bündelt die Leistenknöpfe und das
  Aufklappmenü, xfClick() erledigt die Klicks für „Drehen um Achse“
  (Move um die Kantenrichtung durch den Kantenpunkt) und „Ausrichten“
  (Drehung Quellnormale → −Zielnormale um den ersten Klickpunkt, dann
  Verschiebung auf den zweiten). Beides sind normale Move-Schritte im
  Baum (Rückgängig, Ausschalten). Abkürzung: Ausrichten legt nur die
  Normalen gegeneinander, die Drehung um die Normale bleibt, wie sie
  sich ergibt. Hinweise jetzt über showNotice, sonst überschreibt der
  nächste Bau sie. Im Browser: Deckel von Körper 1 auf die rechte Seite
  von Körper 2 → Klickpunkt liegt auf x = 60; Drehen um senkrechte Kante
  bei x = 40 → 90° um y. Kein Kern-Test (Move ist getestet). 56 Tests grün.
- 2026-10-29 T10.3/T6.4: bodyCopy() in model.ts kopiert alle Schritte eines
  Körpers (Skizzen, Rundung/Fase, Schale, Versatz, Fläche löschen, Zug,
  Übergang, Bewegungen) mit neuen IDs in einen neuen Körper, Verweise auf
  mitkopierte Skizzen umgeschrieben, Flächen-/Kantenbezüge entfernt (der
  Kern findet sie an derselben Stelle neu), dahinter ein Move an den
  Zielort. Spiegeln = Move mit s = −1 und halber Drehung um die
  Spiegelnormale; OCCT liefert dabei einen gültigen Körper mit gleichem
  Volumen (Test: Reihe 3×, Spiegelung an x = 30 → x 40..60). Abkürzung:
  Vereinigen/Abziehen/Teilen des Körpers wird nicht mitkopiert. Im Baum
  heißt die Spiegel-Bewegung „spiegeln“. Leistenknöpfe ohne eigenes
  Werkzeug, sie öffnen Griffe bzw. das Feld zur Auswahl. Im Browser:
  Reihe 3 × 30 mm entlang X und Spiegeln an X mit Bohrung in jeder Kopie.
  56 Tests grün. Hinweis: die Werkzeugleiste ist damit bei 768 px
  Fensterhöhe zu lang und scrollt.
- 2026-10-29 T10.1: OrbitControls.mouseButtons LEFT = keins, RIGHT = drehen,
  MIDDLE = verschieben. Im Auswählen-Werkzeug startet Linksziehen ins
  Leere drag 'box' (#boxSel), beim Loslassen werden alle Skizzen/Features
  gewählt, deren keyPoints ganz im Rahmen liegen (selId + multi); Klick
  ins Leere hebt die Auswahl wie bisher auf. buildDims zeigt jetzt auch
  Rechteck, Kreis und Bogenradien; ein Maß ist anklickbar und schreibt
  über das passende Feld im Seitenfeld (gleiche Prüfung, Abhängigkeiten,
  Rückgängig). Gefunden: rebuild() baute die Maße neu und entfernte das
  Eingabefeld, und der Mausdruck zog den Fokus weg → Sperre während der
  Eingabe, Öffnen erst beim Klick. Im Browser: Rahmen über zwei Skizzen →
  beide gewählt; Breite 30 → 45 am Maß getippt → Modell 45. Nicht mit
  echter rechter Maustaste geprüft (Werkzeug kann nur links ziehen).
  Kein Kern-Test (Oberfläche), 55 Tests grün.
- 2026-10-29 T10.7: Kanten- und Flächenauswertung aus workPoints
  herausgezogen (edgeInfo, edgePoints, faceArea in main.ts), Messen nutzt
  sie: Rastpunkte = Skizzenpunkte (Mitten als „Mitte“ markiert) plus
  Körperkanten (Enden, Mitten, Kreismitten) statt bisher aller Netz-
  punkte; zwischengespeichert bis zum nächsten Bau. Gefunden: vorher
  rasteten Messpunkte auch an jedem Stützpunkt gerundeter Kanten ein.
  Abkürzung: Bogenlänge und Flächeninhalt aus dem Anzeige-Netz (Kreis
  ±0,1 %; Kreisumfang deshalb aus dem Radius), exakt erst über den Kern.
  Gelernt beim Prüfen: synthetische Zeigerereignisse verstellen die
  Kamera (OrbitControls), Messklicks im Browser deshalb mit echter Maus.
  Im Browser: Kante 60,00 mm, Bohrungsrand ⌀ 12,00 / R 6,00, Deckel
  2287,1 mm² (exakt 2286,9), Ecke–Kantenmitte 30,00 mm, drei Ecken
  90,00°. Kein Kern-Test (Anzeige-Netz). 55 Tests grün.
- 2026-10-29 T10.6: display.snap (lokal gemerkt) schaltet: snap() aufs
  Raster (auch Zieh-Maße), alignTo und Richtungsfang (Hilfslinien),
  Ursprung/Skizzenpunkte (snapPoints), Flächenraster-Punkte (workPts),
  Körperkanten in snapSegs (neuer Parameter, Trimmen nutzt weiter alle
  Kanten), Hinweise (showSnapTip), weiße Rastpunkte. Rastergröße aus der
  Ansichtsleiste ins Menü verschoben. Im Browser: Menü offen, Raster aus →
  gezogenes Rechteck 140,76 × 159,73 statt auf mm gerundet. Kein
  Kern-Test (nur Oberfläche). 55 Tests grün.
- 2026-10-29 T10.2: #flyout in index.html, MENUS in main.ts. Rechteck
  „Mitte“: Zugpunkt = Mitte, getippte Maße gelten als ganze Breite/Tiefe.
  „3 Punkte“: erst Kante ziehen (Linie als Vorschau), dann Breite mit der
  Maus (Vorschau „B × T“), Klick legt ein Vieleck mit drei ⟂-
  Abhängigkeiten an, damit es beim Ziehen rechtwinklig bleibt;
  rect3Pts() in model.ts (Test: beide Seiten gegen den Uhrzeigersinn,
  schräge Kante). Vieleck-Menü setzt die Eckenzahl, + / − beim Ziehen
  aktualisiert die Anzeige. Esc bricht das halbe 3-Punkt-Rechteck ab.
  Abkürzung: beim 3-Punkt-Rechteck lassen sich keine Maße tippen. Im
  Browser: Menü, 3 Punkte (57,8 × 22,73, rechte Winkel), Mitte (zentriert
  auf dem Startpunkt). 55 Tests grün.
- 2026-10-29 T5.16: escapeStep() ersetzt den Esc-Zweig, der bisher alles
  auf einmal tat (Zug weg, Werkzeug weg, Auswahl weg) und das Raster
  zuerst entfernte, sobald keine Linie lief. Kontextmenü schließt bei
  jeder Stufe mit. Entscheidung aus T5.12 bleibt: Linienkette ab zwei
  Punkten endet offen statt verworfen zu werden. Im Browser mit
  Tastendruck-Ereignissen: Raster + Linie mit einem Punkt → Esc: Zug weg,
  Werkzeug bleibt → Esc: Auswählen → Esc: Seitenfeld zu → Esc: Raster weg.
  Kein Kern-Test (Tastatur). 54 Tests grün.
- 2026-10-29 T5.15: Linie nutzt dasselbe Trennzeichen wie „B × T“ beim
  Rechteck (Tab bzw. x), Anzeige „L … mm · ∠ …°“. Entscheidung: Winkel
  absolut zur x-Achse der Skizze (wie die Anzeige in Shapr3D), nicht
  relativ zur vorigen Seite. Leeres Feld = Wert der Maus. Kein Kern-Test
  (Tastatur in main.ts). Im Browser mit echten Tastendruck-Ereignissen:
  40, Tab, 30, Enter → Linie 40,0000 mm unter 30,0000°.
- 2026-10-29 T5.14: polyPoint nimmt nach einer Bogen-Seite deren
  Endtangente vorn in die Fangrichtungen (gewinnt bei Gleichstand gegen
  waagrecht/senkrecht); beim Absetzen Con tan(neue Seite, Bogen). Der
  vom letzten Punkt gezogene Bogen war schon geometrisch tangential,
  jetzt merkt er sich das auch als Con tan(Bogen, Vorgänger), auch wenn
  er die Form schließt. Test: im Browser gezeichnete Form (Linie, Bogen,
  tangential weiter) mit h + 2× tan, Punkt 4 gezogen → beide Übergänge
  bleiben tangential. Im Browser: „tangential an Bogen 2“, geschlossen,
  Endtangente exakt (cos = 1). 54 Tests grün.
- 2026-10-29 T5.13: dirSnap() in model.ts (Test) legt den Zeigerpunkt auf
  die nächste Richtung innerhalb 3°, polyPoint() in main.ts sammelt die
  Richtungen: Achsen der Skizze, eigene gerade Seiten (∥ und ⟂), gerade
  Kanten von Körpern und Skizzen in derselben Ebene ab 5 mm (kürzere
  wären Stücke gerundeter Kanten). Vorrang: Punktfang > Ausrichten an
  Punkten > Richtungsfang > Raster. Beim Absetzen wird ∥/⟂ zu einer
  eigenen Seite als Con gemerkt und beim Schließen ins Feature
  geschrieben (zu fremden Kanten nur Geometrie: Abhängigkeiten gibt es
  nur innerhalb einer Skizze). Gilt für Linie und Hilfslinie, nicht für
  Spline und Bogen. Im Browser (Draufsicht): schräge Seite, dann
  „rechtwinklig zu Seite 1“, geschlossen → 90,0000°, Con perp(1,0).
  53 Tests grün.
- 2026-10-29 T5.6: Con 'rad' (Radius der Bogen-Seite i) und 'tan' (Seiten
  i, j tangential). sketchSolver legt für jede Bogen-Seite mit so einem
  Maß Mittelpunkt + planegcs-arc + arc_rules an (Anfang/Ende im
  Gegenuhrzeigersinn, bei negativem bulge vertauscht), arc_radius bzw.
  tangent_la/tangent_aa; danach neuer bulge aus Mitte und Endpunkten.
  Entscheidung: nur Bögen mit Bogen-Maß werden echte Bögen, damit
  bestehende Skizzen beim Ziehen genau wie vorher reagieren. Tests: R 8
  bei waagrechter Nachbarseite, tangential → Mitte senkrecht über dem
  Anschluss, ohne Maß bulge unverändert, R 2 bei festen Enden (Sehne 10)
  = Widerspruch. Im Browser: R 15 eingetippt → Bogen 15,000, dann
  tangential an Seite 1 → Radius ⟂ Seite 1 (Skalarprodukt 3e-6), R hält.
  Offen bleibt der tangentiale Fang beim Zeichnen (T5.14). 52 Tests grün.
- 2026-10-29 T5.18: linePlane() in model.ts: gerade Linie ohne Bögen →
  RefPlane durch die Linienmitte, u = Linienrichtung, n = Linie ×
  Skizzennormale, ausgeblendet; dazu ein Split auf den Körper der Linie.
  Knick oder Bogen → kein Knopf, Hinweis „nur an einer geraden Linie“.
  Entscheidung: zwei Schritte im Baum (Ebene + Teilen) statt eines neuen
  Feature-Typs, weil Teilen an Ebenen schon benannt und getestet ist
  (T1.3d). Abkürzung: die Ebene ist eine Momentaufnahme der Linie,
  wandert die Linie, bleibt die Ebene stehen. Test: Quader 20×10×10,
  Linie quer bei x = 15 → Körper 1500 + 500 mm³. Im Browser: Knopf,
  Körper #1 und #4, Naht an der Linie. 51 Tests grün.
- 2026-10-29 T5.12: Extrude.type 'line' (mit open: true, damit Einrasten,
  Trimmen/Verlängern und Punktziehen der offenen Hilfslinien ohne
  Sonderfälle greifen); noFace() fasst Hilfslinie und Linie zusammen
  (nie extrudiert, nicht in Bereichen, Punkte ohne Flächenprüfung),
  bounds() rechnet für alles mit pts. Linien-Werkzeug: Enter und
  Rechtsklick beenden jetzt offen (vorher: schließen), Esc behält ab zwei
  Punkten das Gezeichnete, Klick ohne Ziehen auf den letzten Punkt und
  Doppelklick beenden ebenfalls; der Doppelklick setzt danach kein Raster.
  Werkzeug bleibt nach einer offenen Linie aktiv. Spline und Bogen
  schließen wie bisher. Entscheidung zu T5.16: „Esc beendet die Kette“
  ist dort die erste Stufe. Test: Linie auf der Deckelfläche baut ohne
  Fehler, bekommt ihren Flächenbezug, teilt keinen Bereich. Im Browser:
  Doppelklick → Linie 3 Punkte, Esc → Linie 2 Punkte, Klick auf Anfang →
  geschlossene Skizze. 50 Tests grün.
- 2026-10-29 T5.11: workPoints() in main.ts beim Anlegen des Rasters:
  Flächenmitte = flächengewichteter Schwerpunkt der Dreiecke der
  angeklickten B-Rep-Fläche (Hit trägt jetzt deren Dreiecksbereich), aus
  den Kanten in der Ebene: Enden, Mitten gerader Kanten, Mittelpunkte
  gekrümmter Kanten (Umkreis aus drei Kantenpunkten, Kreis aus zwei
  Hälften ergibt denselben Punkt). Weiß markiert, in snapPoints, damit
  auch Fluchtlinien und Beschriftung „Mitte“/„Endpunkt“. Gefunden beim
  Prüfen: über einer Bohrung traf der Strahl deren Boden, die Skizze wäre
  dort gelandet → sketchOn: liegt das Raster vor der getroffenen Fläche
  und innerhalb des Rechtecks um die Rastpunkte, gilt das Raster (sonst
  bleibt z. B. die Vorderseite erreichbar). Abkürzungen: Punkte werden
  beim Anlegen berechnet, nach Umbau erst mit neuem Raster aktuell;
  „innerhalb“ ist ein Rechteck. Im Browser geprüft (Zeiger-Durchlauf):
  Flächenmitte, Kantenmitte, Bohrungsmitte = „Mitte“, Ecke = „Endpunkt“.
  Kein Kern-Test (arbeitet auf dem Anzeige-Netz), 49 Tests grün.
- 2026-10-29 T5.10: sketchPoint zeigt den Einrastpunkt jetzt immer (vorher
  nur bei Punkten/Linien), Farbe nach Art; Beschriftung „Mitte“ über
  keyPoints(f, 'mid') (Seiten- und Kreismitten). Linie, Bogen, Spline und
  Hilfslinie zeigen ihn schon vor dem ersten Klick. Raster „Auto“
  (display.grid = 0): kleinster Schritt aus 0,1/0,5/1/5/10/50 mm, der
  mindestens 8 px breit ist (autoStep, Test). Neuer Standard ist Auto;
  gespeicherte Einstellungen bleiben, wer 1 mm gespeichert hat, stellt
  unten links auf Auto. Nebenbei: flatMap(keyPoints) hätte mit dem neuen
  Parameter den Index als 'mid' bekommen → überall als Lambda. Im Browser
  geprüft (Zeiger über den Deckel geführt): Raster, Endpunkt, Mitte, auf
  Linie, Ausrichten erscheinen; 49 Tests grün.
- 2026-10-29 T5.9: lookAtWork() in main.ts: Leertaste mit liegendem Raster
  (Zeiger über derselben Ebene oder im Leeren) fliegt in 300 ms senkrecht
  auf die Rastermitte, Abstand so, dass der Umriss des Bauteils in dieser
  Ebene ins Bild passt; die Ansicht davor wird gemerkt, nochmal Leertaste
  fliegt zurück. Neues Raster oder Raster weg vergisst sie. Abkürzung:
  Kamera-oben bleibt die Welt-Hochachse, weil OrbitControls kein anderes
  up verträgt; senkrechte Flächen stehen damit richtig, liegende zeigen
  −z nach oben wie die Draufsicht. Im Browser geprüft: Vorderseite →
  Ansicht VORNE, zurück, Deckel → OBEN. Kein Kern-Test (nur Kamera).
- 2026-10-29 T5.8: Rechtsklick (ohne Ziehen) bei laufendem Zug = Enter:
  Linie schließt zur Fläche, Hilfslinie und Zug-Pfad enden offen. Nebenbei
  gefunden: Enter auf einem Zug, der keine Fläche ergibt (z. B. 2 Punkte),
  hat die gezeichneten Punkte still verworfen → jetzt Hinweis, Punkte
  bleiben, weiterzeichnen oder Esc. Offene normale Linien kommen mit
  T5.12. Im Browser geprüft: 2 Punkte + Rechtsklick → Hinweis, kein Menü;
  dritter Punkt + Rechtsklick → Dreieck. Kern-Test entfällt (reine
  Oberfläche), 48 Tests grün.
- 2026-10-29 T5.7: Ursache gefunden, kein WebView2-Sonderfall: #toolbar
  hatte top:120px und bottom:150px plus justify-content:center, wuchs
  also mit der Fensterhöhe, die Knöpfe saßen in der Mitte. Jetzt
  max-height statt bottom. Im Browser bei 1600×1080 nachgestellt: Panel
  120–615 px statt bis 930 px; bei 768 px Fensterhöhe passt es ohne Scrollen.
- 2026-10-29 T1.15: Die Anker liefern bei unsicherem Treffer `confirm` =
  Bezug auf das Gefundene (Skizze: face, Rundung/Fase: edge, Schale und
  Fläche löschen: faces, Versetzen: face); buildBody gibt sie als Map
  `confirm` weiter, der Worker reicht sie durch. Seitenfeld eines gelben
  Schritts zeigt „Bezug übernehmen“ (mit Rückgängig-Schritt), danach baut
  der Schritt sicher. Entscheidung: nur auf Knopfdruck, nie automatisch
  (T1.7: nicht still umschreiben). Tests: Grundkörper neu gezeichnet →
  Bohrung und Fase bestätigen → nichts mehr gelb; gekippte Seite (T1.13)
  → bestätigen → grün. Im Browser geprüft: Bohrung auf gekippter Stirnseite
  gelb, Knopf, danach grün, Bezug trägt die neue Normale.
- 2026-10-29 T1.13: anchorSketch dreht die Skizze, wenn ihre Fläche kippt:
  Drehachse = Schnittgerade von alter Skizzenebene und neuer Fläche
  (Scharnier), Winkel = n → N; Ebene, Bereiche und Drehachse werden als
  patch nachgeführt. Entscheidung: gekippt bleibt der Bezug gelb, weil der
  Fingerabdruck (alte Normale) nicht passt; bestätigen kommt mit T1.15,
  nicht still. Umdrehen um mehr als ~90° = sichtbarer Fehler. Test:
  Vieleckecke wandert, Seite kippt um die stehende Kante, Bohrung bleibt
  5 mm vom Scharnier in der neuen Ebene. Im Browser geprüft (17,49 cm³,
  Bohrung gelb auf der schrägen Stirnseite).
- 2026-10-29 T0.1: Jedes DONE-Paket gegen Code, Tests und Log geprüft.
  Beleg je Paket: Kern-Test mit Paketnummer im Namen (T1.3a–d, T1.4–T1.9,
  T1.12, T2.1, T2.2, T3.1, T3.4, T5.1, T5.2, T5.4, T6.1–T6.3, T6.1b) oder
  benannte Prüfung im Log (T1.0/T1.1 = Dokumente, T1.1b ohne Code, T1.10,
  T2.3, T2.4, T4.1, T4.2, T5.3 im Browser bzw. in der gebauten App).
  Zwei Lücken ohne Beleg gefunden und mit Test geschlossen, kein Zurücksetzen
  nötig: Radius-Maß (T3.3, war weder getestet noch im Log genannt) und
  „Rundungen/Fasen werden mitkopiert“ (T6.3, Fase am Bohrungsrand
  mitgespiegelt). Die schon korrigierten Teile von T5.4/T6.3 liegen in
  T5.6/T6.4. replicad: package.json steht auf ^1.2.0 → Offene Frage
  gestrichen, T7.2 bleibt als Pflicht fürs nächste Update.
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
- 2026-10-29 Messen (T5.17): Was genau geht schief? Rastet der Klick
  nicht auf den gewünschten Punkt, kommt ein falscher Wert, oder
  reagiert es gar nicht? Antwort soll aus den Feldnotizen (T0.2) kommen.
- 2026-10-29 macOS- und Linux-Builds (T4.4): bauen oder weglassen? Der
  Weg über GitHub Actions ist durch .github/workflows/opencascade.yml
  schon erprobt, es kostet also vor allem Zeit, nicht Risiko. Ohne
  Testgeräte bleibt es aber ungeprüftes Binärpaket. Vorschlag:
  zurückstellen, bis jemand außer dem Nutzer die App haben will.

Erledigt:
- KI-Assistent (ADR 0002): direkt einfügen mit Übernehmen/Verwerfen, Schlüssel im
  App-Speicher (v1), tauri-plugin-http – alles wie vorgeschlagen (Nutzer 2026-10-29).
- Schrift für Text: DejaVu Sans mitgeliefert (Freigabe des Nutzers 2026-10-29).
- replicad 1.2.0: geklärt in T0.1, package.json steht auf 1.2.0.
- KI-Anbieter: entschieden, siehe Epic 8.
- Weg A oder B beim Skizzieren: entschieden für A zuerst, siehe T5.12
  und Epic 9.
