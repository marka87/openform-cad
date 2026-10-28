// CAD-Kern: Features → B-Rep-Körper über replicad (OpenCascade). setOC() muss vorher aufgerufen sein.
import { draw, drawCircle, drawEllipse, drawProjection, drawRectangle, importSTEP, makeCompound, Plane, ProjectionCamera, type Drawing, type Shape3D, type Sketch } from 'replicad';
import { bodyOf, isCut, isExtrude, isFlat, splineBeziers, type Extrude, type Feature, type Vec } from './model';
import { boolean, edgeOp, faceIndex, nameLoft, nameSolid, shell, type Named, type Origin } from './topo';

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
// Ergebnis: bodies je Körpernummer; body = der einzige Körper bzw. alle als Verbund (für Export und Tests);
// origins je Körper: Herkunft jeder Fläche (Reihenfolge wie shape.faces), null = unbekannt
// shortcut: Import, Bewegen, Teilen schreiben noch keine Namen (T1.3d) → danach unbekannt
export function buildBody(features: Feature[], imports = new Map<number, Shape3D>()) {
  const bodies = new Map<number, Shape3D>(), names = new Map<number, Named>(), alias = new Map<number, number>(), failed: number[] = [];
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
        const front = s.intersect(half), back = s.cut(half);
        half.delete(); s.delete();
        bodies.set(k, back); bodies.set(f.id, front); names.delete(k);
        continue;
      }
      if (f.type === 'move') {
        const k = key(f.body), s = bodies.get(k);
        if (!s) continue;
        const w = Math.min(1, Math.max(-1, f.q[3])), ang = 2 * Math.acos(w), sn = Math.sqrt(1 - w * w);
        let next = s.clone();
        if (sn > 1e-9) next = next.rotate(ang * 180 / Math.PI, f.c, [f.q[0] / sn, f.q[1] / sn, f.q[2] / sn]);
        if (f.s && f.s !== 1) next = next.scale(f.s, f.c);
        next = next.translate(f.t);
        s.delete();
        bodies.set(k, next); names.delete(k);
        continue;
      }
      const k = key(bodyOf(f));
      let body = bodies.get(k) ?? null;
      const done = (next: Shape3D, nm: Named = []) => { body?.delete(); bodies.set(k, next); names.set(k, nm); };
      if (f.type === 'shell') {
        if (!body) continue;
        done(...shell(f.id, body, names.get(k) ?? [], [f.at, ...f.more ?? []], f.t)); // positive Dicke = Wand nach innen
        continue;
      }
      if (f.type === 'fillet' || f.type === 'chamfer') {
        if (!body) continue;
        done(...edgeOp(f.type, f.id, body, names.get(k) ?? [], f.at, f.r));
        continue;
      }
      let s: Shape3D, nS: Named = [];
      if (f.type === 'import') {
        const shape = imports.get(f.id);
        if (!shape) throw new Error('STEP-Datei konnte nicht gelesen werden');
        s = shape.clone();
      } else if (f.type === 'loft') {
        const [A, B] = [f.a, f.b].map(id => features.find(g => g.id === id));
        if (!A || !B || !isExtrude(A) || !isExtrude(B)) throw new Error('Skizze für den Übergang fehlt');
        s = sketchOf(A).loftWith(sketchOf(B)) as Shape3D;
        nS = nameLoft(f.id, A, B, s);
      } else {
        if (!isExtrude(f) || isFlat(f) || (isCut(f) && !body)) continue;
        s = solidOf(f);
        nS = nameSolid(f, s);
      }
      if (!body) { bodies.set(k, s); names.set(k, nS); continue; }
      done(...boolean(isCut(f) ? 'cut' : 'fuse', body, names.get(k) ?? [], s, nS));
      s.delete(); // WASM-Speicher freigeben
    } catch (e) {
      console.warn('Feature', f.id, 'fehlgeschlagen', e);
      failed.push(f.id);
    }
  }
  const all = [...bodies.values()];
  const body = all.length > 1 ? makeCompound(all.map(s => s.clone())) as Shape3D : all[0] ?? null; // makeCompound gibt seine Teile frei
  const origins = new Map<number, (Origin | null)[]>();
  for (const [k, s] of bodies) {
    const faces = s.faces, idx = faceIndex(faces), o: (Origin | null)[] = faces.map(() => null);
    for (const n of names.get(k) ?? []) { const i = idx(n.face.wrapped); if (i >= 0) o[i] = n.o; }
    origins.set(k, o);
  }
  return { body, bodies, failed, origins };
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

export type SheetInfo = { sheet: 'A4' | 'A3'; title: string; material: string; date: string };
const SHEETS = { A4: [297, 210], A3: [420, 297] }, SCALES = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
const num = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ','); // deutsche Schreibweise
const esc = (t: string) => t.replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`);

// Technische Zeichnung auf einem Blatt (quer): drei Ansichten mit Gesamtmaßen, Iso-Ansicht, Rahmen und Schriftfeld.
// Maßstab = größter Normmaßstab, bei dem alles auf das Blatt passt
// shortcut: nur Gesamtmaße je Ansicht, keine Einzelmaße, Schnitte oder Details → Bemaßung aus Skizzenmaßen (M5)
export function sheetSVG(body: Shape3D, info: SheetInfo) {
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
      + `<text x="${x + w / 2}" y="${yd - 1.2}" text-anchor="middle">${num(size[i][0])}</text>`
      + `<text transform="translate(${xd - 1.2} ${y + h / 2}) rotate(-90)" text-anchor="middle">${num(size[i][1])}</text>`;
  }
  // Rahmen und Schriftfeld (unten rechts)
  const tx = W - 10 - 140, ty = H - 10 - 28, scale = k >= 1 ? `${k}:1` : `1:${Math.round(1 / k)}`;
  const cell = (x: number, y: number, label: string, value: string, big = false) =>
    `<text x="${tx + x + 1.5}" y="${ty + y + 3}" font-size="2" fill="#555">${label}</text><text x="${tx + x + 1.5}" y="${ty + y + (big ? 11 : 8.5)}" font-size="${big ? 5 : 3.5}">${esc(value)}</text>`;
  out += `<rect x="20" y="10" width="${W - 30}" height="${H - 20}" stroke-width="0.7"/>`
    + `<path stroke-width="0.5" d="M${tx} ${ty}h140v28h-140zM${tx} ${ty + 14}h140M${tx + 90} ${ty}v28M${tx + 45} ${ty + 14}v14M${tx + 115} ${ty + 14}v14"/>`
    + cell(0, 0, 'Benennung', info.title, true) + cell(90, 0, 'Werkstoff', info.material || '–')
    + cell(0, 14, 'Maßstab', scale) + cell(45, 14, 'Datum', info.date) + cell(90, 14, 'Blatt', info.sheet) + cell(115, 14, 'Erstellt mit', 'OpenForm CAD');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" font-family="Arial, sans-serif" font-size="3.5" `
    + `fill="none" stroke="black" stroke-linecap="round" stroke-linejoin="round"><rect width="${W}" height="${H}" fill="#fff" stroke="none"/>`
    + out.replace(/<text (?![^>]*fill=)/g, '<text fill="#000" ').replace(/<text /g, '<text stroke="none" ') + '</svg>';
}

// Szene ist Y-oben, CAD-Dateien Z-oben
export function forExport(body: Shape3D): Shape3D {
  return body.clone().rotate(90, [0, 0, 0], [1, 0, 0]);
}

export async function loadStep(text: string): Promise<Shape3D> {
  const shape = await importSTEP(new Blob([text])) as Shape3D;
  return shape.rotate(-90, [0, 0, 0], [1, 0, 0]);
}
