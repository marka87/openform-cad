// Datenmodell und Geometrie-Logik ohne Three.js/OpenCascade, damit sie testbar bleibt.
import type { EdgeRef, FaceRef, Origin } from './topo';
export type Vec = [number, number, number];
export interface Frame { o: Vec; n: Vec; u: Vec; v: Vec } // Ursprung, Normale, Skizzenachsen (v = n × u)
export interface Extrude extends Frame {
  id: number;
  type: 'rect' | 'circle' | 'poly' | 'line'; // line = offene Skizzenlinie (Linienkette, bildet keine Fläche, immer mit open)
  p: Record<string, number>; // rect: x y w h · circle: cx cy r (+ ry = Ellipse mit Halbachsen r, ry) · poly: leer
  pts?: number[][];          // poly: Eckpunkte [x, y, bulge?] in Skizzenkoordinaten, geschlossen gedacht;
                             // bulge ≠ 0 = Bogen zum nächsten Punkt (tan(Winkel/4), > 0 = gegen den Uhrzeigersinn)
  d: number;                 // Extrusionshöhe entlang n, 0 = flache Skizze
  onFace?: boolean;          // auf einer Körperfläche skizziert
  face?: FaceRef;            // … auf welcher (vom Kern nachgetragen); wandert die Fläche, wandert die Skizze mit
  smooth?: boolean;          // poly: glatte Kurve (Spline) durch die Punkte statt Strecken
  aux?: boolean;             // Hilfslinie: bildet keine Fläche, nur zum Einrasten (wird nie extrudiert)
  open?: boolean;            // Hilfslinie oder Linie: offener Linienzug (kein Schlusssegment)
  src?: EdgeRef;             // Hilfslinie aus projizierter Körperkante (P): pts rechnet der Kern bei jedem Lauf neu, sie wandert mit
  hidden?: boolean;          // im Feature-Baum ausgeschaltet: wird nicht berechnet
  body?: number;             // Körper, zu dem das Feature gehört (fehlt = Körper 1, so bleiben alte Modelle ein Körper)
  cons?: Con[];              // poly: Bemaßungen und Abhängigkeiten der Seiten (siehe sketchSolver)
  rev?: number;              // Drehkörper: Skizze um eine ihrer Achsen gedreht (Winkel in Grad) statt extrudiert
  axis?: 'u' | 'v';          // Drehachse: x- (u) oder y-Achse (v) der Skizze durch ihren Ursprung o
  axisLine?: { p: Vec; d: Vec }; // … oder eine beliebige Gerade in der Skizzenebene (z. B. eine Körperkante): Punkt p, Richtung d
  sub?: boolean;             // Drehkörper abziehen (Nut) statt vereinigen
  thru?: boolean;            // Schnitt durch den ganzen Körper: d rechnet der Kern bei jedem Lauf neu
  mid?: boolean;             // Rechteck aus der Mitte gezogen: Maßänderungen lassen die Mitte stehen
  and?: Extrude[];           // Bereich: nur wo auch diese Skizzen liegen …
  not?: Extrude[];           // … und keine von diesen (Kopien der flachen Skizzen beim Ziehen)
}
// Rundung/Fase an der Kante, die durch den Punkt at läuft (dir = Kantenrichtung dort)
// shortcut: Kante wird über einen Punkt gefunden; ändert sich der Körper darunter, schlägt sie fehl → Bezug auf Flächen (M3)
// Abhängigkeit einer Vieleck-Seite i (von Punkt i zu i+1): Länge val, waagrecht, senkrecht; mit Seite j parallel, rechtwinklig, gleich lang,
// Winkel val (Grad) zwischen den Seiten; fix = Punkt i bleibt bei p stehen
// rad = Radius der Bogen-Seite i; tan = Seiten i und j berühren sich tangential (mind. eine ist ein Bogen)
export interface Con { t: 'len' | 'h' | 'v' | 'par' | 'perp' | 'eq' | 'ang' | 'fix' | 'rad' | 'tan'; i: number; j?: number; val?: number; p?: number[] }
export interface EdgeOp { id: number; type: 'fillet' | 'chamfer'; at: Vec; dir: Vec; r: number; edge?: EdgeRef; hidden?: boolean; body?: number } // edge: Bezug, vom Kern nachgetragen
// Importierter Körper (STEP-Text); wird mit dem Modell vereinigt
// shortcut: STEP-Text liegt im Modell und in jedem Rückgängig-Schritt, bei großen Dateien speicherhungrig → eigene Ablage (M5, .ofc)
export interface Import { id: number; type: 'import'; name: string; step: string; hidden?: boolean; body?: number }
// Schale: Körper aushöhlen (Wandstärke t), die Flächen durch at und more werden geöffnet
export interface Shell { id: number; type: 'shell'; at: Vec; more?: Vec[]; t: number; faces?: FaceRef[]; hidden?: boolean; body?: number } // faces: Bezüge zu at, more
// Körper an der Hilfsebene plane teilen: der Teil auf der Seite der Normalen wird ein neuer Körper (Nummer = id)
export interface Split { id: number; type: 'split'; body: number; plane: number; hidden?: boolean }
// Übergang (Loft) zwischen zwei flachen Skizzen a und b, mit dem Körper vereinigt
export interface Loft { id: number; type: 'loft'; a: number; b: number; body?: number; hidden?: boolean }
// Profil (flache Skizze profile) entlang eines Pfads ziehen. Der Pfad ist ein Linienzug in eigener Ebene (Frame):
// pts wie beim Vieleck [x, y, bulge?], offen oder geschlossen (closed). Knicke auf Gehrung; runde Ecken = Bögen im Pfad
// (OCCTs RoundCorner ergibt hier ungültige Körper).
// Das Profil sollte am Pfadanfang liegen; es wird so mitgeführt, wie es gezeichnet ist.
// edges: Pfad aus angeklickten Körperkanten statt pts (in Klickreihenfolge, aneinanderhängend), of = deren Körper (T2.5)
export interface Sweep extends Frame { id: number; type: 'sweep'; profile: number; pts: number[][]; closed?: boolean; sub?: boolean; body?: number; hidden?: boolean;
  edges?: { at: Vec; dir: Vec; edge?: EdgeRef }[]; of?: number }
// Ebene Fläche des Körpers um d entlang ihrer Normalen versetzen (d > 0 = nach außen, Material dazu); at/n = Klickpunkt und Normale,
// face = Bezug (vom Kern nachgetragen). Für Flächen ohne eigenes Feature, z. B. aus STEP-Importen oder nach Booleschen Operationen
export interface Offset { id: number; type: 'offset'; at: Vec; n: Vec; d: number; face?: FaceRef; body?: number; hidden?: boolean }
// Flächen löschen (Defeaturing): die Nachbarflächen wachsen zu, z. B. Bohrung, Rundung, Fase oder Absatz weg. at/more und faces wie bei Shell
export interface Remove { id: number; type: 'remove'; at: Vec; more?: Vec[]; faces?: FaceRef[]; body?: number; hidden?: boolean }
// Text (Schrift DejaVu Sans, vendor/fonts): Grundlinie beginnt im Ursprung o der Ebene, Schrifthöhe size (mm), um d entlang n
// extrudiert; d < 0 = in den Körper graviert, d > 0 = erhaben
// shortcut: die Ebene ist beim Anlegen kopiert, ein Text auf einer Fläche wandert nicht mit ihr → Bezug wie bei Skizzen (anchorSketch)
export interface TextFeature extends Frame { id: number; type: 'text'; text: string; size: number; d: number; body?: number; hidden?: boolean }
// Zwei Körper verrechnen: b geht in a auf. fuse = vereinigen, cut = b von a abziehen, common = Schnittmenge
export interface Combine { id: number; type: 'combine'; op: 'fuse' | 'cut' | 'common'; a: number; b: number; hidden?: boolean }
// Körper bewegen: x' = s·R(q)·(x − c) + c + t, q = Drehung als Quaternion [x, y, z, w], s = Maßstab (fehlt = 1)
export interface Move { id: number; type: 'move'; body: number; c: Vec; q: number[]; t: Vec; s?: number; hidden?: boolean }
// Eckpunkt des Modells für Maße: dort, wo die Flächen f zusammentreffen (mind. drei); fp = Lage beim Anlegen (Prüfwert)
export interface PointRef { f: Origin[]; fp: Vec }
// Maß in der Zeichnung (Epic 3), gehört zum Modell, nicht zum Verlauf. v = Ansicht (0 vorne, 1 oben, 2 seitlich).
// lin: Abstand der Punkte a, b – waagrecht (dir h), senkrecht (v) oder entlang der Verbindung (al);
// dia/rad: Kreiskante e; ang: Winkel zwischen den geraden Kanten e und e2.
// off = Lage der Maßlinie in mm auf dem Blatt (lin: Abstand vom Punkt a, dia/rad/ang: Abstand der Zahl), tol = Toleranz-Text
export interface Dim {
  id: number; v: 0 | 1 | 2 | 3; t: 'lin' | 'dia' | 'rad' | 'ang'; // v: vorne, oben, seitlich, Iso
  a?: PointRef; b?: PointRef; dir?: 'h' | 'v' | 'al'; e?: EdgeRef; e2?: EdgeRef;
  off: number; tol?: string;
}
// Angaben je Körper (nicht Teil des Verlaufs): Name, ausgeblendet, eigene Farbe, Werkstoff
export interface BodyMeta { name?: string; hidden?: boolean; color?: string; mat?: string }
// Dichte in g/cm³
export const MATERIALS: Record<string, number> = { Stahl: 7.85, Edelstahl: 8.0, Aluminium: 2.7, Messing: 8.5, PLA: 1.24, ABS: 1.05, Holz: 0.6 };
// Hilfsebene zum Skizzieren: Mitte c + off·n, Achsen u, v (erzeugt keinen Körper)
export interface RefPlane { id: number; type: 'plane'; c: Vec; n: Vec; u: Vec; v: Vec; off: number; hidden?: boolean }
// Muster (Reihe oder Raster): die Skizzen src werden je Richtung n-mal im Abstand d entlang ax kopiert (d < 0 = Gegenrichtung),
// mit b zusätzlich quer dazu (n × b.n Exemplare). Der Kern rechnet die Kopien bei jedem Lauf aus der aktuellen Lage der Quelle neu
// Rundungen/Fasen an der Quelle gehen mit (T6.8). rot: Kreis-Muster um die Achse ax durch c, a.n Exemplare auf 360° (a.ax/a.d unbenutzt);
// mir: Spiegelbild an der Ebene durch c mit Normale ax (ein Exemplar, a unbenutzt)
export interface PatternDir { ax: Vec; n: number; d: number }
export interface Pattern { id: number; type: 'pattern'; src: number[]; a: PatternDir; b?: PatternDir; rot?: { ax: Vec; c: Vec }; mir?: { ax: Vec; c: Vec }; body?: number; hidden?: boolean }
export type Feature = (Extrude | EdgeOp | Import | Shell | Combine | Move | RefPlane | Split | Loft | Sweep | Offset | Remove | TextFeature | Pattern) & { name?: string }; // name = eigener Name im Baum
export const bodyOf = (f: Extrude | EdgeOp | Import | Shell | Split | Loft | Sweep | Offset | Remove | TextFeature | Pattern) => f.body ?? 1;
// Alle Exemplare eines Musters außer dem Original: key bleibt gleich, wenn sich die Anzahl ändert (Reihe/Raster „Spalte:Reihe“),
// copy legt die Kopie einer Quellskizze an, pt/dir bilden Punkte und Richtungen der Quelle auf die Kopie ab, back zurück
export type PatternCopy = { key: string; copy: (f: Extrude, id: number) => Extrude; pt: (p: Vec) => Vec; dir: (d: Vec) => Vec; back: (p: Vec) => Vec; backDir: (d: Vec) => Vec };
export function patternCopies(p: Pattern): PatternCopy[] {
  const O: Vec = [0, 0, 0], same = (d: Vec) => d;
  if (p.mir) {
    const { ax, c } = p.mir, pt = (q: Vec) => mirrorPt(q, ax, c), dir = (d: Vec) => mirrorDir(d, ax);
    return [{ key: 'm', copy: (f, id) => mirroredCopy(f, id, ax, c), pt, dir, back: pt, backDir: dir }];
  }
  const n = Math.max(1, Math.round(p.a.n));
  if (p.rot) {
    const { ax, c } = p.rot;
    return Array.from({ length: n - 1 }, (_, k) => {
      const a = 2 * Math.PI * (k + 1) / n;
      return { key: `r${k + 1}`, copy: (f, id) => movedCopy(f, id, O, ax, a, c), pt: q => movePt(q, O, ax, a, c), dir: d => rotDir(d, ax, a),
        back: q => movePt(q, O, ax, -a, c), backDir: d => rotDir(d, ax, -a) };
    });
  }
  const out: PatternCopy[] = [], nb = p.b ? Math.max(1, Math.round(p.b.n)) : 1;
  for (let j = 0; j < nb; j++) for (let i = 0; i < n; i++) {
    if (!i && !j) continue;
    const t = [0, 1, 2].map(k => p.a.ax[k] * p.a.d * i + (p.b ? p.b.ax[k] * p.b.d * j : 0)) as Vec;
    out.push({ key: `${i}:${j}`, copy: (f, id) => movedCopy(f, id, t), pt: q => q.map((x, k) => x + t[k]) as Vec, dir: same, back: q => q.map((x, k) => x - t[k]) as Vec, backDir: same });
  }
  return out;
}
// Kernlochdurchmesser für metrische Regelgewinde in mm
export const THREADS: Record<string, number> = { M3: 2.5, M4: 3.3, M5: 4.2, M6: 5, M8: 6.8, M10: 8.5, M12: 10.2 };
export const isExtrude = (f: Feature): f is Extrude => f.type === 'rect' || f.type === 'circle' || f.type === 'poly' || f.type === 'line';
// Bildet keine Fläche: Hilfslinie oder offene Skizzenlinie (nie extrudiert, nicht in Bereichen)
export const noFace = (f: Extrude) => !!f.aux || f.type === 'line';
// Flache Skizze: weder extrudiert noch gedreht
// Drehachse eines Drehkörpers als Punkt + Einheitsrichtung und die Richtung w in der Skizzenebene quer dazu
export function revAxis(f: Extrude) {
  const p = f.axisLine?.p ?? f.o, d0 = f.axisLine?.d ?? f[f.axis ?? 'u'], L = Math.hypot(...d0), d = d0.map(x => x / L) as Vec;
  const w = f.axisLine ? [f.n[1] * d[2] - f.n[2] * d[1], f.n[2] * d[0] - f.n[0] * d[2], f.n[0] * d[1] - f.n[1] * d[0]] as Vec : f.axis === 'v' ? f.u : f.v;
  return { p, d, w };
}
export const isFlat = (f: Extrude) => Math.abs(f.d) < 1e-6 && !f.rev;
// Welcher Teil eines Features angefasst wurde; k = Richtung der Flächennormale relativ zur Parameterachse (±1)
export type Part = 'start' | 'end' | 'x0' | 'x1' | 'y0' | 'y1' | 'r' | 'seg' | 'arc';
// i = Segment des Vielecks bei 'seg' und 'arc'
export type Grip = { f: Extrude; part: Part; k: number; i?: number } | { f: EdgeOp; part: 'edge'; k: 0 } | { f: Import; part: 'import'; k: 0 } | { f: RefPlane; part: 'plane'; k: 0 };

export const GROUND: Frame = { o: [0, 0, 0], n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] };

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: ArrayLike<number>, b: ArrayLike<number>): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// In eine Fläche hineingedrückt = Schnitt (Bohrung, Tasche), sonst Vereinigung
export const isCut = (f: Feature) => isExtrude(f) && (f.rev ? !!f.sub : !!f.onFace && f.d < 0);

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
// Ellipse um Mittelpunkt a, Halbachsen bis zur Ecke b
export function ellipseFeature(pl: Frame, a: number[], b: number[], id: number, onFace: boolean): Extrude | null {
  const r = Math.abs(b[0] - a[0]), ry = Math.abs(b[1] - a[1]);
  return r < 0.5 || ry < 0.5 ? null : { id, d: 0, onFace, ...structuredClone(pl), type: 'circle', p: { cx: a[0], cy: a[1], r, ry } };
}

// Bulge des Bogens von a nach b durch den Punkt m (Kreis durch drei Punkte); 0 = auf einer Linie
export function bulge3(a: number[], b: number[], m: number[]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), cr = dx * (m[1] - a[1]) - dy * (m[0] - a[0]);
  if (L < 1e-9 || Math.abs(cr) < 1e-9 * L * L) return 0;
  const am = Math.hypot(m[0] - a[0], m[1] - a[1]), bm = Math.hypot(m[0] - b[0], m[1] - b[1]);
  const r = L * am * bm / (2 * Math.abs(cr)), d = Math.sqrt(Math.max(0, r * r - L * L / 4));
  // m und Mittelpunkt auf derselben Seite der Sehne = großer Bogen; Winkel bei m stumpf ↔ kleiner Bogen
  const obtuse = (a[0] - m[0]) * (b[0] - m[0]) + (a[1] - m[1]) * (b[1] - m[1]) < 0;
  const s = obtuse ? r - d : r + d;
  return (cr < 0 ? 1 : -1) * 2 * s / L; // m rechts der Sehne a→b = gegen den Uhrzeigersinn
}

// Regelmäßiges n-Eck um Mittelpunkt a, erste Ecke in Richtung b
export function ngonPts(a: number[], b: number[], n: number): number[][] {
  const r = Math.hypot(b[0] - a[0], b[1] - a[1]), t0 = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return Array.from({ length: n }, (_, i) => [a[0] + r * Math.cos(t0 + 2 * Math.PI * i / n), a[1] + r * Math.sin(t0 + 2 * Math.PI * i / n)]);
}

// Rechteck aus drei Punkten: Kante a–b, Breite w quer dazu (Vorzeichen = Seite), immer gegen den Uhrzeigersinn
export function rect3Pts(a: number[], b: number[], w: number): number[][] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = [-(b[1] - a[1]) / L * w, (b[0] - a[0]) / L * w];
  const pts = [a, b, [b[0] + n[0], b[1] + n[1]], [a[0] + n[0], a[1] + n[1]]].map(p => [p[0], p[1]]);
  return w < 0 ? pts.reverse() : pts;
}

// Langloch im Rechteck a–b: halbrunde Enden an der kürzeren Seite (gegen den Uhrzeigersinn)
export function slotPts(a: number[], b: number[]): number[][] {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  if (x1 - x0 >= y1 - y0) {
    const r = (y1 - y0) / 2;
    return [[x0 + r, y0], [x1 - r, y0, 1], [x1 - r, y1], [x0 + r, y1, 1]];
  }
  const r = (x1 - x0) / 2;
  return [[x1, y0 + r], [x1, y1 - r, 1], [x0, y1 - r], [x0, y0 + r, 1]];
}

// Bogen von a nach b als Punktfolge (ohne a), für Vorschau, Darstellung und Innen-Test
export function arcPoints(a: number[], b: number[], bulge: number, n = 24): number[][] {
  if (!bulge) return [[b[0], b[1]]];
  const { cx, cy, r, th } = arcInfo(a, b, bulge), a0 = Math.atan2(a[1] - cy, a[0] - cx);
  return Array.from({ length: n }, (_, i) => { const t = a0 + th * (i + 1) / n; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; });
}

// Kreis eines Bogens: Mitte, Radius, Winkel th, Sehnenlänge L, Pfeilhöhe s und Richtung (wx, wy) von der Sehne zum Bogen
export function arcInfo(a: number[], b: number[], bulge: number) {
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

// Spline durch die Punkte als kubische Bézier-Stücke [Start, Kontrollpunkt 1, Kontrollpunkt 2, Ende] (Catmull-Rom)
export function splineBeziers(pts: number[][], closed = true): number[][][] {
  const n = pts.length, at = (i: number) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  return Array.from({ length: closed ? n : n - 1 }, (_, i) => {
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    return [b, [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6], [c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6], c].map(p => [p[0], p[1]]);
  });
}

// Umriss einer Skizze als Punktfolge, Spline (smooth) oder Strecken und Bögen
export function contour(pts: number[][], smooth?: boolean, closed = true): number[][] {
  if (!smooth) return outline(pts, closed);
  const out = pts.length ? [[pts[0][0], pts[0][1]]] : [];
  for (const [p0, c1, c2, p3] of splineBeziers(pts, closed))
    for (let k = 1; k <= 16; k++) {
      const t = k / 16, s = 1 - t;
      out.push([0, 1].map(j => s * s * s * p0[j] + 3 * s * s * t * c1[j] + 3 * s * t * t * c2[j] + t * t * t * p3[j]));
    }
  if (closed) out.pop();
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

// Vieleck bzw. Spline aus mindestens 3 Punkten (oder 2 mit Bogen) mit Fläche; sonst null
export function polyFeature(pl: Frame, pts: number[][], id: number, onFace: boolean, smooth = false): Extrude | null {
  return pts.length >= 2 && Math.abs(area(contour(pts, smooth))) > 0.25
    ? { id, d: 0, onFace, ...structuredClone(pl), type: 'poly', p: {}, pts: structuredClone(pts), ...smooth && { smooth } } : null;
}

// Neue Skizze im Abstand d um f herum (d < 0 = nach innen); null, wenn nichts übrig bleibt
// shortcut: Ecken zwischen Bogen und Gerade ohne Tangente werden nur angenähert, Selbstüberschneidungen nicht erkannt → Kern-Offset (replicad) nutzen
export function offsetFeature(f: Extrude, d: number, id: number): Extrude | null {
  const p = f.p, base = { ...structuredClone(f), id, d: 0 };
  if (f.type === 'rect') return p.w + 2 * d < 0.5 || p.h + 2 * d < 0.5 ? null : { ...base, p: { x: p.x - d, y: p.y - d, w: p.w + 2 * d, h: p.h + 2 * d } };
  if (f.type === 'circle') return p.r + d < 0.5 || p.ry + d < 0.5 ? null : { ...base, p: { ...p, r: p.r + d, ...p.ry && { ry: p.ry + d } } }; // Ellipse: nur angenähert
  if (f.smooth) return null; // shortcut: kein Versatz für Splines → Kern-Offset (replicad)
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

// Punkt i der Skizze nach q verschieben (Bogen bleibt erhalten); bliebe keine Fläche übrig, gilt wieder f0
// shortcut: Selbstüberschneidungen werden nicht verhindert, der Kern meldet sie als fehlgeschlagenes Feature
export function movePoint(f: Extrude, f0: Extrude, i: number, q: number[]) {
  const pts = f0.pts!.map((p, n) => n === i ? [q[0], q[1], ...p.slice(2)] : [...p]);
  const ok = noFace(f) || Math.abs(area(contour(pts, f.smooth))) > 0.25; // Hilfslinie braucht keine Fläche
  f.pts = ok ? pts : structuredClone(f0.pts!);
  return ok;
}

// Parameter s auf a→b, an dem die Strecke c→d sie schneidet (beide 2D), sonst null; Enden von a→b zählen nicht
export function cutParam(a: number[], b: number[], c: number[], d: number[]) {
  const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]], den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-12) return null;
  const w = [c[0] - a[0], c[1] - a[1]], s = (w[0] * q[1] - w[1] * q[0]) / den, u = (w[0] * r[1] - w[1] * r[0]) / den;
  return s > 1e-6 && s < 1 - 1e-6 && u > -1e-9 && u < 1 + 1e-9 ? s : null;
}

// Ende (0 = Anfang, 1 = Ende) einer offenen Hilfslinie geradeaus bis zur nächsten der Strecken segs verlängern; null = trifft nichts
export function extendOpen(pts: number[][], end: 0 | 1, segs: number[][][]): number[][] | null {
  const [p, q] = end ? [pts.at(-2)!, pts.at(-1)!] : [pts[1], pts[0]], far = [q[0] + (q[0] - p[0]) * 1e4, q[1] + (q[1] - p[1]) * 1e4];
  const hits = segs.map(([c, d]) => cutParam(q, far, c, d)).filter((s): s is number => s !== null);
  if (!hits.length) return null;
  const s = Math.min(...hits), to = [q[0] + s * (far[0] - q[0]), q[1] + s * (far[1] - q[1])];
  return end ? [...pts.slice(0, -1), to] : [to, ...pts.slice(1)];
}

// Schnittpunkt zweier Strecken (gleiche Ebene); gemeinsame Endpunkte zählen nicht (z. B. Stücke eines Kreises)
function crossing(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const u = sub(b, a), v = sub(d, c), w = sub(a, c);
  const A = dot(u, u), B = dot(u, v), C = dot(v, v), D = dot(u, w), E = dot(v, w), den = A * C - B * B;
  if (den <= 1e-9 * A * C) return null; // parallel
  const s = (B * E - C * D) / den, t = (A * E - B * D) / den, end = (x: number) => x < 1e-6 || x > 1 - 1e-6;
  if (s < 0 || s > 1 || t < 0 || t > 1 || end(s) && end(t)) return null;
  const p = a.map((x, k) => x + s * u[k]) as Vec, q = c.map((x, k) => x + t * v[k]) as Vec;
  return Math.hypot(...sub(p, q)) < 1e-6 ? p : null;
}

// Einrasten: nächster Punkt bzw. Schnittpunkt innerhalb tol (haben Vorrang), sonst nächster Punkt auf einer Strecke; sonst null
export function snapTo(P: Vec, points: Vec[], segs: Vec[][], tol: number): { p: Vec; kind: 'point' | 'cross' | 'line' } | null {
  const dist = (q: Vec) => Math.hypot(...sub(P, q));
  let best: Vec | null = null, d = tol;
  for (const q of points) if (dist(q) < d) { d = dist(q); best = q; }
  if (best) return { p: best, kind: 'point' };
  const close = segs.filter(([a, b]) => { // nur Strecken nahe P können einen Schnittpunkt nahe P haben
    const ab = sub(b, a), l = dot(ab, ab), t = l ? Math.max(0, Math.min(1, dot(sub(P, a), ab) / l)) : 0;
    return Math.hypot(...sub(P, a.map((x, k) => x + t * ab[k]))) < tol;
  });
  for (let i = 0; i < close.length; i++)
    for (let j = i + 1; j < close.length; j++) {
      const x = crossing(close[i][0], close[i][1], close[j][0], close[j][1]);
      if (x && dist(x) < d) { d = dist(x); best = x; }
    }
  if (best) return { p: best, kind: 'cross' };
  for (const [a, b] of close) {
    const ab = sub(b, a), l = dot(ab, ab);
    if (!l) continue;
    const t = Math.max(0, Math.min(1, dot(sub(P, a), ab) / l)), q = a.map((x, k) => x + t * ab[k]) as Vec;
    if (dist(q) < d) { d = dist(q); best = q; }
  }
  return best && { p: best, kind: 'line' };
}

// Ausrichten in Skizzenkoordinaten: x bzw. y wird dem nächsten Punkt gleich, der innerhalb tol liegt
// ax/ay = Bezugspunkt der senkrechten bzw. waagrechten Hilfslinie (oder null)
export function alignTo(q: number[], pts: number[][], tol: number) {
  let ax: number[] | null = null, ay: number[] | null = null;
  for (const p of pts) {
    if (Math.abs(p[0] - q[0]) < Math.min(tol, ax ? Math.abs(ax[0] - q[0]) : tol)) ax = p;
    if (Math.abs(p[1] - q[1]) < Math.min(tol, ay ? Math.abs(ay[1] - q[1]) : tol)) ay = p;
  }
  return { ax, ay };
}

// Punkte einer Skizze zum Einrasten (Ecken, Mitten gerader Seiten bzw. Kreismittelpunkt), unten und oben
// only 'mid' = nur Seitenmitten und Kreismitten (Beschriftung „Mitte“ beim Einrasten)
export function keyPoints(f: Extrude, only?: 'mid'): Vec[] {
  const p = f.p, corners = f.type === 'rect' ? [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]] : f.pts ?? [];
  const mids = f.smooth ? [] : corners.flatMap((a, i) => {
    if (f.open && i === corners.length - 1) return []; // offene Hilfslinie: kein Schlusssegment
    const b = corners[(i + 1) % corners.length];
    return a[2] ? [] : [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]];
  });
  const pts = f.type === 'circle' ? [[p.cx, p.cy]] : only ? mids : [...corners, ...mids];
  return [0, f.d].flatMap(z => pts.map(([x, y]) => [0, 1, 2].map(k => f.o[k] + x * f.u[k] + y * f.v[k] + z * f.n[k]) as Vec));
}

// Schnittebene aus einer geraden offenen Linie: enthält die Linie und steht senkrecht auf ihrer Skizzenebene (Körper teilen, T5.18).
// null, wenn die Linie Bögen hat oder nicht gerade ist
export function linePlane(f: Extrude, id: number): RefPlane | null {
  const pts = f.pts ?? [], w = pts.map(([x, y]) => [0, 1, 2].map(k => f.o[k] + x * f.u[k] + y * f.v[k]) as Vec);
  if (pts.length < 2 || pts.some(p => p[2])) return null;
  const a = w[0], z = w.at(-1)!, L = Math.hypot(...sub(z, a));
  if (L < 1e-6) return null;
  const u = sub(z, a).map(x => x / L) as Vec;
  if (w.some(p => { const q = sub(p, a), t = dot(q, u); return Math.hypot(...q.map((x, k) => x - t * u[k])) > 1e-6; })) return null;
  const n = [u[1] * f.n[2] - u[2] * f.n[1], u[2] * f.n[0] - u[0] * f.n[2], u[0] * f.n[1] - u[1] * f.n[0]] as Vec;
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]] as Vec;
  return { id, type: 'plane', c: a.map((x, k) => (x + z[k]) / 2) as Vec, n, u, v, off: 0, hidden: true };
}

// Richtungsfang beim Linienzeichnen: liegt die Strecke a→q innerhalb tol Grad an einer der Richtungen refs (Einheitsvektoren,
// beide Orientierungen zählen), wird q auf diese Richtung gelegt (Länge entlang bleibt). Nächste Richtung gewinnt.
export function dirSnap<T>(a: number[], q: number[], refs: { d: number[]; tag: T }[], tol = 3): { q: number[]; d: number[]; tag: T } | null {
  const v = [q[0] - a[0], q[1] - a[1]], L = Math.hypot(v[0], v[1]);
  if (L < 1e-6) return null;
  let best: { q: number[]; d: number[]; tag: T } | null = null, bestAng = tol * Math.PI / 180;
  for (const r of refs) {
    const t = v[0] * r.d[0] + v[1] * r.d[1], ang = Math.acos(Math.min(1, Math.abs(t) / L));
    if (ang < bestAng) { bestAng = ang; best = { q: [a[0] + t * r.d[0], a[1] + t * r.d[1]], d: r.d, tag: r.tag }; }
  }
  return best;
}

// Ganzen Körper b kopieren (Muster/Spiegeln von Körpern): seine Schritte in Reihenfolge mit neuen IDs, alle im neuen Körper
// (= erste neue ID), Verweise auf mitkopierte Skizzen (Zug-Profil, Übergang) umgeschrieben. Flächen-/Kantenbezüge entfallen,
// der Kern findet sie an derselben Stelle neu. Dahinter eine Bewegung, die die Kopie an ihren Platz bringt (q = Drehung als
// Quaternion um c, s = −1 mit halber Drehung um die Spiegelnormale = Spiegelung).
// shortcut: Verrechnungen (Vereinigen/Abziehen) und Teilen des Körpers werden nicht mitkopiert
export function bodyCopy(features: Feature[], b: number, nextId: number, move: { c: Vec; q: number[]; t: Vec; s?: number }): Feature[] {
  const ids = new Map<number, number>(), out: Feature[] = [];
  let id = nextId;
  const nb = nextId;
  for (const f of features) {
    if (f.hidden || f.type === 'combine' || f.type === 'split' || f.type === 'plane' || f.type === 'import') continue;
    if ((f.type === 'move' ? f.body : bodyOf(f)) !== b) continue;
    const g: any = structuredClone(f);
    ids.set(f.id, id); g.id = id++; g.body = nb;
    delete g.face; delete g.edge; delete g.faces;
    if (g.type === 'sweep') g.profile = ids.get(g.profile) ?? g.profile;
    if (g.type === 'loft') { g.a = ids.get(g.a) ?? g.a; g.b = ids.get(g.b) ?? g.b; }
    if (g.type === 'pattern') g.src = g.src.map((s: number) => ids.get(s) ?? s);
    out.push(g);
  }
  if (!out.length) return [];
  out.push({ id: id++, type: 'move', body: nb, ...move } as Move);
  return out;
}

// Rasterabstand „Auto“ nach Zoom: der kleinste Schritt, der auf dem Bildschirm mindestens 8 Pixel breit ist (px = mm je Pixel)
export const autoStep = (px: number) => [0.1, 0.5, 1, 5, 10, 50].find(s => s / px >= 8) ?? 100;

// Kopie von f, verschoben um t und gedreht um die Achse ax (Einheitsvektor) durch c um angle (Bogenmaß)
// Drehung um die Achse ax (Einheitsvektor) um angle (Rodrigues); Punkte zusätzlich um c gedreht und um t verschoben
export const rotDir = (d: ArrayLike<number>, ax: Vec, angle: number): Vec => {
  const cs = Math.cos(angle), sn = Math.sin(angle), k = dot(ax, d), x = [ax[1] * d[2] - ax[2] * d[1], ax[2] * d[0] - ax[0] * d[2], ax[0] * d[1] - ax[1] * d[0]];
  return [0, 1, 2].map(i => d[i] * cs + x[i] * sn + ax[i] * k * (1 - cs)) as Vec;
};
export const movePt = (p: Vec, t: Vec, ax: Vec, angle: number, c: Vec): Vec => rotDir(sub(p, c), ax, angle).map((x, i) => x + c[i] + t[i]) as Vec;
export const mirrorDir = (d: ArrayLike<number>, m: Vec): Vec => { const k = 2 * dot(d, m); return [0, 1, 2].map(i => d[i] - k * m[i]) as Vec; };
export const mirrorPt = (p: Vec, m: Vec, c: Vec): Vec => mirrorDir(sub(p, c), m).map((x, i) => x + c[i]) as Vec;

// Kopien verlieren den Flächenbezug des Originals (sonst zöge der Kern sie auf dessen Fläche zurück); er wird neu nachgetragen
export function movedCopy(f: Extrude, id: number, t: Vec, ax: Vec = [0, 1, 0], angle = 0, c: Vec = [0, 0, 0]): Extrude {
  const rot = (d: Vec) => rotDir(d, ax, angle);
  const move = (g: Extrude): Extrude => {
    const h: Extrude = { ...structuredClone(g), o: movePt(g.o, t, ax, angle, c), u: rot(g.u), v: rot(g.v), n: rot(g.n),
      ...g.and && { and: g.and.map(move) }, ...g.not && { not: g.not.map(move) },
      ...g.axisLine && { axisLine: { p: movePt(g.axisLine.p, t, ax, angle, c), d: rot(g.axisLine.d) } } };
    delete h.face;
    return h;
  };
  return { ...move(f), id };
}

// Spiegelbild von f an der Ebene durch c mit Normale m. Spiegeln dreht die Händigkeit um: v' = n' × u' = −R·v,
// deshalb wird die Form in Skizzenkoordinaten an der x-Achse gespiegelt (y → −y, Bögen kehren ihre Richtung)
export function mirroredCopy(f: Extrude, id: number, m: Vec, c: Vec = [0, 0, 0]): Extrude {
  const R = (d: Vec) => mirrorDir(d, m);
  const flip = (g: Extrude): Extrude => {
    const p = g.p, h = structuredClone(g);
    delete h.face;
    if (g.axisLine) h.axisLine = { p: mirrorPt(g.axisLine.p, m, c), d: R(g.axisLine.d) };
    h.o = R(sub(g.o, c)).map((x, i) => x + c[i]) as Vec;
    h.u = R(g.u); h.n = R(g.n); h.v = R(g.v).map(x => -x) as Vec;
    if (g.type === 'rect') h.p = { ...p, y: -(p.y + p.h) };
    else if (g.type === 'circle') h.p = { ...p, cy: -p.cy };
    else h.pts = g.pts!.map(q => q[2] ? [q[0], -q[1], -q[2]] : [q[0], -q[1]]);
    if (g.and) h.and = g.and.map(flip);
    if (g.not) h.not = g.not.map(flip);
    return h;
  };
  return { ...flip(f), id };
}

// Vorzeichenbehaftete Fläche (> 0 = gegen den Uhrzeigersinn)
export function area(pts: number[][]) {
  return pts.reduce((s, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return s + x * y2 - x2 * y; }, 0) / 2;
}

// Punkt (x, y) in Skizzenkoordinaten innerhalb der Form (eps = Toleranz am Rand)
function insideShape(f: Extrude, x: number, y: number, eps: number) {
  const p = f.p, pts = f.pts ?? [];
  return f.type === 'rect' ? x > p.x - eps && x < p.x + p.w + eps && y > p.y - eps && y < p.y + p.h + eps
    : f.type === 'circle' ? Math.hypot((x - p.cx) / (p.r + eps), (y - p.cy) / ((p.ry ?? p.r) + eps)) < 1
    : insidePoly(contour(pts, f.smooth), x, y) || !f.smooth && pts.some((q, i) => !q[2] && segment(pts, i, x, y).dist < eps);
}

// Achsenparalleler Quader um die Skizze in Weltkoordinaten
export function bounds(f: Extrude) {
  const p = f.p, [x0, y0, x1, y1] = f.type === 'rect' ? [p.x, p.y, p.x + p.w, p.y + p.h] : [p.cx - p.r, p.cy - (p.ry ?? p.r), p.cx + p.r, p.cy + (p.ry ?? p.r)];
  const pts = f.pts ? contour(f.pts, f.smooth) : [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const w = pts.map(([x, y]) => [0, 1, 2].map(k => f.o[k] + x * f.u[k] + y * f.v[k]));
  return [0, 1, 2].map(k => [Math.min(...w.map(q => q[k])), Math.max(...w.map(q => q[k]))]);
}

// Markierte Skizzen, die beim Hochziehen von f mitgehen: nur beim Zug an der Deckfläche und nur in dieselbe Richtung
export const pullTogether = (f: Extrude, part: Part, others: (Feature | undefined)[]) => part !== 'end' ? []
  : others.filter((g): g is Extrude => !!g && isExtrude(g) && g !== f && !noFace(g) && !g.rev && dot(g.n, f.n) > 0.999);
// Liegen zwei Klickpunkte auf derselben Kante? Punkt und Richtung reichen, der Klick darf irgendwo auf der Kante sitzen.
// shortcut: bei Kreiskanten zählt nur die Tangente am Klickpunkt, zweiter Klick auf denselben Kreis gilt dann als andere Kante
export function sameEdge(a: { at: Vec; dir: Vec }, b: { at: Vec; dir: Vec }, tol: number) {
  const q = sub(b.at, a.at), L = Math.hypot(...a.dir), t = dot(q, a.dir) / L ** 2;
  return Math.abs(dot(a.dir, b.dir)) / (L * Math.hypot(...b.dir)) > 0.999 && Math.hypot(...q.map((x, k) => x - t * a.dir[k])) < tol;
}

// Wird eine flache Skizze f an P gezogen und überschneidet sie andere flache Skizzen derselben Ebene,
// entsteht ein eigener Bereich: in f und allen Nachbarn, die P enthalten, aber in keinem anderen. Sonst null.
// shortcut: Überschneidung nur über umschließende Quader geprüft, Nachbarn ohne echte Überschneidung kosten eine Boolesche Operation
export function regionFeature(features: Feature[], f: Extrude, P: ArrayLike<number>, id: number): Extrude | null {
  const b = bounds(f);
  const near = features.filter((g): g is Extrude => isExtrude(g) && g !== f && isFlat(g) && !noFace(g)
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
// Welche Seite der Skizze liegt dem Punkt (x, y) am nächsten? Für das Benennen frisch extrudierter Seitenflächen.
// Rechteck: y0, x1, y1, x0 · Kreis/Ellipse: r · Vieleck: seg bzw. arc mit Seite i (Spline: Bézier-Stück i)
export function sideOf(f: Extrude, x: number, y: number): { part: Part; i?: number; dist: number } {
  if (f.type === 'circle') return { part: 'r', dist: 0 };
  const pts = f.type === 'rect' ? [[f.p.x, f.p.y], [f.p.x + f.p.w, f.p.y], [f.p.x + f.p.w, f.p.y + f.p.h], [f.p.x, f.p.y + f.p.h]] : f.pts!;
  const sides = pts.map((q, i) => {
    const b = pts[(i + 1) % pts.length];
    const line = f.smooth ? bezierPoints(splineBeziers(pts)[i]) : [[q[0], q[1]], ...q[2] ? arcPoints(q, b, q[2]) : [[b[0], b[1]]]];
    return Math.min(...line.slice(1).map((e, k) => segment([line[k], e], 0, x, y).dist));
  });
  const i = sides.indexOf(Math.min(...sides)), dist = sides[i];
  if (f.type === 'rect') return { part: (['y0', 'x1', 'y1', 'x0'] as const)[i], dist };
  return { part: !f.smooth && pts[i][2] ? 'arc' : 'seg', i, dist };
}

const bezierPoints = ([p0, c1, c2, p3]: number[][], n = 16) => Array.from({ length: n + 1 }, (_, k) => {
  const t = k / n, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3;
  return [0, 1].map(j => a * p0[j] + b * c1[j] + c * c2[j] + d * p3[j]);
});

function segment(pts: number[][], i: number, x: number, y: number) {
  const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (l * l)));
  const s = area(outline(pts)) > 0 ? 1 : -1;
  return { dist: Math.hypot(x - ax - t * dx, y - ay - t * dy), ox: s * dy / l, oy: -s * dx / l };
}

// Findet das Feature, auf dessen Begrenzung der Punkt (mit Flächennormale N) liegt. Spätere Features gewinnen.
// Rundungs-/Fasenflächen gehören zu keinem Extrude; sie werden danach über die Nähe zur Kante gefunden.
export function ownerOf(features: Feature[], P: ArrayLike<number>, N: ArrayLike<number>, eps = 0.15): Grip | null {
  features = features.filter(f => !f.hidden);
  return extrudeOwner(features, P, N, eps) ?? edgeOwner(features, P, eps) ?? importOwner(features);
}

// shortcut: Flächen ohne Besitzer gehören zum zuletzt importierten Körper; bei mehreren Importen ungenau → Flächen-IDs aus dem Kern
// Vektor mit Quaternion q drehen (inv = Gegendrehung)
export function qrot(q: number[], v: ArrayLike<number>, inv = false): Vec {
  const [x, y, z] = inv ? [-q[0], -q[1], -q[2]] : q, w = q[3];
  const c1 = [y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]];
  const c2 = [y * c1[2] - z * c1[1], z * c1[0] - x * c1[2], x * c1[1] - y * c1[0]];
  return [0, 1, 2].map(i => v[i] + 2 * w * c1[i] + 2 * c2[i]) as Vec;
}

// Bewegungen, die nach Feature i seinen Körper noch verschieben (in Reihenfolge); Vereinigungen leiten weiter
export function movesAfter(features: Feature[], i: number): Move[] {
  const f = features[i], moves: Move[] = [];
  if (f.type === 'combine' || f.type === 'move' || f.type === 'plane') return moves;
  let b = bodyOf(f);
  for (const g of features.slice(i + 1)) {
    if (g.hidden) continue;
    if (g.type === 'combine' && g.b === b) b = g.a;
    else if (g.type === 'move' && g.body === b) moves.push(g);
  }
  return moves;
}

// Punkt und Normale zurück in die Lage, in der Feature i entstanden ist
function toOriginal(features: Feature[], i: number, P: ArrayLike<number>, N: ArrayLike<number>): [Vec, Vec] {
  let p = [P[0], P[1], P[2]] as Vec, n = [N[0], N[1], N[2]] as Vec;
  for (const m of movesAfter(features, i).reverse()) {
    p = qrot(m.q, [0, 1, 2].map(k => (p[k] - m.c[k] - m.t[k]) / (m.s ?? 1)), true).map((x, k) => x + m.c[k]) as Vec;
    n = qrot(m.q, n, true);
  }
  return [p, n];
}

function importOwner(features: Feature[]): Grip | null {
  const f = [...features].reverse().find(f => f.type === 'import');
  return f?.type === 'import' ? { f, part: 'import', k: 0 } : null;
}

function edgeOwner(features: Feature[], P: ArrayLike<number>, eps: number): Grip | null {
  for (let i = features.length - 1; i >= 0; i--) {
    const f = features[i];
    if (f.type !== 'fillet' && f.type !== 'chamfer') continue;
    const q = sub(toOriginal(features, i, P, P)[0], f.at), along = dot(q, f.dir);
    const toLine = Math.sqrt(Math.max(0, dot(q, q) - along * along));
    if (Math.min(toLine, Math.hypot(...q)) < f.r * 1.5 + eps) return { f, part: 'edge', k: 0 };
  }
  return null;
}

function extrudeOwner(features: Feature[], P0: ArrayLike<number>, N0: ArrayLike<number>, eps: number): Grip | null {
  for (let i = features.length - 1; i >= 0; i--) {
    const f = features[i];
    if (!isExtrude(f) || Math.abs(f.d) < 1e-6) continue;
    const [P, N] = toOriginal(features, i, P0, N0);
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
      if (f.smooth) continue; // shortcut: Spline-Wände lassen sich nicht ziehen, nur Deckel/Boden → Punkte im Seitenfeld bzw. Skizze bearbeiten (M2)
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
      if (p.ry) continue; // shortcut: Ellipsenwand lässt sich nicht ziehen → Halbachsen im Seitenfeld
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

// Umkehrung von applyPush: Verschiebung m (= t·k), die den Wert im HUD genau auf v bringt; null = nicht eintippbar
export function pushTo(part: Part, f0: Extrude, v: number): number | null {
  const p = f0.p;
  switch (part) {
    case 'end': return v - f0.d;
    case 'start': return f0.d - v;
    case 'seg': return v;
    case 'r': return v - p.r;
    case 'x1': case 'x0': return (part === 'x1' ? v - p.w : p.w - v) / (f0.mid ? 2 : 1);
    case 'y1': case 'y0': return (part === 'y1' ? v - p.h : p.h - v) / (f0.mid ? 2 : 1);
    default: return null;
  }
}

// Verschiebt den angefassten Teil um t entlang der Flächennormale. Gibt [Beschriftung, Wert] fürs HUD zurück.
export function applyPush(f: Extrude, f0: Extrude, part: Part, k: number, t: number, i = 0): [string, number] {
  const m = t * k, p = f.p, p0 = f0.p;
  if (part === 'end') delete f.thru; // Tiefe von Hand = nicht mehr durch alles
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
    case 'x1': p.x = p0.x; p.w = p0.w; rectSize(f, 'w', Math.max(1, p0.w + (f.mid ? 2 : 1) * m)); return ['Breite', p.w];
    case 'x0': p.w = Math.max(1, p0.w - (f.mid ? 2 : 1) * m); p.x = p0.x + (f.mid ? (p0.w - p.w) / 2 : p0.w - p.w); return ['Breite', p.w];
    case 'y1': p.y = p0.y; p.h = p0.h; rectSize(f, 'h', Math.max(1, p0.h + (f.mid ? 2 : 1) * m)); return ['Tiefe', p.h];
    case 'y0': p.h = Math.max(1, p0.h - (f.mid ? 2 : 1) * m); p.y = p0.y + (f.mid ? (p0.h - p.h) / 2 : p0.h - p.h); return ['Tiefe', p.h];
  }
}
// Breite oder Tiefe eines Rechtecks setzen; aus der Mitte gezogen bleibt die Mitte stehen
export function rectSize(f: Extrude, key: 'w' | 'h', v: number) {
  const pos = key === 'w' ? 'x' : 'y';
  if (f.mid) f.p[pos] -= (v - f.p[key]) / 2;
  f.p[key] = v;
}
// Fläche einer Skizze: unter übereinanderliegenden Skizzen gewinnt beim Anklicken die kleinste, sonst wäre der Kreis im Rechteck nicht erreichbar
export function sketchArea(f: Extrude) {
  if (f.type === 'rect') return f.p.w * f.p.h;
  if (f.type === 'circle') return Math.PI * f.p.r * (f.p.ry ?? f.p.r);
  const xs = (f.pts ?? []).map(q => q[0]), ys = (f.pts ?? []).map(q => q[1]);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

// Rechteck [[u0, v0], [u1, v1]] aller ebenen B-Rep-Flächen in dieser Ebene, die in Normalenrichtung zeigen; groups = [Anfang, Anzahl] im Index.
// Eine runde Fläche fällt heraus, weil nicht alle ihre Punkte in der Ebene liegen
export function coplanarBounds(pos: ArrayLike<number>, idx: ArrayLike<number>, nrm: ArrayLike<number>, groups: ArrayLike<number>, pl: Frame): number[][] | null {
  const along = (a: Vec, i: number) => (pos[3 * i] - pl.o[0]) * a[0] + (pos[3 * i + 1] - pl.o[1]) * a[1] + (pos[3 * i + 2] - pl.o[2]) * a[2];
  let out: number[][] | null = null;
  for (let k = 0; k < groups.length; k += 2) {
    const s = groups[k], e = s + groups[k + 1];
    let flat = nrm[3 * idx[s]] * pl.n[0] + nrm[3 * idx[s] + 1] * pl.n[1] + nrm[3 * idx[s] + 2] * pl.n[2] > 0.99;
    for (let i = s; flat && i < e; i++) flat = Math.abs(along(pl.n, idx[i])) < 1e-3;
    if (!flat) continue;
    out ??= [[Infinity, Infinity], [-Infinity, -Infinity]];
    for (let i = s; i < e; i++) {
      const u = along(pl.u, idx[i]), v = along(pl.v, idx[i]);
      out[0][0] = Math.min(out[0][0], u); out[0][1] = Math.min(out[0][1], v);
      out[1][0] = Math.max(out[1][0], u); out[1][1] = Math.max(out[1][1], v);
    }
  }
  return out;
}
