import { beforeAll, expect, test } from 'vitest';
import opencascade from 'replicad-opencascadejs';
import { measureVolume, setOC } from 'replicad';
import { buildBody, forExport, loadStep } from './kernel';
import { alignTo, applyPush, arcPoints, contour, endTangent, keyPoints, movePoint, snapTo, GROUND, outline, offsetFeature, ownerOf, polyFeature, regionFeature, sketchFeature, tangentBulge, type Extrude, type Feature } from './model';

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
