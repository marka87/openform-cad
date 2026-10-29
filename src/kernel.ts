// CAD-Kern: Features → B-Rep-Körper über replicad (OpenCascade). setOC() muss vorher aufgerufen sein.
import { draw, drawCircle, type Wire, drawEllipse, drawProjection, drawRectangle, importSTEP, makeCompound, Plane, ProjectionCamera, type Drawing, type Shape3D, type Sketch } from 'replicad';
import { bodyOf, isCut, isExtrude, isFlat, revAxis, splineBeziers, type Dim, type PointRef, type Extrude, type Feature, type Sweep, type Vec } from './model';
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
// errors: Grund je fehlgeschlagenem Feature; fixes: nachgetragene Bezüge und nachgeführte Lagen je Feature-ID (übernimmt main.ts ins Modell); unsure: unsicher aufgelöst
export function buildBody(features: Feature[], imports = new Map<number, Shape3D>()) {
  const bodies = new Map<number, Shape3D>(), names = new Map<number, Named>(), alias = new Map<number, number>(), failed: number[] = [];
  const errors = new Map<number, string>(), fixes = new Map<number, Record<string, unknown>>(), unsure: number[] = [], moved = new Map<number, Extrude>(); // moved: mitgewanderte Skizzen
  const anchor = <T extends { patch?: Record<string, unknown>; sure: boolean }>(id: number, a: T) => {
    if (a.patch) fixes.set(id, { ...fixes.get(id), ...a.patch });
    if (!a.sure) unsure.push(id);
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
        const prof = sketchOf(P) as Sketch & { wire: Wire }, path = pathSketch(f); // beide festhalten: replicads GC löscht sonst die Drähte
        try { [s, nS] = sweep(f, P, prof.wire, path.wire); } finally { prof.delete(); path.delete(); }
      } else {
        if (!isExtrude(f)) continue;
        const g = anchor(f.id, anchorSketch(f, body, names.get(k) ?? [])).f; // Skizze auf ihre (vielleicht gewanderte) Fläche setzen
        if (g !== f) moved.set(f.id, g);
        if (isFlat(g) || (isCut(g) && !body)) continue;
        s = solidOf(g);
        nS = nameSolid(g, s);
      }
      if (!body) { bodies.set(k, s); names.set(k, nS); continue; }
      done(...boolean((isExtrude(f) && isCut(f)) || (f.type === 'sweep' && f.sub) ? 'cut' : 'fuse', body, names.get(k) ?? [], s, nS));
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
  return { body, bodies, failed, errors, origins, names, fixes, unsure };
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
export const PROJ = [(p: ArrayLike<number>) => [p[0], p[1]], (p: ArrayLike<number>) => [p[0], -p[2]], (p: ArrayLike<number>) => [p[2], p[1]]];
// Aufgelöstes Maß in Ansichtskoordinaten (mm, 1:1): pts = Punkte bzw. Kreismitte / Scheitel und Endpunkte der Kanten
export type DimGeo = Dim & { pts: number[][]; r?: number; val: number };

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
        const A = P(a.p), B = P(b.p), val = d.dir === 'h' ? Math.abs(A[0] - B[0]) : d.dir === 'v' ? Math.abs(A[1] - B[1]) : Math.hypot(A[0] - B[0], A[1] - B[1]);
        ok.push({ ...d, pts: [A, B], val }); why = ''; break;
      }
      const e = d.e && resolveEdge(d.e, s, nm);
      if (!e?.ok) continue;
      if (d.t === 'ang') {
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
      ok.push({ ...d, pts: [P(c.c)], r: c.r, val: d.t === 'dia' ? 2 * c.r : c.r }); why = ''; break;
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
    out += `<g stroke-width="0.25" data-dim="${d.id}">${dimSVG(d, d.pts.map(p => S(d.v, p)), (d.r ?? 0) * k, esc(t), arrow)}</g>`;
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
export type Cands = { pts: { v: number; p: number[]; ref: PointRef }[]; circles: { v: number; c: number[]; r: number; ref: EdgeRef }[]; lines: { v: number; a: number[]; b: number[]; ref: EdgeRef }[] };
export function sheetCands(bodies: Map<number, Shape3D>, names: Map<number, Named>, S: (i: number, p: number[]) => number[], k: number): Cands {
  const out: Cands = { pts: [], circles: [], lines: [] };
  for (const [b, s] of bodies) {
    const nm = names.get(b) ?? [], seen: Vec[] = [];
    for (const e of s.edges) {
      for (const q of [e.startPoint.toTuple(), e.endPoint.toTuple()] as Vec[]) {
        if (seen.some(p => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-6)) continue;
        seen.push(q);
        const ref = pointRef(nm, q);
        if (ref) [0, 1, 2].forEach(v => out.pts.push({ v, p: S(v, PROJ[v](q)), ref }));
      }
      const ref = edgeRef(nm, e, s);
      if (!ref) continue;
      const c = circleOf(e);
      if (c) [0, 1, 2].forEach(v => { if (Math.abs(c.n[[2, 1, 0][v]]) > 0.999) out.circles.push({ v, c: S(v, PROJ[v](c.c)), r: c.r * k, ref }); }); // nur von vorn gesehene Kreise
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
  // Durchmesser/Radius: Hinweislinie vom Kreis schräg nach oben rechts zur Zahl
  const [C] = P, a = -Math.PI / 4, on = [C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)], far = Math.max(R + 4, R + d.off);
  const T = [C[0] + far * Math.cos(a), C[1] + far * Math.sin(a)];
  return line(d.t === 'rad' ? C : on, T, [T[0] + 3 + t.length * 1.8, T[1]]) + arrow(on[0], on[1], a + (d.t === 'rad' ? Math.PI : 0)) + text([T[0] + 1.5 + t.length * 0.9, T[1] - 1]);
}

// Szene ist Y-oben, CAD-Dateien Z-oben
export function forExport(body: Shape3D): Shape3D {
  return body.clone().rotate(90, [0, 0, 0], [1, 0, 0]);
}

export async function loadStep(text: string): Promise<Shape3D> {
  const shape = await importSTEP(new Blob([text])) as Shape3D;
  return shape.rotate(-90, [0, 0, 0], [1, 0, 0]);
}
