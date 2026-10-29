# Änderungen

Neueste oben. Einzelheiten und Begründungen stehen im Log in [TASKS.md](TASKS.md).

## 2026-10-29

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
- Echte Teile bauen und Stolperstellen in [FELDNOTIZEN.md](FELDNOTIZEN.md)
  sammeln (T0.2, T0.3). Danach ordnet sich die Reihenfolge neu.
- KI: Runden/Fasen, Muster und Werte ändern (T8.4), Fehler erklären (T8.5),
  Kernfehler an die KI zurückgeben (T8.6).
