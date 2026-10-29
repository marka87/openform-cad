// KI-Werkzeuge (ADR 0002): Schemata für das Modell und ihre Umsetzung in normale Features. Reine Funktionen, ohne Oberfläche.
// Stufe T8.3: Rechteck, Kreis, Extrudieren, Bohrung. Als Fläche nur die Oberseite eines extrudierten Schritts; mehr, wenn es gebraucht wird.
import type { Tool, ToolCall } from './ai';
import { bodyOf, GROUND, isExtrude, sketchFeature, THREADS, type Extrude, type Feature, type Frame } from './model';

const num = (desc: string) => ({ type: 'number', description: desc });
const ebene = { description: 'Wo skizziert wird: "boden" oder eine Fläche eines vorhandenen Schritts',
  anyOf: [{ type: 'string', enum: ['boden'] }, { type: 'object', properties: { schritt: { type: 'integer' }, seite: { type: 'string', enum: ['oben'] } }, required: ['schritt', 'seite'] }] };
const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]): Tool =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } });

export const TOOLS: Tool[] = [
  fn('skizze_rechteck', 'Rechteck skizzieren, optional gleich extrudiert (hoehe). Ecke links vorne bei x, y.',
    { ebene, x: num('mm'), y: num('mm'), breite: num('mm, in x'), tiefe: num('mm, in y'), hoehe: num('mm, optional; negativ = in den Körper hinein') }, ['ebene', 'x', 'y', 'breite', 'tiefe']),
  fn('skizze_kreis', 'Kreis skizzieren, optional gleich extrudiert (hoehe).',
    { ebene, x: num('Mitte, mm'), y: num('Mitte, mm'), radius: num('mm'), hoehe: num('mm, optional; negativ = in den Körper hinein') }, ['ebene', 'x', 'y', 'radius']),
  fn('extrudieren', 'Vorhandene Skizze auf eine Höhe ziehen (negativ = hineindrücken).', { schritt: { type: 'integer' }, hoehe: num('mm') }, ['schritt', 'hoehe']),
  fn('bohrung', 'Runde Bohrung in eine Fläche: Durchmesser oder metrisches Gewinde (Kernloch), Tiefe in mm oder durch.',
    { flaeche: ebene.anyOf[1], x: num('Mitte, mm'), y: num('Mitte, mm'), durchmesser: num('mm, wenn kein Gewinde'),
      gewinde: { type: 'string', enum: Object.keys(THREADS) }, tiefe: { anyOf: [{ type: 'number' }, { type: 'string', enum: ['durch'] }] } }, ['flaeche', 'x', 'y', 'tiefe']),
];

export const SYSTEM = `Du steuerst das CAD-Programm OpenForm über Werkzeuge. Antworte ausschließlich mit Werkzeugaufrufen, ohne Text.
Einheiten: mm. Koordinaten: x nach rechts, y nach hinten, Höhe nach oben. Auf der Fläche „oben“ eines Schritts gelten
dieselben x und y wie in dessen Skizze. Jeder Aufruf, der etwas anlegt, bekommt die nächste freie Schritt-Nummer, der Reihe nach
(steht im Kontext als naechste_nummer). Bohrungen in den Ecken: üblich ist ein Randabstand vom 1,5- bis 2-Fachen des Durchmessers.
Schlägt ein Aufruf fehl, kommt der Grund zurück; korrigiere nur diesen Aufruf.`;

// Was die KI über das Modell erfährt (ADR 0002, Abschnitt 5): Schritte mit Maßen, keine Namen von Dateien oder Körpern
export function aiContext(fs: Feature[], nextId: number, unit: 'mm' | 'in') {
  const schritte = fs.filter(f => !f.hidden).map(f => isExtrude(f)
    ? { schritt: f.id, art: f.type, auf: f.onFace ? 'Fläche' : 'Boden', masse: f.p, hoehe: f.d }
    : { schritt: f.id, art: f.type });
  return JSON.stringify({ einheit: 'mm', anzeige: unit, naechste_nummer: nextId, schritte });
}

type Result = { id: string; ok: boolean; text: string };
const MAX = 10000;
const len = (v: unknown, what: string, min = 0.01) => {
  if (typeof v !== 'number' || !isFinite(v) || Math.abs(v) < min || Math.abs(v) > MAX) throw new Error(`${what}: Zahl zwischen ${min} und ${MAX} mm erwartet`);
  return v;
};
const coord = (v: unknown, what: string) => { if (typeof v !== 'number' || !isFinite(v) || Math.abs(v) > MAX) throw new Error(`${what}: Zahl erwartet`); return v; };

// Werkzeugaufrufe auf eine Kopie der Schritte anwenden. Jeder Aufruf einzeln: ein fehlerhafter ändert nichts, die anderen gelten
export function applyCalls(features: Feature[], calls: ToolCall[], nextId: number): { fs: Feature[]; nextId: number; results: Result[] } {
  const fs = structuredClone(features), results: Result[] = [];
  const sketch = (id: unknown) => {
    const f = fs.find(g => g.id === id);
    if (!f || !isExtrude(f) || f.type === 'line' || f.aux) throw new Error(`Schritt ${id} ist keine Skizze`);
    return f;
  };
  // Ebene der neuen Skizze; auf der Oberseite dieselben u/v wie die Skizze darunter, damit x/y gleich bleiben
  const plane = (e: unknown): { pl: Frame; onFace: boolean; body?: number; under?: Extrude } => {
    if (e === 'boden') return { pl: GROUND, onFace: false };
    const { schritt, seite } = (e ?? {}) as { schritt?: unknown; seite?: unknown };
    const f = sketch(schritt);
    if (seite !== 'oben') throw new Error('seite: nur "oben"');
    if (!(f.d > 0)) throw new Error(`Schritt ${schritt} ist nicht nach oben extrudiert`);
    return { pl: { o: f.o.map((x, i) => x + f.d * f.n[i]) as Frame['o'], n: f.n, u: f.u, v: f.v }, onFace: true, body: bodyOf(f), under: f };
  };
  const place = (f: Extrude | null, where: ReturnType<typeof plane>, hoehe: unknown) => {
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
      const a = c.args;
      let f: Extrude & { name?: string };
      if (c.name === 'skizze_rechteck') {
        const where = plane(a.ebene), x = coord(a.x, 'x'), y = coord(a.y, 'y');
        f = place(sketchFeature('rect', where.pl, [x, y], [x + len(a.breite, 'breite'), y + len(a.tiefe, 'tiefe')], nextId, where.onFace), where, a.hoehe);
      } else if (c.name === 'skizze_kreis') {
        const where = plane(a.ebene), x = coord(a.x, 'x'), y = coord(a.y, 'y');
        f = place(sketchFeature('circle', where.pl, [x, y], [x + len(a.radius, 'radius'), y], nextId, where.onFace), where, a.hoehe);
      } else if (c.name === 'extrudieren') {
        f = sketch(a.schritt);
        const d = len(a.hoehe, 'hoehe');
        if (f.onFace ? d > 0 : d < 0) throw new Error(f.onFace ? 'Skizze auf einer Fläche: nur hinein (negativ)' : 'Skizze auf dem Boden: nur nach oben');
        f.d = d;
      } else if (c.name === 'bohrung') {
        const where = plane(a.flaeche), dia = a.gewinde !== undefined ? THREADS[a.gewinde as string] : len(a.durchmesser, 'durchmesser');
        if (!dia) throw new Error(`Gewinde ${a.gewinde} unbekannt (${Object.keys(THREADS).join(', ')})`);
        const depth = a.tiefe === 'durch' ? Math.abs(where.under!.d) : len(a.tiefe, 'tiefe');
        const x = coord(a.x, 'x'), y = coord(a.y, 'y');
        f = place(sketchFeature('circle', where.pl, [x, y], [x + dia / 2, y], nextId, true), where, -depth);
        if (a.gewinde !== undefined) f.name = `Gewinde ${a.gewinde}`;
      } else throw new Error(`Unbekanntes Werkzeug ${c.name}`);
      results.push({ id: c.id, ok: true, text: `ok, Schritt ${f.id}` });
    } catch (e) {
      results.push({ id: c.id, ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }
  return { fs, nextId, results };
}
