// Belastungsprobe: typische Teile über viele Schritte, mit nachgerechneten Volumen, Zurückspulen, Maßänderung und Export.
// Selbst ausgedacht, um Fehler zu finden; das sind NICHT die echten Teile aus T0.3.
import { beforeAll, expect, test } from 'vitest';
import opencascade from 'replicad-opencascadejs';
import { cast, getOC, makeCompound, makeCylinder, makeLine, measureVolume, setOC, type Shape3D } from 'replicad';
import { shownEdges, newCache, buildBody, forExport, invalidBodies, loadStep, sheetSVG, to3MF } from './kernel';
import { pieceAt, trimFeatures } from './trim';
import { parseModel, roundCorners, THREAD_SPECS, isSlot, slotLength, slotMoveEnd, slotPull, slotRadius, ownerOf, coplanarBounds, applyPush, arcPoints, GROUND, isExtrude, linePlane, mirroredCopy, pullTogether, pushTo, rectSize, sameEdge, sketchArea, sketchFeature, slotPts, type EdgeOp, type Extrude, type Feature, type Frame, type Loft, type Pattern, type Shell, type Sweep, type Vec } from './model';

beforeAll(async () => { setOC(await (opencascade as any)()); });
const valid = (sh: any) => { const c = new (getOC() as any).BRepCheck_Analyzer(sh.wrapped, true, false), ok = c.IsValid(); c.delete(); return ok; };

// Wie main.ts: nachgetragene Bezüge übernehmen und neu rechnen, bis nichts mehr nachkommt
function settle(fs: Feature[]) {
  let r = buildBody(fs);
  for (let i = 0; i < 4 && r.fixes.size; i++) {
    fs = fs.map(f => r.fixes.has(f.id) ? { ...f, ...r.fixes.get(f.id) } as Feature : f);
    r = buildBody(fs);
  }
  return { r, fs };
}
const rect = (pl: Frame, a: number[], b: number[], id: number, d: number, onFace = true) => ({ ...sketchFeature('rect', pl, a, b, id, onFace)!, d }) as Extrude;
const circle = (pl: Frame, c: number[], r: number, id: number, d: number, onFace = true) => ({ ...sketchFeature('circle', pl, c, [c[0] + r, c[1]], id, onFace)!, d }) as Extrude;
const edge = (type: 'fillet' | 'chamfer', id: number, at: Vec, dir: Vec, r: number): EdgeOp => ({ id, type, at, dir, r });

// Dichtes, einheitlich ausgerichtetes Netz: jede gerichtete Kante genau einmal, mit Gegenstück (3MF-ZIP ist unkomprimiert, das Modell steht im Klartext)
function closed(bytes: Uint8Array) {
  let tris = 0, dup = 0, open = 0;
  for (const obj of new TextDecoder().decode(bytes).split('<object ').slice(1)) {  // Eckennummern zählen je Objekt neu
    const dir = new Set<string>();
    for (const [, a, b, c] of obj.matchAll(/v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)) {
      tris++;
      for (const [p, q] of [[a, b], [b, c], [c, a]]) { if (dir.has(`${p},${q}`)) dup++; dir.add(`${p},${q}`); }
    }
    open += [...dir].filter(k => !dir.has(k.split(',').reverse().join(','))).length;
  }
  return { tris, dup, open };
}

const top = (y: number): Frame => ({ o: [0, y, 0], n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] });

function halter(): Feature[] {
  const web: Frame = { o: [0, 6, -34], n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] };
  const rib: Frame = { o: [55, 6, -34], n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] };
  const p: Pattern = { id: 4, type: 'pattern', src: [3], a: { ax: [1, 0, 0], n: 3, d: 20 } };
  return [
    rect(GROUND, [0, 0], [60, 40], 1, 6, false),
    rect(top(6), [0, 34], [60, 40], 2, 34),
    circle(top(6), [10, 12], 2.6, 3, -6),
    p,
    edge('fillet', 5, [30, 6, -34], [1, 0, 0], 4),
    edge('chamfer', 6, [30, 6, 0], [1, 0, 0], 1),
    edge('fillet', 7, [0, 3, 0], [0, 1, 0], 5),
    circle(web, [30, 20], 4, 8, -6),
    { id: 9, d: 2, onFace: false, ...structuredClone(rib), type: 'poly', p: {}, pts: [[0, 0], [-20, 0], [0, 20]] } as Extrude,
  ];
}

test('Halter: alle Schritte gelingen, Export dicht', async () => {
  const { r, fs } = settle(halter());
  expect(r.errors.size).toBe(0);
  expect(valid(r.body!)).toBe(true);
  const back = await loadStep(await forExport(r.body!).blobSTEP().text());
  expect(measureVolume(back)).toBeCloseTo(measureVolume(r.body!), 1);
  const m = closed((to3MF([...r.bodies.values()])));
  expect([m.dup, m.open]).toEqual([0, 0]);
});

test('Halter: Zurückspulen auf jeden Stand', () => {
  const { fs } = settle(halter());
  const bad: unknown[] = [];
  for (let k = 1; k <= fs.length; k++) {
    const r = buildBody(fs.slice(0, k));
    if (r.errors.size || !valid(r.body)) bad.push([k, [...r.errors], valid(r.body)]);
  }
  expect(bad).toEqual([]);
});

test('Halter: Maße ändern, alles zieht mit', () => {
  const { fs } = settle(halter());
  const plate = (d: number) => fs.map(f => f.id === 1 ? { ...f, d } : f) as Feature[];
  const webH = (d: number) => fs.map(f => f.id === 2 ? { ...f, d } : f) as Feature[];
  const wide = fs.map(f => f.id === 1 ? { ...f, p: { ...(f as Extrude).p, w: 80 } } : f.id === 2 ? { ...f, p: { ...(f as Extrude).p, w: 80 } } : f) as Feature[];
  for (const [name, c] of [['Platte 10', plate(10)], ['Steg 50', webH(50)], ['Breite 80', wide]] as const) {
    const s = settle(c);
    expect([name, [...s.r.errors]]).toEqual([name, []]);
    expect(valid(s.r.body!)).toBe(true);
  }
});

function adapter(): Feature[] {
  const face = top(6);
  const rot: Pattern = { id: 4, type: 'pattern', src: [3], a: { ax: [0, 1, 0], n: 6, d: 0 }, rot: { ax: [0, 1, 0], c: [0, 6, 0] } };
  return [
    circle(GROUND, [0, 0], 30, 1, 6, false),
    circle(face, [0, 0], 14, 2, 25),
    circle(face, [22, 0], 2.25, 3, -6),
    rot,
    circle(top(31), [0, 0], 10, 5, -31),
    edge('fillet', 6, [14, 6, 0], [0, 0, 1], 2),
    edge('chamfer', 7, [14, 31, 0], [0, 0, 1], 1),
  ];
}

test('Adapter (Flansch mit Lochkreis): Schritte, Zurückspulen, Maße', async () => {
  const { r, fs } = settle(adapter());
  expect(r.errors.size).toBe(0);
  expect(valid(r.body!)).toBe(true);
  const back = await loadStep(await forExport(r.body!).blobSTEP().text());
  expect(measureVolume(back)).toBeCloseTo(measureVolume(r.body!), 1);
  const m = closed((to3MF([...r.bodies.values()])));
  expect([m.dup, m.open]).toEqual([0, 0]);
  for (let k = 1; k <= fs.length; k++) expect([k, [...buildBody(fs.slice(0, k)).errors]]).toEqual([k, []]);
  const thick = settle(fs.map(f => f.id === 1 ? { ...f, d: 10 } : f) as Feature[]);
  expect([...thick.r.errors]).toEqual([]);
  const six = settle(fs.map(f => f.id === 2 ? { ...f, p: { ...(f as Extrude).p, r: 16 } } : f) as Feature[]);
  expect([...six.r.errors]).toEqual([]);
});

test('Schlauchadapter: Schale auf einem Übergang höhlt aus oder wird rot, nie still massiv', () => {
  const up = top(40), l: Loft = { id: 3, type: 'loft', a: 1, b: 2, body: 3 };
  const sh: Shell = { id: 4, type: 'shell', at: [0, 40, 0], more: [[0, 0, 0]], t: 2, body: 3 };
  const kk = settle([circle(GROUND, [0, 0], 20, 1, 0, false), circle(up, [0, 0], 12, 2, 0, false), l, sh]);
  expect([...kk.r.errors]).toEqual([]);
  expect(valid(kk.r.body!)).toBe(true);
  // Kegelstumpf R20 → R12, Höhe 40: innen um 2 mm senkrecht zur Wand kleiner, Radius also um 2·√(1 + 0,2²)
  const c = 2 * Math.hypot(1, 0.2), cone = (a: number, b: number) => Math.PI * 40 / 3 * (a * a + a * b + b * b);
  expect(measureVolume(kk.r.body!)).toBeCloseTo(cone(20, 12) - cone(20 - c, 12 - c), -1);
  const m = closed(to3MF([...kk.r.bodies.values()]));
  expect([m.dup, m.open]).toEqual([0, 0]);
  const rk = settle([rect(GROUND, [-20, -20], [20, 20], 1, 0, false), circle(up, [0, 0], 12, 2, 0, false), l, sh]);
  expect(rk.r.errors.get(4)).toMatch(/ohne Wirkung/);                  // Rechteck → Kreis schafft der Kern nicht: rot statt massiv
});

test('Rohrbogen: Zug mit runder Ecke, danach Bohrung und Flansch', async () => {
  const side: Frame = { o: [0, 0, 0], n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] };
  const prof = circle(side, [0, 0], 5, 1, 0, false);
  const sw: Sweep = { id: 2, type: 'sweep', profile: 1, ...GROUND, pts: [[0, 0], [40, 0, 0.4142], [50, 10], [50, 40]], body: 2 };
  const { r, fs } = settle([prof, sw]);
  expect([...r.errors]).toEqual([]);
  expect(valid(r.body!)).toBe(true);
  const back = await loadStep(await forExport(r.body!).blobSTEP().text());
  expect(measureVolume(back)).toBeCloseTo(measureVolume(r.body!), 0);
});


function gehaeuse(): Feature[] {
  const front: Frame = { o: [0, 0, 0], n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] };
  const p: Pattern = { id: 9, type: 'pattern', src: [7, 8], a: { ax: [1, 0, 0], n: 2, d: 64 }, b: { ax: [0, 0, -1], n: 2, d: 34 } };
  return [
    rect(GROUND, [0, 0], [80, 50], 1, 30, false),
    edge('fillet', 2, [0, 15, 0], [0, 1, 0], 5), edge('fillet', 3, [80, 15, 0], [0, 1, 0], 5),
    edge('fillet', 4, [0, 15, -50], [0, 1, 0], 5), edge('fillet', 5, [80, 15, -50], [0, 1, 0], 5),
    { id: 6, type: 'shell', at: [40, 30, -25], t: 2 } as Shell,
    circle(top(2), [8, 8], 4, 7, 18),
    circle(top(20), [8, 8], 1.25, 8, -10),
    p,
    circle(front, [40, 15], 6, 10, -2),
  ];
}
const GEH_V = 119356 - 97672 + 4 * Math.PI * 16 * 18 - 4 * Math.PI * 1.5625 * 10 - Math.PI * 36 * 2; // Schale + 4 Dome − 4 Sacklöcher − Wandloch

test('Gehäuse mit Schraubdomen: Volumen, Zurückspulen, Maße', () => {
  const { r, fs } = settle(gehaeuse());
  expect([...r.errors]).toEqual([]);
  expect(valid(r.body!)).toBe(true);
  expect(Math.abs(measureVolume(r.body!) - GEH_V)).toBeLessThan(5);
  for (let k = 1; k <= fs.length; k++) { const b = buildBody(fs.slice(0, k)); expect([k, [...b.errors], valid(b.body!)]).toEqual([k, [], true]); }
  for (const [name, c] of [
    ['Höhe 40', fs.map(f => f.id === 1 ? { ...f, d: 40 } : f)],
    ['Wand 3', fs.map(f => f.id === 6 ? { ...f, t: 3 } : f)],
    ['Breite 100', fs.map(f => f.id === 1 ? { ...f, p: { ...(f as Extrude).p, w: 100 } } : f)],
    ['Rundung 8', fs.map(f => f.id === 2 ? { ...f, r: 8 } : f)],
    ['Muster 3×2', fs.map(f => f.id === 9 ? { ...f, a: { ...(f as Pattern).a, n: 3, d: 30 } } : f)],
  ] as const) {
    const s = settle(c as Feature[]);
    expect([name, [...s.r.errors], valid(s.r.body!)]).toEqual([name, [], true]);
  }
});

test('Gehäuse: Schritte löschen und ausblenden stürzt nie ab, Fehlendes wird rot', () => {
  const { fs } = settle(gehaeuse());
  for (const id of [2, 6, 7, 8, 9, 10, 1]) {
    const del = buildBody(fs.filter(f => f.id !== id)), hid = buildBody(fs.map(f => f.id === id ? { ...f, hidden: true } : f) as Feature[]);
    if (del.body) expect(valid(del.body)).toBe(true);
    if (hid.body) expect(valid(hid.body)).toBe(true);
  }
});

test('Gehäuse mit Deckel als zweiter Körper: Speichern/Laden, STEP, 3MF, Zeichnung', async () => {
  const deckel: Feature[] = [
    { ...rect(top(30), [0, 0], [80, 50], 20, 2, false), body: 20 },
    { ...rect(top(30), [2.2, 2.2], [77.8, 47.8], 21, -3, false), body: 20 },
    { ...edge('fillet', 22, [0, 31, 0], [0, 1, 0], 5), body: 20 },
  ];
  const { r, fs } = settle([...gehaeuse(), ...deckel]);
  expect([...r.errors]).toEqual([]);
  expect(r.bodies.size).toBe(2);
  const back = settle(JSON.parse(JSON.stringify(fs)) as Feature[]);          // wie Speichern und Laden
  expect(measureVolume(back.r.body!)).toBeCloseTo(measureVolume(r.body!), 3);
  expect(back.r.fixes.size).toBe(0);
  const st = await loadStep(await forExport(r.body!).blobSTEP().text());
  expect(measureVolume(st)).toBeCloseTo(measureVolume(r.body!), 0);
  const bytes = to3MF([...r.bodies.values()]), m = closed(bytes);
  expect([m.dup, m.open]).toEqual([0, 0]);
  expect(new TextDecoder().decode(bytes).match(/<object /g)!.length).toBe(2);
  expect(sheetSVG(r.body!, { sheet: 'A4', title: 'Gehäuse', material: 'ABS', date: '' })).toContain('<path');
});

test('Ersatzteil aus STEP: Bohrung, Fläche versetzen, Rundung, wieder STEP, wieder bearbeiten', async () => {
  const { r: r0 } = settle(halter());
  const step = await forExport(r0.body!).blobSTEP().text();
  const shape = await loadStep(step), imports = new Map([[1, shape]]), v0 = measureVolume(shape);
  const bb = shape.boundingBox.bounds;
  const yTop = bb[1][1];
  const fs: Feature[] = [
    { id: 1, type: 'import', name: 'halter.step', step },
    { id: 2, d: -4, onFace: true, type: 'circle', o: [30, yTop, -38], n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], p: { cx: 0, cy: 0, r: 1.5 } } as Extrude,
    { id: 3, type: 'offset', at: [5, yTop, -37], n: [0, 1, 0], d: 5 } as Feature,
  ];
  let c = fs, r = buildBody(c, imports);
  for (let i = 0; i < 4 && r.fixes.size; i++) { c = c.map(f => r.fixes.has(f.id) ? { ...f, ...r.fixes.get(f.id) } as Feature : f); r = buildBody(c, imports); }
  expect([...r.errors]).toEqual([]);
  expect(valid(r.body!)).toBe(true);
  expect(r.body!.boundingBox.bounds[1][1]).toBeCloseTo(yTop + 5, 3);
  const st2 = await loadStep(await forExport(r.body!).blobSTEP().text());
  expect(measureVolume(st2)).toBeCloseTo(measureVolume(r.body!), 0);
});

test('STEP mit Zwischenständen und Hilfslinie: nur das fertige Teil und echte weitere Körper bleiben, Netz ohne NaN', async () => {
  const fertig = makeCylinder(5, 20).cut(makeCylinder(2, 20)) as Shape3D, block = makeCylinder(5, 20) as Shape3D, anderer = makeCylinder(5, 20, [50, 0, 0]) as Shape3D;
  const soll = measureVolume(fertig) + measureVolume(anderer), einzeln = await anderer.blobSTEP().text();
  const step = await (makeCompound([fertig, block, anderer, makeLine([0, 0, 0], [1e9, 0, 0])] as Shape3D[]) as Shape3D).blobSTEP().text();
  let dropped = 0;
  const s = await loadStep(step, n => { dropped = n; });
  expect(dropped).toBe(1);
  expect(measureVolume(s)).toBeCloseTo(soll, 1);
  expect(s.edges.every(e => e.length < 1000)).toBe(true);
  expect(s.meshEdges({ tolerance: 0.1, angularTolerance: 0.5 }).lines.every(Number.isFinite)).toBe(true);
  let nochmal = 0;
  await loadStep(einzeln, n => { nochmal = n; }); // einzelner Körper: nichts zu melden
  expect(nochmal).toBe(0);
});

test('Teilen, Verschieben, Bohren am verschobenen Körper, Zusammenfügen', () => {
  const plane: Feature = { id: 2, type: 'plane', c: [30, 0, 0], n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], off: 0 };
  const base = rect(GROUND, [0, 0], [60, 20], 1, 10, false);
  const split: Feature = { id: 3, type: 'split', body: 1, plane: 2 };
  const mv: Feature = { id: 4, type: 'move', body: 3, c: [0, 0, 0], q: [0, 0, 0, 1], t: [10, 0, 0] };
  const hole2: Extrude = { ...circle(top(10), [50, 10], 3, 5, -10), body: 3 };
  const fil = { ...edge('chamfer', 6, [70, 5, 0], [0, 1, 0], 1), body: 3 };
  const a = settle([base, plane, split, mv, hole2, fil]);
  expect([...a.r.errors]).toEqual([]);
  expect(a.r.bodies.size).toBe(2);
  const v = 60 * 20 * 10 - Math.PI * 9 * 10 - 0.5 * 10;
  expect(measureVolume(a.r.body!)).toBeCloseTo(v, 0);
  const cmb = settle([...a.fs, { id: 7, type: 'move', body: 3, c: [0, 0, 0], q: [0, 0, 0, 1], t: [-10, 0, 0] } as Feature, { id: 8, type: 'combine', op: 'fuse', a: 1, b: 3 } as Feature]);
  expect([...cmb.r.errors]).toEqual([]);
  expect(cmb.r.bodies.size).toBe(1);
  expect(measureVolume(cmb.r.body!)).toBeCloseTo(v, 0);
});

test('Drehteil: Profil drehen, Bohrung längs, Lochkreis, Nut, Fase', () => {
  const side: Frame = { o: [0, 0, 0], n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] };
  const prof: Extrude = { id: 1, d: 0, onFace: false, ...structuredClone(side), type: 'poly', p: {}, pts: [[0, 0], [20, 0], [20, 5], [10, 5], [10, 30], [0, 30]], rev: 360, axis: 'v' };
  const bore = circle(top(30), [0, 0], 4, 2, -30);
  const hole = circle(top(5), [15, 0], 2, 3, -5);
  const lk: Pattern = { id: 4, type: 'pattern', src: [3], a: { ax: [0, 1, 0], n: 4, d: 0 }, rot: { ax: [0, 1, 0], c: [0, 5, 0] } };
  const groove: Extrude = { id: 5, d: 0, onFace: false, ...structuredClone(side), type: 'rect', p: { x: 8.5, y: 15, w: 2, h: 3 }, rev: 360, axis: 'v', sub: true };
  const ch = edge('chamfer', 6, [10, 30, 0], [0, 0, 1], 1);
  const { r, fs } = settle([prof, bore, hole, lk, groove, ch]);
  expect([...r.errors]).toEqual([]);
  expect(valid(r.body!)).toBe(true);
  // Scheibe R20×5 + Welle R10×25 − Bohrung R4×30 − 4 Löcher R2×5 − Nut (R 8,5–10, 3 hoch) − Fase
  const nut = Math.PI * (100 - 72.25) * 3, fase = 0.5 * 2 * Math.PI * (10 - 1 / 3);
  const v = Math.PI * 400 * 5 + Math.PI * 100 * 25 - Math.PI * 16 * 30 - 4 * Math.PI * 4 * 5 - nut - fase;
  expect(Math.abs(measureVolume(r.body!) - v)).toBeLessThan(2);
});

test('Langloch-Muster, Spline-Kontur, Bögen im Vieleck: rundum dicht', () => {
  const slot: Extrude = { id: 2, d: -5, onFace: true, ...structuredClone(top(5)), type: 'poly', p: {}, pts: slotPts([7, 5], [23, 11]) };
  const pm: Pattern = { id: 3, type: 'pattern', src: [2], a: { ax: [1, 0, 0], n: 3, d: 20 } };
  const plate = rect(GROUND, [0, 0], [80, 30], 1, 5, false);
  const a = settle([plate, slot, pm]);
  expect([...a.r.errors]).toEqual([]);
  expect(measureVolume(a.r.body!)).toBeCloseTo(80 * 30 * 5 - 3 * 5 * (10 * 6 + Math.PI * 9), 0);
  const spline: Extrude = { id: 1, d: 8, onFace: false, ...structuredClone(GROUND), type: 'poly', smooth: true, p: {}, pts: [[0, 0], [30, -5], [40, 15], [15, 30], [-5, 15]] };
  const b = settle([spline]);
  expect([...b.r.errors]).toEqual([]);
  expect(valid(b.r.body!)).toBe(true);
  const m = closed(to3MF([...b.r.bodies.values()]));
  expect([m.dup, m.open]).toEqual([0, 0]);
  const cut = settle([spline, { ...circle(top(8), [15, 12], 5, 3, -8) }]);
  expect([...cut.r.errors]).toEqual([]);
});

test('Muster, dessen Kopien neben dem Körper liegen, meldet das statt still nichts zu schneiden', () => {
  const plate = rect(GROUND, [0, 0], [60, 40], 1, 6, false), hole = circle(top(6), [10, 20], 3, 2, -6);
  const row = (n: number, d: number): Pattern => ({ id: 3, type: 'pattern', src: [2], a: { ax: [1, 0, 0], n, d } });
  const all = (d: number, n: number) => settle([plate, hole, row(n, d)]).r;
  const v1 = 60 * 40 * 6 - Math.PI * 9 * 6;
  expect(all(20, 3).errors.size).toBe(0);
  const part = all(20, 5);                                               // Löcher bei x 10, 30, 50, 70, 90: zwei liegen daneben
  expect(part.errors.get(3)).toBe('2 von 4 Kopien treffen den Körper nicht');
  expect(part.failed).toEqual([]);
  expect(measureVolume(part.body!)).toBeCloseTo(v1 - 2 * Math.PI * 9 * 6, 1);   // die treffenden bleiben
  expect(all(100, 2).errors.get(3)).toMatch(/Keine Kopie/);
});

test('Fase, die in eine Bohrung läuft und einen ungültigen Körper ergäbe, wird rot, der Körper davor bleibt', () => {
  const plate = rect(GROUND, [-60, 20], [15, 30], 1, 18.5, false);
  const hole = { ...circle(top(18.5), [-20, 20], 4, 2, -9.5) };      // Bohrung sitzt auf der Vorderkante und öffnet die Wand
  const fase = edge('chamfer', 3, [-42.5, 18.5, -20], [1, 0, 0], 7.5);
  const { r } = settle([plate, hole, fase]);
  expect(r.errors.get(3)).toMatch(/gültigen Körper/);
  expect(valid(r.body!)).toBe(true);
  const m = closed(to3MF([...r.bodies.values()]));
  expect([m.dup, m.open]).toEqual([0, 0]);
});

test('Gescheiterte Rundung lässt den Körper davor unversehrt; Schale mit unendlichem Ergebnis wird rot', () => {
  const base = rect(GROUND, [0, 0], [60, 40], 1, 15, false), boss = circle(top(15), [0, 26], 8, 2, 8);
  const failed = settle([base, boss, edge('fillet', 3, [0, 15, -20], [0, 0, 1], 5)]).r;
  expect(failed.errors.has(3)).toBe(true);
  expect(invalidBodies(failed.bodies)).toEqual([]);
  expect(measureVolume(failed.body!)).toBeCloseTo(36000 + Math.PI * 64 * 8, 1);
  const shell = settle([base, circle(top(15), [7, 40], 1, 2, 3), { id: 3, type: 'shell', at: [30, 15, -20], t: 4 } as Shell]).r;
  expect(shell.errors.has(3)).toBe(true);
  expect(measureVolume(shell.body!)).toBeLessThan(40000);
});

test('Bohrung durch alles bleibt durchgehend, wenn das Teil dicker wird; Muster-Kopien auch', () => {
  const plate = (d: number) => rect(GROUND, [0, 0], [60, 40], 1, d, false), hole = (thru: boolean) => ({ ...circle(top(6), [10, 20], 3, 2, -6), thru });
  const p: Pattern = { id: 3, type: 'pattern', src: [2], a: { ax: [1, 0, 0], n: 3, d: 20 } };
  const first = settle([plate(6), hole(true), p]);
  expect(measureVolume(first.r.body!)).toBeCloseTo(60 * 40 * 6 - 3 * Math.PI * 9 * 6, 1);
  const thick = settle(first.fs.map(f => f.id === 1 ? { ...f, d: 10 } : f));
  expect([...thick.r.errors]).toEqual([]);
  expect((thick.fs[1] as Extrude).d).toBeCloseTo(-10, 6);                 // Feld zeigt die wahre Tiefe
  expect(measureVolume(thick.r.body!)).toBeCloseTo(60 * 40 * 10 - 3 * Math.PI * 9 * 10, 1);
  expect(thick.r.fixes.size).toBe(0);                                     // kommt zur Ruhe, kein endloses Nachrechnen
  expect(valid(thick.r.body!)).toBe(true);
  const blind = settle(settle([plate(6), hole(false)]).fs.map(f => f.id === 1 ? { ...f, d: 10 } : f));
  expect(measureVolume(blind.r.body!)).toBeCloseTo(60 * 40 * 10 - Math.PI * 9 * 6, 1); // ohne Haken bleibt es die feste Tiefe
});

test('Großes Lochraster: 300 Löcher in einem Schnitt, überlappende Kopien weiter einzeln', () => {
  const plate = rect(GROUND, [0, 0], [300, 200], 1, 10, false), hole = circle(top(10), [10, 10], 2, 2, -10);
  const grid = (d: number, n: number, m: number): Pattern => ({ id: 3, type: 'pattern', src: [2], a: { ax: [1, 0, 0], n, d }, b: { ax: [0, 0, -1], n: m, d } });
  const big = buildBody([plate, hole, grid(10, 20, 15)]);
  expect(big.errors.size).toBe(0);
  expect(measureVolume(big.body!)).toBeCloseTo(300 * 200 * 10 - 300 * Math.PI * 4 * 10, 0);
  expect(new Set(big.names.get(1)!.filter(x => x.o.f === 3).map(x => x.o.at)).size).toBe(299);   // jede Kopie behält ihren Namen
  const miss = buildBody([plate, hole, grid(30, 12, 1)]);                  // x bis 340: zwei Kopien daneben
  expect(miss.errors.get(3)).toBe('2 von 11 Kopien treffen den Körper nicht');
  const lap = buildBody([plate, hole, { id: 3, type: 'pattern', src: [2], a: { ax: [1, 0, 0], n: 2, d: 3 } }]); // Löcher überlappen sich
  expect([...lap.errors]).toEqual([]);
  expect(valid(lap.body!)).toBe(true);
  const r = 2, a = 2 * r * r * Math.acos(3 / 4) - 1.5 * Math.sqrt(16 - 9);    // Schnittfläche zweier Kreise
  expect(measureVolume(lap.body!)).toBeCloseTo(600000 - (2 * Math.PI * 4 - a) * 10, 1);
}, 30000);

test('Wiederverwendeter Stand liefert genau dasselbe wie volles Neurechnen', () => {
  const sig = (r: ReturnType<typeof buildBody>) => JSON.stringify({ v: r.body ? +measureVolume(r.body).toFixed(4) : null, n: r.bodies.size, e: [...r.errors], f: r.failed, u: r.unsure, x: [...r.fixes], m: [...r.names].map(([k, a]) => [k, a.map(x => `${x.o.f}:${x.o.tag}:${x.o.i ?? ''}:${x.o.at ?? ''}`).sort()]) });
  const cache = newCache();
  let fs = settle(gehaeuse()).fs;
  const set = (id: number, p: Record<string, unknown>) => { fs = fs.map(f => f.id === id ? { ...f, ...p } as Feature : f); };
  const pat = (fs.find(f => f.id === 9) as Pattern);
  const steps: (() => void)[] = [
    () => {}, () => set(10, { d: -1 }), () => set(10, { d: -2 }), () => set(10, { p: { cx: 30, cy: 12, r: 5 } }), () => set(9, { a: { ...pat.a, n: 3, d: 30 } }), () => set(6, { t: 3 }),
    () => set(2, { r: 7 }), () => set(2, { r: 40 }), () => set(2, { r: 5 }), () => set(1, { d: 40 }), () => set(8, { hidden: true }), () => set(8, { hidden: false }),
    () => { fs = fs.filter(f => f.id !== 10); }, () => { fs = [...fs, circle(top(40), [40, 25], 3, 11, -5)]; }, () => { fs = [...fs, edge('chamfer', 12, [40, 40, -25 + 3], [0, 0, 1], 0.5)]; }, () => set(11, { d: -6 }), () => { fs = settle(gehaeuse()).fs; }, () => { fs = [fs[1], fs[0], ...fs.slice(2)]; },
  ];
  for (const [i, step] of steps.entries()) {
    step();
    const c = buildBody(fs, undefined, cache), a = sig(c), b = sig(buildBody(fs));
    expect([i, a]).toEqual([i, b]);
    if (c.body) expect(valid(c.body)).toBe(valid(buildBody(fs).body!));
  }
}, 60000);

test('Prüfung vor dem Export erkennt einen ungültigen Körper', () => {
  const { r } = settle([rect(GROUND, [-60, 20], [15, 30], 1, 18.5, false), circle(top(18.5), [-20, 20], 4, 2, -9.5)]);
  expect(invalidBodies(r.bodies)).toEqual([]);
  const oc = getOC() as any, b = new oc.BRepFilletAPI_MakeChamfer(r.body!.wrapped);    // dieselbe Fase wie oben, am Kern vorbei
  r.body!.edges.filter(e => { const [x, y, z] = e.pointAt(0.5).toTuple(); return x < -24 && Math.abs(y - 18.5) < 1e-6 && Math.abs(z + 20) < 1e-6; }).forEach(e => b.Add(7.5, e.wrapped));
  b.Build(new oc.Message_ProgressRange());
  expect(invalidBodies(new Map([[1, cast(b.Shape()) as any]]))).toEqual([1]);
});

test('Zwei Kreise auf einer flachen Skizze hochziehen: der zweite bleibt, statt sich an der Unterseite des ersten umzudrehen', () => {
  const a = { ...circle(GROUND, [-20, 0], 5, 2, 0), body: 1 }, b = { ...circle(GROUND, [20, 0], 5, 3, 4), body: 1 }, flach = { ...rect(GROUND, [-30, -10], [30, 10], 1, 0, false), body: 1 };
  const { r: r1, fs: fs1 } = settle([flach, a, b]);
  expect([...r1.errors]).toEqual([]);
  const { r, fs } = settle(fs1.map(f => f.id === 2 ? { ...f, d: 4 } as Feature : f)); // danach auch der linke, er steht in der Liste vor dem rechten
  expect([...r.errors]).toEqual([]);
  expect(measureVolume(r.body!)).toBeCloseTo(2 * Math.PI * 25 * 4, 1);
  expect((fs.find(f => f.id === 3) as Extrude).onFace).toBe(false); // die Skizze lag nie auf einer Körperfläche
});

test('Gemeinsam ziehen: nur Skizzen gleicher Richtung am Deckel; zwei markierte Kanten auf einmal gerundet', () => {
  const a = circle(GROUND, [-20, 0], 5, 1, 0, false), b = circle(GROUND, [20, 0], 5, 2, 0, false), wand = circle({ o: [0, 0, 0], n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, [0, 0], 5, 3, 0, false);
  const linie = { ...GROUND, id: 4, type: 'line', p: {}, d: 0, open: true, pts: [[0, 0], [5, 5]] } as Extrude;
  expect(pullTogether(a, 'end', [b, wand, linie, a, undefined]).map(f => f.id)).toEqual([2]);
  expect(pullTogether(a, 'start', [b])).toEqual([]);
  const kante = { at: [10, 2, 0] as Vec, dir: [0, 1, 0] as Vec };
  expect(sameEdge(kante, { at: [10, 7, 0], dir: [0, -2, 0] }, 0.1)).toBe(true); // irgendwo auf derselben Kante, Richtung egal
  expect(sameEdge(kante, { at: [12, 2, 0], dir: [0, 1, 0] }, 0.1)).toBe(false); // parallele Kante daneben
  expect(sameEdge(kante, { at: [10, 2, 0], dir: [1, 0, 0] }, 0.1)).toBe(false); // andere Kante an derselben Ecke
  const block = rect(GROUND, [0, 0], [20, 10], 1, 5, false), fs: Feature[] = [block, edge('fillet', 2, [0, 2, 0], [0, 1, 0], 1.5), edge('fillet', 3, [20, 2, -10], [0, 1, 0], 1.5)];
  const { r } = settle(fs);
  expect([...r.errors]).toEqual([]);
  expect(measureVolume(r.body!)).toBeCloseTo(1000 - 2 * 5 * 1.5 ** 2 * (1 - Math.PI / 4), 2);
});

test('Trimmen: Rechteck und Kreis werden zu einer Fläche, in jeder Reihenfolge, und lassen sich hochziehen', () => {
  const start = (): Feature[] => [rect(GROUND, [0, 0], [20, 20], 1, 0, false), { ...circle(GROUND, [20, 20], 10, 2, 0, false), body: 1 }];
  const klick = (fs: Feature[], q: number[]) => { // wie im Programm: nächste Skizze an der Mausposition, Nummern ändern sich beim Verbinden
    const sk = fs.filter((f): f is Extrude => isExtrude(f)), p = sk.map(f => pieceAt(f, sk, q)!).sort((x, y) => x.dist - y.dist)[0];
    return trimFeatures(fs, p, 50).features;
  };
  const a = [20, 15], b = [15, 20], c = [12.93, 12.93];
  for (const reihe of [[a, b, c], [c, a, b], [b, c, a], [a, c, b]]) {
    let fs = start();
    for (const q of reihe) fs = klick(fs, q);
    const sk = fs.filter(isExtrude);
    expect(sk.length).toBe(1);
    expect(sk[0].type).toBe('poly');
    expect(sk[0].open).toBeUndefined();
    const { r } = settle([{ ...sk[0], d: 3 }]);
    expect([...r.errors]).toEqual([]);
    expect(valid(r.body!)).toBe(true);
    expect(measureVolume(r.body!)).toBeCloseTo(3 * (400 + Math.PI * 100 * 0.75), 1);
  }
});

test('Trimmen: Stücke bis zum nächsten Schnitt, Hilfslinie bleibt Hilfslinie, Bogen wird geteilt, ohne Schnitt verschwindet der Kreis', () => {
  const hilfe = { ...GROUND, id: 1, type: 'poly', p: {}, d: 0, aux: true, open: true, pts: [[0, 0], [20, 0], [20, 20]] } as Extrude;
  const quer = { ...GROUND, id: 2, type: 'poly', p: {}, d: 0, aux: true, open: true, pts: [[5, -5], [5, 5]] } as Extrude, quer2 = { ...quer, id: 3, pts: [[15, -5], [15, 5]] };
  const rest = (f: Extrude, q: number[], ...o: Extrude[]) => trimFeatures([f, ...o], pieceAt(f, [f, ...o], q)!, 50).features.filter(isExtrude).filter(g => !o.includes(g));
  expect(rest(hilfe, [10, 0], quer, quer2).map(g => g.pts)).toEqual([[[0, 0], [5, 0]], [[15, 0], [20, 0], [20, 20]]]); // Mitte raus: zwei Linien
  expect(rest(hilfe, [2, 0], quer).map(g => g.pts)).toEqual([[[5, 0], [20, 0], [20, 20]]]); // bis zum Schnitt kürzen
  expect(rest(hilfe, [10, 0], quer, quer2).every(g => g.aux && g.type === 'poly')).toBe(true);
  expect(rest({ ...hilfe, pts: [[0, 0], [20, 0]] }, [10, 0])).toEqual([]); // ohne Schnitt: ganz weg
  // Halbkreis-Bogen, senkrecht geschnitten: bleibt ein Bogen auf demselben Kreis
  const bogen = { ...GROUND, id: 4, type: 'line', p: {}, d: 0, open: true, pts: [[10, 0, 1], [-10, 0]] } as Extrude, s = { ...quer, id: 5, pts: [[0, 0], [0, 20]] };
  const [teil] = rest(bogen, [7.07, 7.07], s), mitte = arcPoints(teil.pts![0], teil.pts![1], teil.pts![0][2] ?? 0, 2)[0];
  expect(teil.pts![0][0]).toBeCloseTo(0, 6);
  expect(Math.hypot(mitte[0], mitte[1])).toBeCloseTo(10, 6);
  expect(mitte[0]).toBeLessThan(0); // das Stück bei x > 0 ist weg
  const k = circle(GROUND, [0, 0], 5, 6, 0, false);
  expect(rest(k, [5, 0])).toEqual([]);
  const r2 = rect(GROUND, [100, 100], [110, 110], 7, 0, false); // andere Skizze ohne Berührung: bleibt, nichts wird verbunden
  expect(pieceAt(k, [k, r2], [5, 0])!.i).toBe(-1);
  expect(pieceAt({ ...k, p: { ...k.p, ry: 3 } }, [k], [5, 0])).toBeNull(); // Ellipse lässt sich nicht trimmen
});

test('Rechteck aus der Mitte behält die Mitte: Maß tippen und Seite ziehen', () => {
  const f = { ...rect(GROUND, [-5, -10], [5, 10], 1, 0, false), mid: true };
  const mitte = () => [f.p.x + f.p.w / 2, f.p.y + f.p.h / 2];
  rectSize(f, 'w', 20); rectSize(f, 'h', 10);
  expect(f.p).toMatchObject({ x: -10, y: -5, w: 20, h: 10 });
  const f0 = structuredClone(f);
  expect(applyPush(f, f0, 'x1', 1, 3)).toEqual(['Breite', 26]);
  expect(mitte()).toEqual([0, 0]);
  applyPush(f, f0, 'y0', -1, 2);
  expect(f.p.h).toBe(14);
  expect(mitte()).toEqual([0, 0]);
  expect(pushTo('x1', f0, 30)).toBe(5); // 5 mm je Seite ergeben 30 mm
  const ecke = rect(GROUND, [0, 0], [10, 20], 2, 0, false), ecke0 = structuredClone(ecke); // ohne Mitte bleibt die Gegenseite stehen
  applyPush(ecke, ecke0, 'x1', 1, 3);
  rectSize(ecke, 'h', 5);
  expect(ecke.p).toEqual({ x: 0, y: 0, w: 13, h: 5 });
});

test('Kreis an einer schrägen Hilfslinie spiegeln; kleinere Skizze hat die kleinere Fläche', () => {
  const k = circle(GROUND, [10, 0], 2, 1, 0, false);
  const linie = { ...GROUND, id: 2, type: 'poly', p: {}, d: 0, aux: true, open: true, pts: [[0, 0], [5, 5]] } as Extrude, pl = linePlane(linie, 0)!;
  const m = mirroredCopy(k, 3, pl.n, pl.c);
  const mitte = [0, 1, 2].map(i => m.o[i] + m.p.cx * m.u[i] + m.p.cy * m.v[i]); // an y = x gespiegelt: (10, 0) wird (0, 10), v zeigt nach −z
  expect(mitte[0]).toBeCloseTo(0, 6);
  expect(mitte[2]).toBeCloseTo(-10, 6);
  expect(sketchArea(k)).toBeLessThan(sketchArea(rect(GROUND, [-5, -10], [5, 10], 4, 0, false)));
});

test('Raster: ebene Fläche ergibt ihr Rechteck, runde und abgewandte Flächen fallen heraus', () => {
  const pl = { o: [0, 5, 0], n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] } as Parameters<typeof coplanarBounds>[4];
  const pos = [2, 5, -1, 12, 5, -1, 12, 5, -4, /* Fläche */ 0, 5, 0, 3, 7, 0, 6, 5, 0, /* gewölbt */ 20, 5, 0, 22, 5, 0, 22, 5, 2 /* abgewandt */];
  const nrm = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0];
  const idx = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  expect(coplanarBounds(pos, idx, nrm, [0, 3, 3, 3, 6, 3], pl)).toEqual([[2, 1], [12, 4]]);
  expect(coplanarBounds(pos, idx, nrm, [3, 3, 6, 3], pl)).toBeNull();
});

test('Kugel: Werkzeug, Vollkreis als Drehkörper, Skizze quer über die Achse', async () => {
  const soll = (r: number) => 4 / 3 * Math.PI * r ** 3;
  const k: Extrude = { ...circle(GROUND, [30, -20], 10, 1, 0, false), rev: 360, ball: true };
  const r = buildBody([k]);
  expect([...r.errors]).toEqual([]);
  expect(valid(r.body!)).toBe(true);
  expect(measureVolume(r.body!)).toBeCloseTo(soll(10), 3);
  const box = r.body!.boundingBox; // Mitte liegt am Klickpunkt, nicht am Ursprung
  expect(box.center[0]).toBeCloseTo(30, 3);
  expect(box.center[2]).toBeCloseTo(20, 3);
  // Maße ändern, dann Export hin und zurück
  const groesser = buildBody([{ ...k, p: { ...k.p, r: 15, cx: 0, cy: 5 } }]);
  expect(measureVolume(groesser.body!)).toBeCloseTo(soll(15), 3);
  const back = await loadStep(await forExport(r.body!).blobSTEP().text());
  expect(measureVolume(back)).toBeCloseTo(soll(10), 1);
  expect(to3MF([...r.bodies.values()])).toBeTruthy();
  // Zurückspulen: Kugel an einen Quader gesetzt, ohne Kugel bleibt der Quader
  const quader = rect(GROUND, [0, 0], [10, 10], 2, 10, false), mit = buildBody([quader, { ...k, id: 3, body: 2, p: { cx: 10, cy: 5, r: 5 } }]);
  expect(valid(mit.body!)).toBe(true);
  expect(measureVolume(mit.body!)).toBeGreaterThan(1000);
  expect(measureVolume(buildBody([quader]).body!)).toBeCloseTo(1000, 3);
  // Abziehen: Mitte auf der Fläche = Halbkugel-Mulde
  const wuerfel = rect(GROUND, [0, 0], [20, 20], 4, 10, false), mulde = buildBody([wuerfel, { ...k, id: 5, sub: true, p: { cx: 10, cy: 10, r: 5 } }]);
  expect([...mulde.errors]).toEqual([]);
  expect(valid(mulde.body!)).toBe(true);
  expect(measureVolume(mulde.body!)).toBeCloseTo(4000 - soll(5) / 2, 2);
  // Halbkugel: halber Drehwinkel, flache Seite auf der Skizzenebene, Kuppel in Richtung n (hier +y)
  const halb = buildBody([{ ...k, rev: 180, p: { cx: 0, cy: 0, r: 30 } }]);
  expect(valid(halb.body!)).toBe(true);
  expect(measureVolume(halb.body!)).toBeCloseTo(soll(30) / 2, 1);
  const hb = halb.body!.boundingBox.bounds;
  expect([hb[0][1], hb[1][1]].map(x => Math.round(x * 1e3) / 1e3)).toEqual([0, 30]);
  // Teilen und eine Hälfte als Schritt löschen: übrig bleibt eine Halbkugel; ohne den Schritt beide
  const ebene = { id: 6, type: 'plane' as const, c: [0, 0, 0] as Vec, n: [0, 1, 0] as Vec, u: [1, 0, 0] as Vec, v: [0, 0, -1] as Vec, off: 0 };
  const ganz: Feature[] = [{ ...k, p: { cx: 0, cy: 0, r: 30 } }, ebene, { id: 7, type: 'split', body: 1, plane: 6 }];
  expect([...buildBody(ganz).bodies.keys()].sort()).toEqual([1, 7]);
  const rest = buildBody([...ganz, { id: 8, type: 'drop', body: 7 }]);
  expect([...rest.errors]).toEqual([]);
  expect([...rest.bodies.keys()]).toEqual([1]);
  expect(measureVolume(rest.body!)).toBeCloseTo(soll(30) / 2, 1);
  expect(buildBody([...ganz, { id: 8, type: 'drop', body: 99 }]).errors.get(8)).toContain('nicht vorhanden');
  expect(parseModel(JSON.stringify({ features: [{ id: 8, type: 'drop', body: 7 }] })).features).toHaveLength(1);
  expect(() => parseModel(JSON.stringify({ features: [{ id: 8, type: 'drop' }] }))).toThrow('Körper fehlt');
  // Vollkreis mit Achse durch die Mitte ist auch ohne Werkzeug eine Kugel
  const voll: Extrude = { ...circle(GROUND, [0, 0], 10, 1, 0, false), rev: 360 };
  expect(measureVolume(buildBody([voll]).body!)).toBeCloseTo(soll(10), 3);
  // Quer über die Achse: Meldung statt leerer Körper
  const quer = buildBody([{ ...rect(GROUND, [-5, -5], [5, 5], 1, 0, false), rev: 360 }]);
  expect(quer.errors.get(1)).toContain('beiden Seiten');
});

test('Griff: Kugel zieht am Radius, Rundung eines anderen Körpers bleibt unberührt', () => {
  const k: Extrude = { ...circle(GROUND, [50, 0], 10, 2, 0, false), rev: 360, ball: true, body: 2 };
  const rund = edge('fillet', 3, [40, 10, 0], [1, 0, 0], 20); // Kante zeigt genau auf die Kugel
  rund.body = 1;
  const quader = { ...rect(GROUND, [0, -5], [40, 5], 1, 10, false), body: 1 };
  const g = ownerOf([quader, rund, k], [60, 0, 0], [1, 0, 0], 0.15, 2);
  expect(g?.f.id).toBe(2);
  expect(g?.part).toBe('r');
  const f0 = structuredClone(k);
  applyPush(k, f0, 'r', 1, 5);
  expect(k.p.r).toBe(15);
  // Drehkörper ohne eigenen Griff: die Rundung des anderen Körpers darf nicht anspringen
  const dreh: Extrude = { ...rect(GROUND, [45, 2], [55, 8], 4, 0, false), rev: 360, body: 4 };
  expect(ownerOf([quader, rund, dreh], [50, 8, 0], [0, 1, 0], 0.15, 4)?.f.id).not.toBe(3);
});

test('Kantennetz: Nähte von Kugel und Zylinder fallen weg, echte Kanten bleiben', () => {
  const mesh = { tolerance: 0.05, angularTolerance: 0.3 };
  const kugel = shownEdges(buildBody([{ ...circle(GROUND, [0, 0], 10, 1, 0, false), rev: 360, ball: true }]).body!, mesh);
  expect(kugel.edges).toEqual([]);
  expect(kugel.lines).toEqual([]);
  const zyl = shownEdges(buildBody([circle(GROUND, [0, 0], 5, 1, 10, false)]).body!, mesh);
  expect(zyl.edges.length / 2).toBe(4); // Boden- und Deckelkreis aus je zwei Bögen, die Trennlinien der Halbzylinder fehlen
  expect(zyl.lines.length).toBe(zyl.edges.filter((_, i) => i % 2).reduce((a, b) => a + b, 0) * 3);
  const box = shownEdges(buildBody([rect(GROUND, [0, 0], [10, 10], 1, 10, false)]).body!, mesh);
  expect(box.edges.length / 2).toBe(12);
  expect(box.edges[2]).toBe(box.edges[1]); // Gruppen liegen lückenlos hintereinander
  // Rundung am Kreis: Übergänge zum Zylinder und zum Deckel bleiben als echte Kanten
  const rund = shownEdges(buildBody([circle(GROUND, [0, 0], 5, 1, 10, false), edge('fillet', 2, [5, 10, 0], [0, 0, 1], 1)]).body!, mesh);
  expect(rund.edges.length / 2).toBe(6);
  // Bohrung: nur die beiden Kreise an den Enden, beim Abziehen wird der Zylinder wieder eine Fläche mit Naht
  const loch = shownEdges(buildBody([rect(GROUND, [-20, -20], [20, 20], 1, 10, false), circle(top(10), [0, 0], 4, 2, -10)]).body!, mesh);
  expect(loch.edges.length / 2).toBe(12 + 2);
});

test('Langloch: Länge und Radius ändern beide Seiten gemeinsam, freie Form ändert einzeln', () => {
  const pts = slotPts([0, 0], [30, 10]); // Gerade 20, Radius 5
  const soll = (L: number, r: number, x = 5, y = 0) => [[x, y], [x + L, y, 1], [x + L, y + 2 * r], [x, y + 2 * r, 1]];
  expect(slotLength(pts, 40)).toEqual(soll(40, 5));
  expect(slotRadius(pts, 8)).toEqual(soll(20, 8, 5, -3));
  // Punkt am rechten Ende ziehen: oben und unten laufen mit, auch wenn die Maus schräg steht
  expect(slotMoveEnd(pts, 2, slotPull(pts, 2, [35, 99]))).toEqual(soll(30, 5));
  // Punkt am linken Ende: dort wandert das Ende
  expect(slotMoveEnd(pts, 0, slotPull(pts, 0, [0, -7]))).toEqual(soll(25, 5, 0));
  // nicht durch das andere Ende hindurch, auch nicht mit der kleinsten Länge
  expect(slotMoveEnd(pts, 1, -100)).toEqual(pts);
  expect(slotLength(pts, 0)[1][0]).toBeCloseTo(5.5);
  // Bogen ziehen: Ende wandert nach außen, links in die Gegenrichtung
  const f = { ...sketchFeature('rect', GROUND, [0, 0], [10, 10], 1, false)!, type: 'poly', p: {}, pts, slot: true, d: 0 } as Extrude;
  expect(isSlot(f)).toBe(true);
  const rechts = structuredClone(f), links = structuredClone(f);
  applyPush(rechts, f, 'arc', 1, 4, 1);
  expect(rechts.pts).toEqual(soll(24, 5));
  applyPush(links, f, 'arc', 1, 4, 3);
  expect(links.pts).toEqual(soll(24, 5, 1));
  // ohne das Merkmal: frei wie bisher
  delete f.slot;
  expect(isSlot(f)).toBe(false);
  const frei = structuredClone(f);
  applyPush(frei, f, 'arc', 1, 4, 1);
  expect(frei.pts![1].slice(0, 2)).toEqual([25, 0]);
  // bleibt ein gültiger Körper
  const r = buildBody([{ ...f, slot: true, pts: slotLength(pts, 40), d: 10 } as Extrude]);
  expect(valid(r.body!)).toBe(true);
  expect(measureVolume(r.body!)).toBeCloseTo((40 * 10 + Math.PI * 25) * 10, 2);
});

test('Skizzen-Ecken runden und fasen (F1)', () => {
  const r = rect(GROUND, [0, 0], [20, 10], 1, 5, false), vol = (f: Extrude | null) => measureVolume(buildBody([f!]).body!);
  expect(vol(roundCorners(r, null, 2))).toBeCloseTo((200 - 4 * (4 - Math.PI)) * 5, 3);
  expect(vol(roundCorners(r, null, 2, true))).toBeCloseTo((200 - 4 * 2) * 5, 3);
  const eine = roundCorners(r, [2], 3)!; // eine Ecke: Vieleck mit 5 Punkten, ein Bogen
  expect([eine.type, eine.pts!.length, eine.pts!.filter(q => q[2]).length]).toEqual(['poly', 5, 1]);
  expect(vol(eine)).toBeCloseTo((200 - (9 - Math.PI * 9 / 4)) * 5, 3);
  expect(roundCorners(r, null, 5.5)).toBeNull(); // Seite 10 reicht nicht für 2 × 5,5
  expect(roundCorners(eine, [2], 1)).toBeNull(); // Ecke am Bogen bleibt
  // Abhängigkeiten: Länge der verkürzten Seite fällt weg, die gegenüberliegende rutscht eine Nummer weiter
  const v = { ...eine, pts: [[0, 0], [20, 0], [20, 10], [0, 10]], cons: [{ t: 'len' as const, i: 1, val: 10 }, { t: 'len' as const, i: 3, val: 10 }, { t: 'h' as const, i: 2 }] };
  expect(roundCorners(v, [2], 2)!.cons).toEqual([{ t: 'len', i: 4, val: 10 }, { t: 'h', i: 3 }]);
});

test('Gewinde (F4): Bolzen M10 außen, Bohrung M10 innen, gültig und Volumen zwischen Kern und voll', () => {
  const T = THREAD_SPECS.M10, bolzen = circle(GROUND, [0, 0], 5, 1, 20, false);
  const voll = measureVolume(buildBody([bolzen]).body!), g = buildBody([{ ...bolzen, thread: T }]);
  expect([...g.errors]).toEqual([]);
  expect(valid(g.body!)).toBe(true);
  // ISO-Profil nachgerechnet: Gang = Trapez (Fuß 0,75·P, Spitze P/8, Tiefe 0,5413·P), je Umdrehung Fläche · 2π · Schwerpunkt-Radius (Pappus)
  const lo = 5 - 0.5413 * T.P, t = 5 - lo, A = 0.4375 * T.P * t, rs = lo + t * (0.75 + 0.25) / (3 * 0.875);
  const v = measureVolume(g.body!), soll = Math.PI * lo ** 2 * 20 + A * 2 * Math.PI * rs * 20 / T.P;
  expect(v).toBeLessThan(voll - 50);
  expect(v / soll).toBeCloseTo(1, 3);
  // schnell genug für den Worker: das verdrehte Vorgängermodell brauchte für 5 mm über 2 Minuten nur fürs Netz
  const t0 = performance.now(), netz = g.body!.mesh({ tolerance: 0.05, angularTolerance: 0.2 });
  expect(performance.now() - t0).toBeLessThan(5000);
  expect(netz.triangles.length / 3).toBeLessThan(50000);
  const step = forExport(g.body!).blobSTEP();
  expect(step.size).toBeGreaterThan(1000);
  const top: Frame = { ...GROUND, o: [0, 20, 0] }, block = rect(GROUND, [-15, -15], [15, 15], 2, 20, false);
  const loch = circle(top, [0, 0], (T.D - 1.0825 * T.P) / 2, 3, -15, true), glatt = measureVolume(buildBody([block, loch]).body!);
  const innen = buildBody([block, { ...loch, thread: T }]);
  expect([...innen.errors]).toEqual([]);
  expect(valid(innen.body!)).toBe(true);
  expect(measureVolume(innen.body!)).toBeLessThan(glatt - 50);
  expect(measureVolume(innen.body!)).toBeGreaterThan(18000 - Math.PI * 25 * 15); // nicht mehr als ein Loch mit Nenn-Ø
}, 60000);

test('Rippe (F5): Linie im Winkel wird Wand bis an den Körper, Seite automatisch, ohne Körper in Reichweite Fehler', () => {
  const XY: Frame = { o: [0, 0, 0], n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] };
  const boden = rect(GROUND, [0, -10], [40, 10], 1, 5, false), wand = rect(GROUND, [0, -10], [5, 10], 2, 40, false);
  const linie = (pts: number[][], rib = 3) => ({ ...XY, id: 3, type: 'line', p: {}, pts, d: 0, open: true, rib }) as Extrude;
  const r = buildBody([boden, wand, linie([[5, 30], [35, 5]])]);
  expect([...r.errors]).toEqual([]);
  expect(valid(r.body!)).toBe(true);
  expect(measureVolume(r.body!)).toBeCloseTo(7500 + 0.5 * 30 * 25 * 3, 1); // Dreieck im Winkel, 3 mm dick
  // andersherum gezeichnet: gleiche Seite
  expect(measureVolume(buildBody([boden, wand, linie([[35, 5], [5, 30]])]).body!)).toBeCloseTo(8625, 1);
  // Linie über dem Winkel, nicht berührend: Wand reicht trotzdem bis an den Körper
  expect(measureVolume(buildBody([boden, wand, linie([[5, 30], [35, 30]], 2)]).body!)).toBeCloseTo(7500 + 30 * 25 * 2, 1);
  // weit weg vom Körper: Fehler statt still nichts
  const weg = buildBody([boden, wand, { ...linie([[100, 100], [120, 100]]), o: [0, 0, 50] }]);
  expect(weg.errors.get(3)).toMatch(/trifft den Körper nicht/);
});

test('Lippe und Falz (F6): Ring an der Öffnung einer Schale, nach oben bzw. mit Spiel abgezogen', () => {
  const kiste = rect(GROUND, [0, 0], [40, 30], 1, 20, false), hohl: Shell = { id: 2, type: 'shell', at: [20, 20, -15], t: 2 };
  const ring = (W: number) => (36 + 2 * W) * (26 + 2 * W) - (4 - Math.PI) * W * W - 36 * 26; // Öffnung 36×26, nach außen versetzt mit runden Ecken
  const ohne = measureVolume(buildBody([kiste, hohl]).body!);
  expect(ohne).toBeCloseTo(24000 - 36 * 26 * 18, 1);
  const lippe = buildBody([kiste, { ...hohl, lip: { kind: 'lip', w: 1, h: 2, c: 0.2 } }]);
  expect([...lippe.errors]).toEqual([]);
  expect(valid(lippe.body!)).toBe(true);
  expect(measureVolume(lippe.body!)).toBeCloseTo(ohne + ring(1) * 2, 1);
  expect(lippe.body!.boundingBox.bounds[1][1]).toBeCloseTo(22, 3);
  const falz = buildBody([kiste, { ...hohl, lip: { kind: 'groove', w: 1, h: 2, c: 0.2 } }]);
  expect([...falz.errors]).toEqual([]);
  expect(valid(falz.body!)).toBe(true);
  expect(measureVolume(falz.body!)).toBeCloseTo(ohne - ring(1.2) * 2.2, 1);
  // breiter als die Wand: Schale bleibt, Meldung am Schritt
  const zuBreit = buildBody([kiste, { ...hohl, lip: { kind: 'groove', w: 5, h: 2, c: 0.2 } }]);
  expect(measureVolume(zuBreit.body!)).toBeLessThan(ohne);
});

test('Benannte Maße (F7): Ausdrücke, Bindung, Neurechnen nach Parameteränderung, Datei', async () => {
  const { evalExpr, applyParams, changedNumbers, usesNames } = await import('./model');
  expect(evalExpr('2 + 3 × 4', {})).toBe(14);
  expect(evalExpr('(breite - 2*wand) / 2', { breite: 40, wand: 2 })).toBe(18);
  expect(evalExpr('-a + 1,5', { a: 1 })).toBe(0.5);
  expect(() => evalExpr('hoehe + 1', {})).toThrow('Unbekannter Name „hoehe“');
  expect(() => evalExpr('constructor', {})).toThrow('Unbekannter Name');
  expect(() => evalExpr('alert(1)', { alert: 1 })).toThrow();
  expect(() => evalExpr('2 +', {})).toThrow();
  expect(usesNames('12,5')).toBe(false);
  expect(usesNames('b/2')).toBe(true);
  // Kasten: Breite an Parameter gebunden, aus der Mitte gezeichnet → Mitte bleibt
  const kasten = { ...rect(GROUND, [0, 0], [40, 20], 1, 10, false), mid: true } as Extrude & { ex?: Record<string, { e: string; u: number }> };
  const vorher = structuredClone(kasten);
  kasten.p.x -= 5; kasten.p.w = 50; // so ändert das Seitenfeld w bei „aus der Mitte“
  expect(changedNumbers(vorher, kasten).sort()).toEqual(['p.w', 'p.x']);
  kasten.ex = { 'p.w': { e: 'breite', u: 1 }, d: { e: 'breite / 5', u: 25.4 } }; // d in Zoll eingetippt
  const fehler = applyParams([kasten], { breite: 60 });
  expect(fehler).toEqual([]);
  expect([kasten.p.x, kasten.p.w]).toEqual([-10, 60]); // Mitte bei 20
  expect(kasten.d).toBeCloseTo(60 / 25.4 / 5 * 25.4, 9);
  expect(measureVolume(buildBody([kasten]).body!)).toBeCloseTo(60 * 20 * 12, 3);
  // Parameter gelöscht: Maß bleibt stehen, Meldung
  expect(applyParams([kasten], {})).toEqual(['#1: Unbekannter Name „breite“', '#1: Unbekannter Name „breite“']);
  expect(kasten.p.w).toBe(60);
  // Datei: Parameter und Bindungen kommen mit, Unsinn wird abgelehnt
  const datei = parseModel(JSON.stringify({ features: [kasten], nextId: 2, params: { breite: 60 } }));
  expect(datei.params).toEqual({ breite: 60 });
  expect(datei.features[0].ex?.['p.w'].e).toBe('breite');
  expect(parseModel(JSON.stringify({ features: [] })).params).toEqual({});
  expect(() => parseModel(JSON.stringify({ features: [], params: { '<img>': 1 } }))).toThrow('Parameter');
  expect(() => parseModel(JSON.stringify({ features: [{ ...kasten, ex: { 'p.w': { e: 1 } } }] }))).toThrow('Gebundene');
});

test('Gebundenes Maß, danach gezogen: Bindung fällt weg, Parameteränderung setzt es nicht zurück (P1)', async () => {
  const { applyParams, dropStale } = await import('./model');
  const k = { ...rect(GROUND, [0, 0], [40, 20], 1, 10, false), ex: { d: { e: 'h', u: 1 }, 'p.w': { e: 'b + 2', u: 1 } } } as Extrude & { ex?: Record<string, { e: string; u: number }> };
  const p = { h: 10, b: 38 };
  dropStale([k], p);
  expect(Object.keys(k.ex!).sort()).toEqual(['d', 'p.w']);             // passt noch: bleibt
  k.d = 20;                                                            // Fläche hochgezogen
  dropStale([k], p);
  expect(Object.keys(k.ex!)).toEqual(['p.w']);
  applyParams([k], { h: 15, b: 48 });
  expect([k.d, k.p.w]).toEqual([20, 50]);                              // gezogenes Maß bleibt, gebundenes folgt
  k.ex = { d: { e: 'fehlt', u: 1 } }; k.d = 3;                          // nicht rechenbar: bleibt, applyParams meldet es
  dropStale([k], {});
  expect(k.ex).toEqual({ d: { e: 'fehlt', u: 1 } });
  k.ex = { 'p.h': { e: '0.1', u: 1 } }; k.p.h = 0.5;                    // Rechteck auf 0,5 mm begrenzt wie applyParams
  dropStale([k], {});
  expect(k.ex).toEqual({ 'p.h': { e: '0.1', u: 1 } });
  k.p.h = 7; dropStale([k], {});
  expect(k.ex).toBeUndefined();
});

test('Rippe (R1): Linie auf der Wandfläche gibt keine Riesenplatte, Skizze auf der Stirnfläche gibt bündige Rippe nach innen', () => {
  const boden = rect(GROUND, [0, -10], [40, 10], 1, 5, false), wand = rect(GROUND, [0, -10], [5, 10], 2, 40, false);
  const ohne = measureVolume(buildBody([boden, wand]).body!);
  // Fall des Nutzers: senkrechte Linie auf der Innenseite der Wand (Ebene x = 5), von der Grundplatte bis oben
  const wandFlaeche: Frame = { o: [5, 0, 0], n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] };
  const monster = buildBody([boden, wand, { ...wandFlaeche, id: 3, type: 'line', p: {}, pts: [[0, 5], [0, 40]], d: 0, open: true, onFace: true, rib: 5 } as Extrude]);
  // keine Riesenplatte mehr, sondern Knotenblech: Linie an der Wand entlang, Dreieck in den Boden hinein (35 × 35, 5 dick)
  expect([...monster.errors]).toEqual([]);
  expect(measureVolume(monster.body!)).toBeCloseTo(ohne + 0.5 * 35 * 35 * 5, 1);
  // richtig: schräge Linie auf der Stirnfläche (z = 10), Wand geht von dort nach innen und schließt bündig ab
  const stirn: Frame = { o: [0, 0, 10], n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] };
  const gut = buildBody([boden, wand, { ...stirn, id: 3, type: 'line', p: {}, pts: [[5, 30], [35, 5]], d: 0, open: true, onFace: true, rib: 3 } as Extrude]);
  expect([...gut.errors]).toEqual([]);
  expect(measureVolume(gut.body!)).toBeCloseTo(ohne + 0.5 * 30 * 25 * 3, 1);
  expect(gut.body!.boundingBox.bounds[1][2]).toBeCloseTo(10, 3); // nicht aus dem Teil heraus
});

test('Rippe als Knotenblech: Linie auf dem Boden von der Wand weg gibt ein Dreieck zwischen Boden und Wand', () => {
  const boden = rect(GROUND, [0, -10], [40, 10], 1, 5, false), wand = rect(GROUND, [0, -10], [5, 10], 2, 40, false);
  const ohne = measureVolume(buildBody([boden, wand]).body!);
  // Fall aus dem Bild: auf der Oberseite des Bodens (y = 5) von der Wand (x = 5) 25 mm weg, mittig
  const oben: Frame = { o: [0, 5, 0], n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] };
  const linie = (pts: number[][]) => ({ ...oben, id: 3, type: 'line', p: {}, pts, d: 0, open: true, onFace: true, rib: 3 }) as Extrude;
  for (const pts of [[[5, 0], [30, 0]], [[30, 0], [5, 0]]]) { // beide Zeichenrichtungen
    const r = buildBody([boden, wand, linie(pts)]);
    expect([...r.errors].map(e => e[1]).join()).toBe('');
    expect(valid(r.body!)).toBe(true);
    expect(measureVolume(r.body!)).toBeCloseTo(ohne + 0.5 * 25 * 25 * 3, 1);
  }
  // länger als die Wand hoch ist: oben gekappt, nicht über den Körper hinaus
  const lang = buildBody([boden, wand, linie([[5, 0], [40, 0]])]);
  expect(lang.body!.boundingBox.bounds[1][1]).toBeCloseTo(40, 3);
  // ohne Wand am Ende: weiter Fehler mit Anleitung
  const frei = buildBody([boden, wand, linie([[15, 0], [30, 0]])]);
  expect(frei.errors.get(3)).toMatch(/quer durch das Teil/);
});
