# Plan: OpenForm CAD

## Vision
Ein 3D-CAD-Programm, das sich so intuitiv bedienen lässt wie Shapr3D, aber kostenlos und quelloffen ist wie FreeCAD. Eine KI hilft beim Modellieren, ist aber nie Pflicht.

## Ziele
1. **Intuitiv:** Wer neu anfängt, modelliert in unter 10 Minuten sein erstes brauchbares Teil, ohne Tutorial. Man arbeitet direkt am Modell (Fläche anfassen und ziehen), statt sich durch Menüs zu klicken.
2. **Kostenlos und offen:** Open Source (MIT oder LGPL), kein Konto, kein Abo, kein Cloud-Zwang.
3. **Präzise:** Ein echter CAD-Kern (B-Rep), keine reine Mesh-Spielerei. Exakte Maße, STEP-Export für die Fertigung.
4. **Offline-fähig:** Läuft als Desktop-App (Windows, macOS, Linux) und zusätzlich im Browser.
5. **Hilfreiche KI:** Teile per Text beschreiben, Vorschläge bekommen, Fehler erklärt bekommen. Das Ergebnis ist immer normal weiter bearbeitbar.

## Nicht-Ziele (vorerst)
- Kein Ersatz für SolidWorks oder CATIA im Profi-Maschinenbau
- Keine Simulation (FEM), kein CAM, keine Zeichnungsableitung in v1
- Keine Echtzeit-Zusammenarbeit mehrerer Nutzer in v1

## Zielgruppe
Maker und 3D-Druck-Fans, Schüler und Studenten, Hobby-Konstrukteure und kleine Werkstätten. Also alle, denen FreeCAD zu sperrig und Shapr3D zu teuer ist.

## Technik
| Bereich | Wahl | Grund |
|---|---|---|
| Geometrie-Kern | OpenCascade (über replicad / opencascade.js, WebAssembly) | derselbe Kern wie bei FreeCAD, ausgereift, kostenlos |
| Darstellung | Three.js | schnell, bewährt, schon im Prototyp im Einsatz |
| Oberfläche | TypeScript + React (oder Svelte) | gut wartbar |
| Desktop | Tauri | klein, schnell, offline |
| Datenmodell | Feature-Historie (parametrisch) als JSON | Rückgängig, Bearbeiten im Nachhinein, versionierbar |
| KI | Claude API, optional lokales Modell | Modelle erzeugen, Code für replicad schreiben |
| Formate | STEP, STL, 3MF, eigenes `.ofc` | Fertigung, 3D-Druck, Austausch |

## Meilensteine

**M0: Prototyp (fertig)**
Rechteck- und Kreis-Skizzen, Push/Pull, Größe über Seitenflächen ändern, Maßfelder, Rückgängig, STL-Export.

**M1: Echter Kern (ca. 3–4 Wochen)**
- OpenCascade einbinden, die Körper werden echte Volumenkörper
- Boolesche Operationen: Hineindrücken schneidet (Bohrung, Tasche), Herausziehen vereinigt
- Fasen und Rundungen an Kanten
- STEP-Import und -Export

**M2: Skizzieren richtig (ca. 4 Wochen)**
- Linie, Polylinie, Bogen, Spline, Versatz, Trimmen
- Bemaßungen und Abhängigkeiten (parallel, rechtwinklig, tangential) mit einem Constraint-Solver (z. B. planegcs)
- Geschlossene Bereiche werden automatisch erkannt, wie bei Shapr3D

**M3: Modellieren erweitert (ca. 4 Wochen)**
- Drehen (Revolve), Sweep, Loft, Schale, Muster (linear und kreisförmig), Spiegeln
- Feature-Baum mit nachträglicher Bearbeitung
- Messen, Schnittansicht, Darstellung transparent oder als Drahtmodell

**M4: KI-Assistent (ca. 3 Wochen)**
- Text zu Teil: „Montageplatte 100×60×5 mit 4 Bohrungen M5 in den Ecken“
- Ändern per Sprache: „mach die Wand 2 mm dicker“
- Erklären: Warum ist eine Fase fehlgeschlagen, wie lässt sich das beheben?
- Datenschutz: Die KI ist abschaltbar, man nutzt den eigenen API-Schlüssel oder ein lokales Modell

**M5: Desktop-Release v1.0 (ca. 2–3 Wochen)**
- Tauri-Build, Installer, automatische Updates
- Touch- und Stift-Bedienung (Tablet), Tastenkürzel, Einsteiger-Tour
- Dokumentation, Website, GitHub-Repo

**Später:** Baugruppen, 2D-Zeichnungen (PDF/DXF), Plugins, Gewinde und Normteile, Blech.

## Bedienkonzept (Leitregeln)
- **Kontext statt Menüs:** Was man auswählt, bestimmt, welche Werkzeuge erscheinen.
- **Ziehen zuerst, tippen danach:** Man zieht grob und gibt danach das exakte Maß ein.
- **Wenige Werkzeuge:** Maximal etwa 8 sichtbare Werkzeuge, alles andere über die Suche (Strg+K).
- **Alles lässt sich rückgängig machen,** auch Schritte der KI.

## Messbare Erfolgskriterien für v1.0
- Ein einfacher Halter (Platte, Bohrungen, Fase) ist in unter 3 Minuten modelliert
- STEP-Dateien lassen sich ohne Fehler in FreeCAD und Fusion öffnen
- Mittlere Modelle (etwa 50 Features) laufen flüssig mit 60 fps
- Die KI erzeugt in mindestens 70 % der Testbeschreibungen ein brauchbares Teil

## Risiken
| Risiko | Gegenmaßnahme |
|---|---|
| OpenCascade als WASM ist groß (ca. 10 MB) und manchmal langsam | Lazy Loading, Berechnung in einem Web Worker |
| Der Constraint-Solver ist komplex | fertige Bibliothek (planegcs aus FreeCAD) nutzen |
| Der Umfang wächst ausufernd | Nicht-Ziele strikt einhalten, ein Meilenstein nach dem anderen |
| KI-Ergebnisse sind ungenau | Die KI erzeugt Features statt Meshes, man kann sie also immer nachbearbeiten |

## Nächste Schritte
1. ~~Projektordner und Git-Repo anlegen~~
2. Den Prototyp nach TypeScript + Vite überführen
3. M1 starten: OpenCascade einbinden und die erste Boolesche Operation umsetzen
