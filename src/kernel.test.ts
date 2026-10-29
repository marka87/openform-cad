import { beforeAll, expect, test } from 'vitest';
import opencascade from 'replicad-opencascadejs';
import { drawProjection, measureVolume, setOC } from 'replicad';
import { buildBody, drawingSVG, forExport, loadStep, PROJ, resolveDims, sheetSVG } from './kernel';
import { edgeRef, faceRef, pointRef, resolveEdge, resolveFace } from './topo';
import { rect3Pts, dirSnap, linePlane, autoStep, mirrorDir, mirrorPt, cutParam, extendOpen, trimOpen, bulge3, ellipseFeature, alignTo, applyPush, pushTo, mirroredCopy, qrot, movedCopy, ngonPts, slotPts, arcPoints, contour, endTangent, keyPoints, movePoint, snapTo, GROUND, outline, offsetFeature, ownerOf, polyFeature, regionFeature, sketchFeature, tangentBulge, type Dim, type EdgeOp, type Extrude, type Feature, type Offset, type Sweep, type Vec } from './model';

beforeAll(async () => { setOC(await (opencascade as any)()); });

const box = (): Extrude => ({ ...sketchFeature('rect', GROUND, [0, 0], [20, 10], 1, false)!, d: 10 });
// Kreis auf der Oberseite (y = 10), Skizzenebene wie in main.ts: u = Y × n, v = n × u
const TOP = { o: [10, 10, -5], n: [0, 1, 0], u: [0, 0, -1], v: [-1, 0, 0] } as any;
const hole = (d: number): Extrude => ({ ...sketchFeature('circle', TOP, [0, 0], [3, 0], 2, true)!, d });

test('Hineindrücken schneidet, Herausziehen vereinigt', () => {
  const cut = buildBody([box(), hole(-4)]).body!;
  const add = buildBody([box(), hole(4)]).body!;
  const vol = (s: any) => s.boundingBox.bounds;
  expect(vol(cut)).toEqual([[0, 0, -10], [20, 10, 0]]);              // Bohrung ändert die Hülle nicht
  expect(vol(add)[1][1]).toBeCloseTo(14);                            // Zylinder ragt 4 mm heraus
  expect(cut.faces.length).toBe(8);                                  // 6 Quaderflächen + Wand + Boden
});

test('Flächen werden dem richtigen Feature zugeordnet und verschoben', () => {
  const b = box(), h = hole(-4), fs = [b, h];
  expect(ownerOf(fs, [5, 10, -2], [0, 1, 0])).toMatchObject({ f: b, part: 'end', k: 1 });  // Deckel
  expect(ownerOf(fs, [10, 6, -5], [0, 1, 0])).toMatchObject({ f: h, part: 'end', k: 1 });  // Bohrungsboden
  expect(ownerOf(fs, [13, 8, -5], [-1, 0, 0])).toMatchObject({ f: h, part: 'r', k: -1 });  // Bohrungswand zeigt nach innen
  expect(ownerOf(fs, [20, 5, -5], [1, 0, 0])).toMatchObject({ f: b, part: 'x1', k: 1 });   // rechte Seite

  const h0 = structuredClone(h);
  applyPush(h, h0, 'end', 1, 2);   // Boden 2 mm hochziehen → flacher
  expect(h.d).toBeCloseTo(-2);
  applyPush(h, h0, 'r', -1, 1);    // Wand 1 mm nach innen → kleinere Bohrung
  expect(h.p.r).toBeCloseTo(2);
  const b0 = structuredClone(b);
  applyPush(b, b0, 'x0', -1, 5);   // linke Seite 5 mm nach außen
  expect([b.p.x, b.p.w]).toEqual([-5, 25]);
});

test('STEP-Export ist Z-oben', async () => {
  const s = forExport(buildBody([box()]).body!);
  expect(s.boundingBox.bounds[1][2]).toBeCloseTo(10);                // Höhe liegt jetzt auf Z
  expect(await s.blobSTEP().text()).toContain('ISO-10303-21');
});

test('Rundung und Fase an einer Kante; fehlende Kante wird gemeldet', () => {
  // Kante oben rechts: x = 20, y = 10, verläuft entlang z
  const edge = (type: 'fillet' | 'chamfer', at: [number, number, number]) => ({ id: 3, type, at, dir: [0, 0, 1] as [number, number, number], r: 2 });
  const round = buildBody([box(), edge('fillet', [20, 10, -5])]);
  expect(round.failed).toEqual([]);
  expect(round.body!.faces.length).toBe(7);                          // 6 + Rundungsfläche
  expect(buildBody([box(), edge('chamfer', [20, 10, -5])]).body!.faces.length).toBe(7);
  expect(buildBody([box(), edge('fillet', [50, 50, 50])]).failed).toEqual([3]);
  for (const t of ['fillet', 'chamfer'] as const) {                     // T1.3b: alle 7 Flächen benannt, die neue nach der Rundung/Fase
    const o = buildBody([box(), edge(t, [20, 10, -5])]).origins.get(1)!;
    expect(o.map(x => x && `${x.f}:${x.tag}`).sort()).toEqual(['1:end', '1:start', '1:x0', '1:x1', '1:y0', '1:y1', `3:${t}`]);
  }

  // Klick auf die Rundungsfläche findet die Rundung, Klick auf den Deckel weiterhin den Quader
  const fs = [box(), edge('fillet', [20, 10, -5])];
  expect(ownerOf(fs, [19.4, 9.4, -8], [0.7, 0.7, 0])).toMatchObject({ part: 'edge', f: { id: 3 } });
  expect(ownerOf(fs, [5, 10, -5], [0, 1, 0])).toMatchObject({ part: 'end', f: { id: 1 } });
});

test('STEP-Import: exportierter Körper kommt an derselben Stelle zurück und lässt sich bearbeiten', async () => {
  const step = await forExport(buildBody([box()]).body!).blobSTEP().text();
  const imports = new Map([[5, await loadStep(step)]]);
  const imp = { id: 5, type: 'import' as const, name: 'quader.step', step };
  const back = buildBody([imp], imports).body!;
  expect(back.boundingBox.bounds.flat().map(v => Math.round(v * 1e3) / 1e3)).toEqual([0, 0, -10, 20, 10, 0]);
  expect(buildBody([imp, hole(-4)], imports).body!.faces.length).toBe(8);   // Bohrung in den Import
  expect(buildBody([imp], new Map()).failed).toEqual([5]);                // nicht lesbare Datei wird gemeldet
  expect(ownerOf([imp, box()], [5, 10, -5], [1, 0, 0])).toMatchObject({ part: 'import' }); // Fläche ohne Feature
});

test('Vieleck: L-Profil extrudieren, Seite verschieben, ungültige Formen ablehnen', () => {
  // L-Form auf dem Boden (Skizzen-y zeigt in Welt -z), 10 hoch
  const L = { ...polyFeature(GROUND, [[0, 0], [20, 0], [20, 5], [5, 5], [5, 15], [0, 15]], 7, false)!, d: 10 };
  const body = buildBody([L]).body!;
  expect(body.faces.length).toBe(8);                                   // 6 Seiten + Boden + Deckel
  expect(body.boundingBox.bounds).toEqual([[0, 0, -15], [20, 10, 0]]);

  // Innenkante x = 5 (zwischen [5,5] und [5,15]); Normale zeigt nach +x
  const g = ownerOf([L], [5, 5, -10], [1, 0, 0]);
  expect(g).toMatchObject({ part: 'seg', i: 3, k: 1 });
  const L0 = structuredClone(L);
  applyPush(L, L0, 'seg', g!.k, 3, (g as any).i);                      // 3 mm nach außen
  expect(L.pts![3]).toEqual([8, 5]);
  expect(L.pts![4]).toEqual([8, 15]);
  expect(buildBody([L]).failed).toEqual([]);

  expect(polyFeature(GROUND, [[0, 0], [10, 0]], 8, false)).toBeNull();   // zu wenige Punkte
  expect(polyFeature(GROUND, [[0, 0], [10, 0], [20, 0]], 8, false)).toBeNull(); // keine Fläche
});

test('Bögen: Halbkreis, tangentialer Anschluss, Profil mit Bogen im Kern', () => {
  const r = (p: number[]) => p.map(v => Math.round(v * 1e6) / 1e6 + 0);
  // bulge 1 = Halbkreis, liegt rechts der Sehne (gegen den Uhrzeigersinn um die Mitte)
  const semi = arcPoints([0, 0], [10, 0], 1, 4);
  expect(r(semi[1])).toEqual([5, -5]);
  expect(r(semi[3])).toEqual([10, 0]);

  // Nach einer Strecke nach oben schließt ein tangentialer Bogen nach links als Halbkreis an
  const t = endTangent([10, 0], [10, 5]);
  expect(tangentBulge(t, [10, 5], [0, 5])).toBeCloseTo(1);
  expect(r(endTangent([10, 5], [0, 5], 1))).toEqual([0, -1]);        // Halbkreis endet nach unten zeigend
  expect(outline([[0, 0], [10, 0], [10, 5, 1], [0, 5]]).length).toBe(3 + 24); // Ecken + aufgelöster Bogen

  const D = { ...polyFeature(GROUND, [[0, 0], [10, 0], [10, 5, 1], [0, 5]], 9, false)!, d: 2 };
  const body = buildBody([D]).body!;
  expect(body.faces.length).toBe(6);                                   // 3 Wände + Bogenwand + Boden + Deckel
  expect(r(body.boundingBox.bounds.flat())).toEqual([0, 0, -10, 10, 2, 0]);
  expect(ownerOf([D], [5, 2, -5], [0, 1, 0])).toMatchObject({ part: 'end' }); // Deckel im Bogenbereich
  expect(polyFeature(GROUND, [[0, 0, 1], [10, 0, 1]], 10, false)).not.toBeNull(); // Kreis aus zwei Bögen
});

test('Bogenwand anfassen und ziehen ändert den Radius, Endpunkte bleiben', () => {
  // Halbkreis oben (Skizze y = 5..10), auf dem Boden: Skizzen-y = Welt -z; Bogenmitte bei Welt (5, ·, -10), Normale -z
  const D = { ...polyFeature(GROUND, [[0, 0], [10, 0], [10, 5, 1], [0, 5]], 9, false)!, d: 2 };
  const g = ownerOf([D], [5, 1, -10], [0, 0, -1]);
  expect(g).toMatchObject({ part: 'arc', i: 2, k: 1 });
  expect(ownerOf([D], [5, 1, 0], [0, 0, 1])).toMatchObject({ part: 'seg', i: 0 });   // gerade Unterseite weiterhin 'seg'

  const D0 = structuredClone(D);
  const [label, R] = applyPush(D, D0, 'arc', g!.k, 2, 2);             // 2 mm nach außen: Pfeilhöhe 5 → 7
  expect(label).toBe('Radius');
  expect(R).toBeCloseTo((25 + 49) / 14);
  expect(D.pts![2][2]).toBeCloseTo(1.4);
  expect(D.pts!.map(p => p.slice(0, 2))).toEqual(D0.pts!.map(p => p.slice(0, 2)));
  expect(buildBody([D]).body!.boundingBox.bounds[0][2]).toBeCloseTo(-12);

  applyPush(D, D0, 'arc', g!.k, -10, 2);                               // nicht unter die Sehne
  expect(D.pts![2][2]).toBeGreaterThan(0);
});

test('Überschneidende Skizzen zerfallen in Bereiche', () => {
  const rect = sketchFeature('rect', GROUND, [0, 0], [20, 20], 1, false)!, circ = sketchFeature('circle', GROUND, [20, 10], [30, 10], 2, false)!;
  const half = Math.PI * 100 / 2, fs = [rect, circ];
  const vol = (f: Extrude, P: number[]) => {
    const r = regionFeature(fs, f, P, 3)!;
    r.d = 5;
    return measureVolume(buildBody([r]).body!);
  };
  expect(vol(rect, [5, 0, -10])).toBeCloseTo((400 - half) * 5, 0);   // nur Rechteck
  expect(vol(rect, [15, 0, -10])).toBeCloseTo(half * 5, 0);          // Schnittmenge
  expect(vol(circ, [25, 0, -10])).toBeCloseTo(half * 5, 0);          // nur Kreis
  const far = sketchFeature('rect', GROUND, [50, 50], [60, 60], 4, false)!;
  expect(regionFeature([rect, far], rect, [5, 0, -10], 5)).toBeNull(); // keine Überschneidung → Skizze selbst ziehen
});

test('Versatz um Rechteck, Kreis und Vieleck mit Bogen', () => {
  const rect = sketchFeature('rect', GROUND, [0, 0], [20, 10], 1, false)!;
  expect(offsetFeature(rect, 2, 2)!.p).toEqual({ x: -2, y: -2, w: 24, h: 14 });
  expect(offsetFeature(rect, -6, 2)).toBeNull();                     // nach innen aufgebraucht
  expect(offsetFeature(sketchFeature('circle', GROUND, [0, 0], [5, 0], 1, false)!, -1, 2)!.p.r).toBe(4);
  const L = polyFeature(GROUND, [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]], 1, false)!;
  expect(offsetFeature(L, 1, 2)!.pts).toEqual([[-1, -1], [21, -1], [21, 11], [11, 11], [11, 21], [-1, 21]]);
  // Halbkreis: Bogen behält seinen Winkel, Radius 10 → 12
  const D = polyFeature(GROUND, [[0, 0, 1], [20, 0]], 1, false)!, o = offsetFeature(D, 2, 2)!;
  expect(o.pts![0][2]).toBe(1);
  expect(Math.hypot(o.pts![1][0] - o.pts![0][0], o.pts![1][1] - o.pts![0][1]) / 2).toBeCloseTo(12);
});

test('Spline: geschlossene glatte Kurve durch die Punkte, im Kern als Bézier-Stücke', () => {
  const pts = [[10, 0], [0, 10], [-10, 0], [0, -10]], f = polyFeature(GROUND, pts, 1, false, true)!;
  expect(f.smooth).toBe(true);
  const c = contour(pts, true);
  expect(c).toContainEqual([0, 10]);                                   // läuft durch die Punkte
  c.forEach(([x, y]) => expect(Math.hypot(x, y)).toBeGreaterThan(8.5)); // nach außen gewölbt, weit über der Raute (7,07)
  f.d = 5;
  const v = measureVolume(buildBody([f]).body!);
  expect(v).toBeGreaterThan(200 * 5);                                  // mehr als die Raute
  expect(v).toBeLessThan(Math.PI * 100 * 5);                           // weniger als der Kreis
  expect(polyFeature(GROUND, [[0, 0], [10, 0]], 1, false, true)).toBeNull();
});

test('Skizzenpunkt nachträglich verschieben', () => {
  const f = polyFeature(GROUND, [[0, 0, 0.5], [10, 0], [10, 10], [0, 10]], 1, false)!, f0 = structuredClone(f);
  expect(movePoint(f, f0, 2, [15, 12])).toBe(true);
  expect(f.pts).toEqual([[0, 0, 0.5], [10, 0], [15, 12], [0, 10]]);
  expect(movePoint(f, f0, 0, [-2, -1])).toBe(true);                     // Bogen bleibt am Punkt
  expect(f.pts![0]).toEqual([-2, -1, 0.5]);
  const t = polyFeature(GROUND, [[0, 0], [10, 0], [0, 10]], 1, false)!;
  expect(movePoint(t, structuredClone(t), 2, [20, 0])).toBe(false);    // alles auf einer Linie → bleibt wie vorher
  expect(t.pts![2]).toEqual([0, 10]);
});

test('Einrasten: Punkte vor Linien, sonst nichts', () => {
  const pts: [number, number, number][] = [[0, 0, 0], [10, 0, 0]], segs = [[[0, 0, 5], [10, 0, 5]]] as [number, number, number][][];
  expect(snapTo([9.6, 0, 0.3], pts, segs, 1)).toEqual({ p: [10, 0, 0], kind: 'point' });
  expect(snapTo([4, 0, 4.5], pts, segs, 1)).toEqual({ p: [4, 0, 5], kind: 'line' });
  expect(snapTo([4, 0, 2], pts, segs, 1)).toBeNull();
  const r = sketchFeature('rect', GROUND, [0, 0], [20, 10], 1, false)!;
  expect(keyPoints({ ...r, d: 5 })).toContainEqual([20, 5, -10]);      // obere Ecke (Skizzen-y 10 = Welt −z)
});

test('Kantenmitten und Ausrichten an Punkten', () => {
  const r = sketchFeature('rect', GROUND, [0, 0], [20, 10], 1, false)!;
  expect(keyPoints(r)).toContainEqual([10, 0, 0]);                     // Mitte der unteren Seite
  const arc = polyFeature(GROUND, [[0, 0, 1], [20, 0], [20, -10]], 1, false)!;
  expect(keyPoints(arc)).not.toContainEqual([10, 0, 0]);               // keine Mitte auf der Sehne eines Bogens
  expect(alignTo([5.2, 7.9], [[5, 0], [5.3, 3], [30, 8]], 1)).toEqual({ ax: [5.3, 3], ay: [30, 8] });
  expect(alignTo([12, 12], [[5, 0]], 1)).toEqual({ ax: null, ay: null });
});

test('Einrasten an Schnittpunkten, nicht an Stoßstellen', () => {
  const s = (a: number[], b: number[]) => [a, b] as [number, number, number][];
  const cross = [s([0, 0, 0], [10, 0, 10]), s([0, 0, 10], [10, 0, 0])];
  expect(snapTo([5.5, 0, 4.6], [], cross, 1)).toEqual({ p: [5, 0, 5], kind: 'cross' });
  const chain = [s([0, 0, 0], [5, 0, 0]), s([5, 0, 0], [10, 0, 1])];   // zwei Stücke einer Kurve
  expect(snapTo([5.2, 0, 0.3], [], chain, 1)?.kind).toBe('line');
});

test('n-Eck und Langloch', () => {
  const six = ngonPts([0, 0], [10, 0], 6);
  expect(six).toHaveLength(6);
  expect(six[1][0]).toBeCloseTo(5); expect(six[1][1]).toBeCloseTo(8.660);
  const slot = polyFeature(GROUND, slotPts([0, 0], [30, 10]), 1, false)!;
  slot.d = 2;
  expect(measureVolume(buildBody([slot]).body!)).toBeCloseTo((20 * 10 + Math.PI * 25) * 2, 0); // Rechteck + zwei Halbkreise
  const tall = polyFeature(GROUND, slotPts([0, 0], [10, 30]), 1, false)!;
  expect(Math.max(...contour(tall.pts!).map(p => p[1]))).toBeCloseTo(30);
});

test('Muster und Spiegeln', () => {
  const box = { ...sketchFeature('rect', GROUND, [10, 0], [20, 5], 1, false)!, d: 3 }; // x 10..20, z 0..-5, y 0..3
  const bb = (f: Extrude) => buildBody([f]).body!.boundingBox.bounds.map(p => p.map(x => +x.toFixed(6) || 0));
  expect(bb(movedCopy(box, 2, [0, 0, -20]))).toEqual([[10, 0, -25], [20, 3, -20]]);           // Reihe entlang Y (Szene −Z)
  expect(bb(movedCopy(box, 2, [0, 0, 0], [0, 1, 0], Math.PI))).toEqual([[-20, 0, 0], [-10, 3, 5]]); // halbe Drehung um Z
  expect(bb(mirroredCopy(box, 2, [1, 0, 0]))).toEqual([[-20, 0, -5], [-10, 3, 0]]);           // an YZ-Ebene gespiegelt
  const arc = { ...polyFeature(GROUND, [[10, 0, 0.4], [20, 0], [20, 8], [10, 8]], 1, false)!, d: 2 };
  const m = mirroredCopy(arc, 2, [0, 0, 1]);                                                  // an XY-Ebene (z → −z)
  expect(measureVolume(buildBody([m]).body!)).toBeCloseTo(measureVolume(buildBody([arc]).body!), 3);
  const [lo, hi] = buildBody([arc]).body!.boundingBox.bounds, [mlo, mhi] = buildBody([m]).body!.boundingBox.bounds;
  expect(mlo[2]).toBeCloseTo(-hi[2]); expect(mhi[2]).toBeCloseTo(-lo[2]);
});

test('Ausgeschaltete Schritte werden übersprungen', () => {
  const b = box(), h = { ...hole(-4), hidden: true };
  expect(buildBody([b, h]).body!.faces.length).toBe(6);                 // Bohrung aus → Quader
  expect(ownerOf([b, h], [10, 6, -5], [0, 1, 0])).toBeNull();            // Bohrungsboden gehört niemandem mehr
});

test('Drehkörper und Schale', () => {
  // Rechteck x 5..10, Skizzen-y 0..20 auf dem Boden, um die y-Achse der Skizze (v) gedreht = Rohr
  const ring = { ...sketchFeature('rect', GROUND, [5, 0], [10, 20], 1, false)!, rev: 360, axis: 'v' as const };
  expect(measureVolume(buildBody([ring]).body!)).toBeCloseTo(Math.PI * (100 - 25) * 20, 0);
  const half = { ...ring, rev: 180 };
  expect(measureVolume(buildBody([half]).body!)).toBeCloseTo(Math.PI * (100 - 25) * 10, 0);
  const b = box(); // 20 × 10 × 10, Deckel bei y = 10
  const shelled = buildBody([b, { id: 9, type: 'shell', at: [5, 10, -5], t: 1 }]);
  expect(shelled.failed).toEqual([]);
  expect(measureVolume(shelled.body!)).toBeCloseTo(2000 - 18 * 9 * 8, 0);  // Wände nach innen, Deckel offen
});

test('Drehkörper als Nut abziehen', () => {
  const b = box(); // 20 × 10 × 10
  const groove = { ...sketchFeature('rect', GROUND, [0, 0], [20, 1], 2, false)!, rev: 360, axis: 'u' as const, sub: true }; // dünner Ring um die x-Achse
  const v = measureVolume(buildBody([b, groove]).body!);
  expect(v).toBeLessThan(2000);
  expect(v).toBeGreaterThan(1900);
});

test('Mehrere Körper: getrennt, verrechnen, bewegen', () => {
  const a = { ...box(), body: 1 };                                                   // 20 × 10 × 10 bei x 0..20
  const b = { ...sketchFeature('rect', GROUND, [10, 0], [30, 10], 2, false)!, d: 10, body: 2 }; // überlappt a bei x 10..20
  const two = buildBody([a, b]);
  expect([...two.bodies.keys()]).toEqual([1, 2]);
  expect(measureVolume(two.body!)).toBeCloseTo(4000, 0);                               // Verbund: beide ganz
  const cut = buildBody([a, b, { id: 3, type: 'combine', op: 'cut', a: 1, b: 2 }]);
  expect([...cut.bodies.keys()]).toEqual([1]);
  expect(measureVolume(cut.body!)).toBeCloseTo(1000, 0);                               // a ohne Überlappung
  const common = buildBody([a, b, { id: 3, type: 'combine', op: 'common', a: 1, b: 2 }]);
  expect(measureVolume(common.body!)).toBeCloseTo(1000, 0);
  // Körper 2 um 50 mm in x verschieben und 90° um die Hochachse (Szene y) drehen
  const q = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)];
  const moved = buildBody([a, b, { id: 4, type: 'move', body: 2, c: [20, 5, -5], q, t: [50, 0, 0] }]);
  const [lo, hi] = moved.bodies.get(2)!.boundingBox.bounds;
  expect(lo[0]).toBeCloseTo(65); expect(hi[0]).toBeCloseTo(75); expect(lo[2]).toBeCloseTo(-15); expect(hi[2]).toBeCloseTo(5);
  expect(qrot(q, [1, 0, 0])[2]).toBeCloseTo(-1);
  // Deckel des bewegten Körpers gehört weiter zu b (Punkt zurückgerechnet)
  const fs = [a, b, { id: 4, type: 'move' as const, body: 2, c: [20, 5, -5] as [number, number, number], q, t: [50, 0, 0] as [number, number, number] }];
  expect(ownerOf(fs, [70, 10, 0], [0, 1, 0])).toMatchObject({ f: b, part: 'end' });
  // Vereinigung leitet spätere Bewegungen weiter: Feature von Körper 2 wandert mit Körper 1
  const fs2 = [a, b, { id: 3, type: 'combine' as const, op: 'fuse' as const, a: 1, b: 2 }, { ...fs[2], body: 1 }];
  expect(ownerOf(fs2, [70, 10, 0], [0, 1, 0])?.f).toBe(b);
});

test('Körper skalieren: Volumen ×8, Deckel bleibt anfassbar', () => {
  const b = { ...box(), body: 1 }, m = { id: 2, type: 'move' as const, body: 1, c: [0, 0, 0] as [number, number, number], q: [0, 0, 0, 1], t: [0, 0, 0] as [number, number, number], s: 2 };
  expect(measureVolume(buildBody([b, m]).body!)).toBeCloseTo(16000, 0);
  expect(ownerOf([b, m], [10, 20, -5], [0, 1, 0])).toMatchObject({ f: b, part: 'end' }); // Deckel jetzt bei y = 20
});

test('Bemaßungen und Abhängigkeiten mit planegcs', async () => {
  const { make_gcs_wrapper } = await import('@salusoft89/planegcs');
  const { solveSketch } = await import('./sketchSolver');
  const gcs = await make_gcs_wrapper();
  const pts = [[0, 0], [18, 2], [20, 13], [1, 11, 0.3]];                // schiefes Viereck, letzte Seite gebogen
  const out = solveSketch(gcs, pts, [
    { t: 'len', i: 0, val: 30 }, { t: 'h', i: 0 }, { t: 'perp', i: 0, j: 1 }, { t: 'eq', i: 1, j: 0 }, { t: 'par', i: 2, j: 0 },
  ], [0])!;
  const len = (i: number) => Math.hypot(out[(i + 1) % 4][0] - out[i][0], out[(i + 1) % 4][1] - out[i][1]);
  expect(out[0]).toEqual([0, 0]);                                        // fester Punkt bleibt
  expect(len(0)).toBeCloseTo(30); expect(out[1][1]).toBeCloseTo(0);      // 30 mm, waagrecht
  expect(out[2][0]).toBeCloseTo(30); expect(len(1)).toBeCloseTo(30);     // rechtwinklig, gleich lang
  expect(out[3][1]).toBeCloseTo(out[2][1]); expect(out[3][2]).toBe(0.3); // parallel, Bogen bleibt
  expect(solveSketch(gcs, pts, [{ t: 'h', i: 0 }, { t: 'v', i: 0 }])).toBeNull();                 // fällt zur Linie zusammen
  expect(solveSketch(gcs, pts, [{ t: 'len', i: 0, val: 30 }, { t: 'len', i: 0, val: 20 }])).toBeNull(); // Widerspruch
  gcs.destroy_gcs_module();
});

test('Fläche auf eingetipptes Maß ziehen', () => {
  const b = box(), b0 = structuredClone(b); // 20 × 10, Höhe 10
  for (const [part, k, v, key] of [['end', 1, 25, 'd'], ['x1', 1, 30, 'w'], ['x0', -1, 12, 'w'], ['y0', -1, 4, 'h']] as const) {
    const f = structuredClone(b0);
    applyPush(f, b0, part, k, pushTo(part, b0, v)! * k);
    expect(key === 'd' ? f.d : f.p[key]).toBeCloseTo(v);
  }
  expect(pushTo('arc', b0, 5)).toBeNull();
});

test('Zeichnung als SVG: drei Ansichten, Bohrung verdeckt gestrichelt', () => {
  const svg = drawingSVG(buildBody([box(), hole(-4), { id: 9, type: 'plane', c: [0, 0, 0], n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], off: 5 }]).body!);
  expect(svg.startsWith('<svg')).toBe(true);
  expect((svg.match(/<path /g) ?? []).length).toBeGreaterThan(10);   // Umrisse aller drei Ansichten
  expect(svg).toContain('stroke-dasharray');                          // Bohrung ist in Vorder-/Seitenansicht verdeckt
  expect(svg).toMatch(/width="[\d.]+mm"/);
});

test('Körper an Ebene teilen, Übergang zwischen Skizzen, Schale mit zwei offenen Flächen', () => {
  const b = { ...box(), body: 1 }; // x 0..20, y 0..10, z −10..0
  const pl = { id: 2, type: 'plane' as const, c: [5, 5, -5] as [number, number, number], n: [1, 0, 0] as [number, number, number], u: [0, 0, -1] as [number, number, number], v: [0, 1, 0] as [number, number, number], off: 5 };
  const split = buildBody([b, pl, { id: 3, type: 'split', body: 1, plane: 2 }]);
  expect([...split.bodies.keys()].sort()).toEqual([1, 3]);
  expect(measureVolume(split.bodies.get(1)!)).toBeCloseTo(1000, 0); // x 0..10
  expect(measureVolume(split.bodies.get(3)!)).toBeCloseTo(1000, 0); // x 10..20 (vor der Ebene)
  // Quadrat 10 × 10 am Boden, Kreis R 5 darüber in 20 mm Höhe → Übergang
  const sq = sketchFeature('rect', GROUND, [-5, -5], [5, 5], 4, false)!;
  const ci = sketchFeature('circle', { ...GROUND, o: [0, 20, 0] }, [0, 0], [5, 0], 5, false)!;
  const loft = buildBody([sq, ci, { id: 6, type: 'loft', a: 4, b: 5, body: 6 }]);
  const v = measureVolume(loft.body!);
  expect(v).toBeGreaterThan(Math.PI * 25 * 20); expect(v).toBeLessThan(100 * 20); // zwischen Zylinder und Quader
  // Schale: Deckel und rechte Seite offen
  const one = measureVolume(buildBody([b, { id: 7, type: 'shell', at: [10, 10, -5], t: 1, body: 1 }]).body!);
  const two = measureVolume(buildBody([b, { id: 7, type: 'shell', at: [10, 10, -5], more: [[20, 5, -5]], t: 1, body: 1 }]).body!);
  expect(two).toBeLessThan(one);
});

test('Ellipse und Bogen durch drei Punkte', () => {
  const e = { ...ellipseFeature(GROUND, [0, 0], [10, 4], 1, false)!, d: 5 };
  expect(measureVolume(buildBody([e]).body!)).toBeCloseTo(Math.PI * 10 * 4 * 5, 0);
  const tall = { ...ellipseFeature(GROUND, [0, 0], [3, 8], 1, false)!, d: 1 }; // längere Achse in y
  const [lo, hi] = buildBody([tall]).body!.boundingBox.bounds;
  expect(hi[0] - lo[0]).toBeCloseTo(6); expect(hi[2] - lo[2]).toBeCloseTo(16);
  expect(bulge3([0, 0], [2, 0], [1, -1])).toBeCloseTo(1);    // Halbkreis rechts der Sehne
  expect(bulge3([0, 0], [2, 0], [1, 1])).toBeCloseTo(-1);    // links
  expect(bulge3([0, 0], [2, 0], [1, 0])).toBe(0);            // gerade
  const pts = arcPoints([0, 0], [2, 0], bulge3([0, 0], [2, 0], [1, -0.4]));
  expect(Math.min(...pts.map(p => p[1]))).toBeCloseTo(-0.4, 1); // Bogen läuft durch den Punkt
  const big = bulge3([0, 0], [2, 0], [1, -3]);                // großer Bogen über den Halbkreis hinaus
  expect(Math.abs(big)).toBeGreaterThan(1);
});

test('Zeichnungsblatt: Maßstab, Gesamtmaße, Schriftfeld', () => {
  const body = buildBody([box(), hole(-4)]).body!; // 20 × 10 × 10
  const svg = sheetSVG(body, { sheet: 'A4', title: 'Halter <1>', material: 'Aluminium', date: '28.10.2026' });
  expect(svg).toMatch(/viewBox="0 0 297 210"/);
  expect(svg).toContain('2:1');                         // kleines Teil wird vergrößert
  expect(svg).toContain('>20<'); expect(svg).toContain('>10<');
  expect(svg).toContain('Halter &#60;1&#62;');          // Text wird maskiert
  expect(svg).toContain('stroke-dasharray');
  expect(drawingSVG(body)).toMatch(/<path d="[^"]*A[^"]*"\/>/); // Bohrung in der Draufsicht sichtbar (durchgezogen)
  expect(svg).not.toMatch(/<text[^>]*fill="[^"]*"[^>]*fill=/); // kein doppeltes Attribut
  const big = sheetSVG(buildBody([{ ...box(), p: { x: 0, y: 0, w: 400, h: 100 } }]).body!, { sheet: 'A3', title: '', material: '', date: '' });
  expect(big).toContain('1:5'); // 1:2 wäre mit der Iso-Ansicht zu breit
});

test('Flächen tragen ihre Herkunft durch Extrudieren und Schneiden (T1.3a)', () => {
  const tags = (o: any[]) => o.map(x => x ? `${x.f}:${x.tag}${x.i ?? ''}${x.from ? '<' + x.from : ''}` : '?').sort();
  const { origins } = buildBody([box(), hole(-4)]);
  expect(tags(origins.get(1)!)).toEqual(['1:end', '1:start', '1:x0', '1:x1', '1:y0', '1:y1', '2:end', '2:r']); // Deckel gelocht, Bohrung: Wand + Grund
  const arc: Extrude = { ...polyFeature(GROUND, [[0, 0, 0.4], [20, 0], [20, 10], [0, 10]], 3, false)!, d: 5 };
  expect(tags(buildBody([arc]).origins.get(1)!)).toEqual(['3:arc0', '3:end', '3:seg1', '3:seg2', '3:seg3', '3:start']);
  const spline: Extrude = { ...polyFeature(GROUND, [[0, 0], [20, 0], [20, 10], [0, 10]], 4, false, true)!, d: 5 };
  expect(tags(buildBody([spline]).origins.get(1)!)).toEqual(['4:end', '4:seg0', '4:seg1', '4:seg2', '4:seg3', '4:start']);
  const add = buildBody([box(), hole(4)]).origins.get(1)!;                   // Zapfen oben drauf: Mantel + Deckel kommen dazu
  expect(tags(add)).toEqual(['1:end', '1:start', '1:x0', '1:x1', '1:y0', '1:y1', '2:end', '2:r']);
});

test('Drehkörper, Schale und Loft benennen ihre Flächen (T1.3c)', () => {
  const tags = (o: any[]) => o.map(x => x ? `${x.f}:${x.tag}${x.i ?? ''}${x.of ? '/' + x.of.f + ':' + x.of.tag : ''}` : '?').sort();
  const ring = { ...sketchFeature('rect', GROUND, [5, 0], [10, 20], 1, false)!, rev: 360, axis: 'v' as const };
  expect(tags(buildBody([ring]).origins.get(1)!)).toEqual(['1:x0', '1:x1', '1:y0', '1:y1']); // Innen-, Außenmantel, zwei Ringflächen
  expect(tags(buildBody([{ ...ring, rev: 90 }]).origins.get(1)!)).toEqual(['1:end', '1:start', '1:x0', '1:x1', '1:y0', '1:y1']);
  const shelled = buildBody([box(), { id: 9, type: 'shell', at: [5, 10, -5], t: 1 }]).origins.get(1)!;
  expect(tags(shelled)).toEqual(['1:end', '1:start', '1:x0', '1:x1', '1:y0', '1:y1', // Deckel wird zum Rand
    '9:shell/1:start', '9:shell/1:x0', '9:shell/1:x1', '9:shell/1:y0', '9:shell/1:y1']);
  const sq = sketchFeature('rect', GROUND, [-5, -5], [5, 5], 4, false)!;
  const sq2 = sketchFeature('rect', { ...GROUND, o: [0, 20, 0] }, [-3, -3], [3, 3], 5, false)!;
  expect(tags(buildBody([sq, sq2, { id: 6, type: 'loft', a: 4, b: 5, body: 6 }]).origins.get(6)!)).toEqual(['6:end', '6:start', '6:x0', '6:x1', '6:y0', '6:y1']);
});

test('Bewegen, Skalieren, Teilen und Import benennen ihre Flächen (T1.3d)', async () => {
  const tags = (o: any[]) => o.map(x => x ? `${x.f}:${x.tag}${x.i ?? ''}` : '?').sort();
  const BOX = ['1:end', '1:start', '1:x0', '1:x1', '1:y0', '1:y1', '2:end', '2:r'];
  const q = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)];                       // 45° um z
  const moved = buildBody([box(), hole(-4), { id: 3, type: 'move', body: 1, c: [10, 5, -5], q, t: [30, 0, 0], s: 2 }]);
  expect(tags(moved.origins.get(1)!)).toEqual(BOX);
  const s = moved.bodies.get(1)!, o = moved.origins.get(1)!;                           // Deckel ist auch nach dem Bewegen der Deckel
  expect(s.faces[o.findIndex(x => x?.f === 1 && x.tag === 'end')].normalAt().toTuple().map(v => +v.toFixed(3) + 0)).toEqual([-0.707, 0.707, 0]); // um 45° mitgedreht
  const pl = { id: 4, type: 'plane' as const, c: [5, 5, -5] as Vec, n: [1, 0, 0] as Vec, u: [0, 0, -1] as Vec, v: [0, 1, 0] as Vec, off: 5 }; // Ebene x = 10, mitten durch die Bohrung
  const split = buildBody([box(), hole(-4), pl, { id: 5, type: 'split', body: 1, plane: 4 }]);
  expect(tags(split.origins.get(1)!)).toEqual(['1:end', '1:start', '1:x0', '1:y0', '1:y1', '2:end', '2:r', '5:split']);
  expect(tags(split.origins.get(5)!)).toEqual(['1:end', '1:start', '1:x1', '1:y0', '1:y1', '2:end', '2:r', '5:split']);
  const step = await forExport(buildBody([box()]).body!).blobSTEP().text();
  const imp = { id: 6, type: 'import' as const, name: 'q.step', step };
  expect(tags(buildBody([imp], new Map([[6, await loadStep(step)]])).origins.get(1)!)).toEqual([0, 1, 2, 3, 4, 5].map(i => `6:import${i}`));
});

test('Resolver: Bezug findet seine Fläche/Kante wieder (T1.4)', async () => {
  const at = (r: ReturnType<typeof buildBody>, f: number, tag: string, k = 1) => // Fläche nach Herkunft holen
    r.bodies.get(k)!.faces[r.origins.get(k)!.findIndex(o => o?.f === f && o.tag === tag)];
  const near = (v: any, w: number[]) => v.toTuple().every((x: number, i: number) => Math.abs(x - w[i]) < 1e-3);

  // verschoben: Bohrung wandert 4 mm, Bezug auf ihre Wand folgt
  let r = buildBody([box(), hole(-4)]);
  const wall = faceRef(r.names.get(1)!, at(r, 2, 'r'))!;
  const h = hole(-4); h.p.cy = 4;
  r = buildBody([box(), h]);
  let res = resolveFace(wall, r.bodies.get(1)!, r.names.get(1)!);
  expect(res.ok && res.sure && res.shape.center.x).toBeCloseTo(6, 3);

  // skaliert: Quader doppelt so breit, Deckel bleibt Deckel
  r = buildBody([box()]);
  const top = faceRef(r.names.get(1)!, at(r, 1, 'end'))!;
  const wide = box(); wide.p.w = 40;
  r = buildBody([wide]);
  res = resolveFace(top, r.bodies.get(1)!, r.names.get(1)!);
  expect(res.ok && res.sure && near(res.shape.center, [20, 10, -5])).toBe(true);

  // aufgespalten: Nut quer über den Deckel (x 6..8) teilt ihn; Fingerabdruck wählt die passendere Hälfte, unsicher
  const slot: Extrude = { ...sketchFeature('rect', TOP, [-6, 2], [6, 4], 3, true)!, d: -2 };
  r = buildBody([box(), slot]);
  res = resolveFace(top, r.bodies.get(1)!, r.names.get(1)!);
  expect(res.ok && !res.sure && near(res.shape.center, [14, 10, -5])).toBe(true);
  expect(r.origins.get(1)!.filter(o => o?.f === 1 && o.tag === 'end').length).toBe(2);

  // vier gleiche Eckbohrungen: Bezug auf Bohrung 4 bleibt bei Bohrung 4, auch wenn der Quader breiter wird
  const corners = ([[-2, 7], [-2, -7], [2, 7], [2, -7]] as const).map(([cx, cy], i) => ({ ...sketchFeature('circle', TOP, [cx, cy], [cx + 1.5, cy], 10 + i, true)!, d: -4 }));
  r = buildBody([box(), ...corners]);
  const third = faceRef(r.names.get(1)!, at(r, 12, 'r'))!;
  r = buildBody([wide, ...corners]);
  res = resolveFace(third, r.bodies.get(1)!, r.names.get(1)!);
  expect(res.ok && res.sure && near(res.shape.center, [3, 8, -7])).toBe(true);
  // ohne Abstammung (fremde Feature-ID) und mittig zwischen zwei Bohrungen: mehrdeutig statt geraten
  const orphan = { o: { f: 99, tag: 'r' as const }, fp: { ...third.fp, c: [10, 8, -3] as Vec } };
  expect(resolveFace(orphan, r.bodies.get(1)!, r.names.get(1)!)).toEqual({ ok: false, why: 'ambiguous' });

  // verschwunden: Bohrung ausgeschaltet → kein Zylinder mehr → verloren
  r = buildBody([box(), { ...hole(-4), hidden: true }]);
  expect(resolveFace(wall, r.bodies.get(1)!, r.names.get(1)!)).toEqual({ ok: false, why: 'lost' });

  // STEP-Import ohne Historie: Fläche i der Datei
  const step = await forExport(buildBody([box()]).body!).blobSTEP().text();
  const imp = { id: 6, type: 'import' as const, name: 'q.step', step }, im = new Map([[6, await loadStep(step)]]);
  r = buildBody([imp], im);
  const f3 = r.bodies.get(1)!.faces[3], ref = faceRef(r.names.get(1)!, f3)!;
  r = buildBody([imp, hole(-4)], im);
  res = resolveFace(ref, r.bodies.get(1)!, r.names.get(1)!);
  expect(res.ok && res.sure && near(res.shape.center, f3.center.toTuple())).toBe(true);

  // Kante zwischen Deckel und rechter Seite folgt, wenn der Quader breiter wird
  r = buildBody([box()]);
  const s0 = r.bodies.get(1)!, e0 = s0.edges.find(e => near(e.pointAt(0.5), [20, 10, -5]))!;
  const eref = edgeRef(r.names.get(1)!, e0, s0)!;
  r = buildBody([wide]);
  const er = resolveEdge(eref, r.bodies.get(1)!, r.names.get(1)!);
  expect(er.ok && er.sure && near(er.shape.pointAt(0.5), [40, 10, -5])).toBe(true);
});

test('Bezüge werden nachgetragen und Abhängige wandern mit (T1.5/T1.6/T1.9)', () => {
  const settle = (fs: Feature[]) => { // bauen und die Korrekturen des Kerns übernehmen wie main.ts, bis keine mehr kommen
    let r = buildBody(fs);
    for (let n = 0; r.fixes.size && n < 3; n++) { for (const [id, p] of r.fixes) Object.assign(fs.find(f => f.id === id)!, p); r = buildBody(fs); }
    expect(r.fixes.size).toBe(0);
    return r;
  };
  // Skizze auf dem Deckel + Bohrung, Rundung an der Deckelkante
  const b = box(), h = hole(-4), edge: EdgeOp = { id: 3, type: 'fillet', at: [20, 10, -5], dir: [0, 0, 1], r: 2 };
  const fs: Feature[] = [b, h, edge];
  const r0 = buildBody(fs);
  expect(r0.fixes.get(2)).toHaveProperty('face');                           // T1.5: Bezug wird beim ersten Bau nachgetragen
  expect(r0.fixes.get(3)).toHaveProperty('edge');
  settle(fs);
  b.d = 20;                                                                 // Grundkörper deutlich höher
  const r = settle(fs);
  expect(r.failed).toEqual([]);
  expect(h.o[1]).toBeCloseTo(20);                                           // Skizze ist mit dem Deckel hochgewandert
  expect(edge.at.map(v => +v.toFixed(3) + 0)).toEqual([20, 20, -5]);       // Rundung hängt weiter an der Deckelkante
  expect(measureVolume(r.body!)).toBeCloseTo(4000 - Math.PI * 9 * 4 - (4 - Math.PI) * 10, 0);

  // Platte mit vier Eckbohrungen, Fase an genau einer (Bohrung 12) → Platte höher: Fase bleibt an Bohrung 12
  const p = box();
  const corners = ([[-2, 7], [-2, -7], [2, 7], [2, -7]] as const).map(([cx, cy], i) => ({ ...sketchFeature('circle', TOP, [cx, cy], [cx + 1.5, cy], 10 + i, true)!, d: -4 }));
  const ch: EdgeOp = { id: 20, type: 'chamfer', at: [4.5, 10, -7], dir: [0, 0, 1], r: 0.5 };
  const gs: Feature[] = [p, ...corners, ch];
  settle(gs);
  p.d = 15;
  expect(settle(gs).failed).toEqual([]);
  const c = ch.at;                                                           // Fasenkante liegt auf dem Rand von Bohrung 12, jetzt auf y = 15
  expect(c[1]).toBeCloseTo(15);
  expect(Math.hypot(c[0] - 3, c[2] + 7)).toBeCloseTo(1.5, 3);
});

test('Gelöschtes oder umsortiertes Bezugs-Feature: unsicher oder sichtbar fehlgeschlagen (T1.7/T1.8)', () => {
  const take = (fs: Feature[]) => { const r = buildBody(fs); for (const [id, p] of r.fixes) Object.assign(fs.find(f => f.id === id)!, p); return r; };
  // Grundkörper gelöscht und gleich neu gezeichnet: Abstammung zeigt ins Leere, Fingerabdruck findet den neuen Deckel → baut, aber unsicher
  const h = hole(-4), rim: EdgeOp = { id: 3, type: 'chamfer', at: [13, 10, -5], dir: [0, 0, 1], r: 0.5 };
  take([box(), h, rim]);
  expect(h.face && rim.edge).toBeTruthy();
  const again = { ...box(), id: 5 };
  const r = buildBody([again, h, rim]);
  expect(r.failed).toEqual([]);
  expect(r.unsure).toContain(2);
  // T1.15: „Bezug übernehmen“ schreibt die gefundenen Flächen/Kanten als neue Bezüge → danach sicher
  const fs2: Feature[] = [again, h, rim];
  for (const [id, c] of r.confirm) Object.assign(fs2.find(f => f.id === id)!, c);
  expect([...r.confirm.keys()].sort()).toEqual([...r.unsure].sort());
  const r2 = take(fs2);
  expect(r2.failed).toEqual([]);
  expect(buildBody(fs2).unsure).toEqual([]);
  // Fase vor die Bohrung geschoben: ihre Kante gibt es dort noch nicht → Fehler mit Grund, nicht irgendeine andere Kante
  const moved = buildBody([box(), rim, h]);
  expect(moved.failed).toEqual([3]);
  expect(moved.errors.get(3)).toBe('Kante nicht mehr vorhanden');
});

test('Zug: Kreisprofil entlang eines offenen L-Pfads (T2.1)', () => {
  const tags = (o: any[]) => o.map(x => x ? `${x.f}:${x.tag}${x.i ?? ''}${x.j ?? ''}` : '?').sort();
  // Profil: Kreis R2 in der Ebene x = 0 um den Ursprung; Pfad im Boden: (0,0,0) → (20,0,0) → (20,0,−20)
  const prof = sketchFeature('circle', { o: [0, 0, 0], n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] }, [0, 0], [2, 0], 1, false)!;
  const sw: Sweep = { id: 2, type: 'sweep', profile: 1, ...GROUND, pts: [[0, 0], [20, 0], [20, 20]], body: 2 };
  const r = buildBody([prof, sw]);
  expect(r.failed).toEqual([]);
  expect(measureVolume(r.bodies.get(2)!)).toBeCloseTo(Math.PI * 4 * 40, 0);  // Gehrung: Länge der Mittellinie zählt
  expect(tags(r.origins.get(2)!)).toEqual(['2:end', '2:r00', '2:r01', '2:r10', '2:r11', '2:start']); // Kreis = 2 Bögen × 2 Abschnitte
  // als Abzug: halbrunde Nut R2 längs über den Deckel des Quaders (Pfad auf y = 10, z = −5)
  const prof2 = sketchFeature('circle', { o: [0, 10, -5], n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] }, [0, 0], [2, 0], 8, false)!;
  const groove = buildBody([{ ...box(), body: 3 }, prof2, { ...sw, id: 9, profile: 8, sub: true, body: 3, ...GROUND, o: [0, 10, -5] as Vec, pts: [[0, 0], [20, 0]] }]);
  expect(groove.failed).toEqual([]);
  expect(measureVolume(groove.bodies.get(3)!)).toBeCloseTo(2000 - Math.PI * 4 / 2 * 20, 0);
});

test('Zug: geschlossener Pfad, Knicke auf Gehrung oder als Bogen im Pfad (T2.2)', async () => {
  const prof = sketchFeature('circle', { o: [0, 0, 0], n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] }, [0, 0], [2, 0], 1, false)!;
  const ring: Sweep = { id: 2, type: 'sweep', profile: 1, ...GROUND, pts: [[0, 0], [20, 0], [20, 20], [0, 20]], closed: true, body: 2 };
  const mitre = buildBody([prof, ring]);
  expect(mitre.failed).toEqual([]);
  expect(measureVolume(mitre.bodies.get(2)!)).toBeCloseTo(Math.PI * 4 * 80, 0);   // geschlossener Rahmen, keine Deckel
  expect(mitre.origins.get(2)!.some(o => o?.tag === 'start' || o?.tag === 'end')).toBe(false);
  const tight = buildBody([{ ...prof, p: { cx: 0, cy: 0, r: 12 } }, ring]);         // Profil größer als der Rahmen → Fehler statt kaputter Körper
  expect(tight.errors.get(2)).toMatch(/gültigen Körper|fehlgeschlagen/);
  // Bögen im Pfad: Rahmen mit Ecken R5 (Viertelkreise), Mittellinie 4·10 + 2π·5
  const q = Math.tan(Math.PI / 8);
  const arcs: Sweep = { ...ring, pts: [[5, 0], [15, 0, q], [20, 5], [20, 15, q], [15, 20], [5, 20, q], [0, 15], [0, 5, q]] };
  const prof2 = { ...prof, o: [5, 0, 0] as Vec };
  const bent = buildBody([prof2, arcs]);
  expect(bent.failed).toEqual([]);
  expect(measureVolume(bent.bodies.get(2)!)).toBeCloseTo(Math.PI * 4 * (40 + 2 * Math.PI * 5), 0);
  const back = await loadStep(await forExport(bent.body!).blobSTEP().text());     // STEP hin und zurück: gleicher Körper
  expect(measureVolume(back)).toBeCloseTo(measureVolume(bent.body!), 0);
});

test('Maße in der Zeichnung: Bezug auf Modellpunkte und Kanten, folgen Änderungen (T3.1)', () => {
  // Projektion stimmt mit drawProjection überein (Quader 20 × 10 × 10 mit Ecke im Ursprung)
  const r0 = buildBody([box()]), ex = forExport(r0.body!);
  const corners = [0, 20].flatMap(x => [0, 10].flatMap(y => [-10, 0].map(z => [x, y, z])));
  (['front', 'bottom', 'right'] as const).forEach((v, i) => {
    const [[x0, y0], [x1, y1]] = drawProjection(ex, v).visible.boundingBox.bounds, p = corners.map(PROJ[i]);
    expect([Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))].map(x => +x.toFixed(3) + 0)).toEqual([x0, y0, x1, y1].map(x => +x.toFixed(3) + 0));
  });
  // Breite oben vorne (vorne, waagrecht), Durchmesser der Bohrung (oben), Winkel an einer Deckelecke (oben)
  let r = buildBody([box(), hole(-4)]);
  const nm = r.names.get(1)!, s = r.bodies.get(1)!;
  const a = pointRef(nm, [0, 10, 0])!, b = pointRef(nm, [20, 10, 0])!;
  const rim = s.edges.find(e => e.geomType === 'CIRCLE' && Math.abs(e.startPoint.y - 10) < 1e-6)!;
  const e1 = s.edges.find(e => Math.abs(e.pointAt(0.5).x - 10) < 1e-6 && Math.abs(e.pointAt(0.5).y - 10) < 1e-6 && Math.abs(e.pointAt(0.5).z) < 1e-6)!;   // vordere Deckelkante
  const e2 = s.edges.find(e => Math.abs(e.pointAt(0.5).x - 20) < 1e-6 && Math.abs(e.pointAt(0.5).y - 10) < 1e-6 && Math.abs(e.pointAt(0.5).z + 5) < 1e-6)!; // rechte Deckelkante
  const dims: Dim[] = [
    { id: 1, v: 0, t: 'lin', a, b, dir: 'h', off: 8 },
    { id: 2, v: 1, t: 'dia', e: edgeRef(nm, rim, s)!, off: 6, tol: 'H7' },
    { id: 3, v: 1, t: 'ang', e: edgeRef(nm, e1, s)!, e2: edgeRef(nm, e2, s)!, off: 6 },
    { id: 4, v: 1, t: 'rad', e: edgeRef(nm, rim, s)!, off: 4 },
  ];
  expect(resolveDims(dims, r.bodies, r.names).ok.map(d => +d.val.toFixed(3))).toEqual([20, 6, 90, 3]);
  const wide = box(); wide.p.w = 40;                                   // Quader breiter, Bohrung größer
  const big = hole(-4); big.p.r = 4;
  r = buildBody([wide, big]);
  const res = resolveDims(dims, r.bodies, r.names);
  expect(res.bad).toEqual([]);
  expect(res.ok.map(d => +d.val.toFixed(3))).toEqual([40, 8, 90, 4]);
  const svg = sheetSVG(r.body!, { sheet: 'A4', title: 'T', material: '', date: '' }, res.ok);
  expect(svg).toContain('>40<');
  expect(svg).toContain('⌀8 H7');
  expect(svg).toContain('>90°<');
  expect(svg).toContain('>R4<');
  r = buildBody([wide]);                                                 // Bohrung weg → Maße 2 und 4 werden gemeldet
  expect(resolveDims(dims, r.bodies, r.names).bad.map(x => x[0])).toEqual([2, 4]);
});

test('Zeichnung in Zoll: Gesamt- und Einzelmaße umgerechnet (T3.4)', () => {
  const r = buildBody([box()]);
  const svg = sheetSVG(r.body!, { sheet: 'A4', title: 'T', material: '', date: '', unit: 'in' });
  expect(svg).toContain('>0,787<');                 // 20 mm
  expect(svg).toContain('· Zoll');
});

test('Schale über einer Sacklochbohrung: ungültiger Körper wird gemeldet statt weitergerechnet (T1.12)', () => {
  const r = buildBody([box(), hole(-4), { id: 9, type: 'shell', at: [5, 0, -5], t: 1 }]);
  expect(r.failed).toEqual([9]);
  expect(r.errors.get(9)).toMatch(/gültigen Körper/);
  expect(measureVolume(r.body!)).toBeLessThan(2000);              // ohne die Schale: Quader mit Bohrung bleibt stehen
});

test('Hilfslinien: offen, keine Fläche, kein Bereich, eigene Rastpunkte (T5.1)', () => {
  const aux: Extrude = { id: 7, ...GROUND, type: 'poly', p: {}, pts: [[0, 0], [10, 0], [10, 10]], d: 0, aux: true, open: true };
  expect(keyPoints(aux).length).toBe(2 * (3 + 2));                     // 3 Ecken + 2 Mitten (kein Schlusssegment), je unten/oben
  const sq = sketchFeature('rect', GROUND, [0, 0], [10, 10], 1, false)!;
  const r = regionFeature([sq, aux], sq, [5, 0, -5], 9);
  expect(r).toBeNull();                                              // Hilfslinie zerlegt die Skizze nicht in Bereiche
  expect(buildBody([sq, aux]).body).toBeNull();                      // nichts extrudiert
  const moved = structuredClone(aux);
  expect(movePoint(moved, aux, 2, [20, 0])).toBe(true);              // auch auf einer Linie liegend ziehbar
});

test('Hilfslinien trimmen und verlängern (T5.2)', () => {
  // Linie (0,0)→(20,0)→(20,20), geschnitten von einer senkrechten Linie bei x = 5 und x = 15
  const pts = [[0, 0], [20, 0], [20, 20]], cuts = [0.25, 0.75];
  expect(trimOpen(pts, 0, 0.5, cuts)).toEqual([[[0, 0], [5, 0]], [[15, 0], [20, 0], [20, 20]]]); // Mitte raus → zwei Linien
  expect(trimOpen(pts, 0, 0.1, cuts)).toEqual([[[5, 0], [20, 0], [20, 20]]]);                    // Anfang bis zum Schnitt kürzen
  expect(trimOpen([[0, 0], [20, 0]], 0, 0.5, [])).toEqual([]);                                     // ohne Schnitt: ganzes Stück weg
  expect(cutParam([0, 0], [20, 0], [5, -5], [5, 5])).toBeCloseTo(0.25);
  // Ende bis zur Linie x = 30 verlängern; trifft nichts → null
  expect(extendOpen(pts.slice(0, 2), 1, [[[30, -5], [30, 5]]])).toEqual([[0, 0], [30, 0]]);
  expect(extendOpen(pts.slice(0, 2), 0, [[[30, -5], [30, 5]]])).toBeNull();
});

test('Abhängigkeiten: Winkel zwischen Seiten und fester Punkt (T5.4)', async () => {
  const { make_gcs_wrapper } = await import('@salusoft89/planegcs');
  const { solveSketch } = await import('./sketchSolver');
  const gcs = await make_gcs_wrapper();
  const pts = [[0, 0], [20, 0], [18, 10], [0, 10]];                   // Seite 2 (1→2) leicht schräg
  const ang = (p: number[][], i: number, j: number) => { const d = (k: number) => [p[(k + 1) % 4][0] - p[k][0], p[(k + 1) % 4][1] - p[k][1]], a = d(i), b = d(j);
    return Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])) * 180 / Math.PI; };
  const out = solveSketch(gcs, pts, [{ t: 'ang', i: 0, j: 1, val: 60 }, { t: 'fix', i: 0, p: [0, 0] }, { t: 'fix', i: 1, p: [20, 0] }])!;
  expect(out).not.toBeNull();
  expect(ang(out, 0, 1)).toBeCloseTo(60, 3);
  expect(out[0]).toEqual([0, 0]);                                     // feste Punkte bleiben
  expect(out[1]).toEqual([20, 0]);
  // fester Punkt hält auch, wenn er gezogen wird: Ziehen an Punkt 0 nach (5, 5) wird zurückgestellt
  const pulled = solveSketch(gcs, [[5, 5], ...pts.slice(1)], [{ t: 'fix', i: 0, p: [0, 0] }], [0])!;
  expect(pulled[0]).toEqual([0, 0]);
});

test('Fläche versetzen: nach außen, nach innen, auch am STEP-Import; Skizze darauf wandert mit (T6.1)', async () => {
  const up: Feature = { id: 5, type: 'offset', at: [5, 10, -5], n: [0, 1, 0], d: 5 };     // Deckel des Quaders um 5 mm hoch
  let r = buildBody([box(), up]);
  expect(r.failed).toEqual([]);
  expect(measureVolume(r.body!)).toBeCloseTo(3000, 3);
  expect(r.fixes.get(5)).toHaveProperty('face');                                        // Bezug wird nachgetragen
  r = buildBody([box(), { ...up, d: -3 }]);
  expect(measureVolume(r.body!)).toBeCloseTo(1400, 3);                                  // 20 × 10 × 7
  // Bohrung auf dem versetzten Deckel (y = 15), dann Versatz auf 8 mm: die Bohrung wandert mit auf y = 18
  const settle = (fs: Feature[]) => { for (let n = 0; n < 3; n++) { const x = buildBody(fs); for (const [id, p] of x.fixes) Object.assign(fs.find(f => f.id === id)!, p); } return buildBody(fs); };
  const off: Offset = { ...up, id: 6, d: 5 } as Offset, h = { ...hole(-4), id: 7, o: [10, 15, -5] as Vec };
  const fs: Feature[] = [box(), off, h];
  settle(fs);
  expect(h.face).toBeTruthy();
  off.d = 8;
  r = settle(fs);
  expect(r.failed).toEqual([]);
  expect(h.o[1]).toBeCloseTo(18);
  // STEP-Import: Seite x = 20 um 10 mm nach außen
  const step = await forExport(buildBody([box()]).body!).blobSTEP().text();
  const imp = { id: 8, type: 'import' as const, name: 'q.step', step }, im = new Map([[8, await loadStep(step)]]);
  r = buildBody([imp, { id: 9, type: 'offset', at: [20, 5, -5], n: [1, 0, 0], d: 10 }], im);
  expect(r.failed).toEqual([]);
  expect(measureVolume(r.body!)).toBeCloseTo(3000, 3);
  // gekrümmte Fläche: sichtbarer Fehler statt Unsinn
  r = buildBody([box(), hole(-4), { id: 10, type: 'offset', at: [13, 8, -5], n: [-1, 0, 0], d: 1 }]);
  expect(r.errors.get(10)).toMatch(/ebene Flächen|nicht gefunden/);
});

test('Fläche versetzen an einer ebenen Loft-Seite (als B-Spline gespeichert)', () => {
  const a = sketchFeature('rect', GROUND, [-20, -20], [20, 20], 1, false)!, b = sketchFeature('rect', { ...GROUND, o: [0, 30, 0] }, [-10, -10], [10, 10], 2, false)!;
  const loft = { id: 3, type: 'loft' as const, a: 1, b: 2, body: 3 };
  const v0 = measureVolume(buildBody([a, b, loft]).bodies.get(3)!);
  const n = [-3, 1, 0].map(x => x / Math.hypot(3, 1)) as Vec;               // linke Seite: Normale schräg nach außen/oben
  const r = buildBody([a, b, loft, { id: 4, type: 'offset', at: [-15, 15, 0], n, d: 2, body: 3 }]);
  expect(r.failed).toEqual([]);
  expect(measureVolume(r.bodies.get(3)!)).toBeCloseTo(v0 + (40 + 20) / 2 * Math.hypot(10, 30) * 2, 0); // genau Fläche × Versatz dazu
});

test('Drehkörper um eine beliebige Gerade in der Skizzenebene (T6.2)', () => {
  // Rechteck x 5..10, Skizzen-y 0..20 auf dem Boden; Achse parallel zur y-Achse der Skizze bei x = 2 → Rohr Innenradius 3, außen 8
  const base = { ...sketchFeature('rect', GROUND, [5, 0], [10, 20], 1, false)!, rev: 360 };
  const r = buildBody([{ ...base, axisLine: { p: [2, 0, 0] as Vec, d: [0, 0, -1] as Vec } }]);
  expect(r.failed).toEqual([]);
  expect(measureVolume(r.body!)).toBeCloseTo(Math.PI * (64 - 9) * 20, 0);
  expect(r.origins.get(1)!.map(o => o?.tag).sort()).toEqual(['x0', 'x1', 'y0', 'y1']);   // Seiten weiter benannt
  const half = buildBody([{ ...base, rev: 90, axisLine: { p: [2, 0, 0] as Vec, d: [0, 0, -1] as Vec } }]);
  expect(half.origins.get(1)!.map(o => o?.tag).sort()).toEqual(['end', 'start', 'x0', 'x1', 'y0', 'y1']);
});

test('Spiegeln an einer Ebene, die nicht durch den Ursprung geht; Kopie verliert den Flächenbezug (T6.3)', () => {
  const h = { ...sketchFeature('circle', TOP, [0, 5], [2, 5], 2, true)!, d: -4 };   // Bohrung bei x = 5
  const fs: Feature[] = [box(), h];
  for (let n = 0; n < 2; n++) { const r = buildBody(fs); for (const [id, p] of r.fixes) Object.assign(fs.find(f => f.id === id)!, p); }
  expect(h.face).toBeTruthy();
  const m = mirroredCopy(h, 3, [1, 0, 0], [10, 0, 0]);                              // Spiegelebene x = 10 → Bohrung bei x = 15
  expect(m.face).toBeUndefined();
  const r = buildBody([...fs, m]);
  expect(r.failed).toEqual([]);
  const walls = r.origins.get(1)!.filter(o => o?.tag === 'r').length;
  expect(walls).toBe(2);
  expect(measureVolume(r.body!)).toBeCloseTo(2000 - 2 * Math.PI * 4 * 4, 1);
  const rot = movedCopy(h, 4, [0, 0, 0], [0, 1, 0], Math.PI, [10, 0, -5]);          // 180° um die Hochachse durch die Deckelmitte
  expect(rot.face).toBeUndefined();
  expect(buildBody([...fs, rot]).failed).toEqual([]);
  // Fase am Bohrungsrand wird mitgespiegelt, wie addCopies in main.ts: Punkt/Richtung abbilden, Kantenbezug weg
  const ch: EdgeOp = { id: 5, type: 'chamfer', at: [7, 10, -5], dir: [0, 0, 1], r: 0.5 };
  const chM: EdgeOp = { ...ch, id: 6, at: mirrorPt(ch.at, [1, 0, 0], [10, 0, 0]), dir: mirrorDir(ch.dir, [1, 0, 0]) };
  const r2 = buildBody([...fs, ch, m, chM]);
  expect(r2.failed).toEqual([]);
  expect(r2.origins.get(1)!.filter(o => o?.tag === 'chamfer').length).toBe(2);
});

test('Fläche löschen: Bohrung und Rundung verschwinden, Nachbarflächen wachsen zu (T6.1b)', () => {
  const del = (at: Vec, more?: Vec[]): Feature => ({ id: 9, type: 'remove', at, ...more && { more } });
  let r = buildBody([box(), hole(-4), del([13, 8, -5], [[10, 6, -5]])]);                // Wand und Boden der Bohrung
  expect(r.failed).toEqual([]);
  expect(measureVolume(r.body!)).toBeCloseTo(2000, 3);
  expect(r.body!.faces.length).toBe(6);
  expect(r.fixes.get(9)).toHaveProperty('faces');                                       // Bezüge werden nachgetragen
  const fillet: EdgeOp = { id: 3, type: 'fillet', at: [20, 10, -5], dir: [0, 0, 1], r: 2 };
  r = buildBody([box(), fillet, del([20 - 2 + Math.SQRT2, 10 - 2 + Math.SQRT2, -5])]);
  expect(r.failed).toEqual([]);
  expect(measureVolume(r.body!)).toBeCloseTo(2000, 3);
  r = buildBody([box(), del([10, 10, -5])]);                                            // Deckel des Quaders: nichts schließt die Lücke
  expect(r.failed).toEqual([9]);
});

test('Skizze auf einer gekippten Fläche dreht sich mit, Bezug bleibt bis zur Bestätigung gelb (T1.13)', () => {
  // Vieleck-Quader 20 × 10 × 10 auf dem Boden, Bohrung auf der Seite x = 20 (Mitte 5 mm vom Scharnier z = 0)
  const P = { ...polyFeature(GROUND, [[0, 0], [20, 0], [20, 10], [0, 10]], 1, false)!, d: 10 };
  const SIDE = { o: [20, 5, -5], n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] } as any;
  const h = { ...sketchFeature('circle', SIDE, [0, 0], [1.5, 0], 2, true)!, d: -2 };
  const fs: Feature[] = [P, h], fix = (r: ReturnType<typeof buildBody>) => { for (const [id, p] of r.fixes) Object.assign(fs.find(f => f.id === id)!, p); };
  fix(buildBody(fs));
  expect(h.face).toBeTruthy();
  P.pts![2] = [24, 10];                                    // Ecke wandert: Seite kippt um die senkrechte Kante bei x = 20, z = 0
  let r = buildBody(fs);
  expect(r.failed).toEqual([]);
  expect(r.unsure).toContain(2);
  expect(r.confirm.get(2)).toHaveProperty('face');
  fix(r);
  expect(10 * (h.o[0] - 20) + 4 * h.o[2]).toBeCloseTo(0, 6);                  // Mitte liegt in der neuen Seitenebene …
  expect(Math.hypot(h.o[0] - 20, h.o[2])).toBeCloseTo(5, 6);                  // … gleich weit vom Scharnier
  expect(h.n.map(x => +x.toFixed(6) + 0)).toEqual([10 / Math.sqrt(116), 0, 4 / Math.sqrt(116)].map(x => +x.toFixed(6) + 0));
  r = buildBody(fs);
  expect(r.failed).toEqual([]);
  expect(r.fixes.size).toBe(0);                                                // steht jetzt, nichts mehr nachzuführen
  expect(measureVolume(r.body!)).toBeCloseTo(2200 - Math.PI * 2.25 * 2, 3);
  Object.assign(h, r.confirm.get(2));                                         // T1.15: bestätigen → grün
  expect(buildBody(fs).unsure).toEqual([]);
});

test('Raster „Auto“ nach Zoom und Seitenmitten zum Beschriften (T5.10)', () => {
  expect(autoStep(0.01)).toBe(0.1);                                   // ganz nah: 0,1 mm = 10 px
  expect(autoStep(0.125)).toBe(1);                                    // Bauteil 100 mm füllt 800 px
  expect(autoStep(0.5)).toBe(5);
  expect(autoStep(20)).toBe(100);
  const r = { ...sketchFeature('rect', GROUND, [0, 0], [20, 10], 1, false)!, d: 0 };
  expect(keyPoints(r, 'mid')).toContainEqual([10, 0, 0]);
  expect(keyPoints(r, 'mid')).not.toContainEqual([0, 0, 0]);         // Ecke ist keine Mitte
});

test('Offene Linie (Linienkette): eigene Art, bildet keine Fläche, auch auf einer Fläche (T5.12)', () => {
  const L: Extrude = { id: 5, ...TOP, type: 'line', p: {}, pts: [[-5, -5], [5, -5], [5, 5]], d: 0, onFace: true, open: true };
  const r = buildBody([box(), L]);
  expect(r.failed).toEqual([]);
  expect(measureVolume(r.body!)).toBeCloseTo(2000, 6);                     // Körper unverändert
  expect(r.fixes.get(5)).toHaveProperty('face');                           // hängt an der Fläche wie jede Skizze
  expect(keyPoints(L).length).toBe(2 * (3 + 2));                           // 3 Punkte + 2 Mitten, kein Schlusssegment (je unten/oben)
  const rect = { ...sketchFeature('rect', TOP, [-8, -8], [8, 8], 6, true)!, d: 0 };
  expect(regionFeature([rect, L], rect, [10, 10, -5], 7)).toBeNull();      // Linie teilt (noch) keine Bereiche (Weg B, Epic 9)
  expect(movePoint(L, structuredClone(L), 2, [-5, -5])).toBe(true);        // Punkte ziehen ohne Flächenprüfung
});

test('Körper an einer offenen Linie teilen: Linie wird zur senkrechten Schnittebene (T5.18)', () => {
  const L: Extrude = { id: 5, ...TOP, type: 'line', p: {}, pts: [[-5, -5], [0, -5], [5, -5]], d: 0, onFace: true, open: true }; // quer über den Deckel bei x = 15
  const pl = linePlane(L, 6)!;
  expect(Math.abs(pl.n[0])).toBeCloseTo(1);                                // Ebene x = 15
  const r = buildBody([box(), L, pl, { id: 7, type: 'split', body: 1, plane: 6 }]);
  expect(r.failed).toEqual([]);
  expect([...r.bodies.values()].map(b => Math.round(measureVolume(b))).sort((a, b) => a - b)).toEqual([500, 1500]);
  expect(linePlane({ ...L, pts: [[-5, -5], [5, -5], [5, 5]] }, 8)).toBeNull(); // Knick: keine Ebene
  expect(linePlane({ ...L, pts: [[-5, -5, 0.3], [5, -5]] }, 8)).toBeNull();   // Bogen: keine Ebene
});

test('Bögen als echte Kreisbögen im Löser: Radius-Maß und tangential an eine Linie (T5.6)', async () => {
  const { make_gcs_wrapper } = await import('@salusoft89/planegcs');
  const { solveSketch } = await import('./sketchSolver');
  const gcs = await make_gcs_wrapper();
  const R = (p: number[][], i: number) => { const a = p[i], b = p[(i + 1) % p.length], c = a[2]; return Math.hypot(b[0] - a[0], b[1] - a[1]) * (1 + c * c) / (4 * Math.abs(c)); };
  const centre = (p: number[][], i: number) => { const a = p[i], b = p[(i + 1) % p.length], c = a[2], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = L / 2 * (1 - c * c) / (2 * c);
    return [(a[0] + b[0]) / 2 - (b[1] - a[1]) / L * k, (a[1] + b[1]) / 2 + (b[0] - a[0]) / L * k]; };
  const pts = [[0, 0], [20, 0, 0.3], [20, 10], [0, 10]];                       // rechte Seite (1→2) als Bogen nach außen
  let out = solveSketch(gcs, pts, [{ t: 'h', i: 0 }, { t: 'rad', i: 1, val: 8 }], [0])!;
  expect(out).not.toBeNull();
  expect(R(out, 1)).toBeCloseTo(8, 4);                                         // Radius gilt
  expect(out[0][1]).toBeCloseTo(out[1][1], 6);                                 // Seite 1 bleibt waagrecht
  expect(Math.sign(out[1][2])).toBe(1);                                        // Bogen bleibt nach außen gewölbt
  out = solveSketch(gcs, pts, [{ t: 'h', i: 0 }, { t: 'tan', i: 0, j: 1 }], [0])!;  // Bogen schließt tangential an die waagrechte Seite an
  expect(out).not.toBeNull();
  expect(centre(out, 1)[0]).toBeCloseTo(out[1][0], 4);                         // Mitte senkrecht über dem Anschlusspunkt
  expect(solveSketch(gcs, pts, [{ t: 'h', i: 0 }])![1][2]).toBe(0.3);          // ohne Bogen-Maß: Bogen bleibt Sehne mit gleichem Winkel
  expect(R(solveSketch(gcs, pts, [{ t: 'rad', i: 1, val: 2 }])!, 1)).toBeCloseTo(2, 4); // Endpunkte frei: rücken zusammen
  expect(solveSketch(gcs, pts, [{ t: 'rad', i: 1, val: 2 }], [1, 2])).toBeNull(); // Endpunkte fest, Sehne 10 > 2·R: geht nicht
});

test('Richtungsfang beim Linienzeichnen: waagrecht, rechtwinklig, sonst nichts (T5.13)', () => {
  const refs = [{ d: [1, 0], tag: 'h' }, { d: [0, 1], tag: 'v' }, { d: [Math.SQRT1_2, Math.SQRT1_2], tag: 'par' }];
  expect(dirSnap([0, 0], [10, 0.3], refs)).toMatchObject({ q: [10, 0], tag: 'h' });          // 1,7° neben waagrecht
  expect(dirSnap([0, 0], [-0.2, -8], refs)).toMatchObject({ tag: 'v' });                      // Gegenrichtung zählt auch
  expect(dirSnap([0, 0], [-0.2, -8], refs)!.q[1]).toBeCloseTo(-8);
  expect(dirSnap([2, 2], [7.1, 7], refs)).toMatchObject({ tag: 'par' });                      // 45°-Kante
  expect(dirSnap([0, 0], [10, 2], refs)).toBeNull();                                          // 11° daneben: frei
});

test('Tangential an Bögen beim Zeichnen: gemerkte Abhängigkeiten lassen sich lösen und halten beim Ziehen (T5.14)', async () => {
  const { make_gcs_wrapper } = await import('@salusoft89/planegcs');
  const { solveSketch } = await import('./sketchSolver');
  const gcs = await make_gcs_wrapper();
  // im Browser gezeichnet: Linie, gezogener Bogen, tangential weiter, geschlossen
  const pts = [[-33, -33], [17, -33, 0.5225], [33, -10], [24.8591, 11.9477]];
  const cons = [{ t: 'h' as const, i: 0 }, { t: 'tan' as const, i: 1, j: 0 }, { t: 'tan' as const, i: 2, j: 1 }];
  const moved = structuredClone(pts); moved[3] = [20, 15];                    // Punkt 4 ziehen
  const out = solveSketch(gcs, moved, cons, [3])!;
  expect(out).not.toBeNull();
  const t = (k: number) => endTangent(out[k], out[k + 1], out[k][2] ?? 0), dir = (k: number) => { const d = [out[k + 1][0] - out[k][0], out[k + 1][1] - out[k][1]], L = Math.hypot(d[0], d[1]); return [d[0] / L, d[1] / L]; };
  const c = dir(1), h = -2 * Math.atan(out[1][2]), start = [c[0] * Math.cos(h) - c[1] * Math.sin(h), c[0] * Math.sin(h) + c[1] * Math.cos(h)]; // Anfangsrichtung = Sehne um −h gedreht
  expect(start[0] * dir(0)[0] + start[1] * dir(0)[1]).toBeCloseTo(1, 4);         // Bogen setzt Seite 1 fort
  expect(t(1)[0] * dir(2)[0] + t(1)[1] * dir(2)[1]).toBeCloseTo(1, 4);           // Seite 3 setzt den Bogen fort
});

test('Rechteck aus drei Punkten: Kante plus Breite, immer gegen den Uhrzeigersinn (T10.2)', () => {
  const area = (p: number[][]) => p.reduce((s, q, i) => s + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0) / 2;
  const up = rect3Pts([0, 0], [10, 0], 4), down = rect3Pts([0, 0], [10, 0], -4);
  expect(up).toEqual([[0, 0], [10, 0], [10, 4], [0, 4]]);
  expect(area(up)).toBeCloseTo(40);
  expect(area(down)).toBeCloseTo(40);                                            // andere Seite, gleiche Drehrichtung
  const tilted = rect3Pts([0, 0], [3, 4], 2);                                   // schräge Kante (Länge 5)
  expect(Math.hypot(tilted[2][0] - tilted[1][0], tilted[2][1] - tilted[1][1])).toBeCloseTo(2);
  expect(area(tilted)).toBeCloseTo(10);
});
