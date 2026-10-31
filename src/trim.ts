// Trimmen von Skizzen: ein Stück des Umrisses zwischen zwei Schnittpunkten entfernen. Treffen sich die Enden der Reste, werden sie
// verbunden; schließt sich der Umriss, entsteht wieder eine Fläche (Rechteck und Kreis trimmen ergibt eine gemeinsame Form).
import { arcInfo, contour, isExtrude, polyFeature, type Extrude, type Feature } from './model';

type Seg = { a: number[]; b: number[]; bu: number };
const TOL = 1e-6;
const segsOf = (pts: number[][], closed: boolean): Seg[] =>
  pts.slice(0, closed ? pts.length : pts.length - 1).map((a, i) => ({ a, b: pts[(i + 1) % pts.length], bu: a[2] ?? 0 }));
const pointAt = ({ a, b, bu }: Seg, t: number): number[] => {
  if (!bu) return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  const c = arcInfo(a, b, bu), w = Math.atan2(a[1] - c.cy, a[0] - c.cx) + c.th * t;
  return [c.cx + c.r * Math.cos(w), c.cy + c.r * Math.sin(w)];
};
// Nächste Stelle auf dem Abschnitt: Parameter t (bei Bögen anteilig am Winkel) und Abstand
function nearest(s: Seg, q: number[]) {
  let t: number;
  if (!s.bu) {
    const d = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
    t = Math.max(0, Math.min(1, ((q[0] - s.a[0]) * d[0] + (q[1] - s.a[1]) * d[1]) / (d[0] ** 2 + d[1] ** 2)));
  } else {
    const c = arcInfo(s.a, s.b, s.bu), dir = Math.sign(c.th), full = Math.abs(c.th);
    const w = ((Math.atan2(q[1] - c.cy, q[0] - c.cx) - Math.atan2(s.a[1] - c.cy, s.a[0] - c.cx)) * dir % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    t = w <= full ? w / full : w - full < 2 * Math.PI - w ? 1 : 0; // außerhalb des Bogens: näheres Ende
  }
  const p = pointAt(s, t);
  return { t, dist: Math.hypot(p[0] - q[0], p[1] - q[1]) };
}
// Schnittpunkte der Kreise bzw. Geraden, auf denen die Abschnitte liegen; ob sie auf den Abschnitten selbst liegen, prüft der Aufrufer
function candidates(s: Seg, o: Seg): number[][] {
  const out = [o.a.slice(0, 2), o.b.slice(0, 2)]; // aufliegendes Ende, auch bei deckungsgleichen Kanten
  const circle = (g: Seg) => { const c = arcInfo(g.a, g.b, g.bu); return { x: c.cx, y: c.cy, r: c.r }; };
  const lineCircle = (l: Seg, c: { x: number; y: number; r: number }) => {
    const d = [l.b[0] - l.a[0], l.b[1] - l.a[1]], f = [l.a[0] - c.x, l.a[1] - c.y], A = d[0] ** 2 + d[1] ** 2, B = f[0] * d[0] + f[1] * d[1], D = B * B - A * (f[0] ** 2 + f[1] ** 2 - c.r ** 2);
    if (D < 0) return;
    for (const k of [-1, 1]) { const t = (-B + k * Math.sqrt(D)) / A; out.push([l.a[0] + t * d[0], l.a[1] + t * d[1]]); }
  };
  if (!s.bu && !o.bu) {
    const r = [s.b[0] - s.a[0], s.b[1] - s.a[1]], u = [o.b[0] - o.a[0], o.b[1] - o.a[1]], den = r[0] * u[1] - r[1] * u[0];
    if (Math.abs(den) > 1e-12) { const t = ((o.a[0] - s.a[0]) * u[1] - (o.a[1] - s.a[1]) * u[0]) / den; out.push([s.a[0] + t * r[0], s.a[1] + t * r[1]]); }
    else out.push(s.a.slice(0, 2), s.b.slice(0, 2));
  } else if (!s.bu) lineCircle(s, circle(o));
  else if (!o.bu) lineCircle(o, circle(s));
  else {
    const A = circle(s), B = circle(o), dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
    if (d > 1e-12 && d <= A.r + B.r + TOL && d >= Math.abs(A.r - B.r) - TOL) {
      const k = (d * d + A.r ** 2 - B.r ** 2) / (2 * d), h = Math.sqrt(Math.max(0, A.r ** 2 - k * k));
      for (const m of [-1, 1]) out.push([A.x + (k * dx - m * h * dy) / d, A.y + (k * dy + m * h * dx) / d]);
    }
  }
  return out;
}
// Parameter auf s, an denen o kreuzt oder aufliegt; Enden von s selbst zählen nicht
function cutsOn(s: Seg, o: Seg) {
  return candidates(s, o).flatMap(q => {
    const m = nearest(s, q);
    return m.dist < TOL && nearest(o, q).dist < TOL && m.t > TOL && m.t < 1 - TOL ? [m.t] : [];
  });
}

// Form g in den Koordinaten der Skizze f; Ellipse und Spline nur als Schnittkante, angenähert
function outlineIn(g: Extrude, f: Extrude): { pts: number[][]; closed: boolean } {
  const p = g.p, closed = !g.open && g.type !== 'line';
  const own = g.type === 'rect' ? [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]]
    : g.type === 'circle' ? p.ry ? Array.from({ length: 64 }, (_, i) => [p.cx + p.r * Math.cos(i * Math.PI / 32), p.cy + p.ry * Math.sin(i * Math.PI / 32)]) : [[p.cx + p.r, p.cy, 1], [p.cx - p.r, p.cy, 1]]
    : g.smooth ? contour(g.pts!, true, closed) : g.pts!;
  if (g === f) return { pts: own, closed };
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], turn = dot(g.n, f.n) > 0 ? 1 : -1;
  return { closed, pts: own.map(q => {
    const w = [0, 1, 2].map(k => g.o[k] + q[0] * g.u[k] + q[1] * g.v[k] - f.o[k]);
    return q[2] ? [dot(w, f.u), dot(w, f.v), q[2] * turn] : [dot(w, f.u), dot(w, f.v)];
  }) };
}
const samePlane = (f: Extrude, g: Extrude) => Math.abs(f.n[0] * g.n[0] + f.n[1] * g.n[1] + f.n[2] * g.n[2]) > 0.999
  && Math.abs([0, 1, 2].reduce((s, k) => s + (g.o[k] - f.o[k]) * f.n[k], 0)) < TOL;

export type Piece = { f: Extrude; seg: Seg; pts: number[][]; closed: boolean; i: number; lo: number; hi: number; dist: number };
// Stück der Skizze f an der Stelle q: zwischen den nächsten Schnittpunkten mit den anderen Skizzen oder den Ecken von f
export function pieceAt(f: Extrude, others: Extrude[], q: number[]): Piece | null {
  if (f.smooth || f.p.ry) return null;
  const cutters = others.filter(g => g !== f && samePlane(f, g)).flatMap(g => { const o = outlineIn(g, f); return segsOf(o.pts, o.closed); });
  let { pts, closed } = outlineIn(f, f);
  if (f.type === 'circle') { // Der Kreis hat keine eigenen Ecken: Er zerfällt an den Schnittpunkten in Bögen
    const whole = segsOf(pts, true), at = whole.flatMap((s, k) => [...cutters.flatMap(c => cutsOn(s, c)), ...cutters.some(c => nearest(c, s.a).dist < TOL) ? [0] : []].map(t => [k, t])), ang = [...new Set(at.map(([k, t]) => {
      const w = pointAt(whole[k], t);
      return +Math.atan2(w[1] - f.p.cy, w[0] - f.p.cx).toFixed(9);
    }))].sort((a, b) => a - b);
    if (ang.length < 2) return { f, seg: whole[0], pts, closed, i: -1, lo: 0, hi: 1, dist: Math.abs(Math.hypot(q[0] - f.p.cx, q[1] - f.p.cy) - f.p.r) };
    pts = ang.map((w, k) => [f.p.cx + f.p.r * Math.cos(w), f.p.cy + f.p.r * Math.sin(w), Math.tan(((ang[(k + 1) % ang.length] - w + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI) / 4)]);
  }
  const segs = segsOf(pts, closed), best = segs.map((s, i) => ({ i, ...nearest(s, q) })).sort((a, b) => a.dist - b.dist)[0];
  if (!best) return null;
  const cuts = [...cutters, ...segs.filter((_, k) => k !== best.i)].flatMap(c => cutsOn(segs[best.i], c)); // auch die eigenen: schon verbundene Reste kreuzen sich selbst
  const lo = Math.max(0, ...cuts.filter(t => t < best.t)), hi = Math.min(1, ...cuts.filter(t => t > best.t));
  return { f, seg: segs[best.i], pts, closed, i: best.i, lo, hi, dist: best.dist };
}
// Punkte des Stücks für die Vorschau; ganzer Kreis (i = -1): sein ganzer Umriss
export const piecePoints = (p: Piece) => p.i < 0 ? contour(p.pts, false) : Array.from({ length: 25 }, (_, k) => pointAt(p.seg, p.lo + (p.hi - p.lo) * k / 24));

// Was vom Linienzug bleibt, wenn das Stück fehlt (0, 1 oder 2 Züge)
function remove({ pts, closed, i, lo, hi, seg }: Piece): number[][][] {
  if (i < 0) return [];
  const part = (t0: number, t1: number) => { const [x, y] = pointAt(seg, t0), bu = Math.tan(Math.atan(seg.bu) * (t1 - t0)); return bu ? [x, y, bu] : [x, y]; };
  const head = [...lo > 0 ? [part(0, lo), pointAt(seg, lo)] : [seg.a.slice(0, 2)]], tail = hi < 1 ? [part(hi, 1)] : [];
  const n = pts.length, rest = (k: number) => pts[(i + k) % n].slice();
  if (closed) return [[...tail, ...Array.from({ length: n - 1 }, (_, k) => rest(k + 1)), ...head]];
  return [[...pts.slice(0, i).map(q => q.slice()), ...head], [...tail, ...pts.slice(i + 1).map(q => q.slice())]].filter(c => c.length >= 2);
}
const same = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < TOL;
const reversed = (c: number[][]) => c.map((q, i) => { const [x, y] = c[c.length - 1 - i], bu = c[c.length - 2 - i]?.[2]; return bu ? [x, y, -bu] : [x, y]; });
// Zwei Linienzüge mit gemeinsamem Ende verbinden; null = sie berühren sich nicht
export function joinChains(a: number[][], b: number[][]): number[][] | null {
  const glue = (x: number[][], y: number[][]) => [...x.slice(0, -1), ...y];
  if (same(a.at(-1)!, b[0])) return glue(a, b);
  if (same(a.at(-1)!, b.at(-1)!)) return glue(a, reversed(b));
  if (same(a[0], b.at(-1)!)) return glue(b, a);
  if (same(a[0], b[0])) return glue(reversed(b), a);
  return null;
}

// Stück entfernen. Ergebnis: die Liste aller Skizzen danach; nextId wird für abgespaltene Züge hochgezählt.
// Offene Linien derselben Ebene mit gemeinsamem Ende werden eins, Hilfslinien bleiben für sich
export function trimFeatures(features: Feature[], p: Piece, nextId: number): { features: Feature[]; nextId: number } {
  const { f } = p, chains = remove(p);
  const base = (pts: number[][], id: number): Extrude => ({ ...f, id, p: {}, pts, open: true, type: f.aux ? 'poly' : 'line', cons: undefined, mid: undefined, src: undefined });
  const made = chains.map((c, i) => base(c, i ? nextId++ : f.id));
  let list: Feature[] = [...features.flatMap<Feature>(g => g.id === f.id ? made.slice(0, 1) : [g]), ...made.slice(1)];
  for (const m of made) {
    if (f.aux || !list.some(g => g.id === m.id)) continue;
    let cur = m;
    for (let again = true; again;) {
      again = false;
      for (const o of list) {
        if (o.id === cur.id || !isExtrude(o) || o.hidden || o.type !== 'line' || !samePlane(cur, o)) continue;
        const joined = joinChains(cur.pts!, outlineIn(o, cur).pts);
        if (!joined) continue;
        cur = { ...cur, pts: joined };
        list = list.filter(g => g.id !== o.id);
        again = true;
        break;
      }
    }
    const pts = cur.pts!, ring = pts.length > 2 && same(pts[0], pts.at(-1)!) ? pts.slice(0, -1) : null, face = ring && polyFeature(cur, ring, cur.id, !!cur.onFace);
    const done: Extrude = face ? { ...cur, type: 'poly', pts: ring!, open: undefined } : cur;
    list = list.map(g => g.id === cur.id ? done : g);
  }
  return { features: list, nextId };
}
