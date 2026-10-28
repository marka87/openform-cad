import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { bodyOf, pushTo, movesAfter, type Move, type Combine, isFlat, alignTo, applyPush, mirroredCopy, movedCopy, ngonPts, slotPts, contour, endTangent, keyPoints, movePoint, snapTo, offsetFeature, regionFeature, GROUND, isCut, isExtrude, outline, ownerOf, polyFeature, sketchFeature, tangentBulge, type EdgeOp, type Shell, type Extrude, type Con, type Feature, type Frame, type Grip, type Import, type Vec } from './model';
import type { BodyMesh, FromWorker, ToWorker } from './kernel.worker';
import { GcsWrapper, init_planegcs_module } from '@salusoft89/planegcs';
import gcsWasm from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import { solveSketch } from './sketchSolver';

type Tool = 'measure' | 'shell' | 'select' | 'rect' | 'circle' | 'ngon' | 'slot' | 'line' | 'spline';
const V = (a: ArrayLike<number>) => new THREE.Vector3().fromArray(a as number[]);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const HINTS: Record<Tool, string> = {
  select: 'Fläche ziehen = extrudieren / Größe ändern · Kante wegziehen = runden, hineinschieben = fasen · Punkte einer ausgewählten Skizze ziehen · Linksziehen ins Leere = drehen · Rechts = verschieben',
  rect:   'Auf Boden oder Fläche ziehen, um ein Rechteck zu skizzieren · beim Ziehen „20x10“ tippen + Enter = genaues Maß',
  circle: 'Vom Mittelpunkt aus ziehen, um einen Kreis zu skizzieren · beim Ziehen Zahl tippen + Enter = Radius',
  ngon:   'Vom Mittelpunkt aus ziehen = Vieleck · beim Ziehen + / − = mehr/weniger Ecken · Zahl tippen + Enter = Radius',
  slot:   'Rechteck aufziehen = Langloch mit runden Enden · Zahl tippen + Enter = Länge x Breite',
  measure: 'Zwei Punkte anklicken (Ecken und Kanten rasten ein) = Abstand · dritter Klick beginnt neu',
  shell:  'Fläche des Körpers anklicken, die offen bleiben soll · Wandstärke im Seitenfeld',
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
const guides = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthTest: false }));
guides.frustumCulled = false; scene.add(guides);
const snapTip = document.getElementById('snapTip')!;
const hideSnap = () => { snapMark.visible = false; guides.visible = false; snapTip.style.display = 'none'; };
// Beschriftung neben dem Einrastpunkt, wie in SketchUp
function showSnapTip(p: THREE.Vector3, text: string) {
  const s = p.clone().project(camera), r = el.getBoundingClientRect();
  snapTip.textContent = text;
  snapTip.style.display = 'block';
  snapTip.style.left = `${r.left + (s.x + 1) / 2 * r.width + 12}px`;
  snapTip.style.top = `${r.top + (1 - s.y) / 2 * r.height - 22}px`;
}

// Eigene Listener VOR OrbitControls registrieren, damit Werkzeuge Linksklicks übernehmen können
el.addEventListener('pointerdown', onDown);
const controls = new OrbitControls(camera, el);
controls.enableDamping = true;
controls.zoomToCursor = true; // Mausrad zoomt dorthin, wo die Maus steht
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
function resetView() { camera.position.set(140, 110, 160); controls.target.set(0, 0, 0); }
resetView();

// ---------- Modell ----------
let features: Feature[] = [], nextId = 1, selId: number | null = null, tool: Tool = 'select';
let drag: any = null, ready = false;
const multi = new Set<number>();  // weitere ausgewählte Features (Shift+Klick)
let edgeSel: { at: Vec; dir: Vec; body?: number }[] = []; // angeklickte Kanten, zum gemeinsamen Runden/Fasen
const clearSel = () => { selId = selBody = null; multi.clear(); edgeSel = []; };
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
// Warnung, die auch die nächste Kern-Meldung überdauert
let notice = '';
function showNotice(text: string) { notice = text; showHint(text); }
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
function buildMesh(f: Extrude, kind: 'sketch' | 'preview' | 'outline' | 'add' | 'cut') {
  let g: THREE.BufferGeometry;
  if (Math.abs(f.d) < 1e-6) g = new THREE.ShapeGeometry(shapeOf(f), 64);
  else {
    g = new THREE.ExtrudeGeometry(shapeOf(f), { depth: Math.abs(f.d), bevelEnabled: false, curveSegments: 64 });
    if (f.d < 0) g.translate(0, 0, f.d);
  }
  const sel = f.id === selId;
  const mat = new THREE.MeshStandardMaterial({
    color: kind === 'add' ? 0x4cd964 : kind === 'cut' ? 0xff4d4d : sel ? 0xff9a3c : 0x4da3ff, transparent: true,
    opacity: kind === 'outline' ? 0 : kind === 'add' || kind === 'cut' ? 0.3 : 0.4, depthWrite: false, depthTest: kind !== 'cut',
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

function bodyMesh(m: BodyMesh) {
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
  // Hervorheben beim Überfahren: teilen sich die Puffer des Körpers, zeigen per drawRange nur eine Fläche bzw. Kante
  const hf = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: 0xff9a3c, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  hf.geometry.setAttribute('position', g.attributes.position); hf.geometry.setIndex(g.index);
  const he = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff9a3c, depthTest: false }));
  he.geometry.setAttribute('position', eg.attributes.position);
  for (const o of [hf, he]) { o.visible = false; o.raycast = () => {}; o.renderOrder = 3; mesh.add(o); }
  Object.assign(mesh.userData, { body: m.body, faces: m.faces, edges: m.edges, hf, he });
  return mesh;
}

// Ausgewählte Rundung/Fase: Punkt auf der ursprünglichen Kante
function edgeMarker(f: { at: Vec }) {
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
    for (const m of data.meshes) bodyGroup.add(bodyMesh(m));
    bodyGroup.updateMatrixWorld(true);
    bodyIds = data.meshes.map(m => m.body);
    if (selBody !== null && !bodyIds.includes(selBody)) { selBody = null; renderPanel(); }
    if (gizmo.object) attachGizmo(gizmo.mode as 'translate' | 'rotate'); // Griffe an die neue Lage setzen
    applyDisplay();
    bodyInfo = data.volume ? ` · ${(data.volume / 1000).toFixed(2)} cm³ · ${(data.area / 100).toFixed(1)} cm²` : '';
    renderTree();
    showHint(data.failed.length ? `Features ${data.failed.join(', ')} konnten nicht berechnet werden` : notice || HINTS[tool]);
    notice = '';
    busy = false;
    if (pending) requestBuild();
  } else if (data.blob) download(`modell.${data.format}`, data.blob);
  else alert('Noch kein Körper vorhanden.');
};

function rebuild() {
  requestBuild();
  disposeGroup(group);
  features.forEach((f, i) => {
    if (f.type === 'import' || f.hidden) return;
    const M = moveMatrix(movesAfter(features, i));
    const o = !isExtrude(f) ? ('at' in f && f.id === selId ? edgeMarker(f) : null)
      : isFlat(f) ? buildMesh(f, 'sketch')
      : drag?.kind === 'push' && drag.started && drag.f === f ? buildMesh(f, isCut(f) ? 'cut' : 'add')
      : f.id === selId || multi.has(f.id) ? buildMesh(f, 'outline') : null;
    if (!o) return;
    if (o.matrixAutoUpdate) o.updateMatrix();
    o.matrixAutoUpdate = false;
    o.matrix.premultiply(M);
    group.add(o);
  });
  for (const a of edgeSel) group.add(edgeMarker(a));
  group.updateMatrixWorld(true);
  disposeGroup(handles);
  const s = getSel();
  if (s && isExtrude(s) && s.type === 'poly' && !movesAfter(features, features.indexOf(s)).length) s.pts!.forEach(([x, y], i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(5 * pxSize(), 12, 6), new THREE.MeshBasicMaterial({ color: 0xffd2a8, depthTest: false }));
    m.position.copy(V(s.o).addScaledVector(V(s.u), x).addScaledVector(V(s.v), y));
    m.renderOrder = 1;
    m.userData.i = i;
    handles.add(m);
  });
  handles.updateMatrixWorld(true);
  buildDims();
}
// Bewegungen als Matrix: x' = R(q)·(x − c) + c + t, in Reihenfolge
function moveMatrix(moves: Move[]) {
  const M = new THREE.Matrix4();
  for (const m of moves) {
    const c = V(m.c);
    M.premultiply(new THREE.Matrix4().makeTranslation(c.clone().negate()))
      .premultiply(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().fromArray(m.q)))
      .premultiply(new THREE.Matrix4().makeTranslation(c.add(V(m.t))));
  }
  return M;
}
// ---------- Abhängigkeiten: Löser (planegcs, WASM) einmal laden, danach synchron ----------
let gcs: GcsWrapper | null = null;
init_planegcs_module({ locateFile: () => gcsWasm }).then((m: any) => { gcs = new GcsWrapper(new m.GcsSystem()); },
  (e: unknown) => console.warn('Skizzen-Löser nicht geladen', e));
// Abhängigkeiten der Skizze f erfüllen, fixed bleiben stehen. false = widerspricht sich, f bleibt unverändert
function constrain(f: Extrude, fixed: number[]) {
  if (!f.cons?.length || !gcs) return true;
  const out = solveSketch(gcs, f.pts!, f.cons, fixed);
  if (out) f.pts = out;
  return !!out;
}

function refresh() { rebuild(); renderPanel(); renderTree(); save(); }

// ---------- Feature-Baum: alle Schritte in Reihenfolge; anklicken = auswählen, ↑ = früher, ● = ein/aus ----------
const tree = $('tree');
let bodyInfo = ''; // Volumen und Oberfläche aller Körper, vom Kern gemeldet
let bodyIds: number[] = [], selBody: number | null = null; // vorhandene Körper (vom Kern) und der ausgewählte
function nameOf(f: Feature) {
  if (f.type === 'import') return 'Import';
  if (f.type === 'shell') return 'Schale';
  if (f.type === 'move') return `Körper #${f.body} bewegen`;
  if (f.type === 'combine') return `#${f.a} ${{ fuse: '+', cut: '−', common: '∩' }[f.op]} #${f.b}`;
  if (!isExtrude(f)) return f.type === 'fillet' ? 'Rundung' : 'Fase';
  if (f.rev) return f.sub ? 'Nut' : 'Drehkörper';
  if (Math.abs(f.d) < 1e-6) return 'Skizze';
  return isCut(f) ? (f.type === 'circle' ? 'Bohrung' : 'Tasche') : f.and ? 'Bereich' : f.smooth ? 'Spline' : { rect: 'Rechteck', circle: 'Kreis', poly: 'Profil' }[f.type];
}
function renderTree() {
  tree.innerHTML = (bodyIds.length ? '<h3>Körper</h3>' + bodyIds.map(b =>
    `<div class="row${b === selBody ? ' on' : ''}" data-b="${b}"><span>Körper #${b}</span></div>`).join('') : '') +
    `<h3>Schritte${bodyInfo}</h3>` + (features.map((f, i) =>
    `<div class="row${f.id === selId || multi.has(f.id) ? ' on' : ''}${f.hidden ? ' off' : ''}" data-i="${i}"><span>${nameOf(f)} #${f.id}</span>` +
    `<button data-a="up" title="früher ausführen">↑</button><button data-a="eye" title="ein-/ausschalten">${f.hidden ? '○' : '●'}</button></div>`).join('')
    || '<em>Noch keine Schritte</em>');
  tree.querySelectorAll<HTMLElement>('.row[data-b]').forEach(row => row.onclick = () => {
    selBody = +row.dataset.b!; selId = null; detachGizmo(); refresh();
  });
  tree.querySelectorAll<HTMLElement>('.row[data-i]').forEach(row => row.onclick = ev => {
    const i = +row.dataset.i!, f = features[i], a = (ev.target as HTMLElement).dataset.a;
    if (a === 'eye') { pushHistory(); f.hidden = !f.hidden; }
    else if (a === 'up') { if (!i) return; pushHistory(); [features[i - 1], features[i]] = [features[i], features[i - 1]]; }
    else if (ev.shiftKey && selId !== null && selId !== f.id) multi.has(f.id) ? multi.delete(f.id) : multi.add(f.id);
    else { clearSel(); selId = f.id; detachGizmo(); }
    refresh();
  });
}

// ---------- Eingabe-Helfer ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function setRay(e: PointerEvent) {
  const r = el.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
// Treffer auf Fläche (Körper oder Skizze) und auf Körperkante. Flache Skizzen liegen auf Flächen und haben Vorrang;
// eine Kante zählt, wenn sie höchstens ein paar Pixel neben dem Mauszeiger und nicht hinter der Fläche liegt.
type Hit = { point: THREE.Vector3; n: THREE.Vector3; grip: Grip | null; body?: number };
type EdgeHit = { at: Vec; dir: Vec; body?: number };
let lastPick: { fh?: THREE.Intersection; eh?: THREE.Intersection } = {};
// Getroffene Fläche bzw. Kante orange hervorheben (ganze B-Rep-Fläche/Kante), Skizzen etwas kräftiger
let hoverSketch: THREE.Mesh | null = null;
function setHover(on: boolean) {
  for (const m of bodyGroup.children) m.userData.hf.visible = m.userData.he.visible = false;
  if (hoverSketch) { (hoverSketch.material as THREE.MeshStandardMaterial).opacity = 0.4; hoverSketch = null; }
  const { fh, eh } = lastPick;
  if (!on) return;
  const range = (groups: Int32Array, i: number) => { for (let k = 0; k < groups.length; k += 2) if (i >= groups[k] && i < groups[k] + groups[k + 1]) return [groups[k], groups[k + 1]]; };
  if (eh) {
    const m = eh.object.parent!, r = m.userData.edges && range(m.userData.edges, eh.index!);
    if (r) { m.userData.he.geometry.setDrawRange(r[0], r[1]); m.userData.he.visible = true; }
  } else if (fh?.object.userData.hf) {
    const r = range(fh.object.userData.faces, fh.faceIndex! * 3);
    if (r) { fh.object.userData.hf.geometry.setDrawRange(r[0], r[1]); fh.object.userData.hf.visible = true; }
  } else if (fh?.object.userData.id) {
    hoverSketch = fh.object as THREE.Mesh;
    (hoverSketch.material as THREE.MeshStandardMaterial).opacity = 0.6;
  }
}
function pick(): { face: Hit | null; edge: EdgeHit | null } {
  const px = pxSize();
  ray.params.Line.threshold = 6 * px;
  const hs = ray.intersectObjects([...bodyGroup.children, ...group.children], true);
  const faces = hs.filter(h => h.face), eh = hs.find(h => !h.face);
  const fh = faces.find(h => h.object.userData.id && h.distance < faces[0].distance + 0.05) ?? faces[0];
  let face: Hit | null = null, edge: EdgeHit | null = null;
  lastPick = { fh, eh: eh && (!fh || eh.distance < fh.distance + 12 * px) ? eh : undefined };
  if (fh) {
    const n = fh.face!.normal.clone().transformDirection(fh.object.matrixWorld).normalize();
    const id = fh.object.userData.id, f = features.find(f => f.id === id);
    const grip: Grip | null = f && isExtrude(f) ? { f, part: 'end', k: 1 } : ownerOf(features, fh.point.toArray(), n.toArray());
    const sk = f && isExtrude(f) ? f : null; // flache Skizze: deren Körper
    face = { point: fh.point.clone(), n, grip, body: sk ? sk.body : fh.object.userData.body };
  }
  if (eh && (!fh || eh.distance < fh.distance + 12 * px)) {
    const pos = (eh.object as THREE.LineSegments).geometry.attributes.position as THREE.BufferAttribute;
    const a = new THREE.Vector3().fromBufferAttribute(pos, eh.index!), b = new THREE.Vector3().fromBufferAttribute(pos, eh.index! + 1);
    const at = new THREE.Line3(a, b).closestPointToPoint(eh.point, true, new THREE.Vector3()); // genau auf die Kante legen
    edge = { at: at.toArray() as Vec, dir: b.sub(a).normalize().toArray() as Vec, body: eh.object.parent?.userData.body };
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
  const tri = new THREE.Triangle(), q = new THREE.Vector3(), n = new THREE.Vector3(), normals: THREE.Vector3[] = [];
  for (const mesh of bodyGroup.children as THREE.Mesh[]) {
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute, idx = mesh.geometry.index!;
    for (let i = 0; i < idx.count && normals.length < 2; i += 3) {
      tri.setFromAttributeAndIndices(pos, idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
      if (tri.closestPointToPoint(at, q).distanceTo(at) > 0.05) continue;
      tri.getNormal(n);
      if (!normals.some(m => m.dot(n) > 0.99)) normals.push(n.clone());
    }
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
  if (f) { f.body = drag.body ?? f.id; pushHistory(); nextId++; features.push(f); selId = f.id; setTool('select'); }
}
// Eingetippte Maße als Felder im HUD: Rechteck/Langloch zwei Felder (Tab wechselt), sonst eins
function showTyped() {
  const two = drag?.kind === 'sketch' && (tool === 'rect' || tool === 'slot'), parts = typed.split('x');
  const field = (v: string | undefined, on: boolean) => `<b class="${on ? 'on' : ''}">${v || '…'}</b>`;
  hud.style.display = 'block';
  hud.innerHTML = (two ? `B ${field(parts[0], parts.length === 1)} × T ${field(parts[1], parts.length === 2)}` : field(parts[0], true)) + ' mm ⏎';
}
// Eingetippte Maße anwenden: Rechteck/Langloch „B x T“, Kreis/n-Eck Radius (Richtung der Maus), Linie Länge in Mausrichtung
function applyTyped() {
  const v = typed.split(/[x*; ]+/).map(Number).filter(n => isFinite(n) && n > 0);
  typed = '';
  hud.style.display = 'none';
  if (!v.length) return;
  if (drag?.kind === 'push' && drag.started) { // Fläche auf genaues Maß ziehen
    const m = pushTo(drag.part, drag.f0, v[0]);
    if (m === null) return showNotice('Für diese Fläche gibt es kein eintippbares Maß');
    applyPush(drag.f, drag.f0, drag.part, drag.k, m * drag.k, drag.i);
    if (drag.part === 'seg' && !constrain(drag.f, [drag.i, (drag.i + 1) % drag.f.pts.length])) drag.f.pts = drag.f0.pts;
    drag = null; controls.enabled = true; refresh();
  } else if (drag?.kind === 'sketch') {
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
let poly: { pl: Frame; pts: number[][]; onFace: boolean; smooth: boolean; hover?: number[]; body?: number } | null = null;
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
    const cols = [ax && [0.35, 0.8, 0.4], ay && [0.9, 0.35, 0.35]].filter(c => c).flatMap(c => [...c!, ...c!]); // senkrecht grün, waagrecht rot
    guides.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    guides.visible = !!(ax || ay);
    if (ax || ay) showSnapTip(world(q), ax && ay ? 'an zwei Punkten ausgerichtet' : ax ? 'senkrecht zum Punkt' : 'waagrecht zum Punkt');
    return q;
  }
  snapMark.position.fromArray(s.p);
  snapMark.scale.setScalar((s.kind === 'line' ? 3 : 5) * pxSize());
  showSnapTip(snapMark.position, s.kind === 'line' ? 'auf Kante' : s.kind === 'cross' ? 'Schnittpunkt' : s.p.every(x => Math.abs(x) < 1e-9) ? 'Ursprung' : 'Punkt');
  return toLocal(pl, V(s.p));
}
const onPlane = (pl: Frame, q: ArrayLike<number>) => Math.abs(V(q).sub(V(pl.o)).dot(V(pl.n))) < 1e-3;
function snapPoints(pl: Frame): Vec[] {
  const own = poly ? keyPoints({ ...poly.pl, id: 0, type: 'poly', p: {}, pts: poly.pts, d: 0 }) : []; // Punkte der Linie, die gerade entsteht
  return [[0, 0, 0] as Vec, ...own, ...features.filter(isExtrude).flatMap(keyPoints)].filter(q => onPlane(pl, q));
}
// Körperkanten und Linien flacher Skizzen
function snapSegs(pl: Frame | null): Vec[][] {
  const segs: Vec[][] = [];
  for (const mesh of bodyGroup.children) {
    const lines = (mesh.children[0] as THREE.LineSegments).geometry.attributes.position.array;
    for (let i = 0; i < lines.length; i += 6) segs.push([[lines[i], lines[i + 1], lines[i + 2]], [lines[i + 3], lines[i + 4], lines[i + 5]]]);
  }
  for (const f of features) {
    if (!isExtrude(f) || !isFlat(f)) continue;
    const w = (f.type === 'poly' ? contour(f.pts!, f.smooth) : shapeOf(f).getPoints(32).map(v => [v.x, v.y]))
      .map(([x, y]) => [0, 1, 2].map(k => f.o[k] + x * f.u[k] + y * f.v[k]) as Vec);
    w.forEach((q, i) => segs.push([q, w[(i + 1) % w.length]]));
  }
  return pl ? segs.filter(([a, b]) => onPlane(pl, a) && onPlane(pl, b)) : segs;
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
  if (f) f.body = poly!.body ?? f.id;
  cancelPoly();
  if (f) { pushHistory(); nextId++; features.push(f); selId = f.id; setTool('select'); refresh(); }
}
function cancelPoly() { poly = null; disposeGroup(preview); hud.style.display = 'none'; }

// ---------- Werkzeuge ----------
function onDown(e: PointerEvent) {
  if (e.button !== 0 || !ready) return;
  setRay(e);
  if (gizmo.object) (gizmo as any).pointerHover({ x: ndc.x, y: ndc.y, button: 0 }); // Treffer auch ohne vorherige Mausbewegung
  if (gizmo.axis) return; // Griffe zum Verschieben/Drehen bedienen sich selbst
  const { face: h, edge } = pick();
  const hp = tool === 'select' ? ray.intersectObjects(handles.children)[0] : undefined;
  if (tool === 'line' || tool === 'spline') {
    if (!poly) poly = { pl: planeFor(h), pts: [], onFace: !!h, smooth: tool === 'spline', body: h?.body };
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
    drag = { kind: 'sketch', pl, a, b: a, onFace: !!h, body: h?.body };
  } else if (tool === 'measure') { // Punkt auf Fläche/Kante, eingerastet an Ecken; zwei Punkte = Abstand
    const P = edge ? V(edge.at) : h?.point;
    if (!P) return;
    const pts = [...features.filter(isExtrude).filter(f => !f.hidden).flatMap(keyPoints), ...snapSegs(null).flat()];
    const s = snapTo(P.toArray() as Vec, pts, [], 8 * pxSize());
    measure = measure.length === 2 ? [] : measure;
    measure.push(s ? V(s.p) : P.clone());
    showMeasure();
    return;
  } else if (tool === 'shell') { // Körper aushöhlen, angeklickte Fläche bleibt offen
    if (!h || h.grip?.f && isExtrude(h.grip.f) && isFlat(h.grip.f)) return;
    const f: Shell = { id: nextId++, type: 'shell', at: h.point.toArray() as Vec, t: 1, body: h.body };
    pushHistory(); features.push(f); selId = f.id; setTool('select'); refresh();
    return;
  } else if (hp) { // Punkt der ausgewählten Skizze
    const f = getSel() as Extrude;
    drag = { kind: 'point', f, f0: structuredClone(f), i: hp.object.userData.i, sx: e.clientX, sy: e.clientY, started: false };
  } else if (edge) { // Kante: Rundung entsteht erst beim Ziehen
    drag = { kind: 'edge', f: null, edge, P0: V(edge.at), sx: e.clientX, sy: e.clientY, started: false };
  } else {
    if (!h?.grip) { if (selId !== null || selBody !== null || multi.size || edgeSel.length) { clearSel(); detachGizmo(); refresh(); } return; } // Leere: Orbit
    const g = h.grip;
    if (e.shiftKey && selId !== null && selId !== g.f.id) { multi.has(g.f.id) ? multi.delete(g.f.id) : multi.add(g.f.id); refresh(); return; }
    if (!multi.has(g.f.id)) multi.clear();
    selId = g.f.id; selBody = null; edgeSel = []; detachGizmo(); refresh();
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
    if (typed) return showTyped();
    return showHud(e, `${Math.hypot(q[0] - last[0], q[1] - last[1]).toFixed(1)} mm · Zahl tippen`);
  }
  if (!drag) {
    const h = ['select', 'shell', 'measure'].includes(tool) && pick();
    setHover(!!h && (tool !== 'shell' || !!h.face));
    el.style.cursor = !h ? 'crosshair' : h.edge || h.face?.grip ? 'grab' : 'default';
    return;
  }
  setHover(false);
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
      if (typed) showTyped(); else showHud(e, `${hudText(f)} · Zahl tippen`);
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
        drag.f = { id: nextId++, type: inward ? 'chamfer' : 'fillet', at: drag.edge.at, dir: drag.edge.dir, r: 1, body: drag.edge.body } satisfies EdgeOp;
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
      if (constrain(drag.f, [drag.i])) drag.last = drag.f.pts; else drag.f.pts = drag.last ?? drag.f0.pts; // gezogener Punkt bleibt, Rest folgt
      rebuild();
      return showHud(e, `Punkt ${q[0].toFixed(1)} / ${q[1].toFixed(1)} mm`);
    }
    const s = lineParam(drag.P0, drag.D);
    if (s === null) return;
    const [label, val] = applyPush(drag.f, drag.f0, drag.part, drag.k, snap(s, e, 0.5), drag.i);
    if (drag.part === 'seg' || drag.part === 'arc') { // verschobene Seite bleibt, Abhängigkeiten ziehen den Rest nach
      if (constrain(drag.f, [drag.i, (drag.i + 1) % drag.f.pts.length])) drag.last = drag.f.pts; else drag.f.pts = drag.last ?? drag.f0.pts;
    }
    rebuild();
    if (typed) showTyped(); else showHud(e, `${label}: ${val.toFixed(1)} mm${isCut(drag.f) ? ' (Schnitt)' : ''} · Zahl tippen`);
  }
}

el.addEventListener('pointerup', e => {
  if (!drag) return;
  onMove(e); // Endposition übernehmen
  hud.style.display = 'none';
  if (drag.kind === 'sketch') finishSketch();
  if (drag.kind === 'edge' && !drag.started && !drag.f) {
    const near = (a: { at: Vec }) => V(a.at).distanceTo(V(drag.edge.at)) < 4 * pxSize();
    edgeSel = e.shiftKey ? (edgeSel.some(near) ? edgeSel.filter(a => !near(a)) : [...edgeSel, drag.edge]) : [drag.edge];
    selId = selBody = null; multi.clear();
  }
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
let lastTool: Tool = 'rect'; // Leertaste wählt es wieder
function setTool(t: Tool) {
  if (t !== tool) { cancelPoly(); measure = []; }
  if (t !== 'select') lastTool = t;
  typed = '';
  tool = t;
  document.querySelectorAll<HTMLButtonElement>('#toolbar button').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  showHint(HINTS[t]);
}
document.querySelectorAll<HTMLButtonElement>('#toolbar button').forEach(b => b.onclick = () => setTool(b.dataset.tool as Tool));

const panel = $('panel');
function renderPanel() {
  const f = getSel();
  if (edgeSel.length) { panel.style.display = 'block'; return renderEdgeSetPanel(); }
  if (!f && selBody !== null) { panel.style.display = 'block'; return renderBodyPanel(selBody); }
  if (!f) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  if (f.type === 'move' || f.type === 'combine') {
    panel.innerHTML = `<h3>${nameOf(f)}</h3><button class="del">Löschen</button>`;
    return panel.querySelector<HTMLButtonElement>('.del')!.onclick = deleteSel;
  }
  if (f.type === 'import') return renderImportPanel(f);
  if (f.type === 'shell') return renderShellPanel(f);
  if (!isExtrude(f)) return renderEdgePanel(f);
  const fields = f.type === 'rect' ? [['X', 'p.x'], ['Y', 'p.y'], ['Breite', 'p.w'], ['Tiefe', 'p.h'], ['Höhe', 'd']]
    : f.type === 'circle' ? [['Mitte X', 'p.cx'], ['Mitte Y', 'p.cy'], ['Radius', 'p.r'], ['Höhe', 'd']]
    : [['Höhe', 'd']];
  if (f.rev) fields.splice(-1, 1, ['Winkel °', 'rev']);
  const get = (k: string): number => k.split('.').reduce((o: any, p) => o[p], f);
  const name = nameOf(f);
  panel.innerHTML = `<h3>${name} #${f.id}</h3>` +
    fields.map(([l, k]) => `<label>${l} <input type="number" step="0.5" data-k="${k}" value="${+get(k).toFixed(2)}"></label>`).join('') +
    (isFlat(f) && !f.and && !f.smooth ? `<label>Versatz <input type="number" step="0.5" value="2" class="off"></label><button class="addOff">Versatz anlegen</button>` : '') +
    (isFlat(f) || f.rev ? `<label>Drehen um <select class="revAx"><option value="">–</option><option value="u">x-Achse der Skizze</option><option value="v">y-Achse der Skizze</option></select></label>` : '') +
    (f.type === 'poly' && !f.smooth ? consHtml(f) : '') +
    (f.rev ? `<label>Abziehen (Nut) <input type="checkbox" class="sub"${f.sub ? ' checked' : ''} style="width:auto"></label>` : '') +
    `<details><summary>Muster / Spiegeln</summary>
      <label>Achse <select class="ax"><option>X</option><option>Y</option><option selected>Z</option></select></label>
      <label>Anzahl <input class="cnt" type="number" min="2" value="3"></label>
      <label>Abstand <input class="dist" type="number" step="0.5" value="20"></label>
      <button class="lin">Reihe entlang Achse</button><button class="rot">Kreis um Achse</button><button class="mir">Spiegeln (Ebene ⟂ Achse)</button>
    </details>` +
    `<button class="del">Löschen</button>`;
  // Muster und Spiegeln im Raum; Achsen wie in der Exportdatei (Z oben = Szene +Y), Kreis und Spiegelebene durch den Ursprung
  // shortcut: nur durch den Ursprung und nur das ausgewählte Feature (ohne Rundungen) → Bezug auf Kante/Fläche (M3)
  const AXES: Record<string, Vec> = { X: [1, 0, 0], Y: [0, 0, -1], Z: [0, 1, 0] };
  const num = (c: string) => parseFloat(panel.querySelector<HTMLInputElement>(c)!.value);
  const addCopies = (make: (i: number, ax: Vec) => Extrude[]) => {
    const ax = AXES[panel.querySelector<HTMLSelectElement>('.ax')!.value];
    pushHistory();
    const cs = make(Math.max(2, Math.round(num('.cnt')) || 2), ax);
    features.push(...cs); selId = cs.at(-1)!.id; refresh();
  };
  panel.querySelector<HTMLButtonElement>('.lin')!.onclick = () => addCopies((n, ax) =>
    Array.from({ length: n - 1 }, (_, i) => movedCopy(f, nextId++, ax.map(x => x * num('.dist') * (i + 1)) as Vec)));
  panel.querySelector<HTMLButtonElement>('.rot')!.onclick = () => addCopies((n, ax) =>
    Array.from({ length: n - 1 }, (_, i) => movedCopy(f, nextId++, [0, 0, 0], ax, 2 * Math.PI * (i + 1) / n)));
  panel.querySelector<HTMLButtonElement>('.mir')!.onclick = () => addCopies((_, ax) => [mirroredCopy(f, nextId++, ax)]);
  if (f.type === 'poly' && !f.smooth) bindCons(f);
  const revAx = panel.querySelector<HTMLSelectElement>('.revAx');
  if (revAx) { // Skizze zum Drehkörper machen bzw. Achse wechseln; „–“ = wieder flache Skizze
    revAx.value = f.rev ? f.axis ?? 'u' : '';
    revAx.onchange = () => {
      pushHistory();
      if (revAx.value) { f.axis = revAx.value as 'u' | 'v'; f.rev ||= 360; } else { delete f.rev; delete f.axis; }
      refresh();
    };
  }
  const sub = panel.querySelector<HTMLInputElement>('.sub');
  if (sub) sub.onchange = () => { pushHistory(); f.sub = sub.checked; refresh(); };
  const addOff = panel.querySelector<HTMLButtonElement>('.addOff');
  if (addOff) addOff.onclick = () => { // neue Skizze außen (> 0) bzw. innen (< 0) um die ausgewählte
    const g = offsetFeature(f, parseFloat(panel.querySelector<HTMLInputElement>('.off')!.value) || 0, nextId);
    if (!g) return showNotice('Versatz zu groß: von der Skizze bleibt nichts übrig');
    pushHistory(); nextId++; features.push(g); selId = g.id; refresh();
  };
  panel.querySelectorAll<HTMLInputElement>('input[data-k]').forEach(inp => inp.onchange = () => {
    const v = parseFloat(inp.value);
    if (!isFinite(v)) return;
    pushHistory();
    const ks = inp.dataset.k!.split('.'), key = ks.at(-1)!;
    const obj: any = ks.length > 1 ? f.p : f;
    obj[key] = ['w', 'h', 'r'].includes(key) ? Math.max(0.5, v) : key === 'rev' ? Math.max(1, Math.min(360, v)) : v;
    refresh();
  });
  panel.querySelector<HTMLButtonElement>('.del')!.onclick = deleteSel;
}
// Maße und Abhängigkeiten eines Vielecks: je gerade Seite Länge (eingeben = festlegen), waagrecht, senkrecht;
// zwei Seiten parallel, rechtwinklig, gleich lang; Liste der gesetzten Abhängigkeiten mit ✕
const sideLen = (pts: number[][], i: number) => { const a = pts[i], b = pts[(i + 1) % pts.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); };
const CON_TEXT = { len: 'Länge', h: 'waagrecht', v: 'senkrecht', par: '∥', perp: '⟂', eq: '=' };
const conText = (c: Con) => c.t === 'len' ? `Seite ${c.i + 1} = ${c.val} mm` : c.j === undefined ? `Seite ${c.i + 1} ${CON_TEXT[c.t]}` : `Seite ${c.i + 1} ${CON_TEXT[c.t]} Seite ${c.j + 1}`;
function consHtml(f: Extrude) {
  const pts = f.pts!, sides = pts.map((_, i) => i).filter(i => !pts[i][2]), has = (t: Con['t'], i: number) => f.cons?.some(c => c.t === t && c.i === i);
  const opts = sides.map(i => `<option value="${i}">${i + 1}</option>`).join('');
  return `<details open class="cons"><summary>Maße und Abhängigkeiten</summary>` +
    sides.map(i => `<label>Seite ${i + 1} <span><input type="number" step="0.5" class="len${has('len', i) ? ' lock' : ''}" data-i="${i}" value="${+sideLen(pts, i).toFixed(2)}">` +
      `<button class="hv${has('h', i) ? ' on' : ''}" data-t="h" data-i="${i}" title="waagrecht">—</button><button class="hv${has('v', i) ? ' on' : ''}" data-t="v" data-i="${i}" title="senkrecht">|</button></span></label>`).join('') +
    (sides.length > 1 ? `<label>Seiten <span><select class="sa">${opts}</select> <select class="sb">${opts}</select></span></label>
      <div class="pair"><button data-t="par" title="parallel">∥</button><button data-t="perp" title="rechtwinklig">⟂</button><button data-t="eq" title="gleich lang">=</button></div>` : '') +
    (f.cons ?? []).map((c, k) => `<div class="con">${conText(c)}<button data-k="${k}" title="entfernen">✕</button></div>`).join('') + `</details>`;
}
function bindCons(f: Extrude) {
  // Abhängigkeit setzen (gleiche ersetzen), Seite i bleibt stehen; widerspricht sie, bleibt alles wie vorher
  const addCon = (c: Con) => {
    const pts0 = f.pts!, cons0 = f.cons ?? [];
    pushHistory();
    f.cons = [...cons0.filter(d => !(d.t === c.t && d.i === c.i && d.j === c.j)), c];
    if (!constrain(f, [c.i])) { undoStack.pop(); f.pts = pts0; f.cons = cons0; showNotice('Diese Abhängigkeit widerspricht den anderen'); }
    refresh();
  };
  const remove = (keep: (c: Con) => boolean) => { pushHistory(); f.cons = f.cons!.filter(keep); refresh(); };
  panel.querySelectorAll<HTMLInputElement>('.cons input.len').forEach(inp => inp.onchange = () => {
    const i = +inp.dataset.i!, v = parseFloat(inp.value);
    if (isFinite(v) && v > 0) addCon({ t: 'len', i, val: v });
    else if (f.cons) remove(c => !(c.t === 'len' && c.i === i)); // leer = Maß lösen
  });
  panel.querySelectorAll<HTMLButtonElement>('.cons .hv').forEach(b => b.onclick = () => {
    const t = b.dataset.t as Con['t'], i = +b.dataset.i!;
    if (f.cons?.some(c => c.t === t && c.i === i)) remove(c => !(c.t === t && c.i === i)); else addCon({ t, i });
  });
  const sb = panel.querySelector<HTMLSelectElement>('.sb');
  if (sb) sb.selectedIndex = 1; // zweite Seite vorwählen
  panel.querySelectorAll<HTMLButtonElement>('.cons .pair button').forEach(b => b.onclick = () => {
    const i = +panel.querySelector<HTMLSelectElement>('.sa')!.value, j = +panel.querySelector<HTMLSelectElement>('.sb')!.value;
    if (i === j) return showHint('Bitte zwei verschiedene Seiten wählen');
    addCon({ t: b.dataset.t as Con['t'], i, j });
  });
  panel.querySelectorAll<HTMLButtonElement>('.cons .con button').forEach(b => b.onclick = () => { const c = f.cons![+b.dataset.k!]; remove(d => d !== c); });
}

// Maßzahlen an den Seiten der ausgewählten Skizze; festgelegte Maße orange, waagrecht/senkrecht als — / |
const dims = $('dims');
let dimLabels: { el: HTMLElement; p: THREE.Vector3 }[] = [];
function buildDims() {
  dims.replaceChildren();
  dimLabels = [];
  const f = getSel();
  if (!f || !isExtrude(f) || f.type !== 'poly' || f.smooth) return;
  const M = moveMatrix(movesAfter(features, features.indexOf(f))), pts = f.pts!, world = (q: number[]) => V(f.o).addScaledVector(V(f.u), q[0]).addScaledVector(V(f.v), q[1]);
  pts.forEach((a, i) => {
    if (a[2]) return;
    const el = document.createElement('span'), c = (t: Con['t']) => f.cons?.some(d => d.t === t && d.i === i);
    el.textContent = `${sideLen(pts, i).toFixed(1)}${c('h') ? ' —' : ''}${c('v') ? ' |' : ''}`;
    if (c('len')) el.className = 'lock';
    dims.append(el);
    dimLabels.push({ el, p: world(a).add(world(pts[(i + 1) % pts.length])).multiplyScalar(0.5).applyMatrix4(M) });
  });
}
function updateDims() {
  for (const { el, p } of dimLabels) {
    const s = p.clone().project(camera);
    el.style.display = s.z > 1 ? 'none' : '';
    el.style.left = `${(s.x + 1) / 2 * el.parentElement!.clientWidth}px`;
    el.style.top = `${(1 - s.y) / 2 * el.parentElement!.clientHeight}px`;
  }
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
function renderShellPanel(f: Shell) {
  panel.innerHTML = `<h3>Schale #${f.id}</h3><label>Wandstärke <input type="number" step="0.5" min="0.1" value="${+f.t.toFixed(2)}"></label><button class="del">Löschen</button>`;
  const inp = panel.querySelector('input')!;
  inp.onchange = () => { const v = parseFloat(inp.value); if (isFinite(v) && v > 0) { pushHistory(); f.t = v; refresh(); } };
  panel.querySelector<HTMLButtonElement>('.del')!.onclick = deleteSel;
}
// Mehrere Kanten auf einmal runden oder fasen (Shift+Klick auf Kanten)
function renderEdgeSetPanel() {
  panel.innerHTML = `<h3>${edgeSel.length} Kante${edgeSel.length > 1 ? 'n' : ''}</h3><p style="color:var(--muted);margin:0 0 6px">Shift+Klick = weitere Kanten</p>
    <label>Maß <input type="number" step="0.5" min="0.5" value="2" class="r"></label>
    <button class="act" data-t="fillet">Runden</button><button class="act" data-t="chamfer">Fasen</button>`;
  panel.querySelectorAll<HTMLButtonElement>('button[data-t]').forEach(b => b.onclick = () => {
    const r = Math.max(0.5, parseFloat(panel.querySelector<HTMLInputElement>('.r')!.value) || 2);
    pushHistory();
    for (const a of edgeSel) features.push({ id: nextId++, type: b.dataset.t as EdgeOp['type'], at: a.at, dir: a.dir, r, body: a.body });
    selId = (features.at(-1) as EdgeOp).id; edgeSel = []; refresh();
  });
}
function deleteSel() {
  const ids = new Set([selId, ...multi]);
  if (!features.some(f => ids.has(f.id))) return;
  pushHistory(); features = features.filter(f => !ids.has(f.id)); clearSel(); refresh();
}
function toggleHidden() {
  const fs = features.filter(f => f.id === selId || multi.has(f.id));
  if (!fs.length) return;
  pushHistory(); const h = !fs[0].hidden; fs.forEach(f => f.hidden = h); refresh();
}

// ---------- Kopieren, Einfügen, Duplizieren: Skizzen/Features oder ganzer Körper, um 10 mm in X versetzt ----------
let clip: Feature[] = [], clipBody = false;
const COPY_OFFSET: Vec = [10, 0, 0];
type Copyable = Extrude | EdgeOp | Shell;
function copySel() {
  clipBody = selBody !== null;
  clip = structuredClone(features.filter((f): f is Copyable => (isExtrude(f) || f.type === 'fillet' || f.type === 'chamfer' || f.type === 'shell') && !f.hidden
    && (clipBody ? bodyOf(f) === selBody : f.id === selId || multi.has(f.id))));
  showHint(clip.length ? `${clip.length} Schritt${clip.length > 1 ? 'e' : ''} kopiert · Strg+V fügt ein` : 'Nichts zum Kopieren ausgewählt');
}
// shortcut: Bewegungen und Verrechnungen des Körpers werden nicht mitkopiert → Körper samt Verlauf kopieren (Körper-IDs umschreiben)
function paste() {
  if (!clip.length) return;
  pushHistory();
  const newBody = nextId;
  const out = (clip as Copyable[]).map(f => {
    const id = nextId++, body = clipBody ? newBody : isExtrude(f) && !f.onFace ? id : f.body; // Bodenskizze = eigener Körper
    return isExtrude(f) ? { ...movedCopy(f, id, COPY_OFFSET), body }
      : { ...structuredClone(f), id, body, at: f.at.map((x, k) => x + COPY_OFFSET[k]) as Vec };
  });
  features.push(...out);
  clip = structuredClone(out); // nochmal einfügen = nochmal versetzt
  clearSel();
  if (clipBody) selBody = newBody; else selId = out.at(-1)!.id;
  refresh();
}

// ---------- Rechtsklick-Menü: Befehle zu dem, was unter der Maus liegt ----------
const ctx = $('ctx');
let rDown: { x: number; y: number } | null = null;
el.addEventListener('pointerdown', e => { if (e.button === 2) rDown = { x: e.clientX, y: e.clientY }; });
el.addEventListener('pointerup', e => {
  if (e.button !== 2 || !rDown) return;
  const moved = Math.hypot(e.clientX - rDown.x, e.clientY - rDown.y) > 4; // Rechts ziehen = verschieben
  rDown = null;
  if (!moved) openCtx(e);
});
el.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('pointerdown', e => { if (!ctx.contains(e.target as Node)) ctx.style.display = 'none'; }, true);
function openCtx(e: PointerEvent) {
  setRay(e);
  const { face: h, edge } = pick(), g = h?.grip;
  if (g && g.f.id !== selId && !multi.has(g.f.id)) { clearSel(); selId = g.f.id; refresh(); }
  const sel = getSel(), n = 1 + multi.size, items: ([string, () => void] | null)[] = [];
  if (sel) {
    items.push([n > 1 ? `${n} Schritte löschen` : 'Löschen (Entf)', deleteSel], [sel.hidden ? 'Einschalten' : 'Ausschalten', toggleHidden],
      ['Duplizieren (Strg+D)', () => { copySel(); paste(); }], ['Kopieren (Strg+C)', copySel]);
    const b = sel.type !== 'combine' && sel.type !== 'move' ? bodyOf(sel) : null;
    if (b !== null && bodyIds.includes(b)) items.push([`Körper #${b} auswählen`, () => { clearSel(); selBody = b; refresh(); }]);
    if (isExtrude(sel)) items.push(['Muster / Spiegeln …', () => { const d = panel.querySelector<HTMLDetailsElement>('details:not(.cons)'); if (d) d.open = true; }]);
    items.push(null);
  } else if (edge) items.push(['Kante runden / fasen …', () => { clearSel(); edgeSel = [edge]; refresh(); }], null);
  if (selBody !== null) items.push(['Körper duplizieren (Strg+D)', () => { copySel(); paste(); }], null);
  if (clip.length) items.push(['Einfügen (Strg+V)', paste]);
  items.push(['Einpassen (F)', fitView], ['Rückgängig (Strg+Z)', undo], ['Werkzeugsuche (Strg+K)', openPalette]);
  ctx.replaceChildren(...items.map(it => {
    if (!it) return document.createElement('hr');
    const b = document.createElement('button');
    b.textContent = it[0];
    b.onclick = () => { ctx.style.display = 'none'; it[1](); };
    return b;
  }));
  ctx.style.display = 'block';
  ctx.style.left = `${Math.min(e.clientX, innerWidth - ctx.offsetWidth - 8)}px`;
  ctx.style.top = `${Math.min(e.clientY, innerHeight - ctx.offsetHeight - 8)}px`;
}

function download(name: string, blob: Blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('bNew').onclick = () => { if (features.length) { pushHistory(); features = []; selId = null; refresh(); } };
$('bUndo').onclick = undo;
$('bRedo').onclick = redo;
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
  const f: Import = { id: nextId, type: 'import', name: file.name, step: text, body: nextId++ };
  features.push(f); selId = f.id; refresh();
};
$('bStl').onclick = () => send({ type: 'export', format: 'stl' });
$('bStep').onclick = () => send({ type: 'export', format: 'step' });

addEventListener('keydown', e => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  // Maße tippen, solange ein Rechteck/Kreis aufgezogen wird oder eine Linie entsteht
  if ((drag?.kind === 'sketch' || drag?.kind === 'push' && drag.started || poly?.pts.length) && !e.ctrlKey) {
    if (/^[0-9.]$/.test(k) || k === ',') { typed += k === ',' ? '.' : k; return showTyped(); }
    if ((k === 'tab' || k === 'x') && drag?.kind === 'sketch' && !typed.includes('x')) { e.preventDefault(); typed += 'x'; return showTyped(); }
    if (k === 'backspace' && typed) { typed = typed.slice(0, -1); return showTyped(); }
    if (k === 'enter' && typed) return applyTyped();
    if (drag?.kind === 'sketch' && tool === 'ngon' && (k === '+' || k === '-')) { sides = Math.max(3, Math.min(24, sides + (k === '+' ? 1 : -1))); return showHint(`${sides} Ecken`); }
  }
  if (e.ctrlKey && k === 'k') { e.preventDefault(); return openPalette(); }
  if (e.ctrlKey && k === 'c') return copySel();
  if (e.ctrlKey && k === 'v') return paste();
  if (e.ctrlKey && k === 'd') { e.preventDefault(); copySel(); return paste(); }
  if (k === ' ') { e.preventDefault(); return setTool(lastTool); }
  if (e.ctrlKey && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (e.ctrlKey && k === 'y') { e.preventDefault(); redo(); }
  else if (e.ctrlKey) return; // Strg+S/R/… sind keine Werkzeugtasten
  else if (k === 'v') setTool('select');
  else if (k === 'r') setTool('rect');
  else if (k === 'c') setTool('circle');
  else if (k === 'n') setTool('ngon');
  else if (k === 'o') setTool('slot');
  else if (k === 'h') setTool('shell');
  else if (k === 'm') setTool('measure');
  else if (k === 'f') fitView();
  else if (k in { 0: 1, 1: 1, 2: 1, 3: 1 }) setView(['iso', 'front', 'top', 'right'][+k]);
  else if (k === 'l') setTool('line');
  else if (k === 's') setTool('spline');
  else if (k === 'enter' && poly) finishPoly();
  else if (k === 'delete' || k === 'backspace') deleteSel();
  else if (k === 'escape') { typed = ''; clearSel(); ctx.style.display = 'none'; detachGizmo(); cancelPoly(); drag = null; disposeGroup(preview); controls.enabled = true; selId = null; setTool('select'); refresh(); }
});

// ---------- Körper: auswählen, verschieben/drehen (Griffe oder Zahlen), mit anderem Körper verrechnen ----------
const gizmo = new TransformControls(camera, el), pivot = new THREE.Object3D(), gizmoStart = new THREE.Vector3();
scene.add(pivot, gizmo.getHelper());
gizmo.setTranslationSnap(1); gizmo.setRotationSnap(Math.PI / 12); // 1 mm bzw. 15°
gizmo.addEventListener('dragging-changed', e => { controls.enabled = !e.value; if (!e.value) commitGizmo(); });
const bodyMeshOf = (b: number) => bodyGroup.children.find(m => m.userData.body === b);
function attachGizmo(mode: 'translate' | 'rotate') {
  const m = selBody !== null && bodyMeshOf(selBody);
  if (!m) return detachGizmo();
  new THREE.Box3().setFromObject(m).getCenter(gizmoStart);
  pivot.position.copy(gizmoStart); pivot.quaternion.identity();
  gizmo.setMode(mode); gizmo.attach(pivot);
}
function detachGizmo() { gizmo.detach(); }
function addMove(q: THREE.Quaternion, t: THREE.Vector3) {
  if (selBody === null || t.length() < 1e-6 && Math.abs(q.w) > 1 - 1e-9) return;
  pushHistory();
  features.push({ id: nextId++, type: 'move', body: selBody, c: gizmoStart.toArray() as Vec, q: q.toArray(), t: t.toArray() as Vec });
  refresh();
}
function commitGizmo() { addMove(pivot.quaternion.clone(), pivot.position.clone().sub(gizmoStart)); }
function renderBodyPanel(b: number) {
  const others = bodyIds.filter(o => o !== b);
  panel.innerHTML = `<h3>Körper #${b}</h3>
    <button class="gT">Verschieben (Griffe)</button><button class="gR">Drehen (Griffe)</button>
    <details><summary>Genau verschieben / drehen</summary>
      <label>ΔX <input type="number" step="0.5" value="0" class="dx"></label><label>ΔY <input type="number" step="0.5" value="0" class="dy"></label>
      <label>ΔZ <input type="number" step="0.5" value="0" class="dz"></label><button class="mv">Verschieben</button>
      <label>Achse <select class="ax"><option>X</option><option>Y</option><option selected>Z</option></select></label>
      <label>Winkel ° <input type="number" step="5" value="90" class="ang"></label><button class="rt">Drehen um Mitte</button>
    </details>` +
    (others.length ? `<label>mit <select class="other">${others.map(o => `<option value="${o}">Körper #${o}</option>`).join('')}</select></label>
    <button class="op" data-op="fuse">Vereinigen</button><button class="op" data-op="cut">Abziehen</button><button class="op" data-op="common">Schnittmenge</button>` : '');
  panel.querySelectorAll<HTMLButtonElement>('button').forEach(x => x.classList.add('act'));
  const q = <T extends HTMLElement>(c: string) => panel.querySelector<T>(c)!;
  q<HTMLButtonElement>('.gT').onclick = () => attachGizmo('translate');
  q<HTMLButtonElement>('.gR').onclick = () => attachGizmo('rotate');
  const num = (c: string) => parseFloat(q<HTMLInputElement>(c).value) || 0;
  // Achsen wie in der Exportdatei: X = x, Y = −z, Z = y
  q<HTMLButtonElement>('.mv').onclick = () => { attachGizmo('translate'); addMove(new THREE.Quaternion(), new THREE.Vector3(num('.dx'), num('.dz'), -num('.dy'))); };
  q<HTMLButtonElement>('.rt').onclick = () => {
    attachGizmo('rotate');
    const ax = V({ X: [1, 0, 0], Y: [0, 0, -1], Z: [0, 1, 0] }[q<HTMLSelectElement>('.ax').value]!);
    addMove(new THREE.Quaternion().setFromAxisAngle(ax, num('.ang') * Math.PI / 180), new THREE.Vector3());
  };
  panel.querySelectorAll<HTMLButtonElement>('.op').forEach(x => x.onclick = () => { // b nimmt den anderen Körper auf
    const f: Combine = { id: nextId++, type: 'combine', op: x.dataset.op as Combine['op'], a: b, b: +q<HTMLSelectElement>('.other').value };
    pushHistory(); features.push(f); detachGizmo(); refresh();
  });
}

// ---------- Messen ----------
let measure: THREE.Vector3[] = [];
function showMeasure() {
  disposeGroup(preview);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff9a3c, depthTest: false });
  for (const p of measure) { const m = new THREE.Mesh(new THREE.SphereGeometry(4 * pxSize(), 12, 6), mat.clone()); m.position.copy(p); m.renderOrder = 2; preview.add(m); }
  if (measure.length < 2) return showHint('Zweiten Punkt anklicken');
  const [a, b] = measure, d = b.clone().sub(a);
  preview.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0xff9a3c, depthTest: false })));
  // Achsen wie in der Exportdatei: X = x, Y = −z, Z = y
  showHint(`Abstand ${d.length().toFixed(2)} mm · ΔX ${d.x.toFixed(2)} · ΔY ${(-d.z).toFixed(2)} · ΔZ ${d.y.toFixed(2)}`);
}

// ---------- Ansichten ----------
const VIEWS: Record<string, Vec> = { iso: [1, 0.8, 1], top: [0, 1, 1e-4], bottom: [0, -1, 1e-4], front: [0, 0, 1], back: [0, 0, -1], right: [1, 0, 0], left: [-1, 0, 0] };
// Kamera weich zu neuer Lage fahren (300 ms), statt zu springen
let fly: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; start: number } | null = null;
function flyTo(pos: THREE.Vector3, target: THREE.Vector3) {
  fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now() };
}
function stepFly() {
  if (!fly) return;
  const t = Math.min(1, (performance.now() - fly.start) / 300), s = t * t * (3 - 2 * t);
  camera.position.lerpVectors(fly.p0, fly.p1, s);
  controls.target.lerpVectors(fly.t0, fly.t1, s);
  if (t === 1) fly = null;
}
function setView(name: string) {
  if (name === 'fit') return fitView();
  const dist = camera.position.distanceTo(controls.target);
  flyTo(controls.target.clone().addScaledVector(V(VIEWS[name]).normalize(), dist), controls.target.clone());
}
// Kamera so setzen, dass Körper und Skizzen ganz zu sehen sind
function fitView() {
  const box = new THREE.Box3().setFromObject(bodyGroup).union(new THREE.Box3().setFromObject(group));
  if (box.isEmpty()) return resetView();
  const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  const dir = camera.position.clone().sub(controls.target).normalize();
  flyTo(c.clone().addScaledVector(dir, Math.max(r, 5) / Math.sin(camera.fov * Math.PI / 360) * 1.1), c);
}
// Doppelklick: Drehpunkt auf die angeklickte Stelle legen
el.addEventListener('dblclick', e => {
  setRay(e as unknown as PointerEvent);
  const h = ray.intersectObjects([...bodyGroup.children, ...group.children], true).find(x => x.face);
  if (!h) return;
  flyTo(camera.position.clone().add(h.point).sub(controls.target), h.point.clone());
});

// ---------- Ansichtswürfel oben links: Seite anklicken = Ansicht, dreht sich mit der Kamera ----------
const cubeRenderer = new CSS3DRenderer(), cubeScene = new THREE.Scene(), cubeCam = new THREE.PerspectiveCamera(30, 1, 1, 1000);
cubeRenderer.setSize(96, 96);
$('cube').append(cubeRenderer.domElement);
for (const [view, label, rot] of [['front', 'VORNE', [0, 0, 0]], ['back', 'HINTEN', [0, Math.PI, 0]], ['right', 'RECHTS', [0, Math.PI / 2, 0]],
  ['left', 'LINKS', [0, -Math.PI / 2, 0]], ['top', 'OBEN', [-Math.PI / 2, 0, 0]], ['bottom', 'UNTEN', [Math.PI / 2, 0, 0]]] as const) {
  const d = document.createElement('div');
  d.className = 'face'; d.textContent = label; d.title = `Ansicht ${label.toLowerCase()}`;
  d.onclick = () => setView(view);
  const o = new CSS3DObject(d);
  o.rotation.set(rot[0], rot[1], rot[2]);
  o.position.copy(V(VIEWS[view]).normalize().multiplyScalar(28));
  cubeScene.add(o);
}
function renderCube() {
  cubeCam.position.copy(camera.position).sub(controls.target).normalize().multiplyScalar(220);
  cubeCam.quaternion.copy(camera.quaternion);
  cubeRenderer.render(cubeScene, cubeCam);
}
document.querySelectorAll<HTMLButtonElement>('#views button[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view!));

// ---------- Darstellung: Draht, transparent, Kanten, Schnitt, Render, Farbe (nur Anzeige, wird lokal gemerkt) ----------
const display = { wire: false, glass: false, edges: true, section: 0, render: false, color: '#c9ced6' };
try { Object.assign(display, JSON.parse(localStorage.getItem('openform-view') ?? '{}')); } catch {}
let envMap: THREE.Texture | null = null;
const cut = new THREE.Plane();
function applyDisplay() {
  localStorage.setItem('openform-view', JSON.stringify(display));
  if (display.render && !envMap) envMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = display.render ? envMap : null;
  renderer.toneMapping = display.render ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  grid.visible = fine.visible = !display.render;
  renderer.localClippingEnabled = !!display.section;
  if (bodyGroup.children.length && display.section) { // Schnittebene durch die Mitte aller Körper; Achsen wie in der Exportdatei (X, Y = −z, Z = y)
    const c = new THREE.Box3().setFromObject(bodyGroup).getCenter(new THREE.Vector3()), n = V([[1, 0, 0], [0, 0, 1], [0, -1, 0]][display.section - 1]);
    cut.setFromNormalAndCoplanarPoint(n, c);
  }
  for (const mesh of bodyGroup.children as THREE.Mesh[]) {
    const m = mesh.material as THREE.MeshStandardMaterial, lines = mesh.children[0] as THREE.LineSegments;
    m.color.set(display.color);
    m.emissive.set(mesh.userData.body === selBody ? 0x5a2a00 : 0x000000);
    m.wireframe = display.wire;
    m.transparent = display.glass; m.opacity = display.glass ? 0.35 : 1; m.depthWrite = !display.glass;
    m.metalness = display.render ? 0.35 : 0.1; m.roughness = display.render ? 0.35 : 0.6;
    m.clippingPlanes = (lines.material as THREE.Material).clippingPlanes = display.section ? [cut] : null;
    m.needsUpdate = true;
    lines.visible = display.edges;
  }
  document.querySelectorAll<HTMLButtonElement>('#views button[data-show]').forEach(b => {
    const v = display[b.dataset.show as 'wire'];
    b.classList.toggle('on', !!v);
    if (b.dataset.show === 'section') b.textContent = display.section ? `Schnitt ${'XYZ'[display.section - 1]}` : 'Schnitt';
  });
  $<HTMLInputElement>('bodyColor').value = display.color;
}
document.querySelectorAll<HTMLButtonElement>('#views button[data-show]').forEach(b => b.onclick = () => {
  const k = b.dataset.show as 'wire' | 'glass' | 'edges' | 'render' | 'section';
  if (k === 'section') display.section = (display.section + 1) % 4; else display[k] = !display[k];
  applyDisplay();
});
$<HTMLInputElement>('bodyColor').oninput = e => { display.color = (e.target as HTMLInputElement).value; applyDisplay(); };
applyDisplay();

// ---------- Werkzeugsuche (Strg+K): alle Knöpfe der Werkzeugleiste und der oberen Leiste ----------
const palette = $('palette'), palIn = palette.querySelector('input')!, palList = palette.querySelector('div')!;
const commands = () => [...document.querySelectorAll<HTMLButtonElement>('#toolbar button, #top button, #views button')]
  .map(b => ({ label: b.firstChild!.textContent!.replace(/[↶↷]/g, '').trim(), run: () => b.click() }));
function renderPalette() {
  const q = palIn.value.toLowerCase(), hits = commands().filter(c => c.label.toLowerCase().includes(q));
  palList.replaceChildren(...hits.map((c, i) => {
    const d = document.createElement('div');
    d.textContent = c.label; // Beschriftung als Text, nicht als HTML
    if (!i) d.className = 'first';
    d.onclick = () => { closePalette(); c.run(); };
    return d;
  }));
  return hits;
}
function openPalette() { palette.style.display = 'block'; palIn.value = ''; renderPalette(); palIn.focus(); }
function closePalette() { palette.style.display = 'none'; palIn.blur(); }
palIn.oninput = renderPalette;
palIn.onkeydown = e => {
  if (e.key === 'Escape') closePalette();
  if (e.key === 'Enter') { const c = renderPalette()[0]; closePalette(); c?.run(); }
};
palIn.onblur = () => setTimeout(closePalette, 150);

function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
renderer.setAnimationLoop(() => {
  stepFly();
  controls.update(); renderer.render(scene, camera);
  renderCube();
  updateScale();
  updateDims();
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
