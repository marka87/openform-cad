// Stabile Bezüge auf Flächen und Kanten (Epic 1, ADR 0001).
// Eine Fläche heißt nach ihrer Herkunft: welches Feature sie mit welchem Teil erzeugt hat.
// Die OCCT-Historie (Generated/Modified/IsDeleted) schreibt diese Herkunft beim Rebuild fort;
// der Fingerabdruck prüft das Ergebnis und entscheidet nur bei Mehrdeutigkeit.
import { cast, EdgeFinder, getOC, type Face, type Shape3D } from 'replicad';
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

// Frisch extrudierten Körper benennen: Boden/Deckel über die Höhe, Seiten über die nächste Skizzenseite
// (bei Bereichen auch die Seiten der beteiligten Skizzen, dann mit from)
export function nameSolid(f: Extrude, s: Shape3D): Named {
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
