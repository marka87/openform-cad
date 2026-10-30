// CAD-Kern: Features → B-Rep-Körper über replicad (OpenCascade). setOC() muss vorher aufgerufen sein.
import { assembleWire, type Edge, draw, drawCircle, drawText, type Wire, drawEllipse, drawProjection, drawRectangle, importSTEP, makeCompound, Plane, ProjectionCamera, type Drawing, type Shape3D, type Sketch } from 'replicad';
import { bodyOf, bulge3, isCut, isExtrude, isFlat, movedCopy, noFace, patternOffsets, revAxis, splineBeziers, type Dim, type EdgeOp, type Frame, type PointRef, type Extrude, type Feature, type Sweep, type TextFeature, type Vec } from './model';
import { anchorEdges, anchorFaces, anchorSketch, boolean, offsetFace, removeFaces, byIndex, circleOf, edgeOp, edgeRef, pointRef, resolveEdge, resolvePoint, type EdgeRef, nameLoft, nameSolid, originsOf, shell, sweep, type Named, type Origin } from './topo';

// Umriss der Skizze auf ihrer Ebene (ohne Bereiche)
function sketchOf(f: Extrude) {
  const p = f.p;
  const drawing = f.type === 'rect' ? drawRectangle(p.w, p.h).translate(p.x + p.w / 2, p.y + p.h / 2)
    : f.type === 'circle' ? (p.ry ? drawEllipse(Math.max(p.r, p.ry), Math.min(p.r, p.ry)).rotate(p.ry > p.r ? 90 : 0) : drawCircle(p.r)).translate(p.cx, p.cy)
    : polyDrawing(f.pts!, f.smooth);
  return drawing.sketchOnPlane(new Plane(f.o, f.u, f.n)) as Sketch;
}

export function solidOf(f: Extrude): Shape3D {
  const sk = sketchOf(f);
  const ax = f.rev ? revAxis(f) : null;
  let s = (ax ? sk.revolve(ax.d, { origin: ax.p, angle: f.rev }) : sk.extrude(f.d)) as Shape3D;
  // Bereich: mit hohen Prismen der anderen Skizzen schneiden bzw. sie abziehen (Höhe egal, Ebene ist dieselbe)
  for (const c of [...f.and ?? [], ...f.not ?? []]) {
    const tool = solidOf({ ...c, o: c.o.map((x, i) => x - 1e4 * c.n[i]) as Vec, d: 2e4 });
    const next = f.and?.includes(c) ? s.intersect(tool) : s.cut(tool);
    s.delete(); tool.delete();
    s = next;
  }
  return s;
}

function polyDrawing(pts: number[][], smooth?: boolean, open = false) {
  const pen = draw([pts[0][0], pts[0][1]]);
  if (smooth) {
    for (const [, c1, c2, e] of splineBeziers(pts)) pen.cubicBezierCurveTo(e as [number, number], c1 as [number, number], c2 as [number, number]);
    return pen.close();
  }
  pts.forEach((q, i) => {
    if (open && i === pts.length - 1) return; // offen: kein Schlusssegment
    const next = pts[(i + 1) % pts.length], to: [number, number] = [next[0], next[1]];
    if (q[2]) pen.bulgeArcTo(to, q[2]);
    else if (open || i < pts.length - 1) pen.lineTo(to); // gerades Schlusssegment erledigt close()
  });
  return open ? pen.done() : pen.close();
}

// Pfad eines Sweeps als Skizze in seiner Ebene (.wire = Draht); die Skizze muss leben, solange der Draht gebraucht wird
export const pathSketch = (f: Sweep) => polyDrawing(f.pts, false, !f.closed).sketchOnPlane(new Plane(f.o, f.u, f.n)) as Sketch & { wire: Wire };

// Features der Reihe nach in ihren Körper einrechnen (vereinigen, abziehen, Kanten bearbeiten), Körper verrechnen und bewegen.
// Fehlgeschlagene Features werden übersprungen. imports: bereits eingelesene STEP-Körper je Feature-ID (siehe loadStep)
// Ergebnis: bodies je Körpernummer; body = der einzige Körper bzw. alle als Verbund (für Export und Tests);
// origins je Körper: Herkunft jeder Fläche (Reihenfolge wie shape.faces), null = unbekannt;
// errors: Grund je fehlgeschlagenem Feature; fixes: nachgetragene Bezüge und nachgeführte Lagen je Feature-ID (übernimmt main.ts ins Modell); unsure: unsicher aufgelöst,
// confirm: neuer Bezug je unsicherem Feature, den „Bezug übernehmen“ ins Modell schreibt
// Körperkante in eine Skizzenebene projizieren (T5.5): Strecke exakt, Kreis/Bogen von vorn als Bogen (bulge),
// sonst abgetastet; was auf eine Strecke fällt (Kreis von der Seite), auf deren Enden gekürzt. null = steht senkrecht auf der Ebene
export function projectEdge(e: Edge, pl: Frame): { pts: number[][]; closed: boolean } | null {
  const loc = (t: number) => { const p = e.pointAt(t).toTuple(), d = [0, 1, 2].map(i => p[i] - pl.o[i]);
    return [pl.u, pl.v].map(a => Math.round((d[0] * a[0] + d[1] * a[1] + d[2] * a[2]) * 1e6) / 1e6); };
  const len = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const c = circleOf(e), ring = len(loc(0), loc(1)) < 1e-6;
  if (c && Math.abs(c.n[0] * pl.n[0] + c.n[1] * pl.n[1] + c.n[2] * pl.n[2]) > 1 - 1e-9) {
    const [a, b] = [loc(0), loc(ring ? 0.5 : 1)];
    return ring ? { pts: [[...a, bulge3(a, b, loc(0.25))], [...b, bulge3(b, a, loc(0.75))]], closed: true }
      : { pts: [[...a, bulge3(a, b, loc(0.5))], b], closed: false };
  }
  const pts = e.geomType === 'LINE' ? [loc(0), loc(1)] : Array.from({ length: 33 }, (_, i) => loc(i / 32));
  const [a, z] = pts.flatMap(p => pts.map(q => [p, q])).reduce((m, x) => len(x[0], x[1]) > len(m[0], m[1]) ? x : m);
  const L = len(a, z);
  if (L < 1e-6) return null;
  const line = pts.every(p => Math.abs((p[0] - a[0]) * (z[1] - a[1]) - (p[1] - a[1]) * (z[0] - a[0])) / L < 1e-6);
  return { pts: line ? [a, z] : pts.filter((p, i) => !i || len(p, pts[i - 1]) > 1e-6), closed: false };
}
// Alle Kanten eines Körpers projizieren, deckungsgleiche nur einmal; src = Bezug, damit die Linie mitwandert (null = nicht benennbar)
export function projectBody(s: Shape3D, named: Named, pl: Frame) {
  const out: { pts: number[][]; closed: boolean; src: EdgeRef | null }[] = [], seen = new Set<string>();
  for (const e of s.edges) {
    const p = projectEdge(e, pl);
    if (!p) continue;
    const key = (q: number[][]) => q.map(x => x.slice(0, 2).map(v => v.toFixed(3)).join()).join('|');
    if (seen.has(key(p.pts)) || seen.has(key([...p.pts].reverse()))) continue;
    seen.add(key(p.pts));
    out.push({ ...p, src: edgeRef(named, e, s) });
  }
  return out;
}

export function buildBody(features: Feature[], imports = new Map<number, Shape3D>()) {
  const bodies = new Map<number, Shape3D>(), names = new Map<number, Named>(), alias = new Map<number, number>(), failed: number[] = [];
  const errors = new Map<number, string>(), fixes = new Map<number, Record<string, unknown>>(), unsure: number[] = [], confirm = new Map<number, Record<string, unknown>>(), moved = new Map<number, Extrude>(); // moved: mitgewanderte Skizzen
  const anchor = <T extends { patch?: Record<string, unknown>; sure: boolean; confirm?: Record<string, unknown> }>(id: number, a: T) => {
    if (a.patch) fixes.set(id, { ...fixes.get(id), ...a.patch });
    if (!a.sure) unsure.push(id);
    if (a.confirm) confirm.set(id, a.confirm);
    return a;
  };
  const key = (b: number) => { while (alias.has(b)) b = alias.get(b)!; return b; }; // verrechnete Körper leben in a weiter
  for (const f of features) {
    if (f.hidden || f.type === 'plane') continue;
    try {
      if (f.type === 'combine') {
        const a = key(f.a), b = key(f.b), A = bodies.get(a), B = bodies.get(b);
        if (a === b || !A || !B) throw new Error('Körper nicht vorhanden');
        const [next, nm] = boolean(f.op, A, names.get(a) ?? [], B, names.get(b) ?? []);
        A.delete(); B.delete();
        bodies.set(a, next); bodies.delete(b); alias.set(b, a);
        names.set(a, nm); names.delete(b);
        continue;
      }
      if (f.type === 'split') {
        const k = key(f.body), s = bodies.get(k), pl = features.find(g => g.id === f.plane);
        if (!s || pl?.type !== 'plane') throw new Error('Körper oder Ebene fehlt');
        const o = pl.c.map((x, i) => x + pl.off * pl.n[i]) as Vec;
        const half = drawRectangle(2e4, 2e4).sketchOnPlane(new Plane(o, pl.u, pl.n)).extrude(1e4) as Shape3D; // Halbraum vor der Ebene
        const nS = names.get(k) ?? [], nH: Named = half.faces.map(face => ({ face, o: { f: f.id, tag: 'split' } })); // Schnittfläche
        const [front, nF] = boolean('common', s, nS, half, nH), [back, nB] = boolean('cut', s, nS, half, nH);
        half.delete(); s.delete();
        bodies.set(k, back); bodies.set(f.id, front); names.set(k, nB); names.set(f.id, nF);
        continue;
      }
      if (f.type === 'move') {
        const k = key(f.body), s = bodies.get(k);
        if (!s) continue;
        const w = Math.min(1, Math.max(-1, f.q[3])), ang = 2 * Math.acos(w), sn = Math.sqrt(1 - w * w);
        const o = originsOf(s, names.get(k));
        let next = s.clone();
        if (sn > 1e-9) next = next.rotate(ang * 180 / Math.PI, f.c, [f.q[0] / sn, f.q[1] / sn, f.q[2] / sn]);
        if (f.s && f.s !== 1) next = next.scale(f.s, f.c);
        next = next.translate(f.t);
        s.delete();
        bodies.set(k, next); names.set(k, byIndex(next, o));
        continue;
      }
      const k = key(bodyOf(f));
      let body = bodies.get(k) ?? null;
      const done = (next: Shape3D, nm: Named = []) => { body?.delete(); bodies.set(k, next); names.set(k, nm); };
      if (f.type === 'shell') {
        if (!body) continue;
        const nm = names.get(k) ?? [];
        done(...shell(f.id, body, nm, anchor(f.id, anchorFaces(f, body, nm)).faces, f.t)); // positive Dicke = Wand nach innen
        continue;
      }
      if (f.type === 'remove') {
        if (!body) continue;
        const nm = names.get(k) ?? [];
        done(...removeFaces(body, nm, anchor(f.id, anchorFaces(f, body, nm)).faces));
        continue;
      }
      if (f.type === 'offset') {
        if (!body || Math.abs(f.d) < 1e-6) continue;
        done(...anchor(f.id, offsetFace(f, body, names.get(k) ?? [])).out);
        continue;
      }
      if (f.type === 'fillet' || f.type === 'chamfer') {
        if (!body) continue;
        const nm = names.get(k) ?? [];
        done(...edgeOp(f.type, f.id, body, nm, anchor(f.id, anchorEdges(f, body, nm)).edges, f.r));
        continue;
      }
      if (f.type === 'pattern') { // Kopien der Quellskizzen in ihrer aktuellen (vielleicht gewanderten) Lage; flache Skizzen ergeben nichts
        const na = Math.max(1, Math.round(f.a.n)), here = features.indexOf(f);
        for (const id of f.src) {
          const S = moved.get(id) ?? features.find(g => g.id === id);
          if (!S || !isExtrude(S) || S.hidden) throw new Error('Skizze für das Muster fehlt');
          if (isFlat(S) || noFace(S)) continue;
          // Rundungen/Fasen an der Quelle (vor dem Muster, gelungen) gehen mit: ihr Kantenbezug auf die Kopie umgeschrieben
          const ops = features.slice(0, here).filter((e): e is EdgeOp => (e.type === 'fillet' || e.type === 'chamfer') && !e.hidden && !!e.edge
            && !failed.includes(e.id) && (e.edge.a.f === id || e.edge.b.f === id));
          patternOffsets(f).forEach((t, n) => {
            const at = `${id}:${(n + 1) % na}:${Math.floor((n + 1) / na)}`, c = movedCopy(S, f.id, t);
            if (isCut(c) && !body) return;
            const s = solidOf(c), nS = nameSolid(c, s).map(x => ({ face: x.face, o: { ...x.o, at } }));
            if (!body) { body = s; bodies.set(k, s); names.set(k, nS); }
            else {
              done(...boolean(isCut(c) ? 'cut' : 'fuse', body, names.get(k) ?? [], s, nS));
              body = bodies.get(k)!;
              s.delete();
            }
            const re = (o: Origin): Origin => o.f === id ? { ...o, f: f.id, at } : o, mv = (p: Vec) => p.map((x, i) => x + t[i]) as Vec;
            for (const e of ops) {
              const nm = names.get(k) ?? [], edge = { a: re(e.edge!.a), b: re(e.edge!.b), fp: { ...e.edge!.fp, c: mv(e.edge!.fp.c) } };
              done(...edgeOp(e.type, e.id, body!, nm, anchorEdges({ at: mv(e.at), edge }, body!, nm).edges, e.r, { at }));
              body = bodies.get(k)!;
            }
          });
        }
        continue;
      }
      let s: Shape3D, nS: Named = [];
      if (f.type === 'import') {
        const shape = imports.get(f.id);
        if (!shape) throw new Error('STEP-Datei konnte nicht gelesen werden');
        s = shape.clone();
        nS = s.faces.map((face, i) => ({ face, o: { f: f.id, tag: 'import', i } })); // Reihenfolge aus der STEP-Datei
      } else if (f.type === 'loft') {
        const [A, B] = [f.a, f.b].map(id => moved.get(id) ?? features.find(g => g.id === id));
        if (!A || !B || !isExtrude(A) || !isExtrude(B)) throw new Error('Skizze für den Übergang fehlt');
        s = sketchOf(A).loftWith(sketchOf(B)) as Shape3D;
        nS = nameLoft(f.id, A, B, s);
      } else if (f.type === 'sweep') {
        const P = moved.get(f.profile) ?? features.find(g => g.id === f.profile);
        if (!P || !isExtrude(P) || !isFlat(P)) throw new Error('Profil für den Zug fehlt');
        if (f.sub && !body) continue;
        if (f.edges?.length) { // Pfad aus Körperkanten, über Bezüge wie bei Rundungen; Lagen und Bezüge je Kante nachtragen
          const ok = key(f.of ?? k), E = bodies.get(ok);
          if (!E) throw new Error('Körper mit den Pfadkanten fehlt');
          const nm = names.get(ok) ?? [], got = f.edges.map(e => anchorEdges(e, E, nm));
          const merged = (part: 'patch' | 'confirm') => got.some(g => g[part]) && { [part]: { edges: f.edges!.map((e, i) => ({ ...e, ...got[i][part] })) } };
          anchor(f.id, { sure: got.every(g => g.sure), ...merged('patch'), ...merged('confirm') });
          const prof = sketchOf(P) as Sketch & { wire: Wire }, spine = assembleWire(got.flatMap(g => g.edges));
          try { [s, nS] = sweep(f, P, prof.wire, spine); } finally { prof.delete(); spine.delete(); }
        } else {
          const prof = sketchOf(P) as Sketch & { wire: Wire }, path = pathSketch(f); // beide festhalten: replicads GC löscht sonst die Drähte
          try { [s, nS] = sweep(f, P, prof.wire, path.wire); } finally { prof.delete(); path.delete(); }
        }
      } else if (f.type === 'text') {
        if (f.d < 0 && !body) continue; // Gravur ohne Körper: nichts zu gravieren
        [s, nS] = textSolid(f);
      } else {
        if (!isExtrude(f)) continue;
        const g = anchor(f.id, anchorSketch(f, body, names.get(k) ?? [])).f; // Skizze auf ihre (vielleicht gewanderte) Fläche setzen
        if (g !== f) moved.set(f.id, g);
        if (g.aux && g.src && body) { // projizierte Hilfslinie: aus der aufgelösten Kante neu rechnen, Lage nachtragen (T5.5)
          const r = resolveEdge(g.src, body, names.get(k) ?? []);
          if (!r.ok) throw new Error(r.why === 'lost' ? 'Projizierte Kante gibt es nicht mehr' : 'Projizierte Kante nicht eindeutig');
          const p = projectEdge(r.shape, g);
          if (!p) throw new Error('Kante steht jetzt senkrecht auf der Skizzenebene');
          const changed = JSON.stringify(p.pts) !== JSON.stringify(g.pts) || !p.closed !== !!g.open;
          anchor(f.id, { sure: r.sure, ...changed && { patch: { pts: p.pts, open: !p.closed } } });
          continue;
        }
        if (isFlat(g) || (isCut(g) && !body)) continue;
        s = solidOf(g);
        nS = nameSolid(g, s);
      }
      if (!body) { bodies.set(k, s); names.set(k, nS); continue; }
      done(...boolean((isExtrude(f) && isCut(f)) || (f.type === 'sweep' && f.sub) || (f.type === 'text' && f.d < 0) ? 'cut' : 'fuse', body, names.get(k) ?? [], s, nS));
      s.delete(); // WASM-Speicher freigeben
    } catch (e) {
      console.warn('Feature', f.id, 'fehlgeschlagen', e);
      failed.push(f.id);
      errors.set(f.id, e instanceof Error ? e.message : String(e));
    }
  }
  const all = [...bodies.values()];
  const body = all.length > 1 ? makeCompound(all.map(s => s.clone())) as Shape3D : all[0] ?? null; // makeCompound gibt seine Teile frei
  const origins = new Map<number, (Origin | null)[]>([...bodies].map(([k, s]) => [k, originsOf(s, names.get(k))]));
  return { body, bodies, failed, errors, origins, names, fixes, unsure, confirm };
}

// Text als Körper: Umrisse der mit loadFont geladenen Schrift (Standard-Schrift des Workers) in der Ebene des Features, um d extrudiert.
// Jede Fläche heißt nach dem Feature (tag text, Index), Buchstaben haben keine eigene Herkunft
function textSolid(f: TextFeature): [Shape3D, Named] {
  if (!f.text.trim()) throw new Error('Kein Text eingegeben');
  if (Math.abs(f.d) < 1e-6) throw new Error('Texthöhe 0');
  const sk = drawText(f.text, { fontSize: f.size }).sketchOnPlane(new Plane(f.o, f.u, f.n)) as unknown as { extrude: (d: number) => Shape3D };
  const s = sk.extrude(f.d);
  return [s, s.faces.map((face, i) => ({ face, o: { f: f.id, tag: 'text' as const, i } }))];
}

// Blickrichtungen: replicad benennt top/bottom und left/right aus Sicht der Ebene, also umgekehrt (im Test geprüft):
// 'bottom' = Draufsicht von oben, 'right' = Ansicht von links
const VIEWS = ['front', 'bottom', 'right'] as const;

// Ansichten 1:1 als SVG (Maße in mm, Grundlage für DXF): Vorderansicht, darunter Draufsicht, rechts daneben Seitenansicht
// von links (europäische Anordnung); verdeckte Kanten grau gestrichelt
export function drawingSVG(body: Shape3D) {
  const s = forExport(body), gap = 15, views = VIEWS.map(v => drawProjection(s, v));
  s.delete();
  const box = (d: Drawing) => d.boundingBox.bounds, [fv, tv, lv] = views.map(v => box(v.visible));
  const shift = [[0, 0], [0, fv[0][1] - gap - tv[1][1]], [fv[1][0] + gap - lv[0][0], 0]];
  const placed = views.map((v, i) => ({ visible: v.visible.translate(shift[i][0], shift[i][1]), hidden: v.hidden.translate(shift[i][0], shift[i][1]) }));
  const all = placed.map(v => box(v.visible)), m = 5;
  const x0 = Math.min(...all.map(b => b[0][0])) - m, x1 = Math.max(...all.map(b => b[1][0])) + m;
  const y0 = Math.min(...all.map(b => b[0][1])) - m, y1 = Math.max(...all.map(b => b[1][1])) + m;
  const paths = (d: Drawing, attrs = '') => { try { return d.toSVGPaths().flat().map(p => `<path d="${p}"${attrs}/>`).join(''); } catch { return ''; } }; // leere Zeichnung
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${-y1} ${x1 - x0} ${y1 - y0}" width="${x1 - x0}mm" height="${y1 - y0}mm" `
    + `fill="none" stroke="black" stroke-width="0.35" stroke-linecap="round" stroke-linejoin="round">`
    + placed.map(v => paths(v.hidden, ' stroke="#888" stroke-width="0.25" stroke-dasharray="2 1.2"') + paths(v.visible)).join('') + '</svg>';
}

export type SheetInfo = { sheet: 'A4' | 'A3'; title: string; material: string; date: string; unit?: 'mm' | 'in' }; // Maße in mm (Standard) oder Zoll

// Modellpunkt (Y-oben) → 2D-Koordinaten der Ansicht, wie drawProjection sie liefert (vorne, oben, seitlich; im Test geprüft)
// Iso: Kamera (1, −1, 1) im Z-oben-Export = Blick aus (1, 1, 1) im Modell, Achsen der ProjectionCamera
export const PROJ = [(p: ArrayLike<number>) => [p[0], p[1]], (p: ArrayLike<number>) => [p[0], -p[2]], (p: ArrayLike<number>) => [p[2], p[1]],
  (p: ArrayLike<number>) => [(p[0] - p[2]) / Math.SQRT2, (2 * p[1] - p[0] - p[2]) / Math.sqrt(6)]];
const AXES = [[0, 0, 1], [0, 1, 0], [1, 0, 0], [1, 1, 1].map(x => x / Math.sqrt(3))]; // Blickrichtung je Ansicht
// Kreis als Punktfolge im Raum (für schräg gesehene Kreise = Ellipsen in der Ansicht)
function ring(c: { c: Vec; n: Vec; r: number }, n = 48) {
  const h = Math.abs(c.n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], cr = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const e1 = cr(c.n, h), l = Math.hypot(...e1), u = e1.map(x => x / l), w = cr(c.n, u);
  return Array.from({ length: n }, (_, i) => { const t = 2 * Math.PI * i / n; return c.c.map((x, k) => x + c.r * (Math.cos(t) * u[k] + Math.sin(t) * w[k])); });
}
const facing = (c: { n: Vec }, v: number) => Math.abs(c.n[0] * AXES[v][0] + c.n[1] * AXES[v][1] + c.n[2] * AXES[v][2]);
// Aufgelöstes Maß in Ansichtskoordinaten (mm, 1:1): pts = Punkte bzw. Kreismitte (+ Ansatzpunkt der Hinweislinie) / Scheitel und
// Endpunkte der Kanten; rv = Abstand Mitte–Ansatzpunkt in der Ansicht (bei schräg gesehenen Kreisen kleiner als r)
export type DimGeo = Dim & { pts: number[][]; r?: number; rv?: number; val: number };

// Maße auf die aktuellen Körper auflösen; ok = darstellbar, sonst Grund (verloren/mehrdeutig/keine Kreiskante …)
export function resolveDims(dims: Dim[], bodies: Map<number, Shape3D>, names: Map<number, Named>): { ok: DimGeo[]; bad: [number, string][] } {
  const ok: DimGeo[] = [], bad: [number, string][] = [];
  for (const d of dims) {
    let why = 'Bezug nicht gefunden';
    for (const [k, s] of bodies) {
      const nm = names.get(k) ?? [], P = PROJ[d.v];
      if (d.t === 'lin') {
        const a = d.a && resolvePoint(d.a, nm), b = d.b && resolvePoint(d.b, nm);
        if (!a?.ok || !b?.ok) continue;
        const A = P(a.p), B = P(b.p), val = d.v === 3 ? Math.hypot(...a.p.map((x, i) => x - b.p[i])) // Iso verkürzt: wahre Länge
          : d.dir === 'h' ? Math.abs(A[0] - B[0]) : d.dir === 'v' ? Math.abs(A[1] - B[1]) : Math.hypot(A[0] - B[0], A[1] - B[1]);
        ok.push({ ...d, pts: [A, B], val }); why = ''; break;
      }
      const e = d.e && resolveEdge(d.e, s, nm);
      if (!e?.ok) continue;
      if (d.t === 'ang') {
        if (d.v === 3) { why = 'Winkel in der Iso-Ansicht wären verzerrt'; break; }
        const e2 = d.e2 && resolveEdge(d.e2, s, nm);
        if (!e2?.ok) continue;
        const [a0, a1, b0, b1] = [e.shape.startPoint, e.shape.endPoint, e2.shape.startPoint, e2.shape.endPoint].map(v => P(v.toTuple()));
        const vertex = [a0, a1].flatMap(p => [b0, b1].map(q => [p, q, Math.hypot(p[0] - q[0], p[1] - q[1])] as const)).sort((x, y) => x[2] - y[2])[0];
        if (vertex[2] > 1e-6) { why = 'Kanten treffen sich in dieser Ansicht nicht'; break; }
        const V = vertex[0], fa = vertex[0] === a0 ? a1 : a0, fb = vertex[1] === b0 ? b1 : b0;
        const ang = Math.abs(Math.atan2(fa[1] - V[1], fa[0] - V[0]) - Math.atan2(fb[1] - V[1], fb[0] - V[0])) * 180 / Math.PI;
        ok.push({ ...d, pts: [V, fa, fb], val: ang > 180 ? 360 - ang : ang }); why = ''; break;
      }
      const c = circleOf(e.shape);
      if (!c) { why = 'keine Kreiskante'; break; }
      if (facing(c, d.v) < 0.1) { why = 'Kreis in dieser Ansicht von der Seite gesehen'; break; }
      const C = P(c.c), on = ring(c).map(P).reduce((m, p) => p[0] + p[1] > m[0] + m[1] ? p : m); // oben rechts am (Ellipsen-)Rand
      ok.push({ ...d, pts: [C, on], r: c.r, rv: Math.hypot(on[0] - C[0], on[1] - C[1]), val: d.t === 'dia' ? 2 * c.r : c.r }); why = ''; break;
    }
    if (why) bad.push([d.id, why]);
  }
  return { ok, bad };
}
const SHEETS = { A4: [297, 210], A3: [420, 297] }, SCALES = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
const num = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ','); // deutsche Schreibweise
const esc = (t: string) => t.replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`);

// Technische Zeichnung auf einem Blatt (quer): drei Ansichten mit Gesamtmaßen, Iso-Ansicht, Rahmen und Schriftfeld.
// Maßstab = größter Normmaßstab, bei dem alles auf das Blatt passt
// shortcut: nur Gesamtmaße je Ansicht, keine Einzelmaße, Schnitte oder Details → Bemaßung aus Skizzenmaßen (M5)
// layout.S: Abbildung Ansicht i, Ansichtspunkt → Blatt (für den Maß-Editor)
export function sheetSVG(body: Shape3D, info: SheetInfo, dims: DimGeo[] = [], layout?: { S?: (i: number, p: number[]) => number[]; k?: number }) {
  const s = forExport(body);
  const views = [...VIEWS.map(v => drawProjection(s, v)), drawProjection(s, new ProjectionCamera([0, 0, 0], [1, -1, 1]))];
  s.delete();
  const bb = views.map(v => v.visible.boundingBox.bounds), size = bb.map(([a, b]) => [b[0] - a[0], b[1] - a[1]]);
  const [W, H] = SHEETS[info.sheet], gap = 22, x0 = 35, y0 = 15; // gap: Platz für Maße zwischen den Ansichten
  const availW = W - x0 - 10, availH = H - y0 - 10 - 32;              // 32 = Schriftfeld unten
  const fits = (k: number) => Math.max(size[0][0], size[1][0]) * k + gap + Math.max(size[2][0], size[3][0]) * k <= availW
    && Math.max(size[0][1], size[2][1]) * k + gap + Math.max(size[1][1], size[3][1]) * k <= availH;
  const k = SCALES.find(fits) ?? SCALES.at(-1)!;
  const col2 = x0 + Math.max(size[0][0], size[1][0]) * k + gap, row2 = y0 + Math.max(size[0][1], size[2][1]) * k + gap;
  const pos = [[x0, y0], [x0, row2], [col2, y0], [col2, row2]]; // Vorder-, Drauf-, Seiten-, Iso-Ansicht
  const paths = (d: Drawing, attrs = '') => { try { return d.toSVGPaths().flat().map(p => `<path d="${p}"${attrs}/>`).join(''); } catch { return ''; } };
  let out = '';
  const len = (mm: number) => info.unit === 'in' ? (Math.round(mm / 25.4 * 1000) / 1000).toString().replace('.', ',') : num(mm);
  views.forEach((v, i) => { // Pfade sind y-gespiegelt (SVG); linke obere Ecke der Ansicht auf pos legen
    const [[ax], [, by]] = bb[i];
    out += `<g transform="translate(${pos[i][0] - k * ax} ${pos[i][1] + k * by}) scale(${k})" stroke-width="${0.5 / k}">`
      + paths(v.hidden, ` stroke="#777" stroke-width="${0.25 / k}" stroke-dasharray="${2 / k} ${1 / k}"`) + paths(v.visible) + '</g>';
  });
  // Maßpfeil mit Spitze in (x, y); a = Richtung von der Spitze in die Maßlinie
  const arrow = (x: number, y: number, a: number) => `<path d="M${x} ${y}L${x + 3 * Math.cos(a + 0.25)} ${y + 3 * Math.sin(a + 0.25)}L${x + 3 * Math.cos(a - 0.25)} ${y + 3 * Math.sin(a - 0.25)}z" fill="#000" stroke="none"/>`;
  for (let i = 0; i < 3; i++) { // Breite unter, Höhe links neben jeder Ansicht
    const [x, y] = pos[i], w = size[i][0] * k, h = size[i][1] * k, yd = y + h + 8, xd = x - 8;
    out += `<g stroke-width="0.25"><path d="M${x} ${y + h + 1}V${yd + 2}M${x + w} ${y + h + 1}V${yd + 2}M${x} ${yd}H${x + w}"/>${arrow(x, yd, 0)}${arrow(x + w, yd, Math.PI)}`
      + `<path d="M${x - 1} ${y}H${xd - 2}M${x - 1} ${y + h}H${xd - 2}M${xd} ${y}V${y + h}"/>${arrow(xd, y, Math.PI / 2)}${arrow(xd, y + h, -Math.PI / 2)}</g>`
      + `<text x="${x + w / 2}" y="${yd - 1.2}" text-anchor="middle">${len(size[i][0])}</text>`
      + `<text transform="translate(${xd - 1.2} ${y + h / 2}) rotate(-90)" text-anchor="middle">${len(size[i][1])}</text>`;
  }
  // Einzelmaße: S = Ansichtspunkt → Blatt
  const S = (i: number, p: number[]) => [pos[i][0] - k * bb[i][0][0] + k * p[0], pos[i][1] + k * (bb[i][1][1] - p[1])];
  if (layout) { layout.S = S; layout.k = k; }
  for (const d of dims) {
    const t = `${d.t === 'dia' ? '⌀' : d.t === 'rad' ? 'R' : ''}${d.t === 'ang' ? num(d.val) : len(d.val)}${d.t === 'ang' ? '°' : ''}${d.tol ? ' ' + d.tol : ''}`;
    out += `<g stroke-width="0.25" data-dim="${d.id}">${dimSVG(d, d.pts.map(p => S(d.v, p)), (d.rv ?? 0) * k, esc(t), arrow)}</g>`;
  }
  // Rahmen und Schriftfeld (unten rechts)
  const tx = W - 10 - 140, ty = H - 10 - 28, scale = k >= 1 ? `${k}:1` : `1:${Math.round(1 / k)}`;
  const cell = (x: number, y: number, label: string, value: string, big = false) =>
    `<text x="${tx + x + 1.5}" y="${ty + y + 3}" font-size="2" fill="#555">${label}</text><text x="${tx + x + 1.5}" y="${ty + y + (big ? 11 : 8.5)}" font-size="${big ? 5 : 3.5}">${esc(value)}</text>`;
  out += `<rect x="20" y="10" width="${W - 30}" height="${H - 20}" stroke-width="0.7"/>`
    + `<path stroke-width="0.5" d="M${tx} ${ty}h140v28h-140zM${tx} ${ty + 14}h140M${tx + 90} ${ty}v28M${tx + 45} ${ty + 14}v14M${tx + 115} ${ty + 14}v14"/>`
    + cell(0, 0, 'Benennung', info.title, true) + cell(90, 0, 'Werkstoff', info.material || '–')
    + cell(0, 14, 'Maßstab', `${scale} · ${info.unit === 'in' ? 'Zoll' : 'mm'}`) + cell(45, 14, 'Datum', info.date) + cell(90, 14, 'Blatt', info.sheet) + cell(115, 14, 'Erstellt mit', 'OpenForm CAD');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" font-family="Arial, sans-serif" font-size="3.5" `
    + `fill="none" stroke="black" stroke-linecap="round" stroke-linejoin="round"><rect width="${W}" height="${H}" fill="#fff" stroke="none"/>`
    + out.replace(/<text (?![^>]*fill=)/g, '<text fill="#000" ').replace(/<text /g, '<text stroke="none" ') + '</svg>';
}

// Was sich im Maß-Editor anklicken lässt, in Blattkoordinaten je Ansicht v: Eckpunkte, Kreiskanten, gerade Kanten
export type Cands = { pts: { v: number; p: number[]; ref: PointRef }[]; circles: { v: number; c: number[]; r: number; ref: EdgeRef; pts?: number[][] }[]; lines: { v: number; a: number[]; b: number[]; ref: EdgeRef }[] };
export function sheetCands(bodies: Map<number, Shape3D>, names: Map<number, Named>, S: (i: number, p: number[]) => number[], k: number): Cands {
  const out: Cands = { pts: [], circles: [], lines: [] };
  for (const [b, s] of bodies) {
    const nm = names.get(b) ?? [], seen: Vec[] = [];
    for (const e of s.edges) {
      for (const q of [e.startPoint.toTuple(), e.endPoint.toTuple()] as Vec[]) {
        if (seen.some(p => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-6)) continue;
        seen.push(q);
        const ref = pointRef(nm, q);
        if (ref) [0, 1, 2, 3].forEach(v => out.pts.push({ v, p: S(v, PROJ[v](q)), ref }));
      }
      const ref = edgeRef(nm, e, s);
      if (!ref) continue;
      const c = circleOf(e);
      if (c) [0, 1, 2, 3].forEach(v => { // schräg gesehen: Ellipse als Punktfolge zum Anklicken; von der Seite gesehen: nicht anklickbar
        const f = facing(c, v);
        if (f > 0.1) out.circles.push({ v, c: S(v, PROJ[v](c.c)), r: c.r * k, ref, ...f < 0.999 && { pts: ring(c).map(p => S(v, PROJ[v](p))) } });
      });
      else if (e.geomType === 'LINE') [0, 1, 2].forEach(v => {
        const a = S(v, PROJ[v](e.startPoint.toTuple())), bb = S(v, PROJ[v](e.endPoint.toTuple()));
        if (Math.hypot(a[0] - bb[0], a[1] - bb[1]) > 1e-3) out.lines.push({ v, a, b: bb, ref });
      });
    }
  }
  return out;
}

// Ein Maß auf dem Blatt; P = Punkte in Blattkoordinaten, R = Kreisradius auf dem Blatt
function dimSVG(d: Dim, P: number[][], R: number, t: string, arrow: (x: number, y: number, a: number) => string) {
  const line = (...q: number[][]) => `<path d="M${q.map(p => p.join(' ')).join('L')}"/>`;
  const text = (p: number[], rot = 0) => `<text transform="translate(${p[0]} ${p[1]}) rotate(${rot})" text-anchor="middle">${t}</text>`;
  if (d.t === 'lin') {
    const [A, B] = P;
    // Richtung der Maßlinie u und Versatz n (Blatt-y zeigt nach unten): h = waagrecht über a, v = senkrecht links von a, al = entlang a→b
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, u = d.dir === 'h' ? [1, 0] : d.dir === 'v' ? [0, -1] : [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    const n = [u[1], -u[0]], along = (p: number[]) => (p[0] - A[0]) * u[0] + (p[1] - A[1]) * u[1];
    const a2 = [A[0] + n[0] * d.off, A[1] + n[1] * d.off], b2 = [a2[0] + u[0] * along(B), a2[1] + u[1] * along(B)];
    const ext = (p: number[], q: number[]) => { const g = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, w = [(q[0] - p[0]) / g, (q[1] - p[1]) / g]; return line([p[0] + w[0], p[1] + w[1]], [q[0] + 2 * w[0], q[1] + 2 * w[1]]); };
    const dir = Math.atan2(b2[1] - a2[1], b2[0] - a2[0]), rot = Math.abs(dir) > Math.PI / 2 ? dir * 180 / Math.PI + 180 : dir * 180 / Math.PI;
    const mid = [(a2[0] + b2[0]) / 2 + n[0] * 1.2, (a2[1] + b2[1]) / 2 + n[1] * 1.2];
    return ext(A, a2) + ext(B, b2) + line(a2, b2) + arrow(a2[0], a2[1], dir) + arrow(b2[0], b2[1], dir + Math.PI) + text(mid, rot);
  }
  if (d.t === 'ang') { // Bogen um den Scheitel mit Radius off
    const [V, A, B] = P, r = Math.max(4, d.off), a0 = Math.atan2(A[1] - V[1], A[0] - V[0]), a1 = Math.atan2(B[1] - V[1], B[0] - V[0]);
    let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const at = (a: number, rr = r) => [V[0] + rr * Math.cos(a), V[1] + rr * Math.sin(a)], m = a0 + da / 2;
    return `<path d="M${at(a0).join(' ')}A${r} ${r} 0 0 ${da > 0 ? 1 : 0} ${at(a1).join(' ')}"/>` + text(at(m, r + 3));
  }
  // Durchmesser/Radius: Hinweislinie vom Ansatzpunkt am Kreis (bzw. an der Ellipse) nach oben rechts zur Zahl
  const [C, on] = P, a = Math.atan2(on[1] - C[1], on[0] - C[0]), far = Math.max(R + 4, R + d.off);
  const T = [C[0] + far * Math.cos(a), C[1] + far * Math.sin(a)];
  return line(d.t === 'rad' ? C : on, T, [T[0] + 3 + t.length * 1.8, T[1]]) + arrow(on[0], on[1], a + (d.t === 'rad' ? Math.PI : 0)) + text([T[0] + 1.5 + t.length * 0.9, T[1] - 1]);
}

// 3MF (T7.1): ZIP ohne Kompression mit einem Objekt je Körper (Z-oben, mm). Gleiche Eckpunkte werden zusammengelegt,
// sonst hat das Netz offene Kanten (OCCT vernetzt je Fläche) und Slicer melden Fehler
export function to3MF(shapes: Shape3D[]): Uint8Array<ArrayBuffer> {
  const objs = shapes.map((sh, i) => {
    const s = forExport(sh), m = s.mesh({ tolerance: 0.01, angularTolerance: 0.1 }), idx = new Map<string, number>(), vs: string[] = [], tris: string[] = [];
    s.delete();
    const at = (k: number) => {
      const p = [0, 1, 2].map(j => +m.vertices[3 * k + j].toFixed(6)), key = p.join();
      if (!idx.has(key)) { idx.set(key, vs.length); vs.push(`<vertex x="${p[0]}" y="${p[1]}" z="${p[2]}"/>`); }
      return idx.get(key)!;
    };
    for (let t = 0; t < m.triangles.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map(j => at(m.triangles[t + j]));
      if (a !== b && b !== c && a !== c) tris.push(`<triangle v1="${a}" v2="${b}" v3="${c}"/>`);
    }
    return `<object id="${i + 1}" type="model" name="Körper ${i + 1}"><mesh><vertices>${vs.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`;
  });
  const xml = '<?xml version="1.0" encoding="UTF-8"?>';
  return zipStore({
    '[Content_Types].xml': `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`,
    '_rels/.rels': `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
    '3D/3dmodel.model': `${xml}<model unit="millimeter" xml:lang="de-DE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${objs.join('')}</resources><build>${objs.map((_, i) => `<item objectid="${i + 1}"/>`).join('')}</build></model>`,
  });
}
// ZIP-Archiv, Einträge unkomprimiert (Methode 0); genügt für 3MF
export function zipStore(files: Record<string, string>): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder(), crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Uint8Array) => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = enc.encode(name), d = enc.encode(text), c = crc(d);
    const head = (sig: number, extra: number) => { const h = new DataView(new ArrayBuffer(extra)); h.setUint32(0, sig, true); return h; };
    const L = head(0x04034b50, 30 + n.length);
    [[4, 20], [6, 0x800], [8, 0]].forEach(([o, v]) => L.setUint16(o, v, true)); // Version, UTF-8-Namen, ohne Kompression
    L.setUint32(14, c, true); L.setUint32(18, d.length, true); L.setUint32(22, d.length, true); L.setUint16(26, n.length, true);
    new Uint8Array(L.buffer).set(n, 30);
    const C = head(0x02014b50, 46 + n.length);
    [[4, 20], [6, 20], [8, 0x800], [10, 0]].forEach(([o, v]) => C.setUint16(o, v, true));
    C.setUint32(16, c, true); C.setUint32(20, d.length, true); C.setUint32(24, d.length, true); C.setUint16(28, n.length, true); C.setUint32(42, off, true);
    new Uint8Array(C.buffer).set(n, 46);
    parts.push(new Uint8Array(L.buffer), d); central.push(new Uint8Array(C.buffer));
    off += 30 + n.length + d.length;
  }
  const size = central.reduce((s, c) => s + c.length, 0), E = new DataView(new ArrayBuffer(22));
  E.setUint32(0, 0x06054b50, true); E.setUint16(8, central.length, true); E.setUint16(10, central.length, true); E.setUint32(12, size, true); E.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(E.buffer)], out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

// Szene ist Y-oben, CAD-Dateien Z-oben
export function forExport(body: Shape3D): Shape3D {
  return body.clone().rotate(90, [0, 0, 0], [1, 0, 0]);
}

export async function loadStep(text: string): Promise<Shape3D> {
  const shape = await importSTEP(new Blob([text])) as Shape3D;
  return shape.rotate(-90, [0, 0, 0], [1, 0, 0]);
}
