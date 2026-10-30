// KI-Werkzeuge (ADR 0002): Schemata für das Modell und ihre Umsetzung in normale Features. Reine Funktionen, ohne Oberfläche.
// Stufe T8.3: Rechteck, Kreis, Extrudieren, Bohrung. Als Fläche nur die Oberseite eines extrudierten Schritts; mehr, wenn es gebraucht wird.
import type { Msg, Tool, ToolCall } from './ai';
import { bodyOf, GROUND, isExtrude, noFace, sketchFeature, THREADS, type Extrude, type Feature, type Frame, type Pattern, type Vec } from './model';

const num = (desc: string) => ({ type: 'number', description: desc });
// Flache Parameter: kleine Modelle (7B, lokal) füllen verschachtelte oder „entweder–oder“-Felder unzuverlässig aus
const auf = { type: 'integer', description: 'weglassen = auf dem Boden (neues Teil); sonst Nummer des Schritts, auf dessen Fläche skizziert wird' };
// Seitenflächen nur bei Rechteck-Schritten (Gehäuse = Rechteck + Schale); die Ebenen ergeben sich aus Rechteck und Höhe, ohne Kern
const SIDES = ['oben', 'vorne', 'hinten', 'links', 'rechts'];
const seite = { type: 'string', enum: SIDES, description: 'Fläche des Schritts, Standard oben. vorne = −y, hinten = +y, links = −x, rechts = +x; dort x waagrecht ab der von außen gesehen linken Kante, y nach oben ab der Unterkante' };
const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]): Tool =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } });

export const TOOLS: Tool[] = [
  fn('skizze_rechteck', 'Rechteck skizzieren, optional gleich extrudiert (hoehe). Ecke links vorne bei x, y.',
    { auf_schritt: auf, seite, x: num('mm, Standard 0'), y: num('mm, Standard 0'), breite: num('Länge in x, mm'), tiefe: num('Länge in y, mm (nicht die Dicke)'), hoehe: num('Dicke bzw. Höhe nach oben, mm; negativ = in den Körper hinein') }, ['breite', 'tiefe']),
  fn('skizze_kreis', 'Kreis skizzieren, optional gleich extrudiert (hoehe).',
    { auf_schritt: auf, seite, x: num('Mitte, mm, Standard 0'), y: num('Mitte, mm, Standard 0'), radius: num('mm'), hoehe: num('mm, optional; negativ = in den Körper hinein') }, ['radius']),
  fn('schritt_entfernen', 'Einen in diesem Auftrag angelegten Schritt wieder entfernen, z. B. weil der CAD-Kern ihn ablehnt.', { schritt: { type: 'integer' } }, ['schritt']),
  fn('extrudieren', 'Vorhandene Skizze auf eine Höhe ziehen (negativ = hineindrücken).', { schritt: { type: 'integer' }, hoehe: num('mm') }, ['schritt', 'hoehe']),
  fn('aendern', 'Maße eines vorhandenen Schritts neu setzen (absolute Werte, nicht die Differenz). Nur angeben, was sich ändert.',
    { schritt: { type: 'integer' }, breite: num('Rechteck, mm'), tiefe: num('Rechteck, mm'), radius: num('Kreis, Rundung oder Fase, mm'),
      hoehe: num('Skizze, mm; negativ = in den Körper hinein'), dicke: num('Wandstärke einer Schale, mm') }, ['schritt']),
  fn('bohrung', 'Runde Bohrung in eine Fläche: Durchmesser oder metrisches Gewinde (Kernloch), Tiefe in mm oder durch.',
    { schritt: { type: 'integer', description: 'Nummer des Schritts, in dessen Fläche gebohrt wird' }, seite, x: num('Mitte, mm'), y: num('Mitte, mm'), durchmesser: num('mm, wenn kein Gewinde'),
      gewinde: { type: 'string', enum: Object.keys(THREADS) }, tiefe: { anyOf: [{ type: 'number' }, { type: 'string', enum: ['durch'] }] } }, ['schritt', 'x', 'y', 'tiefe']),
  fn('lochmuster', 'Mehrere gleiche Bohrungen auf einmal: Reihe, Raster oder Lochkreis. Die Lagen rechnet das Programm; ohne Abstand gleichmäßig über die Fläche verteilt, ohne Mitte in der Flächenmitte.',
    { schritt: { type: 'integer' }, seite, anzahl: { type: 'integer', description: 'Löcher je Reihe (beim Lochkreis: alle)' }, reihen: { type: 'integer', description: 'Standard 1; mehr = Raster' },
      abstand: num('mm zwischen Lochmitten in einer Reihe, optional'), abstand_reihen: num('mm zwischen den Reihen, optional'),
      mitte_x: num('Mitte des Musters, optional'), mitte_y: num('Mitte des Musters, optional'), lochkreis_radius: num('mm; angegeben = Löcher auf einem Kreis statt in Reihen'),
      durchmesser: num('mm, wenn kein Gewinde'), gewinde: { type: 'string', enum: Object.keys(THREADS) }, tiefe: { anyOf: [{ type: 'number' }, { type: 'string', enum: ['durch'] }], description: 'Standard durch' } }, ['schritt', 'anzahl']),
];

export const SYSTEM = `Du steuerst das CAD-Programm OpenForm über Werkzeuge. Antworte ausschließlich mit Werkzeugaufrufen, ohne Text.
Einheiten: mm. Koordinaten: x nach rechts, y nach hinten, Höhe nach oben. Auf der Oberseite eines Schritts gelten
dieselben x und y wie in dessen Skizze. Jeder Aufruf, der etwas anlegt, bekommt die nächste freie Schritt-Nummer, der Reihe nach
(steht im Kontext als naechste_nummer). Bohrungen in den Ecken: üblich ist ein Randabstand vom 1,5- bis 2-Fachen des Durchmessers.
Gewinde (M3–M12) immer über „gewinde“ angeben, nicht als Durchmesser. Schlägt ein Aufruf fehl, kommt der Grund zurück;
korrigiere nur diesen Aufruf. Rufe die Werkzeuge nacheinander auf, bis alles angelegt ist; erst dann antworte nur mit „fertig“.
Beispiel für „Platte 80×40×4 mit 2 Bohrungen M4 links und rechts mittig“ im leeren Modell: zuerst skizze_rechteck mit breite 80,
tiefe 40, hoehe 4 (ohne auf_schritt, wird Schritt 1), danach bohrung mit schritt 1, x 8, y 20, gewinde M4, tiefe durch, und
bohrung mit schritt 1, x 72, y 20, gewinde M4, tiefe durch.
Seitenwände (z. B. Gehäuse): seite vorne/hinten/links/rechts beim Rechteck-Schritt, x/y dann auf dieser Seite gemessen; „durch“
geht bei einer Schale nur durch die Wand. Mehrere gleiche Löcher (Reihe, Raster, Lochkreis, „gleichmäßig verteilt“) immer mit
lochmuster in einem Aufruf, nicht als einzelne Bohrungen; Lagen nicht selbst ausrechnen.
Bestehendes ändern: „auswahl“ im Kontext sind die Schritte, die der Nutzer gerade markiert hat; „das“, „diese“ oder „die Wand“
meint diese. Mit aendern die neuen absoluten Maße setzen, z. B. „Wand 2 mm dicker“ bei einer Schale mit dicke 3: aendern mit dicke 5.`;

// Was die KI über das Modell erfährt (ADR 0002, Abschnitt 5): Schritte mit Maßen, keine Namen von Dateien oder Körpern.
// Maße unter denselben Namen wie in den Werkzeugen, damit die KI sie direkt in aendern verwenden kann
function masse(f: Feature) {
  if (f.type === 'rect') return { x: f.p.x, y: f.p.y, breite: f.p.w, tiefe: f.p.h, hoehe: f.d };
  if (f.type === 'circle') return { x: f.p.cx, y: f.p.cy, radius: f.p.r, ...f.p.ry !== undefined && { radius_y: f.p.ry }, hoehe: f.d };
  if (isExtrude(f)) return { hoehe: f.d };
  if (f.type === 'fillet' || f.type === 'chamfer') return { radius: f.r };
  if (f.type === 'shell') return { dicke: f.t };
  return {};
}
export function aiContext(fs: Feature[], nextId: number, unit: 'mm' | 'in', sel: number[] = []) {
  const schritte = fs.filter(f => !f.hidden).map(f => ({ schritt: f.id, art: f.type, ...isExtrude(f) && { auf: f.onFace ? 'Fläche' : 'Boden' }, ...masse(f) }));
  return JSON.stringify({ einheit: 'mm', anzeige: unit, naechste_nummer: nextId, auswahl: sel, schritte });
}

type Result = { id: string; ok: boolean; text: string };
const MAX = 10000;
const len = (v: unknown, what: string, min = 0.01) => {
  if (typeof v !== 'number' || !isFinite(v) || Math.abs(v) < min || Math.abs(v) > MAX) throw new Error(`${what}: Zahl zwischen ${min} und ${MAX} mm erwartet`);
  return v;
};
const coord = (v: unknown, what: string) => { if (typeof v !== 'number' || !isFinite(v) || Math.abs(v) > MAX) throw new Error(`${what}: Zahl erwartet`); return v; };

// Werkzeugaufrufe auf eine Kopie der Schritte anwenden. Jeder Aufruf einzeln: ein fehlerhafter ändert nichts, die anderen gelten.
// firstId: ab dieser Nummer hat die KI die Schritte in diesem Auftrag selbst angelegt, nur die darf sie entfernen
export function applyCalls(features: Feature[], calls: ToolCall[], nextId: number, firstId = nextId): { fs: Feature[]; nextId: number; results: Result[] } {
  const fs = structuredClone(features), results: Result[] = [];
  const sketch = (id: unknown) => {
    const f = fs.find(g => g.id === id);
    if (!f || !isExtrude(f) || f.type === 'line' || f.aux) throw new Error(`Schritt ${id} ist keine Skizze`);
    return f;
  };
  // Ebene der neuen Skizze: ohne Schritt der Boden, sonst die Oberseite des Schritts mit dessen u/v (x/y bleiben gleich)
  // oder eine Seite des Rechtecks (Ursprung in deren linker unterer Ecke, y = Normale des Schritts). thru = Tiefe für „durch“,
  // box = Fläche in Skizzenkoordinaten [x0, y0, x1, y1] (zum Prüfen der Lage und Verteilen im Lochmuster; Vieleck: keine)
  type Where = { pl: Frame; onFace: boolean; body?: number; thru?: number; box?: number[] };
  const plane = (schritt: unknown, side: unknown = 'oben'): Where => {
    if (schritt === undefined || schritt === null) return { pl: GROUND, onFace: false };
    let f = fs.find(g => g.id === schritt);
    // Schale, Rundung, Bohrung … gemeint ist der Körper („das Gehäuse“): dessen Grundskizze auf dem Boden
    if (f && (!isExtrude(f) || !(f.d > 0)) && f.type !== 'plane') { const b = (f as { body?: number }).body ?? 1; f = fs.find(g => isExtrude(g) && !g.onFace && g.d > 0 && (g.body ?? 1) === b) ?? f; }
    if (!f) throw new Error(`Schritt ${schritt} gibt es nicht${fs.length ? ` (vorhanden: ${fs.map(g => g.id).join(', ')})` : ''} – ein neues Teil ohne auf_schritt anlegen`);
    if (!isExtrude(f)) throw new Error(`Schritt ${schritt} ist keine Skizze`);
    if (!(f.d > 0)) throw new Error(`Schritt ${schritt} ist nicht nach oben extrudiert`);
    if (side === undefined || side === null || side === 'oben') {
      const { x, y, w, h, cx, cy, r } = f.p, box = f.type === 'rect' ? [x, y, x + w, y + h] : f.type === 'circle' && f.p.ry === undefined ? [cx - r, cy - r, cx + r, cy + r] : undefined;
      return { pl: { o: f.o.map((x, i) => x + f.d * f.n[i]) as Frame['o'], n: f.n, u: f.u, v: f.v }, onFace: true, body: bodyOf(f), thru: f.d, box };
    }
    if (!SIDES.includes(side as string)) throw new Error(`seite: ${SIDES.join(', ')}`);
    if (f.type !== 'rect') throw new Error(`Seitenflächen kennt die KI nur bei Rechtecken, Schritt ${schritt} ist ${f.type}`);
    const { x, y, w, h } = f.p, at = (s: number, t: number) => f.o.map((o, i) => o + f.u[i] * s + f.v[i] * t) as Vec, neg = (a: Vec) => a.map(c => -c) as Vec;
    const sd = { vorne: { o: at(x, y), u: f.u, n: neg(f.v), w, across: h }, hinten: { o: at(x + w, y + h), u: neg(f.u), n: f.v, w, across: h },
      rechts: { o: at(x + w, y), u: f.v, n: f.u, w: h, across: w }, links: { o: at(x, y + h), u: neg(f.v), n: neg(f.u), w: h, across: w } }[side as 'vorne'];
    const shell = fs.find(g => g.type === 'shell' && !g.hidden && bodyOf(g) === bodyOf(f)); // Gehäuse: „durch“ = durch die Wand
    return { pl: { o: sd.o, u: sd.u, v: f.n, n: sd.n }, onFace: true, body: bodyOf(f), thru: shell?.type === 'shell' ? shell.t : sd.across, box: [0, 0, sd.w, f.d] };
  };
  const inside = (where: Where, x: number, y: number) => {
    const b = where.box;
    if (b && !(x > b[0] && x < b[2] && y > b[1] && y < b[3])) throw new Error(`Mitte ${+x.toFixed(2)}, ${+y.toFixed(2)} liegt nicht auf der Fläche (x ${b[0]}–${b[2]}, y ${b[1]}–${b[3]})`);
  };
  // Bohrung: Durchmesser/Gewinde und Tiefe wie im Werkzeug bohrung, an x, y der Fläche
  const hole = (where: Where, a: Record<string, unknown>, x: number, y: number) => {
    const dia = a.gewinde !== undefined ? THREADS[a.gewinde as string] : len(a.durchmesser, 'durchmesser');
    if (!dia) throw new Error(`Gewinde ${a.gewinde} unbekannt (${Object.keys(THREADS).join(', ')})`);
    inside(where, x, y);
    // gleiche Bohrung an gleicher Stelle (kleine Modelle wiederholen Aufrufe mit leicht anderen Argumenten): ablehnen statt doppelt anlegen
    const at = (g: Extrude, px: number, py: number) => g.o.map((o, i) => o + g.u[i] * px + g.v[i] * py);
    const P = at(where.pl as Extrude, x, y), twin = fs.find(g => g.type === 'circle' && g.d < 0 && Math.abs(g.p.r - dia / 2) < 1e-6
      && g.n.every((c, i) => Math.abs(c - where.pl.n[i]) < 1e-6) && at(g, g.p.cx, g.p.cy).every((c, i) => Math.abs(c - P[i]) < 1e-3));
    if (twin) throw new Error(`An dieser Stelle gibt es schon diese Bohrung (Schritt ${twin.id}) – nicht wiederholen`);
    const g = place(sketchFeature('circle', where.pl, [x, y], [x + dia / 2, y], nextId, true), where, -(a.tiefe === 'durch' ? where.thru! : len(a.tiefe, 'tiefe')));
    if (a.gewinde !== undefined) (g as Feature).name = `Gewinde ${a.gewinde}`;
    return g;
  };
  const place = (f: Extrude | null, where: Where, hoehe: unknown) => {
    if (!f) throw new Error('Maße ergeben keine Fläche');
    if (hoehe !== undefined) f.d = len(hoehe, 'hoehe');
    if (where.onFace && f.d > 0 || !where.onFace && f.d < 0) throw new Error(where.onFace ? 'Auf einer Fläche nur hinein (negative Höhe)' : 'Auf dem Boden nur nach oben');
    f.body = where.body ?? f.id;
    fs.push(f);
    nextId++;
    return f;
  };
  for (const c of calls) {
    try {
      if (!c.args) throw new Error('Argumente sind kein gültiges JSON');
      const a = Object.fromEntries(Object.entries(c.args).filter(([, v]) => v !== null)); // kleine Modelle schicken leere Felder als null
      let f: Extrude & { name?: string };
      if (c.name === 'skizze_rechteck') {
        const where = plane(a.auf_schritt, a.seite), x = coord(a.x ?? 0, 'x'), y = coord(a.y ?? 0, 'y');
        f = place(sketchFeature('rect', where.pl, [x, y], [x + len(a.breite, 'breite'), y + len(a.tiefe, 'tiefe')], nextId, where.onFace), where, a.hoehe);
      } else if (c.name === 'skizze_kreis') {
        const where = plane(a.auf_schritt, a.seite), x = coord(a.x ?? 0, 'x'), y = coord(a.y ?? 0, 'y');
        f = place(sketchFeature('circle', where.pl, [x, y], [x + len(a.radius, 'radius'), y], nextId, where.onFace), where, a.hoehe);
      } else if (c.name === 'schritt_entfernen') {
        const i = fs.findIndex(g => g.id === a.schritt);
        if (i < 0 || fs[i].id < firstId) throw new Error(`Schritt ${a.schritt} wurde nicht in diesem Auftrag angelegt`);
        fs.splice(i, 1);
        results.push({ id: c.id, ok: true, text: `ok, Schritt ${a.schritt} entfernt` });
        continue;
      } else if (c.name === 'aendern') {
        const g = fs.find(h => h.id === a.schritt);
        if (!g) throw new Error(`Schritt ${a.schritt} gibt es nicht`);
        const set = Object.keys(a).filter(k => k !== 'schritt' && a[k] !== undefined && a[k] !== null);
        const fits = g.type === 'rect' ? ['breite', 'tiefe', 'hoehe'] : g.type === 'circle' && g.p.ry === undefined ? ['radius', 'hoehe']
          : isExtrude(g) && !noFace(g) ? ['hoehe'] : g.type === 'fillet' || g.type === 'chamfer' ? ['radius'] : g.type === 'shell' ? ['dicke'] : [];
        const wrong = set.filter(k => !fits.includes(k));
        if (!set.length || wrong.length) throw new Error(`Schritt ${g.id} (${g.type}) lässt sich ${fits.length ? `nur über ${fits.join(', ')} ändern` : 'nicht ändern'}`);
        const v = Object.fromEntries(set.map(k => { // nur die Höhe hat ein Vorzeichen (Richtung)
          const x = len(a[k], k);
          if (k !== 'hoehe' && x < 0) throw new Error(`${k}: positive Zahl erwartet`);
          return [k, x];
        }));
        if (isExtrude(g)) {
          if (v.hoehe !== undefined && (g.onFace ? v.hoehe > 0 : v.hoehe < 0)) throw new Error(g.onFace ? 'Skizze auf einer Fläche: nur hinein (negativ)' : 'Skizze auf dem Boden: nur nach oben');
          if (v.breite !== undefined) g.p.w = v.breite;
          if (v.tiefe !== undefined) g.p.h = v.tiefe;
          if (v.radius !== undefined) g.p.r = v.radius;
          if (v.hoehe !== undefined) g.d = v.hoehe;
        } else if (g.type === 'shell') g.t = v.dicke;
        else if (g.type === 'fillet' || g.type === 'chamfer') g.r = v.radius;
        results.push({ id: c.id, ok: true, text: `ok, Schritt ${g.id} geändert` });
        continue;
      } else if (c.name === 'extrudieren') {
        f = sketch(a.schritt);
        const d = len(a.hoehe, 'hoehe');
        if (f.onFace ? d > 0 : d < 0) throw new Error(f.onFace ? 'Skizze auf einer Fläche: nur hinein (negativ)' : 'Skizze auf dem Boden: nur nach oben');
        f.d = d;
      } else if (c.name === 'bohrung') {
        if (a.schritt === undefined) throw new Error('schritt fehlt: in welchen Schritt wird gebohrt?');
        f = hole(plane(a.schritt, a.seite), a, coord(a.x, 'x'), coord(a.y, 'y'));
      } else if (c.name === 'lochmuster') {
        // Reihe/Raster: erste Bohrung + Muster-Schritt (bleibt im Baum bearbeitbar); Lochkreis: Einzelbohrungen (Kreis-Muster fehlt noch, T6.7)
        a.tiefe ??= 'durch';
        const where = plane(a.schritt, a.seite), b = where.box, n = Math.round(len(a.anzahl, 'anzahl', 1)), rows = Math.round(a.reihen === undefined ? 1 : len(a.reihen, 'reihen', 1));
        if (n < 1 || rows < 1 || n * rows > 400) throw new Error('anzahl und reihen: 1 bis 400 Löcher');
        const mx = a.mitte_x === undefined ? b && (b[0] + b[2]) / 2 : coord(a.mitte_x, 'mitte_x'), my = a.mitte_y === undefined ? b && (b[1] + b[3]) / 2 : coord(a.mitte_y, 'mitte_y');
        if (mx === undefined || my === undefined) throw new Error('mitte_x und mitte_y angeben (Fläche ohne bekannte Größe)');
        const fs0 = fs.length, id0 = nextId;
        try {
          if (a.lochkreis_radius !== undefined) {
            const R = len(a.lochkreis_radius, 'lochkreis_radius');
            for (let i = 0; i < n; i++) hole(where, a, mx + R * Math.cos(2 * Math.PI * i / n), my + R * Math.sin(2 * Math.PI * i / n));
            results.push({ id: c.id, ok: true, text: `ok, Lochkreis R ${R} mit ${n} Bohrungen, Schritte ${id0}–${nextId - 1}` });
            continue;
          }
          // ohne Abstand: gleich große Lücken zwischen Rand und Loch und zwischen den Löchern
          const step = (v: unknown, what: string, k: number, span?: number) => {
            if (v !== undefined) return len(v, what);
            if (k < 2) return 0;
            if (span === undefined) throw new Error(`${what} angeben (Fläche ohne bekannte Größe)`);
            return span / (k + 1);
          };
          const dx = step(a.abstand, 'abstand', n, b && b[2] - b[0]), dy = step(a.abstand_reihen, 'abstand_reihen', rows, b && b[3] - b[1]);
          const first = hole(where, a, mx - dx * (n - 1) / 2, my - dy * (rows - 1) / 2);
          inside(where, mx + dx * (n - 1) / 2, my + dy * (rows - 1) / 2); // gegenüberliegende Ecke des Musters
          if (n * rows > 1) {
            const p: Pattern = { id: nextId++, type: 'pattern', src: [first.id], a: { ax: where.pl.u, n, d: dx || 1 }, body: where.body };
            if (rows > 1) p.b = { ax: where.pl.v, n: rows, d: dy };
            fs.push(p);
          }
          results.push({ id: c.id, ok: true, text: `ok, Bohrung Schritt ${first.id}${n * rows > 1 ? ` und Muster Schritt ${nextId - 1}: ${n}${rows > 1 ? ` × ${rows}` : ''}, Abstand ${+dx.toFixed(2)}${rows > 1 ? ` / ${+dy.toFixed(2)}` : ''} mm` : ''}` });
        } catch (e) { fs.splice(fs0); nextId = id0; throw e; } // ganz oder gar nicht
        continue;
      } else throw new Error(`Unbekanntes Werkzeug ${c.name}`);
      results.push({ id: c.id, ok: true, text: `ok, Schritt ${f.id}` });
    } catch (e) {
      results.push({ id: c.id, ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }
  return { fs, nextId, results };
}

// Fehler erklären (T8.5, ADR 0002 Abschnitt 6): der rote Schritt, die Meldung des Kerns und die Nachbarschritte; Antwort nur Text
export function explainMsgs(fs: Feature[], id: number, why: string, unit: 'mm' | 'in'): Msg[] {
  const i = fs.findIndex(f => f.id === id);
  const near = fs.slice(Math.max(0, i - 3), i + 2).filter(f => !f.hidden).map(f => ({ schritt: f.id, art: f.type, ...masse(f) }));
  return [{ role: 'system', content: `Du erklärst Fehler im CAD-Programm OpenForm. Antworte auf Deutsch in höchstens drei kurzen Sätzen ohne
Aufzählung: warum der Schritt scheitert und was der Nutzer ändern kann, mit konkreten Werten, wenn möglich. Maße in mm, der Nutzer
arbeitet in ${unit === 'in' ? 'Zoll' : 'mm'}. Du kannst nichts am Modell ändern.` },
  { role: 'user', content: `Schritt ${id} scheitert mit der Meldung „${why}“. Schritte drumherum: ${JSON.stringify(near)}` }];
}

// Eine Anfrage bis zum Ende: die KI darf mehrere Runden lang Werkzeuge aufrufen (kleine Modelle schicken oft einen Aufruf je Antwort),
// jedes Ergebnis geht zurück. Schluss, wenn sie ohne Werkzeug antwortet, nach 12 Runden oder nach 3 Runden mit Fehlern hintereinander.
// check (T8.6): rechnet den Stand im Kern; scheitern dabei Schritte dieses Auftrags, geht der Grund höchstens zweimal an die KI zurück
export async function runRequest(ask: (m: Msg[]) => Promise<{ content: string | null; toolCalls: ToolCall[]; message: Msg }>,
  features: Feature[], nextId: number, unit: 'mm' | 'in', text: string, status: (t: string) => void = () => {},
  check?: (fs: Feature[]) => Promise<[number, string][]>, sel: number[] = []) {
  const msgs: Msg[] = [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Kontext: ${aiContext(features, nextId, unit, sel)}

Auftrag: ${text}` }];
  const firstId = nextId, before = new Map(features.map(f => [f.id, JSON.stringify(f)]));
  let fs = features, made = 0, failing = 0, reply = '', problems: string[] = [], kernelTries = 0;
  const done = new Set<string>(), key = (c: ToolCall) => c.name + JSON.stringify(c.args); // gelungene Aufrufe: kleine Modelle wiederholen sie gern
  const touched = (id: number) => before.get(id) !== JSON.stringify(fs.find(f => f.id === id)); // neu oder von der KI geändert
  for (let round = 0; round < 12 && failing < 3; round++) {
    status(round ? `KI arbeitet … (${made} angelegt)` : 'KI arbeitet …');
    let r: Awaited<ReturnType<typeof ask>>;
    try { r = await ask(msgs); }
    catch (e) { // z. B. 429 mitten im Auftrag: schon Angelegtes bleibt (Verwerfen möglich), statt mit dem Fehler verloren zu gehen
      if (!made) throw e;
      problems = [`abgebrochen: ${e instanceof Error ? e.message : e}`];
      break;
    }
    if (!r.toolCalls.length) {
      reply = r.content ?? '';
      if (!made || !check || kernelTries === 2) break;
      status('CAD-Kern prüft …');
      const bad = (await check(fs)).filter(([id]) => touched(id));
      if (!bad.length) break;
      kernelTries++;
      msgs.push(r.message, { role: 'user', content: `Der CAD-Kern lehnt ab: ${bad.map(([id, why]) => `Schritt ${id}: ${why}`).join('; ')}. Korrigiere das (schritt_entfernen und neu anlegen, oder extrudieren mit anderer Höhe), dann antworte mit „fertig“.` });
      continue;
    }
    const fresh = r.toolCalls.filter((c, i) => !done.has(key(c)) && r.toolCalls.findIndex(d => key(d) === key(c)) === i);
    const out = applyCalls(fs, fresh, nextId, firstId);
    out.results.forEach((x, i) => { if (x.ok) done.add(key(fresh[i])); });
    out.results.push(...r.toolCalls.filter(c => !fresh.includes(c)).map(c => ({ id: c.id, ok: false, text: 'schon angelegt, nicht wiederholen – wenn alles da ist, antworte mit „fertig“' })));
    const bad = out.results.filter(x => !x.ok);
    fs = out.fs; nextId = out.nextId; made += out.results.length - bad.length;
    problems = bad.map(x => x.text);
    failing = bad.length ? failing + 1 : 0;
    msgs.push(r.message, ...out.results.map((x): Msg => ({ role: 'tool', tool_call_id: x.id, content: x.text })));
  }
  return { fs, nextId, made, problems, reply };
}
