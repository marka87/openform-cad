// Stabile Bezüge auf Flächen und Kanten (Epic 1, ADR 0001).
// Eine Fläche heißt nach ihrer Herkunft: welches Feature sie mit welchem Teil erzeugt hat.
// Die OCCT-Historie (Generated/Modified/IsDeleted) schreibt diese Herkunft beim Rebuild fort;
// der Fingerabdruck prüft das Ergebnis und entscheidet nur bei Mehrdeutigkeit.
import { basicFaceExtrusion, cast, EdgeFinder, FaceFinder, getOC, measureArea, measureLength, measureVolume, Vector, type Edge, type Face, type Shape3D, type Wire } from 'replicad';
import { bounds, movedCopy, revAxis, sideOf, type EdgeOp, type Extrude, type Offset, type Part, type PointRef, type Shell, type Sweep, type Vec } from './model';

// Teil eines Features, aus dem eine Fläche hervorgeht.
// Extrusion/Drehkörper/Loft: 'start' = Boden, 'end' = Deckel, Seiten wie in Part
//   (Rechteck x0/x1/y0/y1, Kreis/Ellipse r, Vieleck seg/arc mit Seite i).
// 'fillet'/'chamfer' = von einer Rundung/Fase neu erzeugte Fläche, 'shell' = Innenwand einer Schale,
// 'split' = Schnittfläche beim Teilen, 'import' = Fläche i eines STEP-Imports (Reihenfolge aus der Datei).
export type Tag = Part | 'fillet' | 'chamfer' | 'shell' | 'split' | 'import' | 'text';

export interface Origin {
  f: number;        // Feature-ID, die die Fläche erzeugt hat
  tag: Tag;
  i?: number;       // Seite bei seg/arc, Flächennummer bei import
  from?: number;    // Bereichs-Feature (and/not): ID der Original-Skizze, aus deren Rand die Seite stammt
  of?: Origin;      // Innenwand einer Schale: die Außenfläche, von der sie versetzt ist
  j?: number;       // Sweep: Abschnitt des Pfads, entlang dessen die Seite läuft
  at?: string;      // Muster-Kopie „Quelle:Spalte:Reihe“ (f = Muster-Schritt bzw. mitkopierte Rundung); bleibt gleich, wenn sich die Anzahl ändert
}

// Prüfwert, gemessen beim Anlegen des Bezugs (Weltkoordinaten, mm)
export interface Fingerprint {
  kind: 'plane' | 'cylinder' | 'cone' | 'sphere' | 'torus' | 'bspline' | 'line' | 'circle' | 'ellipse' | 'other'; // Flächen- bzw. Kurventyp
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

// ── Bezüge anlegen und auflösen ──
const KIND: Record<string, Fingerprint['kind']> = { PLANE: 'plane', CYLINDRE: 'cylinder', CONE: 'cone', SPHERE: 'sphere', TORUS: 'torus',
  BEZIER_SURFACE: 'bspline', BSPLINE_SURFACE: 'bspline', LINE: 'line', CIRCLE: 'circle', ELLIPSE: 'ellipse', BEZIER_CURVE: 'bspline', BSPLINE_CURVE: 'bspline' };
const isFace = (s: Face | Edge): s is Face => 'pointOnSurface' in s;

export function fingerprint(s: Face | Edge): Fingerprint {
  const kind = KIND[s.geomType] ?? 'other';
  if (isFace(s)) {
    const c = s.center.toTuple();
    return { kind, c, size: measureArea(s), ...kind === 'plane' && { n: s.normalAt(c).toTuple() } };
  }
  const a = s.startPoint.toTuple(), b = s.endPoint.toTuple(), L = measureLength(s);
  return { kind, c: s.pointAt(0.5).toTuple(), size: L, ...kind === 'line' && { n: [0, 1, 2].map(i => (b[i] - a[i]) / L) as Vec } };
}

export const sameOrigin = (a?: Origin, b?: Origin): boolean => !a || !b ? a === b
  : a.f === b.f && a.tag === b.tag && a.i === b.i && a.j === b.j && a.from === b.from && a.at === b.at && sameOrigin(a.of, b.of);

// Abstand zweier Fingerabdrücke; Infinity = passt nicht (anderer Typ oder andere Richtung)
function mismatch(a: Fingerprint, b: Fingerprint) {
  if (a.kind !== b.kind || (a.n && b.n && Math.abs(dot(a.n, b.n)) < 0.99)) return Infinity;
  return Math.hypot(...[0, 1, 2].map(i => a.c[i] - b.c[i])) + Math.abs(Math.sqrt(a.size) - Math.sqrt(b.size));
}

// Unter den Kandidaten den mit dem nächsten Fingerabdruck; zwei gleich gute = mehrdeutig
function pick<T extends Face | Edge>(fp: Fingerprint, cands: T[], sure: boolean): Resolved<T> {
  const scored = cands.map(c => ({ c, d: mismatch(fp, fingerprint(c)) })).filter(x => x.d < Infinity).sort((x, y) => x.d - y.d);
  if (!scored.length) return { ok: false, why: 'lost' };
  if (scored.length > 1 && scored[1].d - scored[0].d < 1e-3 * (1 + scored[0].d)) return { ok: false, why: 'ambiguous' };
  return { ok: true, shape: scored[0].c, sure };
}

export function faceRef(named: Named, face: Face): FaceRef | null {
  const n = named.find(x => x.face.wrapped.IsSame(face.wrapped));
  return n ? { o: n.o, fp: fingerprint(face) } : null;
}

// Erst die Abstammung; genau ein Treffer mit passendem Fingerabdruck = sicher.
// Aufgespalten (mehrere) oder Kette gerissen (keiner): Fingerabdruck entscheidet, Ergebnis unsicher.
export function resolveFace(ref: FaceRef, s: Shape3D, named: Named): Resolved<Face> {
  const hits = named.filter(n => sameOrigin(n.o, ref.o)).map(n => n.face);
  if (hits.length === 1) return { ok: true, shape: hits[0], sure: mismatch(ref.fp, fingerprint(hits[0])) < Infinity };
  return pick(ref.fp, hits.length ? hits : s.faces, false);
}

// Kante über ihre zwei Nachbarflächen benennen
export function edgeRef(named: Named, edge: Edge, s: Shape3D): EdgeRef | null {
  const [a, b] = s.faces.filter(f => f.edges.some(e => e.wrapped.IsSame(edge.wrapped))).map(f => faceRef(named, f)?.o);
  return a && b ? { a, b, fp: fingerprint(edge) } : null;
}

export function resolveEdge(ref: EdgeRef, s: Shape3D, named: Named): Resolved<Edge> {
  const fa = named.filter(n => sameOrigin(n.o, ref.a)).map(n => n.face), fb = named.filter(n => sameOrigin(n.o, ref.b)).map(n => n.face);
  const eb = fb.flatMap(f => f.edges);
  const shared = fa.flatMap(f => f.edges).filter(e => eb.some(x => x.wrapped.IsSame(e.wrapped)));
  if (shared.length === 1) return { ok: true, shape: shared[0], sure: mismatch(ref.fp, fingerprint(shared[0])) < Infinity };
  return pick(ref.fp, shared.length ? shared : s.edges, false);
}

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
  const { p: A, d: a, w } = revAxis(f), p = f.p;
  const c = f.type === 'rect' ? [p.x + p.w / 2, p.y + p.h / 2] : f.type === 'circle' ? [p.cx, p.cy] : f.pts![0];
  const C = [0, 1, 2].map(i => f.o[i] + c[0] * f.u[i] + c[1] * f.v[i]);
  const sgn = Math.sign(dot(sub3(C, A), w)) || 1; // Seite der Achse, auf der das Profil liegt
  return s.faces.map(face => {
    const P = face.pointOnSurface(0.5, 0.5).toTuple(), q = sub3(P, A), t = dot(q, a);
    if (face.geomType === 'PLANE') {
      const N = face.normalAt(P).toTuple();
      if (Math.abs(dot(N, a)) < 1e-6 && Math.abs(dot(q, N)) < 1e-4) // Ebene durch die Achse: Anfang oder Ende
        return { face, o: { f: f.id, tag: Math.abs(dot(N, f.n)) > 0.999 && Math.sign(dot(q, w)) === sgn ? 'start' : 'end' } };
    }
    // Punkt um die Achse zurück in die Skizzenebene drehen und dort die Seite suchen
    const r = Math.hypot(...[0, 1, 2].map(i => q[i] - t * a[i])), Q = [0, 1, 2].map(i => A[i] + t * a[i] + sgn * r * w[i]);
    return { face, o: side(f, ...sketchXY(f, Q)) };
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

// OCCTs Gültigkeitsprüfung (Topologie und Geometrie); teuer, deshalb nur nach Operationen, die bekanntermaßen Kaputtes liefern können
export function isValid(shape: any) {
  const check = new (getOC() as any).BRepCheck_Analyzer(shape, true, false), ok = check.IsValid();
  check.delete();
  return ok;
}

// Profil P entlang des Pfads ziehen (wie replicads genericSweep, aber mit Historie). Seiten = Generated(Profilkante),
// benannt nach der Profilseite (wie beim Extrudieren) und dem Pfadabschnitt j; Anfang/Ende = Deckel in bzw. außerhalb der Profilebene
// shortcut: j = Reihenfolge der erzeugten Flächen (OCCT legt sie entlang des Pfads an); bei Pfaden mit Splines prüfen
export function sweep(f: Sweep, P: Extrude, profile: Wire, spine: Wire): [Shape3D, Named] {
  const oc = getOC() as any, b = new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped);
  try {
    b.SetTransitionMode(oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RightCorner);
    b.Add(profile.wrapped, false, false);
    b.Build(new oc.Message_ProgressRange());
    if (!b.IsDone() || !b.MakeSolid()) throw new Error('Zug entlang des Pfads fehlgeschlagen');
    if (!isValid(b.Shape())) throw new Error('Zug ergibt keinen gültigen Körper (Profil zu groß für den Pfad?)'); // nie ungültig weiterrechnen oder exportieren
    const s = cast(b.Shape()) as Shape3D, faces = s.faces, idx = faceIndex(faces), named: Named = [], taken = new Set<number>();
    const edges = profile.edges, side0 = edges.map(e => side(P, ...sketchXY(P, e.pointAt(0.5).toTuple())));
    // mehrere Profilkanten auf derselben Seite (Kreis = zwei Bögen): über die Kantennummer k unterscheiden
    const os = side0.map((o, k) => side0.filter(p => sameOrigin(p, o)).length > 1 ? { ...o, i: k } : o);
    for (const [k, e] of edges.entries()) {
      const o = os[k];
      list(b.Generated(e.wrapped)).forEach((g, j) => { const i = idx(g); if (i >= 0 && !taken.has(i)) { taken.add(i); named.push({ face: faces[i], o: { ...o, f: f.id, j } }); } g.delete(); });
    }
    faces.forEach((face, i) => { if (!taken.has(i)) named.push({ face, o: { f: f.id, tag: inPlane(P, face.center.toTuple()) ? 'start' : 'end' } }); });
    return [s, named];
  } finally { b.delete(); }
}

// Schale wie replicad (gleiche OCCT-Aufrufe), mit Historie: Außenflächen bleiben, jede Innenwand ist aus ihrer
// Außenfläche erzeugt (tag shell, of = deren Name), geöffnete Flächen werden zum Rand und behalten ihren Namen
export function shell(id: number, A: Shape3D, nA: Named, open: Face[], t: number): [Shape3D, Named] {
  const oc = getOC() as any, v0 = measureVolume(A);
  let why = '';
  // Arc ergibt an manchen gekrümmten Übergängen Ungültiges, dort trägt Intersection; sonst bleibt Arc, wie immer
  for (const join of [oc.GeomAbs_JoinType.GeomAbs_Arc, oc.GeomAbs_JoinType.GeomAbs_Intersection]) {
    const L = new oc.NCollection_List_TopoDS_Shape(), b = new oc.BRepOffsetAPI_MakeThickSolid();
    try {
      open.forEach(f => L.Append(f.wrapped));
      b.MakeThickSolidByJoin(A.wrapped, L, -t, 1e-3, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, join, false, new oc.Message_ProgressRange());
      if (!b.IsDone()) { why ||= 'Schale fehlgeschlagen'; continue; }
      if (!isValid(b.Shape())) { why ||= 'Schale ergibt keinen gültigen Körper (Wand zu dick für eine Bohrung oder Rundung?)'; continue; }
      const gen = nA.flatMap(({ face, o }) => list(b.Generated(face.wrapped)).map(g => [g, { f: id, tag: 'shell', of: o }] as [any, Origin]));
      const out = carry(b, nA, gen);
      gen.forEach(([g]) => g.delete());
      const v1 = measureVolume(out[0]);
      if (t > 0 && v1 > v0) { out[0].delete(); why ||= 'Schale ergibt keinen brauchbaren Körper (Wand zu dick oder Form zu verwinkelt?)'; continue; } // OCCT meldet teils Erfolg mit unendlichem Volumen
      if (Math.abs(v1 - v0) > 1e-6 * v0) return out;
      out[0].delete();
      throw new Error('Schale bleibt ohne Wirkung: Diese gekrümmten Flächen kann der Kern nicht aushöhlen'); // Intersection braucht hier 10 s und scheitert auch, bei jedem Lauf
    } finally { L.delete(); b.delete(); }
  }
  throw new Error(why);
}

// Flächen löschen: OCCT lässt die Nachbarflächen zuwachsen; braucht den eigenen OpenCascade-Build (vendor/, BRepAlgoAPI_Defeaturing)
export function removeFaces(A: Shape3D, nA: Named, faces: Face[]): [Shape3D, Named] {
  const oc = getOC() as any, b = new oc.BRepAlgoAPI_Defeaturing();
  try {
    b.SetShape(A.wrapped);
    faces.forEach(f => b.AddFaceToRemove(f.wrapped));
    b.SetToFillHistory(true);
    b.Build(new oc.Message_ProgressRange());
    // geht es nicht, liefert OCCT oft still den unveränderten Körper (nur Warnung) → Fläche muss gelöscht sein
    if (!b.IsDone() || b.HasErrors() || faces.some(f => !b.IsDeleted(f.wrapped))) throw new Error('Fläche lässt sich nicht löschen (Nachbarflächen schließen die Lücke nicht)');
    if (!isValid(b.Shape())) throw new Error('Fläche löschen ergibt keinen gültigen Körper');
    return carry(b, nA);
  } finally { b.delete(); }
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

// Herkunft je Fläche in der Reihenfolge von s.faces (null = unbekannt)
export function originsOf(s: Shape3D, named: Named = []): (Origin | null)[] {
  const faces = s.faces, idx = faceIndex(faces), o: (Origin | null)[] = faces.map(() => null);
  for (const n of named) { const i = idx(n.face.wrapped); if (i >= 0) o[i] = n.o; }
  return o;
}

// Namen über die Flächenreihenfolge übertragen: Bewegen/Drehen/Skalieren und Klonen ändern die Topologie nicht,
// nur die Lage, deshalb ist Fläche i danach dieselbe Fläche i (IsSame greift nicht, weil sich die Location ändert)
export function byIndex(s: Shape3D, o: (Origin | null)[]): Named {
  const faces = s.faces;
  if (faces.length !== o.length) return []; // sollte nicht vorkommen; dann lieber unbekannt als falsch
  return faces.flatMap((face, i) => o[i] ? [{ face, o: o[i]! }] : []);
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
    if (!isValid(b.Shape())) throw new Error('Boolesche Operation ergibt keinen gültigen Körper'); // nie still kaputt weiterrechnen oder exportieren
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

// Rundung/Fase an den Kanten (wie replicad, aber mit Historie);
// die neue Fläche heißt nach dem Feature, die Nachbarflächen behalten ihren Namen
export function edgeOp(type: 'fillet' | 'chamfer', id: number, A: Shape3D, nA: Named, edges: Edge[], r: number, extra: Partial<Origin> = {}): [Shape3D, Named] {
  const oc = getOC() as any;
  const b = type === 'fillet' ? new oc.BRepFilletAPI_MakeFillet(A.wrapped, oc.ChFi3d_FilletShape.ChFi3d_Rational) : new oc.BRepFilletAPI_MakeChamfer(A.wrapped);
  try {
    edges.forEach(e => b.Add(r, e.wrapped));
    b.Build(new oc.Message_ProgressRange());
    if (!b.IsDone()) throw new Error(type === 'fillet' ? 'Rundung fehlgeschlagen' : 'Fase fehlgeschlagen');
    if (!isValid(b.Shape())) throw new Error(`${type === 'fillet' ? 'Rundung' : 'Fase'} ergibt keinen gültigen Körper (Maß zu groß oder an einer Bohrung?)`); // sonst Netz mit Löchern, STL und 3MF unbrauchbar
    const gen = edges.flatMap(e => list(b.Generated(e.wrapped))).map(t => [t, { f: id, tag: type, ...extra }] as [any, Origin]);
    const out = carry(b, nA, gen);
    gen.forEach(([t]) => t.delete());
    return out;
  } finally { b.delete(); }
}

// ── Anker: Features, die an einer Fläche/Kante hängen, beim Rebuild darauf auflösen ──
// Ohne Bezug (neu angelegt oder alte Datei) wird er über die gespeicherte Lage gefunden und als patch zurückgegeben;
// mit Bezug wird aufgelöst und die gespeicherte Lage nachgeführt. Verloren/mehrdeutig = Fehler, nie still raten.
// confirm = Bezug auf das, was unsicher gefunden wurde; „Bezug übernehmen“ (T1.15) schreibt ihn ins Feature
type Anchor<T> = T & { patch?: Record<string, unknown>; sure: boolean; confirm?: Record<string, unknown> };
const sub3 = (a: ArrayLike<number>, b: ArrayLike<number>) => [0, 1, 2].map(i => a[i] - b[i]);
const fail = (r: { why: 'lost' | 'ambiguous' }, what: string) => new Error(`${what} ${r.why === 'lost' ? 'nicht mehr vorhanden' : 'nicht eindeutig'}`);

// Skizze auf einer Fläche: verschiebt sich die Fläche, wandert die Skizze mit; kippt sie, dreht sich die Skizze um die
// Schnittgerade von alter und neuer Ebene (das Scharnier, z. B. die stehen gebliebene Kante einer Vieleckseite).
// Gekippt bleibt der Bezug unsicher (gelb), bis der Nutzer ihn bestätigt (T1.15).
// shortcut: Lage in der Ebene nur über das Scharnier, nicht über Kanten der Fläche; reicht für Kippen um eine Kante
export function anchorSketch(f: Extrude, s: Shape3D | null, named: Named): Anchor<{ f: Extrude }> {
  if (!f.onFace || !s) return { f, sure: true };
  if (!f.face) {
    const b = bounds(f), mid = b.map(([lo, hi]) => (lo + hi) / 2);
    const inPlane = s.faces.filter(x => x.geomType === 'PLANE' && Math.abs(dot(x.normalAt(x.center).toTuple(), f.n)) > 0.999
      && Math.abs(dot(sub3(x.center.toTuple(), f.o), f.n)) < 1e-4);
    const cands = inPlane.filter(x => dot(x.normalAt(x.center).toTuple(), f.n) > 0);
    // Nur Unterseiten in der Ebene: Die Skizze lag auf einer flachen Skizze, nie auf dem Körper (z. B. zwei Kreise auf einem Rechteck hochgezogen)
    if (!cands.length && inPlane.length) return { f: { ...f, onFace: false }, sure: true, patch: { onFace: false } };
    // shortcut: mehrere Flächen in der Ebene → die mit dem nächsten Schwerpunkt; ungenau bei verschachtelten Flächen → Abstand Punkt–Fläche
    const face = cands.sort((x, y) => Math.hypot(...sub3(x.center.toTuple(), mid)) - Math.hypot(...sub3(y.center.toTuple(), mid)))[0];
    if (!face) throw new Error('Fläche der Skizze nicht gefunden (in ihrer Ebene liegt keine Fläche mehr, z. B. von einer Schale geöffnet)'); // sonst schneidet sie still nichts
    const ref = faceRef(named, face);
    return { f, sure: true, ...ref && { patch: { face: ref } } };
  }
  const r = resolveFace(f.face, s, named);
  if (!r.ok) throw fail(r, 'Fläche der Skizze');
  const ref = !r.sure && faceRef(named, r.shape), confirm = ref ? { confirm: { face: ref } } : {};
  const C = r.shape.center.toTuple(), N0 = r.shape.normalAt(r.shape.center).toTuple(), N = N0.map(x => x / Math.hypot(...N0)) as Vec;
  const k = dot(N, f.n), A = [f.n[1] * N[2] - f.n[2] * N[1], f.n[2] * N[0] - f.n[0] * N[2], f.n[0] * N[1] - f.n[1] * N[0]], sn = Math.hypot(...A);
  if (k < -0.999) throw new Error('Fläche der Skizze hat sich umgedreht');
  if (k < 0.999999) { // gekippt: Drehung um die Schnittgerade, die n in N überführt
    const h1 = dot(f.o, f.n), h2 = dot(C, N), c1 = (h1 - h2 * k) / (1 - k * k), c2 = (h2 - h1 * k) / (1 - k * k);
    const g = movedCopy(f, f.id, [0, 0, 0], A.map(x => x / sn) as Vec, Math.atan2(sn, k), f.n.map((x, i) => c1 * x + c2 * N[i]) as Vec);
    return { f: g, sure: r.sure, ...confirm, patch: { o: g.o, n: g.n, u: g.u, v: g.v, ...g.and && { and: g.and }, ...g.not && { not: g.not }, ...g.axisLine && { axisLine: g.axisLine } } };
  }
  const d = dot(sub3(C, f.o), f.n);
  if (Math.abs(d) < 1e-6) return { f, sure: r.sure, ...confirm };
  const g = movedCopy(f, f.id, f.n.map(x => x * d) as Vec);
  return { f: g, sure: r.sure, ...confirm, patch: { o: g.o, ...g.and && { and: g.and }, ...g.not && { not: g.not } } };
}

// Rundung/Fase: Kante über den Bezug, sonst über den Punkt at; at/dir werden an die Kante nachgeführt
export function anchorEdges(f: Pick<EdgeOp, 'at' | 'edge'>, s: Shape3D, named: Named): Anchor<{ edges: Edge[] }> {
  if (!f.edge) {
    const edges = new EdgeFinder().withinDistance(0.1, f.at).find(s);
    if (!edges.length) throw new Error('Kante nicht gefunden');
    const ref = edges.length === 1 ? edgeRef(named, edges[0], s) : null;
    return { edges, sure: true, ...ref && { patch: { edge: ref } } };
  }
  const r = resolveEdge(f.edge, s, named);
  if (!r.ok) throw fail(r, 'Kante');
  const e = r.shape, m = e.pointAt(0.5).toTuple(), t = e.tangentAt(0.5).toTuple(), q = sub3(f.at, m), along = dot(q, t);
  const onIt = Math.hypot(...q.map((x, i) => x - along * t[i])) < 1e-4 && Math.abs(along) <= measureLength(e) / 2 + 1e-4; // at liegt noch auf der Kante
  const ref = !r.sure && edgeRef(named, e, s);
  return { edges: [e], sure: r.sure, ...ref && { confirm: { edge: ref } }, ...!onIt && { patch: { at: m, dir: t } } };
}

// Schale: offene Flächen über die Bezüge, sonst über die Punkte at/more.
// Liegt ein Punkt nicht mehr auf seiner aufgelösten Fläche (Maß geändert), wandert er auf deren Mitte bzw. eine Kantenmitte.
export function anchorFaces(f: Pick<Shell, 'at' | 'more' | 'faces'>, s: Shape3D, named: Named): Anchor<{ faces: Face[] }> {
  const pts = [f.at, ...f.more ?? []];
  if (!f.faces) {
    const per = pts.map(p => new FaceFinder().withinDistance(0.1, p).find(s));
    const refs = per.every(x => x.length === 1) ? per.map(x => faceRef(named, x[0])) : [];
    return { faces: per.flat(), sure: true, ...refs.length && refs.every(Boolean) && { patch: { faces: refs } } };
  }
  const rs = f.faces.map(ref => resolveFace(ref, s, named)), bad = rs.find(r => !r.ok);
  if (bad && !bad.ok) throw fail(bad, 'Offene Fläche der Schale');
  const faces = rs.map(r => r.ok ? r.shape : null!), sure = rs.every(r => r.ok && r.sure), refs = sure ? [] : faces.map(x => faceRef(named, x));
  const on = (p: Vec, x: Face) => new FaceFinder().withinDistance(1e-4, p).find(x).length > 0;
  const moved = pts.map((p, i) => !faces[i] || on(p, faces[i]) ? p
    : [faces[i].center.toTuple(), faces[i].edges[0].pointAt(0.5).toTuple()].find(q => on(q as Vec, faces[i])) as Vec);
  const patch = moved.some((p, i) => p !== pts[i]) && { patch: { at: moved[0], ...f.more && { more: moved.slice(1) } } };
  return { faces, sure, ...refs.length && refs.every(Boolean) && { confirm: { faces: refs } }, ...patch };
}

// ── Punkte und Kreise für Maße ──
const ends = (f: Face) => f.edges.flatMap(e => [e.startPoint.toTuple(), e.endPoint.toTuple()]);
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => Math.hypot(...sub3(a, b)) < 1e-6;

// Eckpunkt P über die Flächen benennen, die sich dort treffen; null, wenn es weniger als drei benannte sind
export function pointRef(named: Named, P: Vec): PointRef | null {
  const f = named.filter(n => ends(n.face).some(q => same(q, P))).map(n => n.o);
  return f.length >= 3 ? { f, fp: P } : null;
}

// Punkt, an dem alle Flächen des Bezugs zusammentreffen; mehrere (aufgespaltene Flächen) → der nächste zu fp, unsicher
export function resolvePoint(ref: PointRef, named: Named): { ok: true; p: Vec; sure: boolean } | { ok: false; why: 'lost' | 'ambiguous' } {
  const pts = ref.f.map(o => named.filter(n => sameOrigin(n.o, o)).flatMap(n => ends(n.face)));
  const hits = pts[0].filter(p => pts.every(l => l.some(q => same(q, p)))).filter((p, i, a) => a.findIndex(q => same(q, p)) === i) as Vec[];
  if (hits.length === 1) return { ok: true, p: hits[0], sure: true };
  if (!hits.length) return { ok: false, why: 'lost' };
  const d = hits.map(p => Math.hypot(...sub3(p, ref.fp))).sort((x, y) => x - y);
  if (d[1] - d[0] < 1e-6) return { ok: false, why: 'ambiguous' };
  return { ok: true, p: hits.find(p => Math.hypot(...sub3(p, ref.fp)) === d[0])!, sure: false };
}

// Kreis einer Kreiskante: Mitte, Achse, Radius
export function circleOf(e: Edge): { c: Vec; n: Vec; r: number } | null {
  if (e.geomType !== 'CIRCLE') return null;
  const oc = getOC() as any, ad = new oc.BRepAdaptor_Curve(e.wrapped), ci = ad.Circle(), l = ci.Location(), d = ci.Axis().Direction();
  const out = { c: [l.X(), l.Y(), l.Z()] as Vec, n: [d.X(), d.Y(), d.Z()] as Vec, r: ci.Radius() };
  ad.delete();
  return out;
}

// Eben, auch wenn OCCT sie als B-Spline speichert (z. B. Seiten eines Lofts): Normalen an mehreren Stellen gleich
const flat = (x: Face) => {
  if (x.geomType === 'PLANE') return true;
  const n = [[0.2, 0.2], [0.8, 0.2], [0.5, 0.8]].map(([u, v]) => x.normalAt(x.pointOnSurface(u, v)).toTuple());
  return n.every(m => dot(m, n[0]) > 0.99999);
};

// Fläche versetzen: ebene Fläche über den Bezug, sonst über Klickpunkt und Normale finden; dann ihr Prisma anfügen bzw. abziehen.
// Die versetzte Fläche behält den Namen der alten, damit Skizzen und Kanten daran mitwandern.
export function offsetFace(f: Offset, A: Shape3D, nA: Named): Anchor<{ out: [Shape3D, Named] }> {
  let face: Face | undefined, patch: Record<string, unknown> | undefined, sure = true;
  if (f.face) {
    const r = resolveFace(f.face, A, nA);
    if (!r.ok) throw fail(r, 'Versetzte Fläche');
    face = r.shape; sure = r.sure;
  } else {
    face = new FaceFinder().withinDistance(0.1, f.at).find(A).find(x => flat(x) && Math.abs(dot(x.normalAt(f.at).toTuple(), f.n)) > 0.999);
    const ref = face && faceRef(nA, face);
    if (ref) patch = { face: ref };
  }
  if (!face) throw new Error('Fläche nicht gefunden');
  if (!flat(face)) throw new Error('Nur ebene Flächen lassen sich versetzen');
  const ref = !sure && faceRef(nA, face);
  // B-Spline-Flächen liefern die Normale nicht normiert
  const N0 = face.normalAt(face.center).toTuple(), N = N0.map(x => x / Math.hypot(...N0)) as Vec, c0 = face.center.toTuple(), o0 = nA.find(n => n.face.wrapped.IsSame(face!.wrapped))?.o;
  const prism = basicFaceExtrusion(face, new Vector(N.map(x => x * f.d) as Vec)) as unknown as Shape3D;
  const named: Named = prism.faces.map((x, i) => { // Deckel in Versatzrichtung = die versetzte Fläche
    const h = dot(sub3(x.center.toTuple(), c0), N);
    return { face: x, o: Math.abs(h - f.d) < 1e-6 && o0 ? o0 : Math.abs(h) < 1e-6 ? { f: f.id, tag: 'start' } : { f: f.id, tag: 'seg', i } };
  });
  return { out: boolean(f.d > 0 ? 'fuse' : 'cut', A, nA, prism, named), sure, ...patch && { patch }, ...ref && { confirm: { face: ref } } };
}
