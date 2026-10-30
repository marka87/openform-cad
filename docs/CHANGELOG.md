# Änderungen

Neueste oben. Einzelheiten und Begründungen stehen im Log in [TASKS.md](TASKS.md).

Versionsnummer `MAJOR.MINOR.PATCH`, steht in `package.json` (die
Desktop-App liest sie dort) und in `src-tauri/Cargo.toml`:
- **PATCH** (0.2.0 → 0.2.1): nur Fehlerbehebungen, nichts Neues zu lernen
- **MINOR** (0.2.x → 0.3.0): neue Werkzeuge oder Funktionen
- **MAJOR** (→ 1.0.0): erst, wenn das Dateiformat `.ofc` als stabil gilt
  und alte Dateien garantiert aufgehen

## 0.4.3 — 2026-10-30

- **Schale auf einem Übergang (Loft) bleibt nicht mehr still massiv.**
  Kreis → Kreis wird jetzt richtig hohl (vorher rot). Rechteck → Kreis
  schafft der Kern noch nicht; der Schritt wird rot mit klarer Meldung,
  statt ohne Wirkung und ohne Hinweis durchzulaufen.
- **Zoll durchgängig:** Volumen und Oberfläche in in³/in², Raster,
  Ziehen und Griffe rasten auf runde Zollwerte (0,1 in statt 2,54 mm in
  krummen Zahlen). Die Rasterauswahl zählt in der gewählten Einheit.

## 0.4.2 — 2026-10-30

- **Messen rastet zuverlässig an Ecken ein.** Weiter hinten liegende
  Ecken rasteten bisher oft nicht ein, der Punkt landete daneben auf der
  Kante und das Maß war falsch (z. B. 19,41 statt 20 mm). Der Fangradius
  gilt jetzt in Bildschirm-Pixeln; verdeckte Ecken rasten nicht ein.

## 0.4.1 — 2026-10-30

- **Bohrung, die nichts trifft, wird rot** („Trifft den Körper nicht –
  schneidet nichts“), z. B. eine Bohrung in der Öffnung einer Schale.
  Vorher blieb der Schritt unauffällig, obwohl nichts passierte.
- **Muster-Pfeil** bleibt am letzten Exemplar, auch wenn der Körper
  danach verschoben oder gedreht wird.
- **Muster über Skizzen mehrerer Körper:** Jede Kopie landet im Körper
  ihrer Quelle, nicht mehr alle im ersten.

## 0.4.0 — 2026-10-30

- **KI auf Seitenwänden:** Rechteck, Kreis und Bohrung lassen sich auf
  die Seiten eines Rechteck-Schritts legen (vorne, hinten, links,
  rechts), z. B. Löcher in die Wand eines Gehäuses. „durch“ geht bei
  einer Schale nur durch die Wand.
- **KI-Lochmuster:** Reihe, Raster oder Lochkreis in einem Auftrag, z. B.
  „Lüftungsraster rechts: 4 Reihen mit je 6 Löchern ⌀3, Abstand 6“. Die
  Lagen rechnet das Programm, nicht die KI; Reihe und Raster werden ein
  bearbeitbarer Muster-Schritt.
- **KI legt nichts doppelt an:** Wiederholte Aufrufe und Bohrungen an
  derselben Stelle werden abgelehnt. „Die Schale“ oder „das Gehäuse“ als
  Ziel meint den Körper.
- **Muster nimmt Rundungen und Fasen der Quelle mit** (wenn sie vor dem
  Muster angelegt wurden). Jede Kopie hat eigene Flächennamen, Skizzen
  auf einer bestimmten Kopie bleiben dort.
- **Kreis-Muster und Spiegeln sind jetzt ein Muster-Schritt** wie die
  Reihe: „Kreis-Muster 6“ bzw. „Spiegeln“ im Baum, Anzahl nachträglich
  änderbar, Kopien folgen der Quelle. Der Lochkreis der KI nutzt das
  ebenfalls.

## 0.3.3 — 2026-10-30

- **Ende-Taste** bei einer zu schmalen Form: Die Form bleibt an der Maus
  mit dem Hinweis „zu schmal“, statt still zu verschwinden (Rest von 0.3.2).
- **KI ändert keine Maße ins Negative:** Breite, Tiefe, Radius und
  Wandstärke müssen positiv sein; nur die Höhe hat ein Vorzeichen.
- **KI hängt nicht mehr bei „CAD-Kern prüft …“,** wenn der Prüflauf
  selbst abbricht.
- **429 „Zu viele Anfragen“ (Groq-Gratis-Stufe):** Die KI wartet die vom
  Anbieter genannte Zeit (bis 60 s) und versucht es einmal erneut. Bricht
  ein Auftrag trotzdem ab, bleibt das schon Angelegte erhalten
  (Übernehmen / Verwerfen).

## 0.3.2 — 2026-10-30

- **Rechteck verschwand still:** Bei schräger Sicht auf den Boden rastete
  der Endpunkt oft auf dieselbe Rasterlinie wie der Start, eine Seite wurde
  0 und das Rechteck verschwand ohne Meldung. Jetzt bleibt die Form an der
  Maus mit dem Hinweis „zu schmal“ (gilt für alle Formen mit zwei Klicks).
- **Ladeanzeige** „CAD-Kern wird geladen“ bleibt stehen, auch wenn man
  währenddessen ein Werkzeug wählt (Klicks wirken erst danach).

## 0.3.1 — 2026-10-30

- **Muster-Kopien lassen sich hineindrücken:** Ziehen an einer Kopie
  (flache Skizze oder schon gebohrtes Loch) ändert die Quelle, alle Kopien
  folgen. Vorher ließ sich nur die Quelle selbst ziehen, am Boden einer
  kopierten Bohrung entstand ein eigener „Fläche versetzen“-Schritt.

## 0.3.0 — 2026-10-30

### Muster
- **Muster ist ein eigener Schritt** („Muster 4 × 5“ im Baum) und bleibt
  bearbeitbar: Anzahl und Abstand je Richtung ändern, **⇄** dreht das
  bestehende Muster um, statt ein zweites anzulegen.
- **Raster in einem Schritt:** „quer dazu“ ergibt Reihen und Spalten
  zugleich, in der Fläche der Skizze.
- **Abstand ziehen:** Orange Pfeile am letzten Exemplar je Richtung.
- Kopien folgen der Quelle: Wird die Quellskizze hineingedrückt oder
  geändert, gehen alle Kopien mit. Klick auf eine Kopie wählt das Muster,
  an der Quelle steht „Im Muster … – bearbeiten“.
- Kreis-Muster und Spiegeln legen vorerst weiterhin Einzelkopien an.

### Oberfläche
- **Werkzeugleiste in Gruppen:** Skizze, Hilfen, Körper, Prüfen.
- **Untermenüs** (Rechteck-Art, Vieleck-Ecken, Transformieren, Messen):
  großer ▾-Knopf, Rechtsklick auf das Werkzeug öffnet sie ebenfalls.

## 0.2.0 — 2026-10-30

### Modellieren
- **Muster in der Fläche:** Achse „x/y der Skizze“ liegt in der Fläche, auf
  der gezeichnet wurde, auch auf Seitenwänden. Knopf **„⇄ Richtung“**.
- **Muster für mehrere Skizzen:** Alle markierten Skizzen werden gleich
  vervielfältigt, z. B. eine Lochreihe in einem Schritt zum vollen Raster.

### KI-Assistent
- **Ändern per Text** an bestehenden Schritten („Wand 2 mm dicker“), die
  Auswahl geht als Bezug mit.
- **„?“ an roten Schritten:** Die KI erklärt, warum ein Schritt scheitert.
- **Korrekturrunden:** Lehnt der CAD-Kern einen KI-Schritt ab, bekommt die
  KI den Grund und darf bis zu zweimal nachbessern.
- Groq-Voreinstellung: `openai/gpt-oss-20b` (llama-3.3-70b gibt es dort
  nur noch für Enterprise). Altes Testergebnis verschwindet beim Wechsel.

### Desktop-App
- Installer lässt sich auch auf einem frisch geklonten Stand bauen
  (WebView2Loader.dll fehlte).
- Versionsnummer wird jetzt gepflegt (vorher immer 0.1.0).

## 0.1.0 — 2026-10-29

### Desktop-App
- **Installer startet auf jedem Windows-Rechner.** Die App brauchte bisher
  `libunwind.dll` aus LLVM-MinGW und `WebView2Loader.dll`, die der Installer
  nicht mitlieferte (Absturz `0xC0000135` auf fremden Rechnern). libunwind ist
  jetzt fest eingebaut, WebView2Loader wird mitinstalliert.
- Bauanleitung für neuere rustup-Versionen (≥ 1.29): einmalig
  `rustup set default-host x86_64-pc-windows-gnullvm`.

### Auswahl und Ansicht
- **Strg/Shift + Klick** nimmt Schritte, Kanten und Einträge der Schrittliste
  einzeln in die Auswahl auf oder heraus, auch den zuerst gewählten.
- **Strg+A** wählt alles. Im Rechtsklickmenü: **„Alle Kreise (Skizzen)
  auswählen“**, ebenso für Rechtecke, Vielecke und Linien.
- **Boden-Raster wächst mit dem Modell** (vorher fest 400 × 400 mm).
- Kurzmeldungen („3 ausgewählt“) verschwinden nicht mehr sofort wieder.

### Modellieren
- **Zug entlang von Körperkanten:** Nach „Zug: Pfad zeichnen“ kannst du Kanten
  nacheinander anklicken, mit Vorschau. Die Kanten sind fest bezogen.
- **Projektion (P) aus der echten Geometrie:** Kreise und Bögen exakt. Die
  Linien wandern mit, wenn sich der Körper ändert. Von Hand getrimmte oder
  gezogene Linien bleiben fest.
- **Schale:** Die Punkte der offenen Flächen wandern mit der Fläche.

### Zeichnung
- **Vorschau der Maßlinie** beim Ablegen (Länge, ⌀, R).
- **Maße in der Iso-Ansicht:** Längen mit wahrer Länge, ⌀/R an Bohrungen.
- **Schräg gesehene Kreise** (Ellipsen) lassen sich als ⌀/R bemaßen.

### Export
- **3MF** für den 3D-Druck: „Zeichnung / mehr“ → „Körper als 3MF“, ein dichtes
  Netz je Körper. Dafür kam keine neue Bibliothek dazu.

### KI-Assistent (neu, standardmäßig aus)
- Entwurf: [adr/0002-ki-assistent.md](adr/0002-ki-assistent.md). Die KI ruft
  nur feste Werkzeuge auf, daraus entstehen normale, bearbeitbare Schritte.
  Sie schreibt keinen Code und erzeugt keine Netze.
- **Einrichten:** „Zeichnung / mehr“ → „KI-Assistent einrichten …“. Dort gibt
  es Voreinstellungen für Groq, lokales Ollama und einen eigenen Anbieter,
  einen Hinweis zum Datenschutz und „Verbindung testen“.
- **Benutzen:** „Zeichnung / mehr“ → „KI fragen …“, z. B. „Platte 100×60×5 mit
  4 Bohrungen M5 in den Ecken“. Werkzeuge: Rechteck, Kreis, Extrudieren und
  Bohrung (auch Gewinde M3–M12). Alles zusammen ist ein Rückgängig-Schritt,
  dazu gibt es „Übernehmen / Verwerfen“.
- Mit lokalem **Ollama + qwen2.5:7b** auf einer RTX 4070 geprüft: 3 von 3
  Läufen ergaben die richtige Platte mit vier M5-Bohrungen, in 6 bis 8 s.
- Lokales Ollama hatte die Desktop-App zunächst abgelehnt (403 wegen der
  Herkunft). Das ist behoben.

### Noch offen
Dieser Abschnitt ist überholt; der aktuelle Stand steht in
[TASKS.md](TASKS.md). Zum Zeitpunkt von 0.1.0 offen: Feldnotizen
sammeln (T0.2, T0.3) sowie die KI-Pakete T8.4 bis T8.6. T0.2, T8.4,
T8.5 und T8.6 sind inzwischen erledigt (siehe 0.2.0 und 0.3.x).
