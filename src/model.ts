// Datenmodell und Geometrie-Logik ohne Three.js/OpenCascade, damit sie testbar bleibt.
export type Vec = [number, number, number];
export interface Frame { o: Vec; n: Vec; u: Vec; v: Vec } // Ursprung, Normale, Skizzenachsen (v = n × u)
export interface Extrude extends Frame {
  id: number;
  type: 'rect' | 'circle';
  p: Record<string, number>; // rect: x y w h · circle: cx cy r
  d: number;                 // Extrusionshöhe entlang n, 0 = flache Skizze
  onFace?: boolean;          // auf einer Körperfläche skizziert
}
// Rundung/Fase an der Kante, die durch den Punkt at läuft (dir = Kantenrichtung dort)
// shortcut: Kante wird über einen Punkt gefunden; ändert sich der Körper darunter, schlägt sie fehl → Bezug auf Flächen (M3)
export interface EdgeOp { id: number; type: 'fillet' | 'chamfer'; at: Vec; dir: Vec; r: number }
// Importierter Körper (STEP-Text); wird mit dem Modell vereinigt
// shortcut: STEP-Text liegt im Modell und in jedem Rückgängig-Schritt, bei großen Dateien speicherhungrig → eigene Ablage (M5, .ofc)
export interface Import { id: number; type: 'import'; name: string; step: string }
export type Feature = Extrude | EdgeOp | Import;
export const isExtrude = (f: Feature): f is Extrude => f.type === 'rect' || f.type === 'circle';
// Welcher Teil eines Features angefasst wurde; k = Richtung der Flächennormale relativ zur Parameterachse (±1)
export type Part = 'start' | 'end' | 'x0' | 'x1' | 'y0' | 'y1' | 'r';
export type Grip = { f: Extrude; part: Part; k: number } | { f: EdgeOp; part: 'edge'; k: 0 } | { f: Import; part: 'import'; k: 0 };

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
    const nn = dot(N, f.n), p = f.p;
    const inside = f.type === 'rect'
      ? x > p.x - eps && x < p.x + p.w + eps && y > p.y - eps && y < p.y + p.h + eps
      : Math.hypot(x - p.cx, y - p.cy) < p.r + eps;
    if (Math.abs(nn) > 0.9 && inside) {
      if (Math.abs(z - f.d) < eps) return { f, part: 'end', k: Math.sign(nn) };
      if (Math.abs(z) < eps) return { f, part: 'start', k: Math.sign(nn) };
      continue;
    }
    if (Math.abs(nn) > 0.1 || z < Math.min(0, f.d) - eps || z > Math.max(0, f.d) + eps) continue;
    const nu = dot(N, f.u), nv = dot(N, f.v);
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
export function applyPush(f: Extrude, f0: Extrude, part: Part, k: number, t: number): [string, number] {
  const m = t * k, p = f.p, p0 = f0.p;
  switch (part) {
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
