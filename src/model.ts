// Datenmodell und Geometrie-Logik ohne Three.js/OpenCascade, damit sie testbar bleibt.
export type Vec = [number, number, number];
export interface Frame { o: Vec; n: Vec; u: Vec; v: Vec } // Ursprung, Normale, Skizzenachsen (v = n × u)
export interface Extrude extends Frame {
  id: number;
  type: 'rect' | 'circle' | 'poly';
  p: Record<string, number>; // rect: x y w h · circle: cx cy r · poly: leer
  pts?: number[][];          // poly: Eckpunkte [x, y, bulge?] in Skizzenkoordinaten, geschlossen gedacht;
                             // bulge ≠ 0 = Bogen zum nächsten Punkt (tan(Winkel/4), > 0 = gegen den Uhrzeigersinn)
  d: number;                 // Extrusionshöhe entlang n, 0 = flache Skizze
  onFace?: boolean;          // auf einer Körperfläche skizziert
  and?: Extrude[];           // Bereich: nur wo auch diese Skizzen liegen …
  not?: Extrude[];           // … und keine von diesen (Kopien der flachen Skizzen beim Ziehen)
}
// Rundung/Fase an der Kante, die durch den Punkt at läuft (dir = Kantenrichtung dort)
// shortcut: Kante wird über einen Punkt gefunden; ändert sich der Körper darunter, schlägt sie fehl → Bezug auf Flächen (M3)
export interface EdgeOp { id: number; type: 'fillet' | 'chamfer'; at: Vec; dir: Vec; r: number }
// Importierter Körper (STEP-Text); wird mit dem Modell vereinigt
// shortcut: STEP-Text liegt im Modell und in jedem Rückgängig-Schritt, bei großen Dateien speicherhungrig → eigene Ablage (M5, .ofc)
export interface Import { id: number; type: 'import'; name: string; step: string }
export type Feature = Extrude | EdgeOp | Import;
export const isExtrude = (f: Feature): f is Extrude => f.type === 'rect' || f.type === 'circle' || f.type === 'poly';
// Welcher Teil eines Features angefasst wurde; k = Richtung der Flächennormale relativ zur Parameterachse (±1)
export type Part = 'start' | 'end' | 'x0' | 'x1' | 'y0' | 'y1' | 'r' | 'seg' | 'arc';
// i = Segment des Vielecks bei 'seg' und 'arc'
export type Grip = { f: Extrude; part: Part; k: number; i?: number } | { f: EdgeOp; part: 'edge'; k: 0 } | { f: Import; part: 'import'; k: 0 };

export const GROUND: Frame = { o: [0, 0, 0], n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] };

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: ArrayLike<number>, b: ArrayLike<number>): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// In eine Fläche hineingedrückt = Schnitt (Bohrung, Tasche), sonst Vereinigung
export const isCut = (f: Feature) => isExtrude(f) && !!f.onFace && f.d < 0;

export function sketchFeature(type: Extrude['type'], pl: Frame, a: number[], b: number[], id: number, onFace: boolean): Extrude | null {
  const [ax, ay] = a, [bx, by] = b, base = { id, d: 0, onFace, ...structuredClone(pl) };
  if (type === 'rect') {
    const w = Math.abs(bx - ax), h = Math.abs(by - ay);
    if (w < 0.5 || h < 0.5) return null;
    return { ...base, type, p: { x: Math.min(ax, bx), y: Math.min(ay, by), w, h } };
  }
  const r = Math.hypot(bx - ax, by - ay);
  return r < 0.5 ? null : { ...base, type, p: { cx: ax, cy: ay, r } };
}

// Bogen von a nach b als Punktfolge (ohne a), für Vorschau, Darstellung und Innen-Test
export function arcPoints(a: number[], b: number[], bulge: number, n = 24): number[][] {
  if (!bulge) return [[b[0], b[1]]];
  const { cx, cy, r, th } = arcInfo(a, b, bulge), a0 = Math.atan2(a[1] - cy, a[0] - cx);
  return Array.from({ length: n }, (_, i) => { const t = a0 + th * (i + 1) / n; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; });
}

// Kreis eines Bogens: Mitte, Radius, Winkel th, Sehnenlänge L, Pfeilhöhe s und Richtung (wx, wy) von der Sehne zum Bogen
function arcInfo(a: number[], b: number[], bulge: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), th = 4 * Math.atan(bulge);
  const off = L / 2 / Math.tan(th / 2), cx = (a[0] + b[0]) / 2 - dy / L * off, cy = (a[1] + b[1]) / 2 + dx / L * off;
  const sg = Math.sign(bulge);
  return { cx, cy, r: Math.hypot(a[0] - cx, a[1] - cy), th, L, s: Math.abs(bulge) * L / 2, wx: sg * dy / L, wy: -sg * dx / L };
}

// Umriss mit aufgelösten Bögen; closed = auch das Segment vom letzten zum ersten Punkt
export function outline(pts: number[][], closed = true): number[][] {
  const out = pts.length ? [[pts[0][0], pts[0][1]]] : [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) out.push(...arcPoints(pts[i], pts[(i + 1) % pts.length], pts[i][2] ?? 0));
  if (closed) out.pop(); // letzter Punkt = erster Punkt
  return out;
}

// Richtung am Ende des Segments a→b (bei Bögen um den halben Bogenwinkel gedreht)
export function endTangent(a: number[], b: number[], bulge = 0): number[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), h = 2 * Math.atan(bulge);
  return [(dx * Math.cos(h) - dy * Math.sin(h)) / L, (dx * Math.sin(h) + dy * Math.cos(h)) / L];
}

// Bulge eines Bogens von a nach e, der in Richtung t beginnt (tangentialer Anschluss)
export function tangentBulge(t: number[], a: number[], e: number[]) {
  const cx = e[0] - a[0], cy = e[1] - a[1];
  return Math.tan(Math.atan2(t[0] * cy - t[1] * cx, t[0] * cx + t[1] * cy) / 2);
}

// Vieleck aus mindestens 3 Punkten (oder 2 mit Bogen) mit Fläche; sonst null
export function polyFeature(pl: Frame, pts: number[][], id: number, onFace: boolean): Extrude | null {
  return pts.length >= 2 && Math.abs(area(outline(pts))) > 0.25
    ? { id, d: 0, onFace, ...structuredClone(pl), type: 'poly', p: {}, pts: structuredClone(pts) } : null;
}

// Neue Skizze im Abstand d um f herum (d < 0 = nach innen); null, wenn nichts übrig bleibt
// shortcut: Ecken zwischen Bogen und Gerade ohne Tangente werden nur angenähert, Selbstüberschneidungen nicht erkannt → Kern-Offset (replicad) nutzen
export function offsetFeature(f: Extrude, d: number, id: number): Extrude | null {
  const p = f.p, base = { ...structuredClone(f), id, d: 0 };
  if (f.type === 'rect') return p.w + 2 * d < 0.5 || p.h + 2 * d < 0.5 ? null : { ...base, p: { x: p.x - d, y: p.y - d, w: p.w + 2 * d, h: p.h + 2 * d } };
  if (f.type === 'circle') return p.r + d < 0.5 ? null : { ...base, p: { ...p, r: p.r + d } };
  const pts = f.pts!, n = pts.length, s = Math.sign(area(outline(pts)));
  const normal = (t: number[]) => [s * t[1], -s * t[0]];
  const out = pts.map((q, i) => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const n1 = normal(endTangent(a, q, a[2] ?? 0)), t2 = endTangent(b, q, -(q[2] ?? 0)), n2 = normal([-t2[0], -t2[1]]);
    const k = 1 + n1[0] * n2[0] + n1[1] * n2[1], m = k < 0.1 ? n1 : [(n1[0] + n2[0]) / k, (n1[1] + n2[1]) / k]; // Gehrung
    return [q[0] + d * m[0], q[1] + d * m[1], ...q.slice(2)];
  });
  const g = polyFeature({ o: f.o, n: f.n, u: f.u, v: f.v }, out, id, !!f.onFace);
  return g && Math.sign(area(outline(out))) === s ? g : null;
}

// Vorzeichenbehaftete Fläche (> 0 = gegen den Uhrzeigersinn)
export function area(pts: number[][]) {
  return pts.reduce((s, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return s + x * y2 - x2 * y; }, 0) / 2;
}

// Punkt (x, y) in Skizzenkoordinaten innerhalb der Form (eps = Toleranz am Rand)
function insideShape(f: Extrude, x: number, y: number, eps: number) {
  const p = f.p, pts = f.pts ?? [];
  return f.type === 'rect' ? x > p.x - eps && x < p.x + p.w + eps && y > p.y - eps && y < p.y + p.h + eps
    : f.type === 'circle' ? Math.hypot(x - p.cx, y - p.cy) < p.r + eps
    : insidePoly(outline(pts), x, y) || pts.some((q, i) => !q[2] && segment(pts, i, x, y).dist < eps);
}

// Achsenparalleler Quader um die Skizze in Weltkoordinaten
function bounds(f: Extrude) {
  const p = f.p, [x0, y0, x1, y1] = f.type === 'rect' ? [p.x, p.y, p.x + p.w, p.y + p.h] : [p.cx - p.r, p.cy - p.r, p.cx + p.r, p.cy + p.r];
  const pts = f.type === 'poly' ? outline(f.pts!) : [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const w = pts.map(([x, y]) => [0, 1, 2].map(k => f.o[k] + x * f.u[k] + y * f.v[k]));
  return [0, 1, 2].map(k => [Math.min(...w.map(q => q[k])), Math.max(...w.map(q => q[k]))]);
}

// Wird eine flache Skizze f an P gezogen und überschneidet sie andere flache Skizzen derselben Ebene,
// entsteht ein eigener Bereich: in f und allen Nachbarn, die P enthalten, aber in keinem anderen. Sonst null.
// shortcut: Überschneidung nur über umschließende Quader geprüft, Nachbarn ohne echte Überschneidung kosten eine Boolesche Operation
export function regionFeature(features: Feature[], f: Extrude, P: ArrayLike<number>, id: number): Extrude | null {
  const b = bounds(f);
  const near = features.filter((g): g is Extrude => isExtrude(g) && g !== f && Math.abs(g.d) < 1e-6
    && Math.abs(dot(f.n, g.n)) > 0.999 && Math.abs(dot(sub(g.o, f.o), f.n)) < 1e-6
    && bounds(g).every(([lo, hi], k) => lo < b[k][1] + 1e-6 && b[k][0] < hi + 1e-6));
  if (!near.length) return null;
  const has = (g: Extrude) => { const q = sub(P, g.o); return insideShape(g, dot(q, g.u), dot(q, g.v), 0); };
  return { ...structuredClone(f), id, and: structuredClone(near.filter(has)), not: structuredClone(near.filter(g => !has(g))) };
}

function insidePoly(pts: number[][], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Abstand zur Kante i und deren Normale nach außen
function segment(pts: number[][], i: number, x: number, y: number) {
  const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (l * l)));
  const s = area(outline(pts)) > 0 ? 1 : -1;
  return { dist: Math.hypot(x - ax - t * dx, y - ay - t * dy), ox: s * dy / l, oy: -s * dx / l };
}

// Findet das Feature, auf dessen Begrenzung der Punkt (mit Flächennormale N) liegt. Spätere Features gewinnen.
// Rundungs-/Fasenflächen gehören zu keinem Extrude; sie werden danach über die Nähe zur Kante gefunden.
export function ownerOf(features: Feature[], P: ArrayLike<number>, N: ArrayLike<number>, eps = 0.15): Grip | null {
  return extrudeOwner(features, P, N, eps) ?? edgeOwner(features, P, eps) ?? importOwner(features);
}

// shortcut: Flächen ohne Besitzer gehören zum zuletzt importierten Körper; bei mehreren Importen ungenau → Flächen-IDs aus dem Kern
function importOwner(features: Feature[]): Grip | null {
  const f = [...features].reverse().find(f => f.type === 'import');
  return f?.type === 'import' ? { f, part: 'import', k: 0 } : null;
}

function edgeOwner(features: Feature[], P: ArrayLike<number>, eps: number): Grip | null {
  for (let i = features.length - 1; i >= 0; i--) {
    const f = features[i];
    if (f.type !== 'fillet' && f.type !== 'chamfer') continue;
    const q = sub(P, f.at), along = dot(q, f.dir);
    const toLine = Math.sqrt(Math.max(0, dot(q, q) - along * along));
    if (Math.min(toLine, Math.hypot(...q)) < f.r * 1.5 + eps) return { f, part: 'edge', k: 0 };
  }
  return null;
}

function extrudeOwner(features: Feature[], P: ArrayLike<number>, N: ArrayLike<number>, eps: number): Grip | null {
  for (let i = features.length - 1; i >= 0; i--) {
    const f = features[i];
    if (!isExtrude(f) || Math.abs(f.d) < 1e-6) continue;
    const q = sub(P, f.o), x = dot(q, f.u), y = dot(q, f.v), z = dot(q, f.n);
    const nn = dot(N, f.n), p = f.p, pts = f.pts ?? [];
    if (Math.abs(nn) > 0.9 && insideShape(f, x, y, eps)) {
      if (Math.abs(z - f.d) < eps) return { f, part: 'end', k: Math.sign(nn) };
      if (Math.abs(z) < eps) return { f, part: 'start', k: Math.sign(nn) };
      continue;
    }
    if (Math.abs(nn) > 0.1 || z < Math.min(0, f.d) - eps || z > Math.max(0, f.d) + eps) continue;
    const nu = dot(N, f.u), nv = dot(N, f.v);
    if (f.type === 'poly') {
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i], b = pts[(i + 1) % pts.length];
        if (q[2]) { // Bogenwand: auf dem Kreis und auf der Bogenseite der Sehne
          const c = arcInfo(q, b, q[2]), dx = x - c.cx, dy = y - c.cy;
          const onArc = Math.abs(Math.hypot(dx, dy) - c.r) < eps && (x - (q[0] + b[0]) / 2) * c.wx + (y - (q[1] + b[1]) / 2) * c.wy > -eps;
          if (onArc && Math.abs(nu * dx + nv * dy) / c.r > 0.9) return { f, part: 'arc', k: Math.sign(nu * c.wx + nv * c.wy) || 1, i };
          continue;
        }
        const sg = segment(pts, i, x, y), along = nu * sg.ox + nv * sg.oy;
        if (sg.dist < eps && Math.abs(along) > 0.9) return { f, part: 'seg', k: Math.sign(along), i };
      }
      continue;
    }
    if (f.type === 'circle') {
      const dx = x - p.cx, dy = y - p.cy, l = Math.hypot(dx, dy);
      if (Math.abs(l - p.r) < eps) return { f, part: 'r', k: Math.sign((nu * dx + nv * dy) / l) };
      continue;
    }
    const inY = y > p.y - eps && y < p.y + p.h + eps, inX = x > p.x - eps && x < p.x + p.w + eps;
    if (Math.abs(nu) > 0.9 && inY && Math.abs(x - p.x) < eps) return { f, part: 'x0', k: Math.sign(nu) };
    if (Math.abs(nu) > 0.9 && inY && Math.abs(x - p.x - p.w) < eps) return { f, part: 'x1', k: Math.sign(nu) };
    if (Math.abs(nv) > 0.9 && inX && Math.abs(y - p.y) < eps) return { f, part: 'y0', k: Math.sign(nv) };
    if (Math.abs(nv) > 0.9 && inX && Math.abs(y - p.y - p.h) < eps) return { f, part: 'y1', k: Math.sign(nv) };
  }
  return null;
}

// Verschiebt den angefassten Teil um t entlang der Flächennormale. Gibt [Beschriftung, Wert] fürs HUD zurück.
export function applyPush(f: Extrude, f0: Extrude, part: Part, k: number, t: number, i = 0): [string, number] {
  const m = t * k, p = f.p, p0 = f0.p;
  switch (part) {
    case 'seg': { // Kante parallel nach außen/innen verschieben
      const pts = f0.pts!, j = (i + 1) % pts.length, { ox, oy } = segment(pts, i, ...pts[i] as [number, number]);
      f.pts = pts.map((q, n) => n === i || n === j ? [q[0] + m * ox, q[1] + m * oy, ...q.slice(2)] : [...q]);
      return ['Versatz', m];
    }
    case 'arc': { // Pfeilhöhe ändern, Endpunkte bleiben stehen
      const pts = f0.pts!, q = pts[i], c = arcInfo(q, pts[(i + 1) % pts.length], q[2]);
      const s = Math.max(0.1, c.s + m), bulge = Math.sign(q[2]) * 2 * s / c.L;
      f.pts = pts.map((p, n) => n === i ? [p[0], p[1], bulge] : [...p]);
      return ['Radius', (c.L * c.L / 4 + s * s) / (2 * s)];
    }
    case 'end': f.d = f0.d + m; return ['Höhe', f.d];
    case 'start':
      f.o = f0.o.map((c, i) => c + m * f0.n[i]) as Vec; f.d = f0.d - m; return ['Höhe', f.d];
    case 'r': p.r = Math.max(0.5, p0.r + m); return ['Radius', p.r];
    case 'x1': p.w = Math.max(1, p0.w + m); return ['Breite', p.w];
    case 'x0': p.w = Math.max(1, p0.w - m); p.x = p0.x + p0.w - p.w; return ['Breite', p.w];
    case 'y1': p.h = Math.max(1, p0.h + m); return ['Tiefe', p.h];
    case 'y0': p.h = Math.max(1, p0.h - m); p.y = p0.y + p0.h - p.h; return ['Tiefe', p.h];
  }
}
