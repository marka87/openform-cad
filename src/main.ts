import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { alignTo, applyPush, ngonPts, slotPts, contour, endTangent, keyPoints, movePoint, snapTo, offsetFeature, regionFeature, GROUND, isCut, isExtrude, outline, ownerOf, polyFeature, sketchFeature, tangentBulge, type EdgeOp, type Extrude, type Feature, type Frame, type Grip, type Import, type Vec } from './model';
import type { FromWorker, ToWorker } from './kernel.worker';

type Tool = 'select' | 'rect' | 'circle' | 'ngon' | 'slot' | 'line' | 'spline';
const V = (a: ArrayLike<number>) => new THREE.Vector3().fromArray(a as number[]);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const HINTS: Record<Tool, string> = {
  select: 'Fläche ziehen = extrudieren / Größe ändern · Kante wegziehen = runden, hineinschieben = fasen · Punkte einer ausgewählten Skizze ziehen · Linksziehen ins Leere = drehen · Rechts = verschieben',
  rect:   'Auf Boden oder Fläche ziehen, um ein Rechteck zu skizzieren · beim Ziehen „20x10“ tippen + Enter = genaues Maß',
  circle: 'Vom Mittelpunkt aus ziehen, um einen Kreis zu skizzieren · beim Ziehen Zahl tippen + Enter = Radius',
  ngon:   'Vom Mittelpunkt aus ziehen = Vieleck · beim Ziehen + / − = mehr/weniger Ecken · Zahl tippen + Enter = Radius',
  slot:   'Rechteck aufziehen = Langloch mit runden Enden · Zahl tippen + Enter = Länge x Breite',
  line:   'Punkte klicken · Zahl tippen + Enter = Länge in Mausrichtung · vom letzten Punkt aus ziehen = Bogen · Klick auf den ersten Punkt oder Enter = schließen · Esc = abbrechen',
  spline: 'Punkte klicken, die Kurve läuft glatt hindurch · Klick auf den ersten Punkt oder Enter = schließen · Esc = abbrechen',
};

// ---------- Szene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
document.body.prepend(renderer.domElement);
const el = renderer.domElement;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1e2126);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(80, 150, 60); scene.add(sun);
const grid = new THREE.GridHelper(400, 40, 0x555b66, 0x3a3f48); scene.add(grid);
const fine = new THREE.GridHelper(400, 400, 0x2c3037, 0x2c3037); fine.position.y = -0.01; scene.add(fine);
const bodyGroup = new THREE.Group(); scene.add(bodyGroup); // Körper aus dem Kern
const group = new THREE.Group(); scene.add(group);         // Skizzen und Auswahlrahmen
const preview = new THREE.Group(); scene.add(preview);
const handles = new THREE.Group(); scene.add(handles);     // Punkte der ausgewählten Skizze zum Ziehen
// Achsen wie in der Exportdatei (Z oben): X rot, Y grün (Szene −Z), Z blau (Szene +Y); knapp über dem Raster
for (const [d, c] of [[[1, 0, 0], 0xe05555], [[0, 0, -1], 0x55c060], [[0, 1, 0], 0x5588ee]] as const) {
  const ends = [-200, 200].map(s => V(d).multiplyScalar(s).setY(d[1] ? s : 0.02));
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ends), new THREE.LineBasicMaterial({ color: c })));
}
const snapMark = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6), new THREE.MeshBasicMaterial({ color: 0xff9a3c, depthTest: false }));
snapMark.visible = false; snapMark.renderOrder = 2; scene.add(snapMark);
// Hilfslinien beim Ausrichten: vom Bezugspunkt zum Mauszeiger
const guides = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.6, depthTest: false }));
guides.frustumCulled = false; scene.add(guides);
const hideSnap = () => { snapMark.visible = false; guides.visible = false; };

// Eigene Listener VOR OrbitControls registrieren, damit Werkzeuge Linksklicks übernehmen können
el.addEventListener('pointerdown', onDown);
const controls = new OrbitControls(camera, el);
controls.enableDamping = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
function resetView() { camera.position.set(140, 110, 160); controls.target.set(0, 0, 0); }
resetView();

// ---------- Modell ----------
let features: Feature[] = [], nextId = 1, selId: number | null = null, tool: Tool = 'select';
let drag: any = null, ready = false;
const undoStack: string[] = [], redoStack: string[] = [];
const snapshot = () => JSON.stringify({ features, nextId });
function pushHistory() { undoStack.push(snapshot()); redoStack.length = 0; }
function restore(s: string) { ({ features, nextId } = JSON.parse(s)); selId = null; refresh(); }
function undo() { if (undoStack.length) { redoStack.push(snapshot()); restore(undoStack.pop()!); } }
function redo() { if (redoStack.length) { undoStack.push(snapshot()); restore(redoStack.pop()!); } }
// Fehlgeschlagenes automatisches Speichern (Speicher voll) bleibt im Hinweis sichtbar, sonst geht das Modell beim Neuladen verloren
let saveWarning = '';
function save() {
  try { localStorage.setItem('openform', snapshot()); saveWarning = ''; }
  catch { saveWarning = ' · ⚠ Automatisches Speichern fehlgeschlagen (Modell zu groß), bitte „Speichern“ benutzen'; }
}
function showHint(text: string) { $('hint').textContent = text + saveWarning; }
const getSel = () => features.find(f => f.id === selId);

function shapeOf(f: Extrude) {
  const s = new THREE.Shape(), p = f.p;
  if (f.type === 'rect') {
    s.moveTo(p.x, p.y); s.lineTo(p.x + p.w, p.y); s.lineTo(p.x + p.w, p.y + p.h); s.lineTo(p.x, p.y + p.h); s.closePath();
  } else if (f.type === 'circle') s.absarc(p.cx, p.cy, p.r, 0, Math.PI * 2, false);
  else s.setFromPoints(contour(f.pts!, f.smooth).map(([x, y]) => new THREE.Vector2(x, y)));
  return s;
}

// Skizzen, Vorschau und Auswahlrahmen kommen aus Three.js; der eigentliche Körper aus dem Kern
function buildMesh(f: Extrude, kind: 'sketch' | 'preview' | 'outline') {
  let g: THREE.BufferGeometry;
  if (Math.abs(f.d) < 1e-6) g = new THREE.ShapeGeometry(shapeOf(f), 64);
  else {
    g = new THREE.ExtrudeGeometry(shapeOf(f), { depth: Math.abs(f.d), bevelEnabled: false, curveSegments: 64 });
    if (f.d < 0) g.translate(0, 0, f.d);
  }
  const sel = f.id === selId;
  const mat = new THREE.MeshStandardMaterial({
    color: sel ? 0xff9a3c : 0x4da3ff, transparent: true, opacity: kind === 'outline' ? 0 : 0.4, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(g, mat);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20),
    new THREE.LineBasicMaterial({ color: sel ? 0xffd2a8 : 0x8cc4ff, depthTest: kind !== 'outline' }));
  edges.raycast = () => {};
  mesh.add(edges);
  if (kind !== 'sketch') mesh.raycast = () => {};
  mesh.matrixAutoUpdate = false;
  mesh.matrix.makeBasis(V(f.u), V(f.v), V(f.n)).setPosition(V(f.o));
  mesh.userData.id = f.id;
  return mesh;
}

function bodyMesh(m: NonNullable<Extract<FromWorker, { type: 'built' }>['mesh']>) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.vertices, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setIndex(new THREE.BufferAttribute(m.triangles, 1));
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: 0xc9ced6, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  }));
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(m.lines, 3));
  mesh.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x1a1d22 }))); // Kanten sind anklickbar
  return mesh;
}

// Ausgewählte Rundung/Fase: Punkt auf der ursprünglichen Kante
function edgeMarker(f: EdgeOp) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 8), new THREE.MeshBasicMaterial({ color: 0xff9a3c, depthTest: false }));
  m.position.fromArray(f.at);
  m.raycast = () => {};
  return m;
}

function disposeGroup(gr: THREE.Object3D) {
  gr.traverse((o: any) => { o.geometry?.dispose(); o.material?.dispose(); });
  gr.clear();
}
// ---------- Kern (Web Worker) ----------
// Höchstens eine Berechnung gleichzeitig; Änderungen während des Rechnens werden zur nächsten zusammengefasst
const worker = new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' });
const send = (m: ToWorker) => worker.postMessage(m);
let busy = false, pending = false;
function requestBuild() {
  if (!ready || busy) { pending = true; return; }
  busy = true; pending = false;
  send({ type: 'build', features });
}
worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
  if (data.type === 'ready') { ready = true; setTool(tool); requestBuild(); }
  else if (data.type === 'error') $('hint').textContent = 'CAD-Kern konnte nicht geladen werden: ' + data.message;
  else if (data.type === 'built') {
    disposeGroup(bodyGroup);
    if (data.mesh) bodyGroup.add(bodyMesh(data.mesh));
    bodyGroup.updateMatrixWorld(true);
    showHint(data.failed.length ? `Features ${data.failed.join(', ')} konnten nicht berechnet werden` : HINTS[tool]);
    busy = false;
    if (pending) requestBuild();
  } else if (data.blob) download(`modell.${data.format}`, data.blob);
  else alert('Noch kein Körper vorhanden.');
};

function rebuild() {
  requestBuild();
  disposeGroup(group);
  for (const f of features) {
    if (f.type === 'import') continue;
    if (!isExtrude(f)) { if (f.id === selId) group.add(edgeMarker(f)); }
    else if (Math.abs(f.d) < 1e-6) group.add(buildMesh(f, 'sketch'));
    else if (f.id === selId) group.add(buildMesh(f, 'outline'));
  }
  group.updateMatrixWorld(true);
  disposeGroup(handles);
  const s = getSel();
  if (s && isExtrude(s) && s.type === 'poly') s.pts!.forEach(([x, y], i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(5 * pxSize(), 12, 6), new THREE.MeshBasicMaterial({ color: 0xffd2a8, depthTest: false }));
    m.position.copy(V(s.o).addScaledVector(V(s.u), x).addScaledVector(V(s.v), y));
    m.renderOrder = 1;
    m.userData.i = i;
    handles.add(m);
  });
  handles.updateMatrixWorld(true);
}
function refresh() { rebuild(); renderPanel(); save(); }

// ---------- Eingabe-Helfer ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function setRay(e: PointerEvent) {
  const r = el.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
// Treffer auf Fläche (Körper oder Skizze) und auf Körperkante. Flache Skizzen liegen auf Flächen und haben Vorrang;
// eine Kante zählt, wenn sie höchstens ein paar Pixel neben dem Mauszeiger und nicht hinter der Fläche liegt.
type Hit = { point: THREE.Vector3; n: THREE.Vector3; grip: Grip | null };
type EdgeHit = { at: Vec; dir: Vec };
function pick(): { face: Hit | null; edge: EdgeHit | null } {
  const px = pxSize();
  ray.params.Line.threshold = 6 * px;
  const hs = ray.intersectObjects([...bodyGroup.children, ...group.children], true);
  const faces = hs.filter(h => h.face), eh = hs.find(h => !h.face);
  const fh = faces.find(h => h.object.userData.id && h.distance < faces[0].distance + 0.05) ?? faces[0];
  let face: Hit | null = null, edge: EdgeHit | null = null;
  if (fh) {
    const n = fh.face!.normal.clone().transformDirection(fh.object.matrixWorld).normalize();
    const id = fh.object.userData.id, f = features.find(f => f.id === id);
    const grip: Grip | null = f && isExtrude(f) ? { f, part: 'end', k: 1 } : ownerOf(features, fh.point.toArray(), n.toArray());
    face = { point: fh.point.clone(), n, grip };
  }
  if (eh && (!fh || eh.distance < fh.distance + 12 * px)) {
    const pos = (eh.object as THREE.LineSegments).geometry.attributes.position as THREE.BufferAttribute;
    const a = new THREE.Vector3().fromBufferAttribute(pos, eh.index!), b = new THREE.Vector3().fromBufferAttribute(pos, eh.index! + 1);
    const at = new THREE.Line3(a, b).closestPointToPoint(eh.point, true, new THREE.Vector3()); // genau auf die Kante legen
    edge = { at: at.toArray() as Vec, dir: b.sub(a).normalize().toArray() as Vec };
  }
  return { face, edge };
}
function planeHit(pl: Frame) {
  const P = new THREE.Plane().setFromNormalAndCoplanarPoint(V(pl.n), V(pl.o));
  return ray.ray.intersectPlane(P, new THREE.Vector3());
}
function toLocal(pl: Frame, p: THREE.Vector3) { const d = p.clone().sub(V(pl.o)); return [d.dot(V(pl.u)), d.dot(V(pl.v))]; }
const snap = (x: number, e: PointerEvent, s = 1) => e.shiftKey ? x : Math.round(x / s) * s;
// Parameter s auf der Geraden P0 + s*D, der dem Mausstrahl am nächsten liegt
function lineParam(P0: THREE.Vector3, D: THREE.Vector3) {
  const R0 = ray.ray.origin, E = ray.ray.direction, w0 = P0.clone().sub(R0);
  const b = D.dot(E), d = D.dot(w0), e = E.dot(w0), den = 1 - b * b;
  return Math.abs(den) < 1e-6 ? null : (b * e - d) / den;
}
const hud = $('hud');
function showHud(e: PointerEvent, text: string) { hud.style.display = 'block'; hud.style.left = e.clientX + 16 + 'px'; hud.style.top = e.clientY + 16 + 'px'; hud.textContent = text; }

// Richtung von der Kante ins Freie: Summe der Normalen der beiden angrenzenden Flächen (stimmt auch an Innenecken)
function edgeOutward(at: THREE.Vector3): THREE.Vector3 | null {
  const mesh = bodyGroup.children[0] as THREE.Mesh | undefined;
  if (!mesh) return null;
  const pos = mesh.geometry.attributes.position as THREE.BufferAttribute, idx = mesh.geometry.index!;
  const tri = new THREE.Triangle(), q = new THREE.Vector3(), n = new THREE.Vector3(), normals: THREE.Vector3[] = [];
  for (let i = 0; i < idx.count && normals.length < 2; i += 3) {
    tri.setFromAttributeAndIndices(pos, idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
    if (tri.closestPointToPoint(at, q).distanceTo(at) > 0.05) continue;
    tri.getNormal(n);
    if (!normals.some(m => m.dot(n) > 0.99)) normals.push(n.clone());
  }
  return normals.length === 2 ? normals[0].add(normals[1]).normalize() : null;
}

// Größe eines Bildschirmpixels in mm auf Höhe des Drehpunkts
const pxSize = () => 2 * camera.position.distanceTo(controls.target) * Math.tan(camera.fov * Math.PI / 360) / el.clientHeight;
// Skizzenebene: Boden oder die angeklickte Fläche
function planeFor(h: Hit | null): Frame {
  if (!h) return GROUND;
  const n = h.n, helper = Math.abs(n.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = helper.clone().cross(n).normalize(), v = n.clone().cross(u);
  const o = n.clone().multiplyScalar(n.dot(h.point)); // Lotpunkt des Ursprungs: Raster liegt wie auf dem Boden, nicht am Klickpunkt
  return { o: o.toArray() as Vec, n: n.toArray() as Vec, u: u.toArray() as Vec, v: v.toArray() as Vec };
}

// Skizze des aufgezogenen Werkzeugs zwischen a und b
let sides = 6, typed = ''; // Ecken des n-Ecks; eingetippte Maße
function toolFeature(pl: Frame, a: number[], b: number[], onFace: boolean): Extrude | null {
  if (tool === 'ngon') return Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5 ? null : polyFeature(pl, ngonPts(a, b, sides), nextId, onFace);
  if (tool === 'slot') return Math.min(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) < 0.5 ? null : polyFeature(pl, slotPts(a, b), nextId, onFace);
  return sketchFeature(tool as 'rect' | 'circle', pl, a, b, nextId, onFace);
}
function hudText(f: Extrude) {
  return f.type === 'rect' ? `${f.p.w.toFixed(1)} × ${f.p.h.toFixed(1)} mm` : f.type === 'circle' ? `R ${f.p.r.toFixed(1)} mm`
    : tool === 'ngon' ? `${sides}-Eck R ${Math.hypot(f.pts![0][0] - drag.a[0], f.pts![0][1] - drag.a[1]).toFixed(1)} mm` : 'Langloch';
}
function finishSketch(b?: number[]) {
  if (b) drag.b = b;
  disposeGroup(preview);
  const f = toolFeature(drag.pl, drag.a, drag.b, drag.onFace);
  if (f) { pushHistory(); nextId++; features.push(f); selId = f.id; setTool('select'); }
}
// Eingetippte Maße anwenden: Rechteck/Langloch „B x T“, Kreis/n-Eck Radius (Richtung der Maus), Linie Länge in Mausrichtung
function applyTyped() {
  const v = typed.split(/[x*; ]+/).map(Number).filter(n => isFinite(n) && n > 0);
  typed = '';
  hud.style.display = 'none';
  if (!v.length) return;
  if (drag?.kind === 'sketch') {
    const { a, b } = drag, dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const end = tool === 'rect' || tool === 'slot' ? [a[0] + (Math.sign(dx) || 1) * v[0], a[1] + (Math.sign(dy) || 1) * (v[1] ?? v[0])]
      : [a[0] + (l > 1e-6 && dx ? dx / l : 1) * v[0], a[1] + (dy / l) * v[0]];
    finishSketch(end);
    drag = null; controls.enabled = true; refresh();
  } else if (poly?.pts.length && poly.hover) {
    const last = poly.pts.at(-1)!, dx = poly.hover[0] - last[0], dy = poly.hover[1] - last[1], l = Math.hypot(dx, dy);
    if (l < 1e-6) return;
    poly.pts.push([last[0] + dx / l * v[0], last[1] + dy / l * v[0]]);
    showPoly(poly.pts);
  }
}

// ---------- Linien-Werkzeug: Vieleck Punkt für Punkt ----------
let poly: { pl: Frame; pts: number[][]; onFace: boolean; smooth: boolean; hover?: number[] } | null = null;
function polyPoint(e: PointerEvent) {
  return poly && sketchPoint(poly.pl, e);
}
function showPoly(pts: number[][]) {
  disposeGroup(preview);
  const { o, u, v } = poly!.pl;
  const world = contour(pts, poly!.smooth, false).map(([x, y]) => V(o).addScaledVector(V(u), x).addScaledVector(V(v), y));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(world), new THREE.LineBasicMaterial({ color: 0x4da3ff, depthTest: false }));
  const start = new THREE.Mesh(new THREE.SphereGeometry(4 * pxSize(), 12, 6), new THREE.MeshBasicMaterial({ color: 0x4da3ff, depthTest: false }));
  start.position.copy(world[0]);
  preview.add(line, start);
}
// Punkt auf der Skizzenebene unter der Maus, eingerastet an Punkte und Linien auf dieser Ebene, sonst ans Raster
function sketchPoint(pl: Frame, e: PointerEvent) {
  const p = planeHit(pl);
  if (!p) return null;
  const pts = snapPoints(pl), s = !e.shiftKey && snapTo(p.toArray() as Vec, pts, snapSegs(pl), 8 * pxSize());
  snapMark.visible = !!s;
  if (!s) { // waagrecht/senkrecht zu einem Punkt ausrichten, sonst Raster
    const raw = toLocal(pl, p), loc = pts.map(q => toLocal(pl, V(q)));
    const { ax, ay } = e.shiftKey ? { ax: null, ay: null } : alignTo(raw, loc, 8 * pxSize());
    const q = [ax ? ax[0] : snap(raw[0], e), ay ? ay[1] : snap(raw[1], e)];
    const world = (r: number[]) => V(pl.o).addScaledVector(V(pl.u), r[0]).addScaledVector(V(pl.v), r[1]);
    guides.geometry.setFromPoints([ax, ay].filter(a => a).flatMap(a => [world(a!), world(q)]));
    guides.visible = !!(ax || ay);
    return q;
  }
  snapMark.position.fromArray(s.p);
  snapMark.scale.setScalar((s.kind === 'point' ? 5 : 3) * pxSize());
  return toLocal(pl, V(s.p));
}
const onPlane = (pl: Frame, q: ArrayLike<number>) => Math.abs(V(q).sub(V(pl.o)).dot(V(pl.n))) < 1e-3;
function snapPoints(pl: Frame): Vec[] {
  const own = poly ? keyPoints({ ...poly.pl, id: 0, type: 'poly', p: {}, pts: poly.pts, d: 0 }) : []; // Punkte der Linie, die gerade entsteht
  return [[0, 0, 0] as Vec, ...own, ...features.filter(isExtrude).flatMap(keyPoints)].filter(q => onPlane(pl, q));
}
// Körperkanten und Linien flacher Skizzen
function snapSegs(pl: Frame): Vec[][] {
  const segs: Vec[][] = [];
  const lines = (bodyGroup.children[0]?.children[0] as THREE.LineSegments | undefined)?.geometry.attributes.position.array;
  for (let i = 0; lines && i < lines.length; i += 6) segs.push([[lines[i], lines[i + 1], lines[i + 2]], [lines[i + 3], lines[i + 4], lines[i + 5]]]);
  for (const f of features) {
    if (!isExtrude(f) || Math.abs(f.d) > 1e-6) continue;
    const w = (f.type === 'poly' ? contour(f.pts!, f.smooth) : shapeOf(f).getPoints(32).map(v => [v.x, v.y]))
      .map(([x, y]) => [0, 1, 2].map(k => f.o[k] + x * f.u[k] + y * f.v[k]) as Vec);
    w.forEach((q, i) => segs.push([q, w[(i + 1) % w.length]]));
  }
  return segs.filter(([a, b]) => onPlane(pl, a) && onPlane(pl, b));
}

// Bogen vom letzten Punkt nach q, tangential an das vorige Segment
function arcPts(q: number[]) {
  const pts = poly!.pts, a = pts.at(-2)!, b = pts.at(-1)!;
  const bulge = tangentBulge(endTangent(a, b, a[2] ?? 0), b, q);
  return [...pts.slice(0, -1), [b[0], b[1], bulge], q];
}
const nearPt = (q: number[] | null, p?: number[]) => !!q && !!p && Math.hypot(q[0] - p[0], q[1] - p[1]) < 8 * pxSize();
function finishPoly() {
  const f = poly && polyFeature(poly.pl, poly.pts, nextId, poly.onFace, poly.smooth);
  cancelPoly();
  if (f) { pushHistory(); nextId++; features.push(f); selId = f.id; setTool('select'); refresh(); }
}
function cancelPoly() { poly = null; disposeGroup(preview); hud.style.display = 'none'; }

// ---------- Werkzeuge ----------
function onDown(e: PointerEvent) {
  if (e.button !== 0 || !ready) return;
  setRay(e);
  const { face: h, edge } = pick();
  const hp = tool === 'select' ? ray.intersectObjects(handles.children)[0] : undefined;
  if (tool === 'line' || tool === 'spline') {
    if (!poly) poly = { pl: planeFor(h), pts: [], onFace: !!h, smooth: tool === 'spline' };
    const q = polyPoint(e), last = poly.pts.at(-1);
    // Druck auf den letzten Punkt: beim Ziehen entsteht ein Bogen; sonst setzt der Klick einen Punkt
    const arc = !poly.smooth && poly.pts.length >= 2 && nearPt(q, last);
    drag = { kind: 'line', arc, sx: e.clientX, sy: e.clientY, started: false }; // drag hält auch die Kamera still
    if (!arc && poly.pts.length >= 3 && nearPt(q, poly.pts[0])) finishPoly();
    else if (!arc && q && !(last && q[0] === last[0] && q[1] === last[1])) poly.pts.push(q);
  } else if (tool === 'rect' || tool === 'circle' || tool === 'ngon' || tool === 'slot') {
    const pl = planeFor(h); // auf Boden oder Fläche skizzieren
    const a = sketchPoint(pl, e);
    if (!a) return;
    drag = { kind: 'sketch', pl, a, b: a, onFace: !!h };
  } else if (hp) { // Punkt der ausgewählten Skizze
    const f = getSel() as Extrude;
    drag = { kind: 'point', f, f0: structuredClone(f), i: hp.object.userData.i, sx: e.clientX, sy: e.clientY, started: false };
  } else if (edge) { // Kante: Rundung entsteht erst beim Ziehen
    drag = { kind: 'edge', f: null, edge, P0: V(edge.at), sx: e.clientX, sy: e.clientY, started: false };
  } else {
    if (!h?.grip) { if (selId !== null) { selId = null; refresh(); } return; } // Leere: Orbit
    const g = h.grip;
    selId = g.f.id; refresh();
    if (g.part === 'import') return; // importierte Körper nur auswählen
    drag = g.part === 'edge'
      ? { kind: 'edge', f: g.f, P0: V(g.f.at), sx: e.clientX, sy: e.clientY, started: false }
      : { kind: 'push', f: g.f, f0: structuredClone(g.f), part: g.part, k: g.k, i: g.i, P0: h.point, D: h.n, sx: e.clientX, sy: e.clientY, started: false };
  }
  controls.enabled = false;
  el.setPointerCapture(e.pointerId);
}

el.addEventListener('pointermove', onMove);
function onMove(e: PointerEvent) {
  if (!ready) return;
  setRay(e);
  hideSnap();
  if (!drag && ['rect', 'circle', 'ngon', 'slot'].includes(tool)) sketchPoint(planeFor(pick().face), e); // Einrasten schon vor dem Klick zeigen
  if (poly && !drag) {
    const q = polyPoint(e);
    if (!q || !poly.pts.length) return;
    const last = poly.pts.at(-1)!;
    poly.hover = q;
    showPoly([...poly.pts, q]);
    return showHud(e, typed ? `Länge: ${typed}` : `${Math.hypot(q[0] - last[0], q[1] - last[1]).toFixed(1)} mm`);
  }
  if (!drag) {
    const h = tool === 'select' && pick();
    el.style.cursor = !h ? 'crosshair' : h.edge || h.face?.grip ? 'grab' : 'default';
    return;
  }
  if (drag.kind === 'line') {
    if (!drag.arc || !poly) return;
    if (!drag.started && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
    drag.started = true;
    const q = polyPoint(e);
    if (!q) return;
    const pts = arcPts(nearPt(q, poly.pts[0]) ? poly.pts[0] : q), b = pts.at(-2)!, L = Math.hypot(q[0] - b[0], q[1] - b[1]);
    showPoly(pts);
    return showHud(e, `Bogen R ${(L / 2 / Math.abs(Math.sin(2 * Math.atan(b[2])) || 1e-9)).toFixed(1)} mm`);
  }
  if (drag.kind === 'sketch') {
    const b = sketchPoint(drag.pl, e);
    if (!b) return;
    drag.b = b;
    const f = toolFeature(drag.pl, drag.a, drag.b, drag.onFace);
    disposeGroup(preview);
    if (f) {
      preview.add(buildMesh(f, 'preview'));
      showHud(e, typed ? `Maß: ${typed}` : hudText(f));
    }
  } else {
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.started = true; pushHistory(); el.style.cursor = 'grabbing';
      const r = drag.kind === 'push' && Math.abs(drag.f.d) < 1e-6 && regionFeature(features, drag.f, drag.P0.toArray(), nextId);
      if (r) { nextId++; features.push(r); drag.f = r; drag.f0 = structuredClone(r); selId = r.id; } // nur den Bereich ziehen
    }
    if (drag.kind === 'edge') { // Radius = Abstand des Mauszeigers von der Kante
      if (!drag.f) {
        // Erste Bewegung entscheidet: vom Körper weg = Rundung, in den Körper hinein = Fase
        const out = edgeOutward(drag.P0), a = drag.P0.clone().project(camera), b = out && drag.P0.clone().add(out).project(camera);
        const inward = b && (b.x - a.x) * (e.clientX - drag.sx) - (b.y - a.y) * (e.clientY - drag.sy) < 0;
        drag.f = { id: nextId++, type: inward ? 'chamfer' : 'fillet', at: drag.edge.at, dir: drag.edge.dir, r: 1 } satisfies EdgeOp;
        features.push(drag.f); selId = drag.f.id;
      }
      drag.f.r = Math.max(0.5, snap(ray.ray.distanceToPoint(drag.P0), e, 0.5));
      rebuild();
      return showHud(e, `${drag.f.type === 'fillet' ? 'Radius' : 'Fase'}: ${drag.f.r.toFixed(1)} mm`);
    }
    if (drag.kind === 'point') {
      const p = planeHit(drag.f);
      if (!p) return;
      const q = toLocal(drag.f, p).map(x => snap(x, e));
      movePoint(drag.f, drag.f0, drag.i, q);
      rebuild();
      return showHud(e, `Punkt ${q[0].toFixed(1)} / ${q[1].toFixed(1)} mm`);
    }
    const s = lineParam(drag.P0, drag.D);
    if (s === null) return;
    const [label, val] = applyPush(drag.f, drag.f0, drag.part, drag.k, snap(s, e, 0.5), drag.i);
    rebuild();
    showHud(e, `${label}: ${val.toFixed(1)} mm${isCut(drag.f) ? ' (Schnitt)' : ''}`);
  }
}

el.addEventListener('pointerup', e => {
  if (!drag) return;
  onMove(e); // Endposition übernehmen
  hud.style.display = 'none';
  if (drag.kind === 'sketch') finishSketch();
  if (drag.kind === 'line' && drag.arc && drag.started && poly) {
    const q = polyPoint(e), first = poly.pts[0];
    if (q && nearPt(q, first)) { poly.pts = arcPts(first).slice(0, -1); finishPoly(); } // Bogen schließt die Form
    else if (q) poly.pts = arcPts(q);
  }
  hideSnap();
  const wasLine = drag.kind === 'line';
  if (drag.kind === 'push' && drag.f.and && Math.abs(drag.f.d) < 1e-6) features = features.filter(f => f !== drag.f); // flacher Bereich bringt nichts
  drag = null;
  controls.enabled = true;
  if (!wasLine) refresh();
});

// ---------- UI ----------
function setTool(t: Tool) {
  if (t !== tool) cancelPoly();
  typed = '';
  tool = t;
  document.querySelectorAll<HTMLButtonElement>('#toolbar button').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  showHint(HINTS[t]);
}
document.querySelectorAll<HTMLButtonElement>('#toolbar button').forEach(b => b.onclick = () => setTool(b.dataset.tool as Tool));

const panel = $('panel');
function renderPanel() {
  const f = getSel();
  if (!f) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  if (f.type === 'import') return renderImportPanel(f);
  if (!isExtrude(f)) return renderEdgePanel(f);
  const fields = f.type === 'rect' ? [['X', 'p.x'], ['Y', 'p.y'], ['Breite', 'p.w'], ['Tiefe', 'p.h'], ['Höhe', 'd']]
    : f.type === 'circle' ? [['Mitte X', 'p.cx'], ['Mitte Y', 'p.cy'], ['Radius', 'p.r'], ['Höhe', 'd']]
    : [['Höhe', 'd']];
  const get = (k: string): number => k.split('.').reduce((o: any, p) => o[p], f);
  const name = isCut(f) ? (f.type === 'circle' ? 'Bohrung' : 'Tasche') : (f.smooth ? 'Spline' : { rect: 'Rechteck', circle: 'Kreis', poly: 'Profil' }[f.type]);
  panel.innerHTML = `<h3>${name} #${f.id}</h3>` +
    fields.map(([l, k]) => `<label>${l} <input type="number" step="0.5" data-k="${k}" value="${+get(k).toFixed(2)}"></label>`).join('') +
    (Math.abs(f.d) < 1e-6 && !f.and && !f.smooth ? `<label>Versatz <input type="number" step="0.5" value="2" class="off"></label><button class="addOff">Versatz anlegen</button>` : '') +
    `<button class="del">Löschen</button>`;
  const addOff = panel.querySelector<HTMLButtonElement>('.addOff');
  if (addOff) addOff.onclick = () => { // neue Skizze außen (> 0) bzw. innen (< 0) um die ausgewählte
    const g = offsetFeature(f, parseFloat(panel.querySelector<HTMLInputElement>('.off')!.value) || 0, nextId);
    if (!g) return showHint('Versatz zu groß: von der Skizze bleibt nichts übrig');
    pushHistory(); nextId++; features.push(g); selId = g.id; refresh();
  };
  panel.querySelectorAll<HTMLInputElement>('input[data-k]').forEach(inp => inp.onchange = () => {
    const v = parseFloat(inp.value);
    if (!isFinite(v)) return;
    pushHistory();
    const ks = inp.dataset.k!.split('.'), key = ks.at(-1)!;
    const obj: any = ks.length > 1 ? f.p : f;
    obj[key] = ['w', 'h', 'r'].includes(key) ? Math.max(0.5, v) : v;
    refresh();
  });
  panel.querySelector<HTMLButtonElement>('.del')!.onclick = deleteSel;
}
function renderImportPanel(f: Import) {
  panel.innerHTML = `<h3>Import #${f.id}</h3><p></p><button class="del">Löschen</button>`;
  panel.querySelector('p')!.textContent = f.name; // Dateiname nicht als HTML einsetzen
  panel.querySelector<HTMLButtonElement>('.del')!.onclick = deleteSel;
}
function renderEdgePanel(f: EdgeOp) {
  panel.innerHTML = `<h3>${f.type === 'fillet' ? 'Rundung' : 'Fase'} #${f.id}</h3>
    <label>Art <select><option value="fillet">Rundung</option><option value="chamfer">Fase</option></select></label>
    <label>${f.type === 'fillet' ? 'Radius' : 'Abstand'} <input type="number" step="0.5" min="0.5" value="${+f.r.toFixed(2)}"></label>
    <button class="del">Löschen</button>`;
  const sel = panel.querySelector('select')!, inp = panel.querySelector('input')!;
  sel.value = f.type;
  sel.onchange = () => { pushHistory(); f.type = sel.value as EdgeOp['type']; refresh(); };
  inp.onchange = () => {
    const v = parseFloat(inp.value);
    if (!isFinite(v)) return;
    pushHistory(); f.r = Math.max(0.5, v); refresh();
  };
  panel.querySelector<HTMLButtonElement>('.del')!.onclick = deleteSel;
}
function deleteSel() {
  if (!getSel()) return;
  pushHistory(); features = features.filter(f => f.id !== selId); selId = null; refresh();
}

function download(name: string, blob: Blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('bNew').onclick = () => { if (features.length) { pushHistory(); features = []; selId = null; refresh(); } };
$('bUndo').onclick = undo;
$('bRedo').onclick = redo;
$('bView').onclick = resetView;
$('bSave').onclick = () => download('modell.json', new Blob([snapshot()], { type: 'application/json' }));
const fileIn = $<HTMLInputElement>('fileIn');
$('bOpen').onclick = () => fileIn.click();
// .json = eigenes Modell öffnen, .step/.stp = Körper ins Modell importieren
fileIn.onchange = async () => {
  const file = fileIn.files?.[0];
  fileIn.value = '';
  if (!file) return;
  const text = await file.text();
  pushHistory();
  if (!/\.(step|stp)$/i.test(file.name)) return restore(text);
  const f: Import = { id: nextId++, type: 'import', name: file.name, step: text };
  features.push(f); selId = f.id; refresh();
};
$('bStl').onclick = () => send({ type: 'export', format: 'stl' });
$('bStep').onclick = () => send({ type: 'export', format: 'step' });

addEventListener('keydown', e => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  // Maße tippen, solange ein Rechteck/Kreis aufgezogen wird oder eine Linie entsteht
  if ((drag?.kind === 'sketch' || poly?.pts.length) && !e.ctrlKey) {
    if (/^[0-9.x ]$/.test(k) || k === ',' ) { typed += k === ',' ? '.' : k; hud.style.display = 'block'; hud.textContent = `Maß: ${typed}`; return; }
    if (k === 'backspace' && typed) { typed = typed.slice(0, -1); hud.textContent = `Maß: ${typed}`; return; }
    if (k === 'enter' && typed) return applyTyped();
    if (drag?.kind === 'sketch' && tool === 'ngon' && (k === '+' || k === '-')) { sides = Math.max(3, Math.min(24, sides + (k === '+' ? 1 : -1))); return showHint(`${sides} Ecken`); }
  }
  if (e.ctrlKey && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (e.ctrlKey && k === 'y') { e.preventDefault(); redo(); }
  else if (k === 'v') setTool('select');
  else if (k === 'r') setTool('rect');
  else if (k === 'c') setTool('circle');
  else if (k === 'n') setTool('ngon');
  else if (k === 'o') setTool('slot');
  else if (k === 'l') setTool('line');
  else if (k === 's') setTool('spline');
  else if (k === 'enter' && poly) finishPoly();
  else if (k === 'delete' || k === 'backspace') deleteSel();
  else if (k === 'escape') { typed = ''; cancelPoly(); drag = null; disposeGroup(preview); controls.enabled = true; selId = null; setTool('select'); refresh(); }
});

function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
renderer.setAnimationLoop(() => {
  controls.update(); renderer.render(scene, camera);
  updateScale();
});

try { const s = localStorage.getItem('openform'); if (s) ({ features, nextId } = JSON.parse(s)); } catch {}
refresh();

// Maßstab: runde Länge (1, 2 oder 5 × 10ⁿ mm), die auf Höhe des Drehpunkts etwa 100 Pixel lang ist
const scaleBar = $('scale');
function updateScale() {
  const mm = 100 * pxSize(), e = 10 ** Math.floor(Math.log10(mm)), nice = [5, 2, 1].find(k => k * e <= mm)! * e;
  const label = nice >= 1 ? `${nice} mm` : `${+nice.toFixed(3)} mm`;
  (scaleBar.firstElementChild as HTMLElement).style.width = `${nice / pxSize()}px`;
  if (scaleBar.lastElementChild!.textContent !== label) scaleBar.lastElementChild!.textContent = label;
}
