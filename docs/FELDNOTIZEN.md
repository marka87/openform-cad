# Feldnotizen — OpenForm CAD

Hier steht, was beim Bauen echter Teile gestört hat. Keine Wunschliste,
kein Plan: nur, was tatsächlich passiert ist.

## Wie notieren

Eine Zeile je Stolperstelle, beim Bauen, nicht hinterher aus dem
Gedächtnis.

```
- [Teil] Wollte: … | Passiert: … | Umweg: … (Dauer)
```

**Keine Lösungen notieren.** „Brauche Hilfspunkte" ist schon eine
Lösung und verdeckt, was sonst geholfen hätte. Schreib stattdessen, was
du erreichen wolltest und was im Weg stand.

Gut:
```
- [Halter] Wollte: Bohrung mittig auf der Rippe anfangen |
  Passiert: kein Rastpunkt in der Flächenmitte |
  Umweg: Koordinaten im Kopf gerechnet und getippt (2 min)
```

Schlecht:
```
- [Halter] Flächenmitte als Rastpunkt wäre gut
```

## Auswertung

Nach drei Teilen zählen (T0.3):
- dreimal oder öfter → wird ein Paket in TASKS.md und bestimmt die
  Reihenfolge mit
- einmal → bleibt hier stehen, kein Paket
- Abbruch oder Datenverlust → sofort ein Paket, egal wie oft

Was bereits ein Paket hat, bekommt die Paketnummer dahinter, damit die
Häufigkeit dessen Rang belegt.

---

## Teil 1: Gehäuse mit Lochraster in der Seitenwand (2026-10-30)

Was ist es, wofür brauchst du es: Kasten mit Tasche, eine Seitenwand
voll mit gleich großen, gleich verteilten runden Löchern.

Notizen:
- [Gehäuse] Wollte: Lochraster per Muster auf der Seitenwand |
  Passiert: Muster lief aus dem Modell hinaus, wenn die erste Bohrung
  nicht in der passenden Ecke saß | Umweg: in genau der richtigen Ecke
  anfangen (behoben 2026-10-30, siehe Log → T6.5)
- [Gehäuse] Wollte: die untere Reihe (4 Kreise) auf einmal nach oben
  vervielfältigen | Passiert: Muster wirkte nur auf einen Kreis |
  Umweg: Kreise einzeln vervielfältigen, viele Klicks (behoben
  2026-10-30, siehe Log → T6.5)
- [Gehäuse] Wollte: Lochraster per KI („Both sides along the X-axis,
  circular hole pattern full, equal spacing and size“), Groq
  gpt-oss-20b | Passiert: „Zu viele Anfragen oder Kontingent erschöpft
  (429)“ | Umweg: von Hand gezeichnet → T8.9, dazu T8.7 (lochmuster)
  und T8.8 (KI auf Seitenflächen)

## Teil 2: (Name, Datum)
Offen — siehe T0.3. Solange Teil 2 und 3 fehlen, sind alle neuen
Funktionswünsche Vermutungen.

Was ist es, wofür brauchst du es:

Notizen:
-

## Teil 3: (Name, Datum)

Was ist es, wofür brauchst du es:

Notizen:
-

---

## Zählung nach Teil 3
(nach T0.3 ausfüllen)

| Stolperstelle | Wie oft | Paket |
|---|---|---|
| | | |
