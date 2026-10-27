// CAD-Kern: Features → B-Rep-Körper über replicad (OpenCascade). setOC() muss vorher aufgerufen sein.
import { draw, drawCircle, drawRectangle, importSTEP, makeCompound, Plane, type EdgeFinder, type Shape3D, type Sketch } from 'replicad';
import { bodyOf, isCut, isExtrude, isFlat, splineBeziers, type Extrude, type Feature, type Vec } from './model';

export function solidOf(f: Extrude): Shape3D {
  const p = f.p;
  const drawing = f.type === 'rect' ? drawRectangle(p.w, p.h).translate(p.x + p.w / 2, p.y + p.h / 2)
    : f.type === 'circle' ? drawCircle(p.r).translate(p.cx, p.cy)
    : polyDrawing(f.pts!, f.smooth);
  const sk = drawing.sketchOnPlane(new Plane(f.o, f.u, f.n)) as Sketch;
  let s = (f.rev ? sk.revolve(f[f.axis ?? 'u'], { origin: f.o, angle: f.rev }) : sk.extrude(f.d)) as Shape3D;
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

// Features der Reihe nach in ihren Körper einrechnen (vereinigen, abziehen, Kanten bearbeiten), Körper verrechnen und bewegen.
// Fehlgeschlagene Features werden übersprungen. imports: bereits eingelesene STEP-Körper je Feature-ID (siehe loadStep)
// Ergebnis: bodies je Körpernummer; body = der einzige Körper bzw. alle als Verbund (für Export und Tests)
export function buildBody(features: Feature[], imports = new Map<number, Shape3D>()) {
  const bodies = new Map<number, Shape3D>(), alias = new Map<number, number>(), failed: number[] = [];
  const key = (b: number) => { while (alias.has(b)) b = alias.get(b)!; return b; }; // verrechnete Körper leben in a weiter
  for (const f of features) {
    if (f.hidden) continue;
    try {
      if (f.type === 'combine') {
        const a = key(f.a), b = key(f.b), A = bodies.get(a), B = bodies.get(b);
        if (a === b || !A || !B) throw new Error('Körper nicht vorhanden');
        const next: Shape3D = f.op === 'fuse' ? A.fuse(B) : f.op === 'cut' ? A.cut(B) : A.intersect(B);
        A.delete(); B.delete();
        bodies.set(a, next); bodies.delete(b); alias.set(b, a);
        continue;
      }
      if (f.type === 'move') {
        const k = key(f.body), s = bodies.get(k);
        if (!s) continue;
        const w = Math.min(1, Math.max(-1, f.q[3])), ang = 2 * Math.acos(w), sn = Math.sqrt(1 - w * w);
        let next = s.clone();
        if (sn > 1e-9) next = next.rotate(ang * 180 / Math.PI, f.c, [f.q[0] / sn, f.q[1] / sn, f.q[2] / sn]);
        next = next.translate(f.t);
        s.delete();
        bodies.set(k, next);
        continue;
      }
      const k = key(bodyOf(f));
      let body = bodies.get(k) ?? null;
      const done = (next: Shape3D) => { body?.delete(); bodies.set(k, next); };
      if (f.type === 'shell') {
        if (!body) continue;
        done(body.shell(f.t, (q: any) => q.withinDistance(0.1, f.at))); // positive Dicke = Wand nach innen
        continue;
      }
      if (f.type === 'fillet' || f.type === 'chamfer') {
        if (!body) continue;
        const pick = (e: EdgeFinder) => e.withinDistance(0.1, f.at);
        done(f.type === 'fillet' ? body.fillet(f.r, pick) : body.chamfer(f.r, pick));
        continue;
      }
      let s: Shape3D;
      if (f.type === 'import') {
        const shape = imports.get(f.id);
        if (!shape) throw new Error('STEP-Datei konnte nicht gelesen werden');
        s = shape.clone();
      } else {
        if (!isExtrude(f) || isFlat(f) || (isCut(f) && !body)) continue;
        s = solidOf(f);
      }
      if (!body) { bodies.set(k, s); continue; }
      done(isCut(f) ? body.cut(s) : body.fuse(s));
      s.delete(); // WASM-Speicher freigeben
    } catch (e) {
      console.warn('Feature', f.id, 'fehlgeschlagen', e);
      failed.push(f.id);
    }
  }
  const all = [...bodies.values()];
  const body = all.length > 1 ? makeCompound(all.map(s => s.clone())) as Shape3D : all[0] ?? null; // makeCompound gibt seine Teile frei
  return { body, bodies, failed };
}

// Szene ist Y-oben, CAD-Dateien Z-oben
export function forExport(body: Shape3D): Shape3D {
  return body.clone().rotate(90, [0, 0, 0], [1, 0, 0]);
}

export async function loadStep(text: string): Promise<Shape3D> {
  const shape = await importSTEP(new Blob([text])) as Shape3D;
  return shape.rotate(-90, [0, 0, 0], [1, 0, 0]);
}
