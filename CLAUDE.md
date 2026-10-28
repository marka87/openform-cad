# OpenForm CAD — Projektkontext

## Mission
Direkt-manipulatives 3D-CAD im Stil von Shapr3D, auf OpenCascade,
Open Source, kein Konto, kein Abo, kein Cloud-Zwang.
Erfolgsmaß: Teile, die der Nutzer heute in Shapr3D baut (Halter,
Gehäuse, Adapter, Ersatzteile), sind hier ohne Lizenz baubar und als
STEP/STL fertigungstauglich.

## Stack
replicad / opencascade.js (WASM) · Three.js · TypeScript (ohne UI-Framework) · Vite · vitest ·
Tauri (Desktop, noch offen) · planegcs (Constraints) ·
Feature-Historie als JSON · STEP, STL, OBJ, SVG, DXF
(geplant: 3MF, eigenes Dateiformat `.ofc`)

## Harte Randbedingungen
- Echte B-Rep-Volumenkörper. Keine Mesh-Behelfe für Kern-Operationen.
- STEP muss in FreeCAD und Fusion fehlerfrei aufgehen.
- Keine Abhängigkeit, die Konto, Lizenz oder Cloud nachzieht.
- Direktmanipulation zuerst (ziehen), Maßeingabe danach, Dialog zuletzt.
- mm und Zoll überall konsistent.
- OCCT-Last im Web Worker, nicht im Main Thread.
- `main` bleibt immer lauffähig, Kern-Tests grün.
- Direkt in `main` arbeiten und pushen, keine Branches oder PRs.
  Wegwerf-Code (Spikes) liegt außerhalb des Repos.

## Fertig (nicht neu bauen, nicht kaputtmachen)
Solids: Extrudieren, Hineindrücken/Bohren, Verrunden, Fasen, STEP
rein/raus, STL raus.
Skizzen: Rechteck, Kreis, Ellipse, Vieleck, Langloch, Linie+Bogen,
Spline; Snapping, getippte Maße, Constraints, die beim Ziehen halten.
Modellieren: mehrere Körper, Boolesche Operationen, Verschieben/Drehen/
Skalieren/Teilen, Revolve, Schale, Loft, Muster, Spiegeln,
Bohrungsvorlagen, Feature-Baum mit Umsortieren/Umbenennen/Zurückspulen.
UX: Hover-Highlight, Kontextmenü, Ansichtswürfel, Copy/Paste,
Werkzeugsuche, Schatten, Schnittansicht, Messen (Länge, Winkel, Masse).
Zeichnung: Blatt mit 3 Ansichten + Iso, Gesamtmaße, Schriftfeld;
SVG, PDF, DXF.

## Hinweis zu docs/PLAN.md
PLAN.md ist das Visionsdokument und in Teilen überholt: M1–M3 sind
umgesetzt, Zeichnungsableitung ist entgegen der Nicht-Ziele bereits
gebaut. PLAN.md nicht als Aufgabenliste lesen und nicht eigenmächtig
umschreiben. Aktueller Arbeitsstand steht ausschließlich in
docs/TASKS.md.

## Offene Lücken, in dieser Reihenfolge
1. Persistente topologische Referenzen — Skizzen und Features hängen
   nicht stabil an Flächen/Kanten. Verschiebt sich eine Fläche, wandert
   die Skizze darauf nicht mit. Das ist Architektur, kein Feature.
2. Sweep entlang Pfad, mit Vorschau beim Ziehen.
3. Einzelbemaßung in Zeichnungen (Durchmesser, Radius, Winkel,
   Toleranzen), nicht nur Gesamtmaße.
4. Desktop-App über Tauri: Doppelklick-Start, kein `npm run dev`.
5. KI-Assistent (M6 in docs/ROADMAP.md) — erst danach, und nur mit eigenem API-Schlüssel,
   abschaltbar, Ausgabe als bearbeitbare Features statt Meshes.

## Nicht-Ziele
FEM, CAM, Baugruppen mit Gelenken, Rendering, Kollaboration,
Cloud-Speicher, Echtzeit-Zusammenarbeit.

## Definition of Done
Direkt am Modell bedienbar · maßlich eingebbar · übersteht Rebuild und
Zurückspulen · exportiert korrekt nach STEP und STL · hat einen
Kern-Test · funktioniert in mm und Zoll.

## Arbeitsmodus: autonome Schleife
Zustand liegt in `docs/TASKS.md`, nicht im Chat.
Jedes Paket hat Status TODO / DOING / DONE / BLOCKED(+Grund).

Bei jedem Start und nach jedem fertigen Paket:
1. docs/TASKS.md lesen. Steht etwas auf DOING → dort weitermachen.
2. Sonst oberstes TODO nehmen, auf DOING setzen.
3. Umsetzen, Kern-Tests schreiben und grün machen.
4. Commit mit aussagekräftiger Nachricht, Paket auf DONE.
5. Zeile unter "Log": was geändert, was gelernt, was dadurch neu nötig
   wurde (als neue TODO-Pakete unten anhängen).
6. Zurück zu 1. Nicht auf Bestätigung warten.

Ein Paket = ein Commit = unter einer Stunde Arbeit.

Selbst entscheiden bei: Namen, Dateistruktur, Implementierungsdetail,
Teststrategie, kleine UX-Fragen. Entscheidung ins Log, weiter.

Anhalten und fragen nur bei:
- Architekturentscheidung, die später teuer rückgängig zu machen ist
- neuer Abhängigkeit mit Lizenz-, Cloud- oder Konto-Folge
- wenn ein Paket bestehende funktionierende Features brechen würde
- dreimal am selben Paket gescheitert → BLOCKED mit Grund, nächstes
  Paket nehmen
Frage unter "Offene Fragen" notieren und mit dem nächsten unabhängigen
Paket weitermachen.