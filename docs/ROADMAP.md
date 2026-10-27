# Roadmap

Konkrete Aufgaben je Meilenstein. Ziele und Begründungen stehen in [PLAN.md](PLAN.md).
Regel: ein Meilenstein nach dem anderen, jeder endet mit etwas, das man im Browser ausprobieren kann.

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

## M2 – Skizzieren richtig (läuft)
- [x] Linien-Werkzeug: Vieleck Punkt für Punkt, Seitenflächen parallel verschiebbar
- [x] Bogen: im Linien-Werkzeug vom letzten Punkt aus ziehen = tangentialer Bogen
- [x] Bogenflächen ziehen (Radius ändern, Endpunkte bleiben)
- [x] Überschneidende Skizzen zerfallen in Bereiche; Ziehen nimmt nur den angeklickten Bereich
- [x] Versatz: neue Skizze im Abstand um eine flache Skizze (Seitenfeld)
- [ ] Spline, Trimmen
- [ ] Bemaßungen und Abhängigkeiten mit planegcs
- [ ] Skizzen nachträglich bearbeiten

## M3 – Modellieren erweitert
- [ ] Feature-Baum (Liste links), Features nachträglich ändern und umsortieren
- [ ] Skizzen hängen an ihrer Fläche: wird die Fläche verschoben, wandert die Bohrung mit (heute bleibt sie stehen)
- [ ] Drehen (Revolve), Schale, Spiegeln, Muster
- [ ] Sweep, Loft
- [ ] Messen, Schnittansicht, Drahtmodell/transparent
- [ ] Werkzeugsuche (Strg+K)

## M4 – KI-Assistent
- [ ] Eingabefeld „Beschreibe dein Teil“, eigener API-Schlüssel, abschaltbar
- [ ] KI erzeugt Features (JSON), nicht Meshes; ein Schritt = ein Rückgängig
- [ ] Ändern per Text („Wand 2 mm dicker“)
- [ ] Fehler erklären (z. B. fehlgeschlagene Fase)
- [ ] Testsammlung mit Beschreibungen, Ziel ≥ 70 % brauchbare Teile

## M5 – Desktop-Release v1.0
- [ ] Tauri-Build für Windows, macOS, Linux; Installer, Auto-Update
- [ ] Touch- und Stift-Bedienung, Einsteiger-Tour
- [ ] Eigenes Dateiformat `.ofc`, 3MF-Export
- [ ] Doku, Website, öffentliches GitHub-Repo
