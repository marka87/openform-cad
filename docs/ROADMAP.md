# Roadmap

Konkrete Aufgaben je Meilenstein. Ziele und Begründungen stehen in [PLAN.md](PLAN.md).
Regel: ein Meilenstein nach dem anderen, jeder endet mit etwas, das man im Browser ausprobieren kann.
Vorbild ist der Funktionsumfang von Shapr3D (Stand Okt. 2026); was dort Bezahl-, Cloud- oder Hardware-Funktion ist, steht unten unter „Nicht geplant“.

## M0 – Prototyp ✅
- [x] Rechteck und Kreis skizzieren, Push/Pull, Maßfelder, Rückgängig, STL-Export

## M1 – Echter Kern ✅
- [x] Projekt auf Vite + TypeScript umstellen, Prototyp übernehmen
- [x] OpenCascade (replicad, WASM) einbinden: Körper sind echte Volumenkörper
- [x] Herausziehen vereinigt, Hineindrücken in eine Fläche schneidet (Bohrung, Tasche)
- [x] STEP- und STL-Export aus dem Kern
- [x] Kern in einen Web Worker verlegen (Oberfläche bleibt flüssig)
- [x] Fasen und Rundungen an Kanten (Kante wegziehen = Rundung, hineinschieben = Fase; Art auch im Seitenfeld)
- [x] STEP-Import (Öffnen → .step/.stp; Körper lässt sich bohren und runden, aber nicht ziehen)
- [x] Hinweis, solange der Kern lädt (WASM ca. 23 MB, gzip ca. 7 MB)

## M2 – Skizzieren (großteils fertig)
- [x] Linien-Werkzeug: Vieleck Punkt für Punkt, Seitenflächen parallel verschiebbar
- [x] Bogen: im Linien-Werkzeug vom letzten Punkt aus ziehen = tangentialer Bogen
- [x] Bogenflächen ziehen (Radius ändern, Endpunkte bleiben)
- [x] Überschneidende Skizzen zerfallen in Bereiche; Ziehen nimmt nur den angeklickten Bereich
- [x] Versatz: neue Skizze im Abstand um eine flache Skizze (Seitenfeld)
- [x] Spline-Werkzeug (S): geschlossene glatte Kurve durch geklickte Punkte
- [x] X/Y/Z-Achsen im Raum und Maßstab unten rechts (passt sich dem Zoom an)
- [x] Einrasten an Punkten, Kantenmitten, Schnittpunkten und Linien; waagrecht/senkrecht ausrichten; Shift schaltet ab
- [x] Skizzen nachträglich bearbeiten: Punkte von Vieleck/Spline ziehen (auch nach dem Extrudieren)
- [x] Maße beim Zeichnen eintippen (Rechteck „20x10“, Radius, Linienlänge)
- [x] Weitere Formen: regelmäßiges Vieleck (n Ecken), Langloch
- [x] Ellipse (I), Bogen über 3 Punkte (A, wechselt mit der Linie L)
- [x] Bemaßungen und Abhängigkeiten mit planegcs für Vielecke: Seitenlänge, waagrecht, senkrecht, parallel, rechtwinklig, gleich lang; Maßzahlen an den Seiten, gelten auch beim Ziehen
- [ ] Weitere Abhängigkeiten: Winkel, Radius/Tangente an Bögen, Abstand Punkt–Punkt über Seiten hinweg, fester Punkt, Bezug zu anderen Skizzen
- [x] Waagrecht/senkrecht gezeichnete Seiten bekommen automatisch die Abhängigkeit
- [ ] Weitere automatische Abhängigkeiten aus dem Einrasten (auf Linie, im Punkt)
- [x] Skizzen spiegeln und als Muster (Reihe, Kreis) vervielfachen – gilt auch für Körper-Features, siehe M3
- [x] Trimmen und Verlängern von Hilfslinien (T); geschlossene Skizzen bilden Bereiche
- [x] Hilfslinien (G): bilden keine Fläche, nur zum Einrasten
- [x] Raster auf einer Fläche (Doppelklick oder Leertaste), passend zum Bauteil; Skizzen landen in dieser Ebene
- [x] Versetzte Skizzenebenen (Hilfsebene, Werkzeug E)

## M3 – Modellieren
- [x] Feature-Baum (Liste „Schritte“): anzeigen, auswählen/ändern, ein-/ausschalten, umsortieren
- [x] Feature-Baum: „bis hier“ zurückspulen (neue Schritte kommen dorthin), umbenennen (Doppelklick), per Ziehen umsortieren
- [x] Skizzen, Rundungen und Schalen hängen an ihrer Fläche/Kante und wandern mit (Epic 1, docs/TASKS.md)
- [x] Mehrere Körper: Skizze auf dem Boden = neuer Körper, auf einer Fläche = dessen Körper; Körperliste
- [x] Körper kopieren (Strg+D)
- [x] Körper benennen, ein-/ausblenden, eigene Farbe
- [ ] Körper eines Features nachträglich ändern
- [x] Boolesche Operationen zwischen Körpern: vereinigen, abziehen, Schnittmenge
- [x] Körper verschieben und drehen (Griffe mit 1 mm/15° Raster oder Zahleneingabe)
- [x] Körper skalieren (um die Mitte, in %)
- [x] Drehen (Revolve) einer Skizze um ihre x- oder y-Achse, Winkel einstellbar
- [x] Drehkörper abziehen (Nut, Häkchen im Seitenfeld)
- [ ] Um beliebige Kante drehen
- [x] Schale: Wandstärke, eine Fläche offen (Werkzeug H)
- [x] Schale mit mehreren offenen Flächen (H, Shift+Klick)
- [ ] Fläche versetzen (Offset Face) und Fläche löschen
- [x] Körper an einer Hilfsebene teilen
- [ ] Körper an einer Fläche teilen
- [x] Spiegeln und Muster (Reihe, Kreis) für Features; Achse/Ebene durch den Ursprung
- [ ] Muster und Spiegeln an beliebiger Kante/Fläche, inklusive Rundungen
- [x] Loft: Übergang zwischen zwei flachen Skizzen (zweite mit Shift dazu wählen)
- [x] Sweep (Profil entlang Pfad, offen/geschlossen, mit Vorschau, auch als Abzug)
- [x] Rundung/Fase an mehreren Kanten auf einmal
- [ ] Variable Rundung
- [x] Bohrungsvorlagen: Kernloch für M3–M12, Senkung
- [ ] Gewinde als echte Geometrie oder Kennzeichnung in der Zeichnung
- [x] Werkzeugsuche (Strg+K) über alle Werkzeuge und Befehle

## M4 – Ansicht, Messen, Darstellung
- [x] Ansichten Iso/Oben/Vorne/Rechts per Klick oder Taste 0–3, Einpassen (F)
- [x] Ansichtswürfel zum Anklicken, Doppelklick zentriert
- [x] Messen: Abstand zwischen zwei Punkten (M), Volumen und Oberfläche des Körpers
- [x] Messen: Winkel zwischen zwei Flächen, Masse aus Werkstoff
- [ ] Messen: Fläche einer einzelnen Fläche
- [x] Schnittansicht: Ebene durch die Körpermitte senkrecht zu X, Y oder Z
- [x] Schnittansicht: Ebene verschieben (Regler), Schnittfläche gefüllt
- [x] Drahtmodell, transparent, Kanten an/aus
- [x] Körperfarbe (Anzeige)
- [x] Werkstoffe mit Dichte, Farbe je Körper im Modell gespeichert
- [x] Rendermodus: Umgebungslicht (RoomEnvironment), glänzenderes Material, ohne Raster

## M4b – Bedienkomfort (Feinschliff nach Vorbild Fusion, Onshape, SketchUp) ✅
- [x] Fläche/Kante beim Überfahren hervorheben; Zieh-Vorschau grün (dazu) / rot (abziehen)
- [x] Einrast-Beschriftung (Punkt, Schnittpunkt, auf Kante, Ursprung, ausgerichtet), Hilfslinien in Achsfarben
- [x] Eingabefelder am Zeiger (Tab wechselt), Maß beim Ziehen einer Fläche eintippen
- [x] Rechtsklick-Menü, Mehrfachauswahl (Shift), mehrere Kanten auf einmal runden/fasen
- [x] Kopieren/Einfügen/Duplizieren von Features und ganzen Körpern, Leertaste = letztes Werkzeug
- [x] Ansichtswürfel, weiche Kamerafahrten, Zoom zur Maus, Doppelklick zentriert
- [x] Weiche Schatten, Umgebungslicht, dicke glatte Kanten
- [x] Symbole und Tooltips, einstellbare Rastergröße
- [x] Hilfsebenen (Werkzeug E)
- [x] Kanten eines Körpers in die Skizzenebene projizieren (P bei Flächenraster)
- [ ] Zeitleiste unten (wie Fusion) statt Liste
- [x] Einheiten mm/Zoll (Anzeige und Eingabe)
- [ ] Umgebungsverdeckung (AO) im Rendermodus

## M5 – Technische Zeichnungen
- [x] Erste Zeichnung als SVG: Vorder-, Drauf-, Seitenansicht mit verdeckten Kanten
- [x] Iso-Ansicht, Blatt A4/A3 mit Normmaßstab, Schriftfeld
- [x] Gesamtmaße je Ansicht
- [x] Einzelmaße: Länge, Durchmesser, Radius, Winkel, Toleranz; folgen Modelländerungen
- [ ] Beschriftungen, Schnittansichten, Detailansichten
- [ ] Schnitt- und Detailansichten
- [x] PDF über Drucken („Als PDF speichern“), Ansichten als DXF (Bögen als kurze Strecken)

## M6 – KI-Assistent
- [ ] Eingabefeld „Beschreibe dein Teil“, eigener API-Schlüssel, abschaltbar
- [ ] KI erzeugt Features (JSON), nicht Meshes; ein Schritt = ein Rückgängig
- [ ] Ändern per Text („Wand 2 mm dicker“)
- [ ] Fehler erklären (z. B. fehlgeschlagene Fase)
- [ ] Skizze aus Foto oder Handskizze vorschlagen
- [ ] Testsammlung mit Beschreibungen, Ziel ≥ 70 % brauchbare Teile

## M7 – Desktop-Release v1.0
- [ ] Tauri-Build für Windows, macOS, Linux; Installer, Auto-Update
- [ ] Eigenes Dateiformat `.ofc` (Feature-Liste + eingebettete Importe), Zuletzt-geöffnet-Liste
- [x] OBJ-Export
- [ ] Weitere Formate: IGES-Import/-Export, 3MF-Export
- [ ] Touch- und Stift-Bedienung, SpaceMouse, eigene Tastenkürzel
- [ ] Einsteiger-Tour und kurze Lernvideos
- [ ] Doku, Website, öffentliches GitHub-Repo

## Nicht geplant (vorerst)
- Native Formate anderer Hersteller (SLDPRT, PRT, CATPART): geschlossene Formate, mit OpenCascade nicht lesbar
- AR-Ansicht, Apple Vision Pro: braucht eigene Apps je Gerät
- Team-Cloud, Freigabelinks mit Kommentaren: braucht einen eigenen Server
- KI-Renderbilder (Generative Render): erst nach M6, wenn überhaupt
