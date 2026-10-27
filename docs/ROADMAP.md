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

## M2 – Skizzieren (läuft)
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
- [ ] Ellipse, Bogen über 3 Punkte
- [ ] Bemaßungen und Abhängigkeiten mit planegcs (Länge, Abstand, Winkel, Radius; parallel, senkrecht, tangential, gleich, fest)
- [ ] Abhängigkeiten beim Zeichnen automatisch setzen (aus dem Einrasten: waagrecht, auf Linie, im Punkt)
- [x] Skizzen spiegeln und als Muster (Reihe, Kreis) vervielfachen – gilt auch für Körper-Features, siehe M3
- [ ] Trimmen und Verlängern von Linien (heute teils durch Bereiche abgedeckt)
- [ ] Hilfsgeometrie (Konstruktionslinien, die keine Fläche bilden)
- [x] Raster auf Flächen beginnt am Lotpunkt des Ursprungs (nicht mehr am Klickpunkt)
- [ ] Versetzte Skizzenebenen (Ebene im Abstand zu einer Fläche)

## M3 – Modellieren
- [ ] Feature-Baum (Liste links): Schritte anzeigen, ändern, ausblenden, umsortieren, „bis hier“ zurückspulen
- [ ] Skizzen hängen an ihrer Fläche: wird die Fläche verschoben, wandert die Bohrung mit
- [ ] Mehrere Körper: neuer Körper statt Vereinigung, Körper benennen, ein-/ausblenden
- [ ] Boolesche Operationen zwischen Körpern: vereinigen, abziehen, schneiden
- [ ] Körper verschieben, drehen, skalieren, kopieren (mit Griffen und Zahleneingabe)
- [ ] Drehen (Revolve) einer Skizze um eine Achse
- [ ] Schale (Wandstärke, Flächen öffnen)
- [ ] Fläche versetzen (Offset Face) und Fläche löschen
- [ ] Körper teilen (an Ebene oder Fläche)
- [x] Spiegeln und Muster (Reihe, Kreis) für Features; Achse/Ebene durch den Ursprung
- [ ] Muster und Spiegeln an beliebiger Kante/Fläche, inklusive Rundungen
- [ ] Sweep (Profil entlang Pfad) und Loft (Übergang zwischen Profilen)
- [ ] Rundung/Fase an mehreren Kanten auf einmal, variable Rundung
- [ ] Gewinde- und Bohrungsvorlagen (Senkung, Gewindebohrung als Maß)
- [ ] Werkzeugsuche (Strg+K)

## M4 – Ansicht, Messen, Darstellung
- [ ] Ansichtswürfel (oben, vorne, iso per Klick), Kamera auf Auswahl zentrieren
- [ ] Messen: Abstand, Winkel, Fläche, Volumen, Masse (mit Dichte)
- [ ] Schnittansicht (Ebene durch das Modell)
- [ ] Drahtmodell, transparent, Kanten an/aus
- [ ] Farben und Materialien je Körper
- [ ] Rendermodus: realistisches Licht und Materialien (Three.js PBR, Umgebungsbild)

## M5 – Technische Zeichnungen
- [ ] 2D-Zeichnung aus dem Modell: Vorder-, Seiten-, Draufsicht, Iso
- [ ] Maße und Beschriftungen in der Zeichnung
- [ ] Schnitt- und Detailansichten
- [ ] Export als PDF und DXF

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
- [ ] Weitere Formate: IGES-Import/-Export, OBJ- und 3MF-Export
- [ ] Touch- und Stift-Bedienung, SpaceMouse, eigene Tastenkürzel
- [ ] Einsteiger-Tour und kurze Lernvideos
- [ ] Doku, Website, öffentliches GitHub-Repo

## Nicht geplant (vorerst)
- Native Formate anderer Hersteller (SLDPRT, PRT, CATPART): geschlossene Formate, mit OpenCascade nicht lesbar
- AR-Ansicht, Apple Vision Pro: braucht eigene Apps je Gerät
- Team-Cloud, Freigabelinks mit Kommentaren: braucht einen eigenen Server
- KI-Renderbilder (Generative Render): erst nach M6, wenn überhaupt
