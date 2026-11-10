// CAD-Kern: Features → B-Rep-Körper über replicad (OpenCascade). setOC() muss vorher aufgerufen sein.
import { assembleWire, makeBox, basicFaceExtrusion, makeFace, measureArea, Vector, makeCylinder, makeVertex, measureDistanceBetween, makeHelix, loft, makePolygon, makeSolid, cast, type Edge, type Face, getOC, draw, drawCircle, drawText, type Wire, drawEllipse, drawProjection, drawRectangle, importSTEP, iterTopo, makeCompound, measureVolume, Plane, ProjectionCamera, type Drawing, type Shape3D, type Sketch } from 'replicad';
import { esc, revSpan, bodyOf, bulge3, isCut, isExtrude, isFlat, noFace, patternCopies, revAxis, splineBeziers, type Dim, type EdgeOp, type Frame, type PointRef, type Shell, type Extrude, type Feature, type Sweep, type TextFeature, type Vec } from './model';
import { anchorEdges, anchorFaces, anchorSketch, boolean, offsetFace, removeFaces, draftFaces, byIndex, circleOf, edgeOp, edgeRef, isValid, pointRef, resolveEdge, resolvePoint, type EdgeRef, nameLoft, nameSolid, originsOf, shell, sweep, type Named, type Origin } from './topo';

// Umriss der Skizze auf ihrer Ebene (ohne Bereiche)
function sketchOf(f: Extrude) {
  const p = f.p;
  const drawing = f.type === 'rect' ? drawRectangle(p.w, p.h).translate(p.x + p.w / 2, p.y + p.h / 2)
    : f.type === 'circle' ? (p.ry ? drawEllipse(Math.max(p.r, p.ry), Math.min(p.r, p.ry)).rotate(p.ry > p.r ? 90 : 0) : drawCircle(p.r)).translate(p.cx, p.cy)
    : polyDrawing(f.pts!, f.smooth);
  return drawing.sketchOnPlane(new Plane(f.o, f.u, f.n)) as Sketch;
}

// Kennung der Fläche, auf der eine runde B-Rep-Fläche liegt: zwei Hälften desselben Zylinders haben dieselbe; Ebenen und Freiformflächen eine eigene je Fläche
function roundSurfaceKey(face: Face, i: number) {
  const oc = getOC() as any, t = face.geomType;
  if (t !== 'CYLINDRE' && t !== 'CONE' && t !== 'SPHERE' && t !== 'TORUS') return `#${i}`;
  const a = new oc.BRepAdaptor_Surface(face.wrapped, false), q = [] as number[];
  try {
  const xyz = (p: any) => { q.push(p.X(), p.Y(), p.Z()); p.delete(); return q.slice(-3); };
  const line = (ax: any) => { // Achse als Gerade: Richtung ohne Vorzeichen, Lotpunkt des Ursprungs
    const d0 = ax.Direction(), d = [d0.X(), d0.Y(), d0.Z()], sg = Math.sign(d.find(x => Math.abs(x) > 1e-9) ?? 1), l = ax.Location(), p = [l.X(), l.Y(), l.Z()], k = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
    q.push(...d.map(x => x * sg), ...p.map((x, n) => x - k * d[n]));
    d0.delete(); l.delete(); ax.delete();
  };
  if (t === 'TORUS') { // gp_Torus fehlt in dieser OCCT-Fassung: Mitte, Achse und Radien aus Punkten auf der Fläche, unabhängig vom Anfang der Parameter
    const at = (u: number, v: number) => { const P = a.Value(u, v), r = [P.X(), P.Y(), P.Z()]; P.delete(); return r; };
    const add = (A: number[], B: number[], k = 1) => A.map((x, n) => x + k * B[n]), ring = [0, 1, 2].map(n => add(at(n * 2 * Math.PI / 3, 0), at(n * 2 * Math.PI / 3, Math.PI)).map(x => x / 2));
    const c = add(add(ring[0], ring[1]), ring[2]).map(x => x / 3), e = add(ring[0], c, -1), f = add(ring[1], c, -1);
    const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]], L = Math.hypot(...n), sg = Math.sign(n.find(x => Math.abs(x) > 1e-9 * L) ?? 1);
    q.push(Math.hypot(...e), Math.hypot(...add(at(0, 0), at(0, Math.PI), -1)) / 2, ...c, ...n.map(x => x * sg / L));
  } else {
    let g: any;
    if (t === 'CYLINDRE') { g = a.Cylinder(); q.push(g.Radius()); line(g.Axis()); }
    else if (t === 'CONE') { g = a.Cone(); q.push(g.SemiAngle()); xyz(g.Apex()); line(g.Axis()); }
    else { g = a.Sphere(); q.push(g.Radius()); xyz(g.Location()); }
    g.delete();
  }
  return t + q.map(x => (Math.round(x * 1e4) / 1e4 || 0).toFixed(4)).join();
  } catch { return `#${i}`; } finally { a.delete(); } // lieber eine Linie zu viel als kein Bild
}
// Kantennetz fürs Bild ohne Nähte. Keine echte Kante: gehört nur zu einer einzigen Fläche (Naht einer Kugel, eines Zylinders)
// oder trennt zwei Teile derselben runden Fläche (ein Kreis wird zu zwei Halbzylindern)
export function shownEdges(s: Shape3D, options: { tolerance: number; angularTolerance: number }) {
  const e = s.meshEdges(options), faces = new Map<number, string[]>();
  s.faces.forEach((face, i) => {
    const key = roundSurfaceKey(face, i);
    for (const edge of face.edges) { faces.set(edge.hashCode, [...faces.get(edge.hashCode) ?? [], key]); edge.delete(); }
    face.delete();
  });
  const keep = e.edgeGroups.filter(g => { const k = faces.get(g.edgeId); return !k || new Set(k).size > 1 && k.length > 1; }), lines: number[] = [];
  const edges = keep.flatMap(g => {
    const start = lines.length / 3;
    for (let i = g.start * 3; i < (g.start + g.count) * 3; i++) lines.push(e.lines[i]);
    return [start, g.count];
  });
  return { lines, edges };
}

export function solidOf(f: Extrude): Shape3D {
  const ax = f.rev ? revAxis(f) : null;
  let of = f;
  if (ax) {
    const [lo, hi] = revSpan(f), c = [f.p.cx, f.p.cy], r = f.p.r;
    if (f.type === 'circle' && !f.p.ry && Math.abs(lo + hi) < 1e-6) { // Kreis um seine Mitte: die Hälfte reicht, der ganze Kreis ergäbe Volumen 0
      const du = ax.d[0] * f.u[0] + ax.d[1] * f.u[1] + ax.d[2] * f.u[2], dv = ax.d[0] * f.v[0] + ax.d[1] * f.v[1] + ax.d[2] * f.v[2];
      of = { ...f, type: 'poly', pts: [[c[0] + r * du, c[1] + r * dv, 1], [c[0] - r * du, c[1] - r * dv]] };
    } else if (lo < -1e-6 && hi > 1e-6) throw new Error('Die Skizze liegt auf beiden Seiten der Drehachse');
  }
  const sk = sketchOf(of);
  let s = (ax ? sk.revolve(ax.d, { origin: ax.p, angle: f.rev }) : sk.extrude(f.d)) as Shape3D;
  // Bereich: mit hohen Prismen der anderen Skizzen schneiden bzw. sie abziehen (Höhe egal, Ebene ist dieselbe)
  for (const c of [...f.and ?? [], ...f.not ?? []]) {
    const tool = solidOf({ ...c, o: c.o.map((x, i) => x - 1e4 * c.n[i]) as Vec, d: 2e4 });
    const next = f.and?.includes(c) ? s.intersect(tool) : s.cut(tool);
    s.delete(); tool.delete();
    s = next;
  }
  if (f.thread && f.type === 'circle' && !f.rev && !f.p.ry && !f.and && !f.not && Math.abs(f.d) > 1e-6) { // Gewinde ersetzt den glatten Zylinder
    const next = threaded(f);
    s.delete(); s = next;
  }
  return s;
}

// Lippe/Falz (F6) am offenen Rand einer Schale: Randfläche = ebene Fläche in der Ebene der geöffneten Fläche, mit Loch (Öffnung).
// Ring an der Öffnung, Breite W von ihrer Kante nach außen. Lippe: Ring um h nach oben angesetzt. Falz (Gegenstück am Deckel):
// Ring mit Spiel c breiter, h + c tief abgezogen; dort bleibt der äußere Teil der Wand stehen und greift über die Lippe.
function lipOn(f: Shell, A: Shape3D, nA: Named, N: Vec): [Shape3D, Named] {
  const { kind, w, h, c } = f.lip!, groove = kind === 'groove', W = groove ? w + c : w, d = groove ? -(h + c) : h, lvl = dot3(f.at, N);
  const holes = A.faces.filter(x => x.geomType === 'PLANE' && dot3(x.normalAt().toTuple(), N) > 0.999 && Math.abs(dot3(x.center.toTuple(), N) - lvl) < 1e-4)
    .flatMap(x => x.innerWires()); // innerWires gibt die Fläche frei: zuletzt
  if (!holes.length) throw new Error('Rand der Schale nicht gefunden – Lippe nur an einer ebenen Öffnung');
  let out: [Shape3D, Named] = [A.clone() as Shape3D, nA];
  for (const hole of holes) {
    const inner = makeFace(hole.clone()), grow = [W, -W].map(o => makeFace(hole.clone().offset2D(o))) // makeFace/offset2D verbrauchen den Draht; [0] = +W = nach außen (alle sechs Seiten eines Quaders geprüft)
    grow[1].delete();
    const vec = () => new Vector(N.map(x => x * d) as Vec), ring = basicFaceExtrusion(grow[0], vec()) as unknown as Shape3D, cavity = basicFaceExtrusion(inner, vec()) as unknown as Shape3D;
    const tool = groove ? ring : ring.cut(cavity) as Shape3D; // Falz: die Öffnung ist ohnehin leer
    const nT: Named = tool.faces.map((face, i) => ({ face, o: { f: f.id, tag: 'shell', i: 100 + i } }));
    const next = boolean(groove ? 'cut' : 'fuse', out[0], out[1], tool, nT);
    out[0].delete(); out = next;
    if (tool !== ring) tool.delete();
    ring.delete(); cavity.delete(); inner.delete(); grow[0].delete();
  }
  return out;
}
const dot3 = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Rippe (F5): offene Linie als Wand der Dicke rib, mittig auf der Skizzenebene. Die Wand reicht quer zur Linie (in der Ebene) bis an
// den Körper: Streifen von der Linie weg, Körper abziehen, das Stück an der Linie bleibt. Seite = die, auf der der Körper den Streifen
// begrenzt; begrenzt er beide, die kleinere. Probe für „an der Linie“: Mitte der ersten Seite, knapp daneben.
// Skizze auf einer Körperfläche (z. B. Stirnfläche): Wand von der Fläche nach innen, bündig, statt halb aus dem Teil heraus.
// Gegen Fehlbedienung (Linie auf der Wandfläche statt quer durch das Profil, R1): ein Stück, das quer zur Linie viel weiter reicht
// als die Linie lang ist, wird abgelehnt statt als Riesenplatte angebaut.
// shortcut: Richtung quer zur Sehne vom ersten zum letzten Punkt; bei stark gebogenen Linienzügen ungenau → Richtung je Abschnitt
const RIB_HOW = 'Linie auf eine Ebene quer durch das Teil legen (z. B. Stirnfläche) und schräg von Wand zu Boden zeichnen';
function ribSolid(g: Extrude, body: Shape3D): Shape3D {
  try { return ribRegion(g, body); } catch (e) {
    const k = g.onFace ? gusset(g, body) : null; // auf einer Fläche gezeichnet und an einer Wand: Knotenblech
    if (k) return k;
    throw e;
  }
}
// Knotenblech: Linie auf einer Fläche (z. B. Boden eines Winkels), ein Ende an einer aufragenden Wand. Dreieck senkrecht auf der Fläche durch
// die Linie, rechter Winkel an der Wand, Höhe = Linienlänge (45°), oben auf die Hüllbox des Körpers gekappt. null = keine Wand an einem Ende
function gusset(g: Extrude, body: Shape3D): Shape3D | null {
  const t = g.rib!, pts = g.pts!, ends = [pts[0], pts[pts.length - 1]];
  const W = (q: number[], z = 0) => g.o.map((o, i) => o + q[0] * g.u[i] + q[1] * g.v[i] + z * g.n[i]);
  const A = W(ends[0]), B = W(ends[1]), L = Math.hypot(...A.map((x, i) => B[i] - x));
  if (L < 1e-6) return null;
  for (const [E, F] of [[A, B], [B, A]]) {
    const s = E.map((x, i) => (F[i] - x) / L), up = g.n;
    // liegt knapp hinter dem Ende, 1 mm über der Fläche, Material? (Abstand zum Punkt taugt nicht: beim Verbund misst er zur Hülle)
    const c = E.map((x, i) => x - 0.3 * s[i] + 1 * up[i]), cube = makeBox(c.map(x => x - 0.1) as Vec, c.map(x => x + 0.1) as Vec), hit = cube.intersect(body) as Shape3D;
    const inWall = measureVolume(hit) > 0.004; // halber Würfel (0,2³ = 0,008)
    cube.delete(); hit.delete();
    if (!inWall) continue;
    const n = [s[1] * up[2] - s[2] * up[1], s[2] * up[0] - s[0] * up[2], s[0] * up[1] - s[1] * up[0]] as Vec;
    const tri = solidOf({ id: g.id, type: 'poly', p: {}, pts: [[0, 0], [L, 0], [0, L]], d: t, o: E.map((x, i) => x - t / 2 * n[i]) as Vec, u: s as Vec, v: up, n } as Extrude);
    const [lo, hi] = body.boundingBox.bounds, box = makeBox(lo as Vec, hi as Vec), out = tri.intersect(box) as Shape3D; // nicht über den Körper hinaus
    tri.delete(); box.delete();
    return out;
  }
  return null;
}
function ribRegion(g: Extrude, body: Shape3D): Shape3D {
  const t = g.rib!, pts = g.pts!, a = pts[0], b = pts[pts.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 1e-6 || t <= 0) throw new Error('Linie zu kurz für eine Rippe');
  const m = [(a[1] - b[1]) / L, (b[0] - a[0]) / L], [lo, hi] = body.boundingBox.bounds, D = 2 * Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) + 10;
  const z0 = g.onFace ? -t : -t / 2, zm = z0 + t / 2; // Unterseite und Mitte der Wand entlang n
  const world = (x: number, y: number, z = 0) => g.o.map((o, i) => o + x * g.u[i] + y * g.v[i] + z * g.n[i]) as Vec;
  const mw = g.u.map((u, i) => u * m[0] + g.v[i] * m[1]), A = world(a[0], a[1]);
  const q = [(a[0] + pts[1][0]) / 2, (a[1] + pts[1][1]) / 2];
  let best: { s: Shape3D; v: number; open: boolean } | null = null, tooFar = false;
  for (const k of [1, -1]) {
    const far = (p: number[]) => [p[0] + k * D * m[0], p[1] + k * D * m[1]];
    const slab = solidOf({ ...g, type: 'poly', p: {}, pts: [...pts.slice(0, -1), [b[0], b[1]], far(b), far(a)], open: undefined, rib: undefined, cons: undefined, onFace: false, thru: undefined, o: world(0, 0, z0), d: t });
    const full = measureVolume(slab), rest = slab.cut(body) as Shape3D, probe = makeVertex(world(q[0] + k * 0.05 * m[0], q[1] + k * 0.05 * m[1], zm));
    slab.delete();
    const near = (rest.solids ?? []).map(s => ({ s, dist: measureDistanceBetween(s, probe) })).sort((x, y) => x.dist - y.dist)[0];
    probe.delete();
    const v = near ? measureVolume(near.s) : 0, open = v > full * 0.999; // nichts begrenzt: Streifen läuft ins Leere
    if (near && near.dist < 0.1) {
      const [p0, p1] = near.s.boundingBox.bounds, corners = [0, 1, 2, 3, 4, 5, 6, 7].map(c => [c & 1 ? p1[0] : p0[0], c & 2 ? p1[1] : p0[1], c & 4 ? p1[2] : p0[2]]);
      const reach = Math.max(...corners.map(c => k * c.reduce((s, x, i) => s + (x - A[i]) * mw[i], 0)));
      if (!open && reach > 2 * L + 2 * t + 5) tooFar = true; // Riesenplatte statt Rippe
      else if (!best || best.open && !open || best.open === open && v < best.v) { best?.s.delete(); best = { s: near.s.clone() as Shape3D, v, open }; }
    }
    rest.delete();
  }
  if (!best || best.open) {
    best?.s.delete();
    throw new Error(tooFar ? `Rippe würde weit über die Linie hinaus wachsen – ${RIB_HOW}` : `Rippe trifft den Körper nicht – ${RIB_HOW}`);
  }
  return best.s;
}

// Gewinde (F4): ISO-Profil (60°, Spitze P/8 und Grund P/4 flach). Jede Profilecke läuft auf einer Schraubenlinie, zwischen je zwei
// liegt eine Regelfläche; mit zwei Deckeln ergibt das den Gewindegang als Körper, dazu der Kern-Zylinder, auf die Höhe zugeschnitten.
// Bolzen: Kreis = Nenn-Ø, Kern 0,5413·P tiefer. Bohrung: Werkzeug von Kern-Ø (Kreis) bis Nenn-Ø, der Schnitt hinterlässt das Innengewinde.
// Verworfen: verdreht extrudierte Nocke (Netz 8 Mio. Dreiecke für 5 mm, Minuten im Worker) und Rille per genericSweep (unzuverlässig).
// Gerechnet in Z am Ursprung, dann gedreht; rechtsgängig.
// shortcut: Grundprofil ohne Spiel für den Druck → bei klemmenden Teilen Ø im Feld anpassen
function threaded(f: Extrude): Shape3D {
  const { D, P } = f.thread!, r = f.p.r, h = Math.abs(f.d);
  const [lo, hi] = isCut(f) ? [r, Math.max(D / 2, r + 0.3 * P)] : [r - 0.5413 * P, r];
  const fl = 0.3125 * P, ov = 0.1 * P, r0 = lo - ov, ext = fl * ov / (hi - lo); // Fuß um ov in den Kern verlängert, sonst berühren sich Gang und Kern nur
  const prof = [[r0, -ext], [hi, fl], [hi, fl + P / 8], [r0, 2 * fl + P / 8 + ext]]; // (Radius, Höhe) bei Winkel 0
  const H = h + 2 * P, z0 = -P, th = 2 * Math.PI * H / P; // Gang über beide Enden hinaus, dann zugeschnitten
  const hel = prof.map(([q, z]) => makeHelix(P, H, q, [0, 0, z0 + z]));
  const cap = (a: number, dz: number) => makePolygon(prof.map(([q, z]) => [q * Math.cos(a), q * Math.sin(a), z0 + z + dz] as Vec));
  const ridge = makeSolid([...hel.map((w, i) => loft([w, hel[(i + 1) % 4]], { ruled: true }, true) as unknown as Face), cap(0, 0), cap(th, H)]);
  const core = makeCylinder(lo, H, [0, 0, z0]), clip = makeCylinder(hi + 1, h), full = ridge.fuse(core) as Shape3D;
  let out = full.intersect(clip) as Shape3D;
  hel.forEach(w => w.delete()); ridge.delete(); core.delete(); clip.delete(); full.delete();
  const n = f.n.map(x => x * Math.sign(f.d)), C = [0, 1, 2].map(i => f.o[i] + f.p.cx * f.u[i] + f.p.cy * f.v[i]);
  const ax = [-n[1], n[0], 0], s2 = Math.hypot(ax[0], ax[1]), ang = Math.atan2(s2, n[2]) * 180 / Math.PI; // Drehung z → n um z × n
  if (ang > 1e-9) out = out.rotate(ang, [0, 0, 0], s2 > 1e-12 ? ax as Vec : [1, 0, 0]);
  return out.translate(C as Vec);
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

// Tiefe von der Skizzenebene bis zum entferntesten Punkt der Körperhülle gegen die Normale
function thruDepth(f: Extrude, b: Shape3D) {
  const [lo, hi] = b.boundingBox.bounds, dot = (x: number, y: number, z: number) => x * f.n[0] + y * f.n[1] + z * f.n[2];
  const min = Math.min(...[lo[0], hi[0]].flatMap(x => [lo[1], hi[1]].flatMap(y => [lo[2], hi[2]].map(z => dot(x, y, z)))));
  return Math.round(Math.max(0, dot(f.o[0], f.o[1], f.o[2]) - min) * 1e6) / 1e6;
}
// Stand vor dem zuletzt geänderten Schritt: Beim Ziehen und Nachtragen von Bezügen muss nur ab dort neu gerechnet werden.
// end = Stand nach dem letzten Schritt, für einen neu angehängten Schritt.
// Hält Kopien der Körper-Hüllen (gleiche OCCT-Geometrie), deshalb verwirft ihn eine gescheiterte Rundung (siehe safeEdgeOp)
export interface BuildCache { keys: string[]; at: number; st: ReturnType<typeof snapshotOf> | null; end: ReturnType<typeof snapshotOf> | null }
const newCache = (): BuildCache => ({ keys: [], at: 0, st: null, end: null });
function snapshotOf(bodies: Map<number, Shape3D>, names: Map<number, Named>, alias: Map<number, number>, failed: number[], errors: Map<number, string>, fixes: Map<number, Record<string, unknown>>, unsure: number[], confirm: Map<number, Record<string, unknown>>, moved: Map<number, Extrude>) {
  return { bodies: new Map([...bodies].map(([k, s]) => [k, s.clone() as Shape3D])), names: new Map(names), alias: new Map(alias), failed: [...failed], errors: new Map(errors), fixes: new Map(fixes), unsure: [...unsure], confirm: new Map(confirm), moved: new Map(moved) };
}
const dropCache = (c: BuildCache) => { c.st?.bodies.forEach(s => s.delete()); c.end?.bodies.forEach(s => s.delete()); c.st = c.end = null; };
export { newCache, dropCache };
// Größtes Maß, bei dem Rundung/Fase id noch gelingt (I2): Halbierungssuche zwischen 0,05 mm und dem gescheiterten Maß.
// Nur die Schritte bis zur Rundung; der Stand davor bleibt im eigenen Zwischenspeicher, jeder Versuch rechnet nur den einen Schritt. null = nicht einmal 0,05 mm
export function maxEdgeSize(features: Feature[], id: number, imports = new Map<number, Shape3D>()): number | null {
  const i = features.findIndex(f => f.id === id), c = newCache(), fs = features.slice(0, i + 1);
  const ok = (r: number) => {
    const res = buildBody(fs.map(f => f.id === id ? { ...f, r } as Feature : f), imports, c), good = !res.errors.has(id) && !res.failed.includes(id);
    if (res.body && res.bodies.size > 1) res.body.delete();
    res.bodies.forEach(s => s.delete());
    return good;
  };
  let lo = 0.05, hi = (fs[i] as { r?: number } | undefined)?.r ?? 0;
  try {
    if (i < 0 || !ok(lo)) return null;
    if (ok(hi)) return hi;
    for (let k = 0; k < 12 && hi - lo > 0.01; k++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  } finally { dropCache(c); }
  return lo >= 0.1 ? Math.floor(lo * 10) / 10 : Math.floor(lo * 100) / 100;
}
export function buildBody(features: Feature[], imports = new Map<number, Shape3D>(), cache?: BuildCache) {
  const bodies = new Map<number, Shape3D>(), names = new Map<number, Named>(), alias = new Map<number, number>(), failed: number[] = [];
  const errors = new Map<number, string>(), fixes = new Map<number, Record<string, unknown>>(), unsure: number[] = [], confirm = new Map<number, Record<string, unknown>>(), moved = new Map<number, Extrude>(); // moved: mitgewanderte Skizzen
  // Eine gescheiterte Rundung/Fase kann den Ausgangskörper in OCCT beschädigen (Flächen fehlen danach): dann den Stand davor neu rechnen
  const safeEdgeOp = (owner: Feature, k: number, type: 'fillet' | 'chamfer', id: number, A: Shape3D, nA: Named, edges: Edge[], r: number, extra?: Partial<Origin>) => {
    try { return edgeOp(type, id, A, nA, edges, r, extra); }
    catch (e) {
      const prev = buildBody(features.slice(0, features.indexOf(owner)), imports), kept = prev.bodies.get(k);
      if (prev.body && prev.bodies.size > 1) prev.body.delete();
      for (const [n, b] of prev.bodies) if (n !== k) b.delete();
      A.delete();
      if (cache) dropCache(cache);
      if (kept) { bodies.set(k, kept); names.set(k, prev.names.get(k) ?? []); } else { bodies.delete(k); names.delete(k); }
      throw e;
    }
  };
  const anchor = <T extends { patch?: Record<string, unknown>; sure: boolean; confirm?: Record<string, unknown> }>(id: number, a: T) => {
    if (a.patch) fixes.set(id, { ...fixes.get(id), ...a.patch });
    if (!a.sure) unsure.push(id);
    if (a.confirm) confirm.set(id, a.confirm);
    return a;
  };
  const key = (b: number) => { while (alias.has(b)) b = alias.get(b)!; return b; }; // verrechnete Körper leben in a weiter
  const keys = cache ? features.map(f => f.type === 'import' ? `${f.id}:${f.name}:${f.hidden}` : JSON.stringify(f)) : [];
  let changed = 0, start = 0;
  if (cache) {
    while (changed < keys.length && keys[changed] === cache.keys[changed]) changed++;
    const tail = cache.end && changed >= cache.keys.length && cache.keys.length > 0, c = tail ? cache.end : cache.st && cache.at <= changed ? cache.st : null;
    if (c) {
      c.bodies.forEach((s, k) => bodies.set(k, s.clone() as Shape3D));
      c.names.forEach((v, k) => names.set(k, v)); c.alias.forEach((v, k) => alias.set(k, v));
      failed.push(...c.failed); unsure.push(...c.unsure);
      c.errors.forEach((v, k) => errors.set(k, v)); c.fixes.forEach((v, k) => fixes.set(k, v));
      c.confirm.forEach((v, k) => confirm.set(k, v)); c.moved.forEach((v, k) => moved.set(k, v));
      start = tail ? cache.keys.length : cache.at;
    } else dropCache(cache);
    cache.keys = keys;
  }
  for (let fi = start; fi < features.length; fi++) {
    if (cache && fi === changed && !(cache.st && cache.at === changed)) {
      cache.st?.bodies.forEach(s => s.delete());
      cache.st = snapshotOf(bodies, names, alias, failed, errors, fixes, unsure, confirm, moved);
      cache.at = changed;
    }
    const f = features[fi];
    if (f.hidden || f.type === 'plane' || f.type === 'mesh' || f.type === 'image') continue; // Referenz-Netz/-Bild: nur Anzeige (F2, F3)
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
      if (f.type === 'drop') {
        const k = key(f.body), s = bodies.get(k);
        if (!s) throw new Error('Körper nicht vorhanden');
        s.delete(); bodies.delete(k); names.delete(k);
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
        const open = anchor(f.id, anchorFaces(f, body, nm)).faces;
        const N = f.lip && open[0] ? open[0].normalAt(f.at).normalized().toTuple() as Vec : null; // vor dem Aushöhlen: danach ist die Fläche weg
        const [hollow, nH] = shell(f.id, body, nm, open, f.t); // positive Dicke = Wand nach innen
        if (!N) { done(hollow, nH); continue; }
        try { done(...lipOn(f, hollow, nH, N)); hollow.delete(); }
        catch (e) { done(hollow, nH); errors.set(f.id, `Lippe: ${e instanceof Error ? e.message : e}`); } // Schale bleibt, nur die Lippe fehlt
        continue;
      }
      if (f.type === 'remove') {
        if (!body) continue;
        const nm = names.get(k) ?? [];
        done(...removeFaces(body, nm, anchor(f.id, anchorFaces(f, body, nm)).faces));
        continue;
      }
      if (f.type === 'draft') {
        if (!body || Math.abs(f.a) < 1e-6) continue;
        const nm = names.get(k) ?? [];
        done(...draftFaces(body, nm, anchor(f.id, anchorFaces(f, body, nm)).faces, f.a));
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
        done(...safeEdgeOp(f, k, f.type, f.id, body, nm, anchor(f.id, anchorEdges(f, body, nm)).edges, f.r));
        continue;
      }
      if (f.type === 'pattern') { // Kopien der Quellskizzen in ihrer aktuellen (vielleicht gewanderten) Lage; flache Skizzen ergeben nichts
        const here = features.indexOf(f);
        let total = 0, missed = 0;
        for (const id of f.src) {
          const S = moved.get(id) ?? features.find(g => g.id === id);
          if (!S || !isExtrude(S) || S.hidden) throw new Error('Skizze für das Muster fehlt');
          if (isFlat(S) || noFace(S)) continue;
          // jede Kopie gehört zum Körper ihrer Quelle (Mehrfachauswahl über mehrere Körper), nicht zum Körper des Muster-Schritts
          const kk = key(bodyOf(S));
          let b = bodies.get(kk) ?? null;
          const put = (next: Shape3D, nm: Named = []) => { b?.delete(); bodies.set(kk, next); names.set(kk, nm); b = next; };
          // Rundungen/Fasen an der Quelle (vor dem Muster, gelungen) gehen mit: ihr Kantenbezug auf die Kopie umgeschrieben
          const ops = features.slice(0, here).filter((e): e is EdgeOp => (e.type === 'fillet' || e.type === 'chamfer') && !e.hidden && !!e.edge
            && !failed.includes(e.id) && (e.edge.a.f === id || e.edge.b.f === id));
          // Ohne mitkopierte Rundungen und ohne Überlappung: alle Kopien in einem Schnitt, sonst wächst die Rechenzeit quadratisch (und 300 Löcher sprengen den Speicher)
          const all = patternCopies(f);
          if (b && !ops.length && all.length > 1) {
            const parts = all.map(P => {
              const at = `${id}:${P.key}`, c = P.copy(S, f.id), cd = c.thru && isCut(c) ? thruDepth(c, b!) : 0, s = solidOf(cd ? { ...c, d: -cd - 1 } : c);
              return { at, c, s, box: s.boundingBox.bounds, nS: nameSolid(c, s).map(x => ({ face: x.face, o: { ...x.o, at } })) };
            });
            const apart = parts.every((p, i) => parts.slice(i + 1).every(q => [0, 1, 2].some(k => p.box[1][k] < q.box[0][k] - 1e-6 || q.box[1][k] < p.box[0][k] - 1e-6)));
            if (apart) {
              const cut = isCut(parts[0].c), tool = makeCompound(parts.map(p => p.s)) as Shape3D; // makeCompound gibt seine Teile frei
              put(...boolean(cut ? 'cut' : 'fuse', b, names.get(kk) ?? [], tool, parts.flatMap(p => p.nS)));
              tool.delete();
              total += parts.length;
              if (cut) missed += parts.filter(p => !(names.get(kk) ?? []).some(n => n.o.f === f.id && n.o.at === p.at)).length;
              continue;
            }
            parts.forEach(p => p.s.delete());
          }
          for (const P of all) {
            const at = `${id}:${P.key}`, c = P.copy(S, f.id);
            total++;
            if (isCut(c) && !b) { missed++; continue; }
            const cd = c.thru && b && isCut(c) ? thruDepth(c, b) : 0;
            const s = solidOf(cd ? { ...c, d: -cd - 1 } : c), nS = nameSolid(c, s).map(x => ({ face: x.face, o: { ...x.o, at } }));
            if (!b) { b = s; bodies.set(kk, s); names.set(kk, nS); }
            else {
              put(...boolean(isCut(c) ? 'cut' : 'fuse', b, names.get(kk) ?? [], s, nS));
              s.delete();
              if (isCut(c) && !(names.get(kk) ?? []).some(n => n.o.f === f.id && n.o.at === at)) missed++;
            }
            const re = (o: Origin): Origin => o.f === id ? { ...o, f: f.id, at } : o;
            for (const e of ops) {
              const fp = e.edge!.fp, nm = names.get(kk) ?? [], edge = { a: re(e.edge!.a), b: re(e.edge!.b), fp: { ...fp, c: P.pt(fp.c), ...fp.n && { n: P.dir(fp.n) } } };
              put(...safeEdgeOp(f, kk, e.type, e.id, b!, nm, anchorEdges({ at: P.pt(e.at), edge }, b!, nm).edges, e.r, { at }));
            }
          }
        }
        // Kopien neben dem Körper schneiden nichts: nie still; die treffenden bleiben, deshalb nur Meldung, kein Abbruch
        if (missed && missed === total) throw new Error('Keine Kopie trifft den Körper – schneidet nichts');
        if (missed) errors.set(f.id, `${missed} von ${total} Kopien treffen den Körper nicht`);
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
        if (g.type === 'line' && g.rib && body) { s = ribSolid(g, body); nS = s.faces.map((face, i) => ({ face, o: { f: f.id, tag: 'seg' as const, i } })); }
        else if (isFlat(g) || (isCut(g) && !body)) continue;
        else {
        const depth = g.thru && body && isCut(g) ? thruDepth(g, body) : 0;
        if (depth && Math.abs(depth + g.d) > 1e-6) anchor(f.id, { sure: true, patch: { d: -depth } });
        s = solidOf(depth ? { ...g, d: -depth - 1 } : g); // 1 mm überstehen, sonst bleibt am Boden eine Haut
        nS = nameSolid(g, s);
        }
      }
      if (!body) { bodies.set(k, s); names.set(k, nS); continue; }
      done(...boolean((isExtrude(f) && isCut(f)) || (f.type === 'sweep' && f.sub) || (f.type === 'text' && f.d < 0) ? 'cut' : 'fuse', body, names.get(k) ?? [], s, nS));
      s.delete(); // WASM-Speicher freigeben
      // Bohrung/Tasche ohne eine einzige eigene Fläche im Ergebnis hat nichts getroffen (z. B. in der Öffnung einer Schale): rot statt still
      if (isExtrude(f) && isCut(f) && !(names.get(k) ?? []).some(n => n.o.f === f.id)) throw new Error('Trifft den Körper nicht – schneidet nichts');
    } catch (e) {
      console.warn('Feature', f.id, 'fehlgeschlagen', e);
      failed.push(f.id);
      errors.set(f.id, e instanceof Error ? e.message : String(e));
    }
  }
  if (cache) {
    cache.end?.bodies.forEach(s => s.delete());
    cache.end = snapshotOf(bodies, names, alias, failed, errors, fixes, unsure, confirm, moved);
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

// Zusatzansichten des Blatts (F8), gehören zum Modell. cut: Schnitt A–A an der Ebene ax = at (Modell, Y oben; at fehlt = Körpermitte).
// det: Einzelheit B, Kreis um c (Ansichtskoordinaten in mm) mit Radius r in Ansicht v (0 vorne, 1 oben, 2 seitlich), doppelt so groß gezeichnet
export type SheetExtra = { cut?: { ax: 'x' | 'y' | 'z'; at?: number }; det?: { v: number; c: number[]; r: number } };
export type SheetInfo = { sheet: 'A4' | 'A3'; title: string; material: string; date: string; unit?: 'mm' | 'in' } & SheetExtra; // Maße in mm (Standard) oder Zoll
// Schnitt je Achse: sv = Ansicht, in deren Richtung man auf die Schnittfläche schaut; pv = Ansicht, in der die Ebene als Linie erscheint
// (horiz = waagrecht); dir = Blickrichtung an dieser Linie auf dem Blatt
const CUT = { x: { sv: 2, pv: 0, horiz: false, dir: [1, 0] }, y: { sv: 1, pv: 0, horiz: true, dir: [0, 1] }, z: { sv: 0, pv: 1, horiz: true, dir: [0, -1] } };
const DETAIL = 2; // Vergrößerung der Einzelheit gegenüber dem Blattmaßstab
export type SheetLayout = { S?: (i: number, p: number[]) => number[]; k?: number; o?: number[][]; box?: number[][] }; // o: Blattpunkt des Ansichts-Ursprungs, box: x, y, b, h je Ansicht 0–2

// Schnittansicht: weg, was zwischen Betrachter und Ebene liegt; Ansicht des Rests und die Dreiecke der Schnittfläche (zum Schraffieren)
// in Ansichtskoordinaten. null = Ebene trifft nichts
function sectionOf(body: Shape3D, ax: 'x' | 'y' | 'z', at: number): { view: Drawing; tris: number[][] } | null {
  const B = 1e4, i = 'xyz'.indexOf(ax), lo = [-B, -B, -B], hi = [B, B, B], P = PROJ[CUT[ax].sv], tris: number[][] = [];
  if (ax === 'x') hi[0] = at; else lo[i] = at; // Betrachter: Seitenansicht von −x, Vorderansicht von +z, Draufsicht von +y
  const half = makeBox(lo as Vec, hi as Vec);
  const parts = [...iterTopo(body.wrapped, 'solid')].map(s => (cast(s) as Shape3D).cut(half)).filter(c => c.faces.length);
  half.delete();
  if (!parts.length) return null;
  for (const c of parts) {
    const m = c.mesh({ tolerance: 0.05, angularTolerance: 0.2 }), on = (k: number) => Math.abs(m.vertices[3 * k + i] - at) < 1e-4;
    for (let t = 0; t < m.triangles.length; t += 3) { // nur Flächen in der Ebene haben Dreiecke mit allen drei Ecken darauf
      const q = [m.triangles[t], m.triangles[t + 1], m.triangles[t + 2]];
      if (q.every(on)) tris.push(q.flatMap(k => P([m.vertices[3 * k], m.vertices[3 * k + 1], m.vertices[3 * k + 2]])));
    }
  }
  if (!tris.length) { parts.forEach(c => c.delete()); return null; } // Ebene liegt neben dem Körper
  const all = parts.length > 1 ? makeCompound(parts) as Shape3D : parts[0], s = forExport(all); // makeCompound gibt seine Teile frei
  all.delete();
  const view = drawProjection(s, VIEWS[CUT[ax].sv]).visible;
  s.delete();
  return { view, tris };
}

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

// Technische Zeichnung auf einem Blatt (quer): drei Ansichten mit Gesamtmaßen, Iso-Ansicht, Rahmen und Schriftfeld.
// Maßstab = größter Normmaßstab, bei dem alles auf das Blatt passt
// Dritte Spalte bei Bedarf: Schnitt A–A (oben) und Einzelheit B (unten), siehe SheetExtra.
// layout.S: Abbildung Ansicht i, Ansichtspunkt → Blatt (für den Maß-Editor)
export function sheetSVG(body: Shape3D, info: SheetInfo, dims: DimGeo[] = [], layout?: SheetLayout) {
  const s = forExport(body);
  const views = [...VIEWS.map(v => drawProjection(s, v)), drawProjection(s, new ProjectionCamera([0, 0, 0], [1, -1, 1]))];
  s.delete();
  const bb = views.map(v => v.visible.boundingBox.bounds), size = bb.map(([a, b]) => [b[0] - a[0], b[1] - a[1]]);
  const cut = info.cut && { ...CUT[info.cut.ax], ax: info.cut.ax, at: info.cut.at ?? body.boundingBox.center['xyz'.indexOf(info.cut.ax)] };
  let sec: ReturnType<typeof sectionOf> = null;
  try { sec = cut ? sectionOf(body, cut.ax, cut.at) : null; } catch (e) { console.warn('Schnittansicht fehlgeschlagen', e); } // Blatt kommt dann ohne Schnitt
  const sb = sec?.view.boundingBox.bounds, det = info.det && info.det.v >= 0 && info.det.v < 3 && info.det.r > 0 ? info.det : null;
  const [W, H] = SHEETS[info.sheet], gap = 22, x0 = 35, y0 = 15; // gap: Platz für Maße zwischen den Ansichten
  const availW = W - x0 - 10, availH = H - y0 - 10 - 32;              // 32 = Schriftfeld unten
  // Zellen [Spalte, Zeile, Breite, Höhe] in Modell-mm: Vorder-, Drauf-, Seiten-, Iso-Ansicht, dann Schnitt und Einzelheit
  const cells = [[0, 0, ...size[0]], [0, 1, ...size[1]], [1, 0, ...size[2]], [1, 1, ...size[3]],
    ...sb ? [[2, 0, sb[1][0] - sb[0][0], sb[1][1] - sb[0][1]]] : [], ...det ? [[2, 1, 2 * DETAIL * det.r, 2 * DETAIL * det.r]] : []];
  const span = (d: number) => Array.from({ length: Math.max(...cells.map(c => c[d])) + 1 }, (_, j) => Math.max(0, ...cells.filter(c => c[d] === j).map(c => c[2 + d])));
  const cw = span(0), rh = span(1), sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const fits = (k: number) => sum(cw) * k + gap * (cw.length - 1) <= availW && sum(rh) * k + gap * (rh.length - 1) <= availH;
  const k = SCALES.find(fits) ?? SCALES.at(-1)!;
  const pos = cells.map(c => [x0 + sum(cw.slice(0, c[0])) * k + gap * c[0], y0 + sum(rh.slice(0, c[1])) * k + gap * c[1]]);
  const ratio = (k: number) => k >= 1 ? `${k}:1` : `1:${Math.round(1 / k)}`;
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
  if (layout) Object.assign(layout, { S, k, o: [0, 1, 2].map(i => S(i, [0, 0])), box: [0, 1, 2].map(i => [...pos[i], size[i][0] * k, size[i][1] * k]) });
  const r3 = (x: number) => Math.round(x * 1e3) / 1e3;
  if (cut && sec && sb) { // Schnitt A–A: schraffierte Schnittfläche, Umrisse, darunter der Name; Schnittlinie mit Blickpfeilen in der Ansicht pv
    const [px, py] = pos[4], h = 2.5 / k, i = cut.pv, p = S(i, cut.horiz ? [0, cut.ax === 'z' ? -cut.at : cut.at] : [cut.at, 0]);
    out += `<g transform="translate(${px - k * sb[0][0]} ${py + k * sb[1][1]}) scale(${k})" stroke-width="${0.5 / k}">`
      + `<pattern id="hat" patternUnits="userSpaceOnUse" width="${h}" height="${h}" patternTransform="rotate(45)"><path d="M0 ${h / 2}H${h}" stroke-width="${0.18 / k}"/></pattern>`
      + `<path fill="url(#hat)" stroke="none" d="${sec.tris.map(t => `M${r3(t[0])} ${r3(-t[1])}L${r3(t[2])} ${r3(-t[3])}L${r3(t[4])} ${r3(-t[5])}z`).join('')}"/>` + paths(sec.view) + '</g>'
      + `<text x="${px + (sb[1][0] - sb[0][0]) * k / 2}" y="${py + (sb[1][1] - sb[0][1]) * k + 6}" text-anchor="middle">A–A</text>`;
    const a = cut.horiz ? [pos[i][0] - 13, p[1]] : [p[0], pos[i][1] - 6], b = cut.horiz ? [pos[i][0] + size[i][0] * k + 6, p[1]] : [p[0], pos[i][1] + size[i][1] * k + 13]; // 13: an den Gesamtmaßen (8 mm) vorbei
    const [dx, dy] = cut.dir, ang = Math.atan2(-dy, -dx), line = `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;
    out += `<g data-cut="1" stroke-width="0.35"><path d="${line}" stroke-dasharray="6 1.5 1 1.5"/><path d="${line}" stroke-opacity="0" stroke-width="4"/>` // breite unsichtbare Linie zum Greifen
      + [a, b].map(q => `<path d="M${q[0]} ${q[1]}l${5 * dx} ${5 * dy}"/>${arrow(q[0] + 5 * dx, q[1] + 5 * dy, ang)}`
        + `<text x="${q[0] + 8 * dx + (dx ? 0 : -1.2)}" y="${q[1] + 8 * dy + 1.2}" text-anchor="${dx < 0 ? 'end' : dx ? 'start' : 'middle'}">A</text>`).join('') + '</g>';
  }
  if (det) { // Einzelheit B: Kreis in der Ansicht, daneben derselbe Ausschnitt vergrößert
    const K = k * DETAIL, R = det.r * K, [px, py] = pos[cells.length - 1], cx = px + R, cy = py + R, P = S(det.v, det.c), v = views[det.v];
    out += `<circle data-det="1" cx="${P[0]}" cy="${P[1]}" r="${det.r * k}" stroke-width="0.25"/><text x="${P[0] + det.r * k * 0.71 + 1}" y="${P[1] - det.r * k * 0.71 - 1}">B</text>`
      + `<clipPath id="detc"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath><g clip-path="url(#detc)"><g transform="translate(${cx - K * det.c[0]} ${cy + K * det.c[1]}) scale(${K})" stroke-width="${0.5 / K}">`
      + paths(v.hidden, ` stroke="#777" stroke-width="${0.25 / K}" stroke-dasharray="${2 / K} ${1 / K}"`) + paths(v.visible) + `</g></g><circle cx="${cx}" cy="${cy}" r="${R}" stroke-width="0.25"/>`
      + `<text x="${cx}" y="${cy + R + 6}" text-anchor="middle">B (${ratio(K)})</text>`;
  }
  for (const d of dims) {
    const t = `${d.t === 'dia' ? '⌀' : d.t === 'rad' ? 'R' : ''}${d.t === 'ang' ? num(d.val) : len(d.val)}${d.t === 'ang' ? '°' : ''}${d.tol ? ' ' + d.tol : ''}`;
    out += `<g stroke-width="0.25" data-dim="${d.id}">${dimSVG(d, d.pts.map(p => S(d.v, p)), (d.rv ?? 0) * k, esc(t), arrow)}</g>`;
  }
  // Rahmen und Schriftfeld (unten rechts)
  const tx = W - 10 - 140, ty = H - 10 - 28, scale = ratio(k);
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
// Körper, die OCCTs Prüfung nicht bestehen (z. B. aus einer fehlerhaften STEP-Datei); Grundlage der Warnung vor dem Export
export const invalidBodies = (bodies: Map<number, Shape3D>) => [...bodies].filter(([, s]) => !isValid(s.wrapped)).map(([id]) => id);
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

// FreeCAD schreibt beim Export des ganzen Baums auch Achsen (unendliche Kanten, im Netz NaN), Skizzen und jeden Zwischenstand
// als eigenen Körper (der Rohblock deckt dann alle Löcher zu). Echte Mehrkörper-Dateien überlappen nicht, also bleibt von
// überlappenden Körpern nur der erste. shortcut: „der erste“ stimmt für FreeCAD (Body steht vorn), bei anderen Quellen die Meldung beachten
function cleanStep(shape: Shape3D) {
  const solids = [...iterTopo(shape.wrapped, 'solid')].map(s => cast(s) as Shape3D), kept: Shape3D[] = [];
  const overlaps = (a: Shape3D, b: Shape3D) => {
    if (a.boundingBox.isOut(b.boundingBox)) return false;
    try {
      const c = a.clone().intersect(b.clone()), v = measureVolume(c);
      c.delete();
      return v > 0.5 * Math.min(measureVolume(a), measureVolume(b));
    } catch { return false; } // lieber einen Körper zu viel als stillschweigend einen weg
  };
  for (const s of solids) if (!kept.some(k => overlaps(k, s))) kept.push(s);
  const loose = solids.length > 0 && shape.edges.length > solids.reduce((n, s) => n + s.edges.length, 0);
  if (kept.length === solids.length && !loose) return { shape, dropped: 0 };
  return { shape: (kept.length > 1 ? makeCompound(kept) : kept[0]) as Shape3D, dropped: solids.length - kept.length };
}

export async function loadStep(text: string, onDropped?: (n: number) => void): Promise<Shape3D> {
  const { shape, dropped } = cleanStep(await importSTEP(new Blob([text])) as Shape3D);
  if (dropped) onDropped?.(dropped);
  return shape.rotate(-90, [0, 0, 0], [1, 0, 0]);
}
