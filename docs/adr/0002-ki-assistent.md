# ADR 0002 – KI-Assistent: Werkzeugaufrufe statt Code oder Netze

Status: Entwurf (T8.1), Freigabe durch den Nutzer offen

## Ausgangslage

Schon entschieden (Epic 8, 2026-10-29): kein fest eingebauter Anbieter,
sondern ein Adapter für die OpenAI-kompatible Chat-Completions-Schnittstelle
mit drei Feldern (Basis-URL, Modell, Schlüssel). Die KI ist standardmäßig
aus und lässt sich abschalten. Gratis-Stufen lesen in der Regel mit, das
sagt die Oberfläche deutlich.

Dieser Entwurf legt fest, **was** die KI tun darf und **wie** ihre Antwort
ins Modell kommt.

## Entscheidung

### 1. Die KI ruft nur Werkzeuge mit festem Schema auf

Das Modell antwortet ausschließlich mit `tool_calls`. Die App prüft jeden
Aufruf gegen sein JSON-Schema und gegen Wertebereiche (Längen 0,01 bis
10 000 mm, Winkel −360° bis 360°, Anzahl 1 bis 100). Erst dann setzt sie
ihn in ein **normales Feature** um, also genau das, was ein Mausklick
erzeugt hätte.

Nie: ausgeführter Code (auch kein replicad-Skript), nie Netze, nie
Dateizugriff, nie Netzwerk außer zum eingestellten Anbieter.

Folge: Das Modell muss ein Schema zuverlässig befolgen, aber keine
Geometrie verstehen. Kleine Modelle (lokal über Ollama) genügen.

### 2. Bezüge über die vorhandenen stabilen Namen

Die KI kann keine Flächen „sehen“. Sie benennt sie so, wie es der
Topologie-Resolver ohnehin tut (ADR 0001): `{ f: Feature-ID, tag }`,
z. B. `{ f: 1, tag: "end" }` = Oberseite des Quaders aus Schritt 1.
Die App löst das mit `resolveFace`/`resolveEdge` auf. Ein Bezug, der
nicht eindeutig ist, wird nicht geraten, sondern als Fehler an die KI
zurückgegeben.

Zusätzlich steht die **aktuelle Auswahl** im Kontext („ausgewählt:
Fläche { f: 3, tag: "x1" }“). So funktioniert „mach diese Wand 2 mm
dicker“, ohne dass die KI etwas suchen muss.

### 3. Werkzeuge (erste Ausbaustufe)

| Werkzeug | Parameter | ergibt |
|---|---|---|
| `skizze_rechteck` | Ebene (`boden` oder Fläche), x, y, Breite, Tiefe | Rechteck-Skizze |
| `skizze_kreis` | Ebene, Mitte x/y, Radius | Kreis-Skizze |
| `extrudieren` | Skizze, Höhe (negativ = hineindrücken) | Extrusion bzw. Tasche |
| `bohrung` | Fläche, Mitte x/y, Durchmesser oder Gewinde M3–M12, Tiefe oder „durch“ | Bohrung über die vorhandenen Bohrungsvorlagen |
| `runden` / `fasen` | Kanten, Maß | Rundung / Fase |
| `muster` | Schritt, Reihe oder Kreis, Anzahl, Abstand bzw. Winkel | Muster |
| `wert_setzen` | Schritt, Feld (z. B. `d`, `p.w`), Wert | Maßänderung |

Mehr kommt erst dazu, wenn die Feldnotizen zeigen, dass es fehlt.

### 4. Ablauf einer Anfrage

1. Der Nutzer tippt einen Satz in das KI-Feld und schickt ihn bewusst ab.
   Nichts wird im Hintergrund gesendet.
2. Die Anfrage enthält: Systemanweisung, Werkzeug-Schemata, den Kontext
   (siehe 5.) und den Satz.
3. Die App prüft alle Werkzeugaufrufe. Sie legt **einen** Rückgängig-Schritt
   an und fügt die Features ein. Danach rechnet der Kern.
4. Scheitert ein Schritt im Kern (z. B. Rundung zu groß), geht die
   Fehlermeldung als Werkzeugergebnis an die KI zurück, **höchstens zweimal**.
   Danach bleibt der Stand stehen und der Fehler ist sichtbar.
5. Unten erscheint „KI: 4 Schritte angelegt · Übernehmen / Verwerfen“.
   Verwerfen = Rückgängig.

### 5. Was gesendet wird

- die Feature-Liste als JSON (Typ, ID, Name, Maße, Ebene), ohne Datei- und
  Körpernamen
- je Körper Hüllquader und Volumen
- die aktuelle Auswahl als Bezug
- die Einheit (mm/Zoll)

Nicht gesendet werden importierte STEP-Daten, Dateipfade und Notizen.
Vor der ersten Anfrage zeigt die App genau diesen Umfang an.

### 6. Fehler erklären (T8.5)

Eigener Knopf am roten Schritt: Gesendet werden das Feature, die
Fehlermeldung des Kerns und die Nachbarschritte. Die KI antwortet nur mit
Text, ohne Werkzeuge. Sie ändert also nichts am Modell.

## Prüfbarkeit

- Schema-Prüfung und Umsetzung in Features sind reine Funktionen und
  bekommen Kern-Tests mit **aufgezeichneten** Werkzeugaufrufen.
  Kein Test braucht Netzwerk.
- Der Adapter wird mit einem vorgetäuschten `fetch` getestet
  (Antwort, Fehler 401/429, Zeitüberschreitung).
- Abnahme T8.3: „Platte 100×60×5 mit 4 Bohrungen M5 in den Ecken“ ergibt
  5 Schritte, das Volumen stimmt und STEP öffnet sich.

## Offene Fragen an den Nutzer

1. **Vorschau oder direkt?** Der Vorschlag ist, direkt einzufügen und
   „Übernehmen / Verwerfen“ anzubieten. Die Alternative wäre eine Vorschau,
   die erst nach Klick ins Modell geht. Das ist sicherer, aber ein Klick mehr.
2. **Wo liegt der Schlüssel?** Vorschlag für v1: im Speicher der App,
   mit Hinweis. Sicherer wäre der Windows-Schlüsselspeicher, dafür bräuchte
   es ein zusätzliches Tauri-Plugin.
3. **Netzwerk in der Desktop-App:** Ein Aufruf direkt aus dem WebView
   scheitert bei manchen Anbietern an CORS. Lokales Ollama braucht dafür
   `OLLAMA_ORIGINS`. Sauber geht es über das offizielle Plugin
   `tauri-plugin-http` (MIT/Apache, kein Konto, keine Cloud). Das wäre eine
   neue Abhängigkeit.

## Abgelehnte Wege

- **Die KI schreibt replicad-Code, die App führt ihn aus:** Das ist
  mächtiger, aber das Ergebnis ist kein bearbeitbares Feature, es birgt
  ein Sicherheitsrisiko und ist nicht rückgängig zu machen.
- **Die KI erzeugt Netze oder Text-zu-3D:** Das widerspricht der harten
  Randbedingung „echte B-Rep-Körper“.
- **Fest eingebauter Anbieter mit Gratis-Stufe:** siehe Epic 8,
  Datennutzung fürs Training.
