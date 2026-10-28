// Stabile Bezüge auf Flächen und Kanten (Epic 1, ADR 0001).
// Eine Fläche heißt nach ihrer Herkunft: welches Feature sie mit welchem Teil erzeugt hat.
// Die OCCT-Historie (Generated/Modified/IsDeleted) schreibt diese Herkunft beim Rebuild fort;
// der Fingerabdruck prüft das Ergebnis und entscheidet nur bei Mehrdeutigkeit.
import { cast, EdgeFinder, FaceFinder, getOC, type Face, type Shape3D } from 'replicad';
import { sideOf, type Extrude, type Part, type Vec } from './model';

// Teil eines Features, aus dem eine Fläche hervorgeht.
// Extrusion/Drehkörper/Loft: 'start' = Boden, 'end' = Deckel, Seiten wie in Part
//   (Rechteck x0/x1/y0/y1, Kreis/Ellipse r, Vieleck seg/arc mit Seite i).
// 'fillet'/'chamfer' = von einer Rundung/Fase neu erzeugte Fläche, 'shell' = Innenwand einer Schale,
// 'split' = Schnittfläche beim Teilen, 'import' = Fläche i eines STEP-Imports (Reihenfolge aus der Datei).
export type Tag = Part | 'fillet' | 'chamfer' | 'shell' | 'split' | 'import';

export interface Origin {
  f: number;        // Feature-ID, die die Fläche erzeugt hat
  tag: Tag;
  i?: number;       // Seite bei seg/arc, Flächennummer bei import
  from?: number;    // Bereichs-Feature (and/not): ID der Original-Skizze, aus deren Rand die Seite stammt
  of?: Origin;      // Innenwand einer Schale: die Außenfläche, von der sie versetzt ist
}

// Prüfwert, gemessen beim Anlegen des Bezugs (Weltkoordinaten, mm)
export interface Fingerprint {
  kind: 'plane' | 'cylinder' | 'cone' | 'sphere' | 'torus' | 'bspline' | 'other'; // Flächen- bzw. Kurventyp
  c: Vec;           // Schwerpunkt
  n?: Vec;          // Fläche: Normale (eben) bzw. Achse (Zylinder …); Kante: Richtung, wenn gerade
  size: number;     // Flächeninhalt bzw. Kantenlänge
}

export interface FaceRef {
  o: Origin;
  via?: number[];   // Feature-IDs, die die Fläche seither verändert haben (nur zur Fehlermeldung, nicht zum Auflösen)
  fp: Fingerprint;
}

// Kante = Grenze zwischen zwei Flächen; reicht das nicht (zwei Kanten zwischen denselben Flächen,
// z. B. Zylindermantel an einer Naht), entscheidet der Fingerabdruck.
export interface EdgeRef {
  a: Origin;
  b: Origin;
  fp: Fingerprint;
}

// Ergebnis des Auflösens: sicher = genau ein Treffer über die Herkunft und Fingerabdruck passt
export type Resolved<T> = { ok: true; shape: T; sure: boolean } | { ok: false; why: 'lost' | 'ambiguous' };

// ── Abstammung während eines Rebuilds ──
// Flächen eines Körpers mit ihrer Herkunft. Gilt nur, solange der Körper lebt (TopoDS-Identität).
export type Named = { face: Face; o: Origin }[];

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const side = (f: Extrude, x: number, y: number): Origin => { const s = sideOf(f, x, y); return { f: f.id, tag: s.part, ...s.i !== undefined && { i: s.i } }; };
const inPlane = (g: Extrude, P: ArrayLike<number>) => Math.abs(dot([0, 1, 2].map(i => P[i] - g.o[i]), g.n)) < 1e-4;
const sketchXY = (g: Extrude, P: ArrayLike<number>) => { const q = [0, 1, 2].map(i => P[i] - g.o[i]); return [dot(q, g.u), dot(q, g.v)] as const; };

// Frisch extrudierten Körper benennen: Boden/Deckel über die Höhe, Seiten über die nächste Skizzenseite
// (bei Bereichen auch die Seiten der beteiligten Skizzen, dann mit from)
export function nameSolid(f: Extrude, s: Shape3D): Named {
  if (f.rev) return nameRevolved(f, s);
  return s.faces.map(face => {
    const P = face.pointOnSurface(0.5, 0.5).toTuple(), q = [0, 1, 2].map(i => P[i] - f.o[i]);
    const z = dot(q, f.n), flat = face.geomType === 'PLANE' && Math.abs(dot(face.normalAt(P).toTuple(), f.n)) > 0.999;
    if (flat && Math.abs(z) < 1e-4) return { face, o: { f: f.id, tag: 'start' } };
    if (flat && Math.abs(z - f.d) < 1e-4) return { face, o: { f: f.id, tag: 'end' } };
    const best = [f, ...f.and ?? [], ...f.not ?? []].map(g => {
      const r = [0, 1, 2].map(i => P[i] - g.o[i]);
      return { g, ...sideOf(g, dot(r, g.u), dot(r, g.v)) };
    }).reduce((a, b) => b.dist < a.dist ? b : a);
    return { face, o: { f: f.id, tag: best.part, ...best.i !== undefined && { i: best.i }, ...best.g !== f && { from: best.g.id } } };
  });
}

// Drehkörper: Seiten über Abstand zur Achse und Lage entlang der Achse zurück in die Skizze gedreht;
// 'start' = Fläche in der Skizzenebene, 'end' = um den Winkel gedrehte Endfläche (fehlt bei 360°)
function nameRevolved(f: Extrude, s: Shape3D): Named {
  const ax = f.axis ?? 'u', a = f[ax], perp = ax === 'u' ? f.v : f.u, p = f.p;
  const c = f.type === 'rect' ? [p.x + p.w / 2, p.y + p.h / 2] : f.type === 'circle' ? [p.cx, p.cy] : f.pts![0];
  const sgn = Math.sign(ax === 'u' ? c[1] : c[0]) || 1; // Seite der Achse, auf der das Profil liegt
  return s.faces.map(face => {
    const P = face.pointOnSurface(0.5, 0.5).toTuple(), q = [0, 1, 2].map(i => P[i] - f.o[i]), t = dot(q, a);
    if (face.geomType === 'PLANE') {
      const N = face.normalAt(P).toTuple();
      if (Math.abs(dot(N, a)) < 1e-6 && Math.abs(dot(q, N)) < 1e-4) // Ebene durch die Achse: Anfang oder Ende
        return { face, o: { f: f.id, tag: Math.abs(dot(N, f.n)) > 0.999 && Math.sign(dot(q, perp)) === sgn ? 'start' : 'end' } };
    }
    const r = sgn * Math.hypot(...[0, 1, 2].map(i => q[i] - t * a[i]));
    return { face, o: ax === 'u' ? side(f, t, r) : side(f, r, t) };
  });
}

// Loft zwischen den Skizzen A (Anfang) und B (Ende): Seiten nach der Seite von A, an der sie beginnen
export function nameLoft(id: number, A: Extrude, B: Extrude, s: Shape3D): Named {
  return s.faces.flatMap(face => {
    const P = face.pointOnSurface(0.5, 0.5).toTuple();
    if (face.geomType === 'PLANE' && inPlane(A, P)) return [{ face, o: { f: id, tag: 'start' as Tag } }];
    if (face.geomType === 'PLANE' && inPlane(B, P)) return [{ face, o: { f: id, tag: 'end' as Tag } }];
    const e = face.edges.map(e => e.pointAt(0.5).toTuple()).find(m => inPlane(A, m));
    return e ? [{ face, o: { ...side(A, ...sketchXY(A, e)), f: id } }] : [];
  });
}

// Schale wie replicad (gleiche OCCT-Aufrufe), mit Historie: Außenflächen bleiben, jede Innenwand ist aus ihrer
// Außenfläche erzeugt (tag shell, of = deren Name), geöffnete Flächen werden zum Rand und behalten ihren Namen
export function shell(id: number, A: Shape3D, nA: Named, at: Vec[], t: number): [Shape3D, Named] {
  const oc = getOC() as any, open = new FaceFinder().either(at.map(p => (x: FaceFinder) => x.withinDistance(0.1, p))).find(A);
  const L = new oc.NCollection_List_TopoDS_Shape(), b = new oc.BRepOffsetAPI_MakeThickSolid();
  try {
    open.forEach(f => L.Append(f.wrapped));
    b.MakeThickSolidByJoin(A.wrapped, L, -t, 1e-3, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Arc, false, new oc.Message_ProgressRange());
    if (!b.IsDone()) throw new Error('Schale fehlgeschlagen');
    const gen = nA.flatMap(({ face, o }) => list(b.Generated(face.wrapped)).map(g => [g, { f: id, tag: 'shell', of: o }] as [any, Origin]));
    const out = carry(b, nA, gen);
    gen.forEach(([g]) => g.delete());
    return out;
  } finally { L.delete(); b.delete(); }
}

// Liste aus OCCT in ein Array (Kopie, die Originalliste bleibt dem Builder)
function list(l: any): any[] {
  const c = new (getOC() as any).NCollection_List_TopoDS_Shape(l), out: any[] = [];
  while (c.Size() > 0) { out.push(c.First()); c.RemoveFirst(); }
  c.delete();
  return out;
}

// Nachschlagen „welche dieser Flächen ist dasselbe TopoDS?“ über replicads Hash (wie IsSame: Orientierung egal),
// IsSame nur bei gleichem Hash; -1 = nicht enthalten
export function faceIndex(faces: Face[]) {
  const hash = (s: any): number => (getOC() as any).ReplicadShapeHasher.HashCode(s, 2147483647), map = new Map<number, number[]>();
  faces.forEach((f, i) => { const h = hash(f.wrapped); map.set(h, [...map.get(h) ?? [], i]); });
  return (s: any) => map.get(hash(s))?.find(i => faces[i].wrapped.IsSame(s)) ?? -1;
}

// Boolesche Operation wie replicad (gleiche Vereinfachung), aber mit Fortschreiben der Namen:
// unverändert → gleicher Name, verändert/aufgespalten → alle Teile erben den Namen, gelöscht → weg.
export function boolean(op: 'fuse' | 'cut' | 'common', A: Shape3D, nA: Named, B: Shape3D, nB: Named): [Shape3D, Named] {
  const oc = getOC() as any;
  const b = new oc[op === 'fuse' ? 'BRepAlgoAPI_Fuse' : op === 'cut' ? 'BRepAlgoAPI_Cut' : 'BRepAlgoAPI_Common'](A.wrapped, B.wrapped, new oc.Message_ProgressRange());
  try {
    b.Build();
    if (!b.IsDone()) throw new Error('Boolesche Operation fehlgeschlagen');
    b.SimplifyResult(true, true, 1e-3);
    return carry(b, [...nA, ...nB]);
  } finally { b.delete(); }
}

// Ergebnis des Builders b holen und die Namen fortschreiben: unverändert → gleicher Name,
// verändert/aufgespalten → alle Teile erben ihn, gelöscht → weg. extra = Namen für neu erzeugte Flächen
function carry(b: any, named: Named, extra: [any, Origin][] = []): [Shape3D, Named] {
  const res = cast(b.Shape()) as Shape3D, out = res.faces, idx = faceIndex(out), next: Named = [], taken = new Set<number>();
  const put = (t: any, o: Origin) => { const i = idx(t); if (i >= 0 && !taken.has(i)) { taken.add(i); next.push({ face: out[i], o }); } }; // zusammengelegte Flächen: erster Name gewinnt
  for (const { face, o } of named) {
    if (b.IsDeleted(face.wrapped)) continue;
    const mod = list(b.Modified(face.wrapped));
    (mod.length ? mod : [face.wrapped]).forEach(t => put(t, o));
    mod.forEach(m => m.delete());
  }
  extra.forEach(([t, o]) => put(t, o));
  return [res, next];
}

// Rundung/Fase an allen Kanten durch den Punkt at (wie replicad, aber mit Historie);
// die neue Fläche heißt nach dem Feature, die Nachbarflächen behalten ihren Namen
export function edgeOp(type: 'fillet' | 'chamfer', id: number, A: Shape3D, nA: Named, at: Vec, r: number): [Shape3D, Named] {
  const oc = getOC() as any, edges = new EdgeFinder().withinDistance(0.1, at).find(A);
  if (!edges.length) throw new Error('Kante nicht gefunden');
  const b = type === 'fillet' ? new oc.BRepFilletAPI_MakeFillet(A.wrapped, oc.ChFi3d_FilletShape.ChFi3d_Rational) : new oc.BRepFilletAPI_MakeChamfer(A.wrapped);
  try {
    edges.forEach(e => b.Add(r, e.wrapped));
    b.Build(new oc.Message_ProgressRange());
    if (!b.IsDone()) throw new Error(type === 'fillet' ? 'Rundung fehlgeschlagen' : 'Fase fehlgeschlagen');
    const gen = edges.flatMap(e => list(b.Generated(e.wrapped))).map(t => [t, { f: id, tag: type }] as [any, Origin]);
    const out = carry(b, nA, gen);
    gen.forEach(([t]) => t.delete());
    return out;
  } finally { b.delete(); }
}
