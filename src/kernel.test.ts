import { beforeAll, expect, test } from 'vitest';
import opencascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { buildBody, forExport } from './kernel';
import { applyPush, GROUND, ownerOf, sketchFeature, type Feature } from './model';

beforeAll(async () => { setOC(await (opencascade as any)()); });

const box = (): Feature => ({ ...sketchFeature('rect', GROUND, [0, 0], [20, 10], 1, false)!, d: 10 });
// Kreis auf der Oberseite (y = 10), Skizzenebene wie in main.ts: u = Y × n, v = n × u
const TOP = { o: [10, 10, -5], n: [0, 1, 0], u: [0, 0, -1], v: [-1, 0, 0] } as any;
const hole = (d: number): Feature => ({ ...sketchFeature('circle', TOP, [0, 0], [3, 0], 2, true)!, d });

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
