// CAD-Kern: Features → B-Rep-Körper über replicad (OpenCascade). setOC() muss vorher aufgerufen sein.
import { draw, drawCircle, drawRectangle, importSTEP, Plane, type EdgeFinder, type Shape3D, type Sketch } from 'replicad';
import { isCut, isExtrude, splineBeziers, type Extrude, type Feature, type Vec } from './model';

export function solidOf(f: Extrude): Shape3D {
  const p = f.p;
  const drawing = f.type === 'rect' ? drawRectangle(p.w, p.h).translate(p.x + p.w / 2, p.y + p.h / 2)
    : f.type === 'circle' ? drawCircle(p.r).translate(p.cx, p.cy)
    : polyDrawing(f.pts!, f.smooth);
  let s = (drawing.sketchOnPlane(new Plane(f.o, f.u, f.n)) as Sketch).extrude(f.d) as Shape3D;
  // Bereich: mit hohen Prismen der anderen Skizzen schneiden bzw. sie abziehen (Höhe egal, Ebene ist dieselbe)
  for (const c of [...f.and ?? [], ...f.not ?? []]) {
    const tool = solidOf({ ...c, o: c.o.map((x, i) => x - 1e4 * c.n[i]) as Vec, d: 2e4 });
    const next = f.and?.includes(c) ? s.intersect(tool) : s.cut(tool);
    s.delete(); tool.delete();
    s = next;
  }
  return s;
}

function polyDrawing(pts: number[][], smooth?: boolean) {
  const pen = draw([pts[0][0], pts[0][1]]);
  if (smooth) {
    for (const [, c1, c2, e] of splineBeziers(pts)) pen.cubicBezierCurveTo(e as [number, number], c1 as [number, number], c2 as [number, number]);
    return pen.close();
  }
  pts.forEach((q, i) => {
    const next = pts[(i + 1) % pts.length], to: [number, number] = [next[0], next[1]];
    if (q[2]) pen.bulgeArcTo(to, q[2]);
    else if (i < pts.length - 1) pen.lineTo(to); // gerades Schlusssegment erledigt close()
  });
  return pen.close();
}

// Features der Reihe nach vereinigen, abziehen bzw. Kanten bearbeiten. Fehlgeschlagene Features werden übersprungen.
// imports: bereits eingelesene STEP-Körper je Feature-ID (siehe loadStep)
export function buildBody(features: Feature[], imports = new Map<number, Shape3D>()) {
  let body: Shape3D | null = null;
  const failed: number[] = [];
  for (const f of features) {
    if (f.hidden) continue;
    try {
      if (f.type === 'fillet' || f.type === 'chamfer') {
        if (!body) continue;
        const pick = (e: EdgeFinder) => e.withinDistance(0.1, f.at);
        const next: Shape3D = f.type === 'fillet' ? body.fillet(f.r, pick) : body.chamfer(f.r, pick);
        body.delete();
        body = next;
        continue;
      }
      let s: Shape3D;
      if (f.type === 'import') {
        const shape = imports.get(f.id);
        if (!shape) throw new Error('STEP-Datei konnte nicht gelesen werden');
        s = shape.clone();
      } else {
        if (!isExtrude(f) || Math.abs(f.d) < 1e-6 || (isCut(f) && !body)) continue;
        s = solidOf(f);
      }
      if (!body) { body = s; continue; }
      const next: Shape3D = isCut(f) ? body.cut(s) : body.fuse(s);
      body.delete(); s.delete(); // WASM-Speicher freigeben
      body = next;
    } catch (e) {
      console.warn('Feature', f.id, 'fehlgeschlagen', e);
      failed.push(f.id);
    }
  }
  return { body, failed };
}

// Szene ist Y-oben, CAD-Dateien Z-oben
export function forExport(body: Shape3D): Shape3D {
  return body.clone().rotate(90, [0, 0, 0], [1, 0, 0]);
}

export async function loadStep(text: string): Promise<Shape3D> {
  const shape = await importSTEP(new Blob([text])) as Shape3D;
  return shape.rotate(-90, [0, 0, 0], [1, 0, 0]);
}
