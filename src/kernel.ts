// CAD-Kern: Features → B-Rep-Körper über replicad (OpenCascade). setOC() muss vorher aufgerufen sein.
import { drawCircle, drawRectangle, Plane, type EdgeFinder, type Shape3D, type Sketch } from 'replicad';
import { isCut, isExtrude, type Extrude, type Feature } from './model';

export function solidOf(f: Extrude): Shape3D {
  const p = f.p;
  const drawing = f.type === 'rect'
    ? drawRectangle(p.w, p.h).translate(p.x + p.w / 2, p.y + p.h / 2)
    : drawCircle(p.r).translate(p.cx, p.cy);
  return (drawing.sketchOnPlane(new Plane(f.o, f.u, f.n)) as Sketch).extrude(f.d) as Shape3D;
}

// Features der Reihe nach vereinigen, abziehen bzw. Kanten bearbeiten. Fehlgeschlagene Features werden übersprungen.
export function buildBody(features: Feature[]) {
  let body: Shape3D | null = null;
  const failed: number[] = [];
  for (const f of features) {
    try {
      if (!isExtrude(f)) {
        if (!body) continue;
        const pick = (e: EdgeFinder) => e.withinDistance(0.1, f.at);
        const next: Shape3D = f.type === 'fillet' ? body.fillet(f.r, pick) : body.chamfer(f.r, pick);
        body.delete();
        body = next;
        continue;
      }
      if (Math.abs(f.d) < 1e-6 || (isCut(f) && !body)) continue;
      const s = solidOf(f);
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
