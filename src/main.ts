import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { openSheetEditor, showSheet } from './sheetEditor';
import { baseName, initialFile, isDesktop, openFile, readFile, saveAs, setTitle, writeFile } from './desktop';
import { bulge3, ellipseFeature, type Dim, type BodyMeta, MATERIALS, type RefPlane, bodyOf, pushTo, movesAfter, type Move, type Combine, isFlat, alignTo, applyPush, mirroredCopy, movedCopy, ngonPts, slotPts, contour, endTangent, keyPoints, movePoint, snapTo, offsetFeature, regionFeature, GROUND, isCut, isExtrude, outline, ownerOf, polyFeature, sketchFeature, tangentBulge, type EdgeOp, type Shell, type Extrude, type Con, type Feature, type Frame, type Grip, type Import, type Sweep, type Vec } from './model';
import type { BodyMesh, FromWorker, ToWorker } from './kernel.worker';
import { GcsWrapper, init_planegcs_module } from '@salusoft89/planegcs';
import gcsWasm from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import { solveSketch } from './sketchSolver';

type Tool = 'ellipse' | 'arc' | 'plane' | 'measure' | 'shell' | 'select' | 'rect' | 'circle' | 'ngon' | 'slot' | 'line' | 'spline';
const V = (a: ArrayLike<number>) => new THREE.Vector3().fromArray(a as number[]);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const HINTS: Record<Tool, string> = {
  select: 'Fläche ziehen = extrudieren / Größe ändern · Kante wegziehen = runden, hineinschieben = fasen · Punkte einer ausgewählten Skizze ziehen · Linksziehen ins Leere = drehen · Rechts = verschieben',
  rect:   'Auf Boden oder Fläche ziehen, um ein Rechteck zu skizzieren · beim Ziehen „20x10“ tippen + Enter = genaues Maß',
  circle: 'Vom Mittelpunkt aus ziehen, um einen Kreis zu skizzieren · beim Ziehen Zahl tippen + Enter = Radius',
  ngon:   'Vom Mittelpunkt aus ziehen = Vieleck · beim Ziehen + / − = mehr/weniger Ecken · Zahl tippen + Enter = Radius',
  ellipse: 'Vom Mittelpunkt aus ziehen = Ellipse · Zahl tippen + Enter = Halbachsen „a x b“',
  arc:    'Anfang, Ende, dann Punkt auf dem Bogen klicken · weiter mit Bogen oder L (Linie) · Klick auf den ersten Punkt = schließen · Esc = abbrechen',
  slot:   'Rechteck aufziehen = Langloch mit runden Enden · Zahl tippen + Enter = Länge x Breite',
  plane:  'Fläche anklicken = Hilfsebene 10 mm davor · Ebene ziehen = Abstand ändern · darauf skizzieren wie auf einer Fläche',
  measure: 'Zwei Punkte anklicken (Ecken und Kanten rasten ein) = Abstand; zwei Flächen = auch deren Winkel · dritter Klick beginnt neu',
  shell:  'Fläche des Körpers anklicken, die offen bleiben soll · Shift+Klick = weitere offene Fläche · Wandstärke im Seitenfeld',
  line:   'Punkte klicken · Zahl tippen + Enter = Länge in Mausrichtung · vom letzten Punkt aus ziehen = Bogen · Klick auf den ersten Punkt oder Enter = schließen · Esc = abbrechen',
  spline: 'Punkte klicken, die Kurve läuft glatt hindurch · Klick auf den ersten Punkt oder Enter = schließen · Esc = abbrechen',
};

// ---------- Szene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const el = renderer.domElement;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1e2126);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(80, 150, 60); scene.add(sun);
// weiche Schatten auf einen unsichtbaren Boden, der nur den Schatten zeigt
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.3;
Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 1, far: 500 });
const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-100, 60, -80); scene.add(fill);
const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.ShadowMaterial({ opacity: 0.22 }));
shadowFloor.rotation.x = -Math.PI / 2; shadowFloor.position.y = -0.03; shadowFloor.receiveShadow = true; shadowFloor.raycast = () => {};
scene.add(shadowFloor);
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
let meta: Record<number, BodyMeta> = {}; // Name, Sichtbarkeit, Farbe, Werkstoff je Körper
let roll: number | null = null; // Rückspul-Marke: nur die Schritte davor werden berechnet, neue Schritte kommen dorthin
const live = () => roll === null ? features : features.slice(0, roll);
function add(...fs: Feature[]) { if (roll === null) features.push(...fs); else { features.splice(roll, 0, ...fs); roll += fs.length; } }
let sheetDims: Dim[] = []; // Maße der Zeichnung (Maß-Editor), gehören zum Modell
const snapshot = () => JSON.stringify({ features, nextId, meta, roll, dims: sheetDims });
function pushHistory() { undoStack.push(snapshot()); redoStack.length = 0; }
function load(s: string) { const d = JSON.parse(s); features = d.features; nextId = d.nextId; meta = d.meta ?? {}; roll = d.roll ?? null; sheetDims = d.dims ?? []; }
function restore(s: string) { load(s); selId = null; refresh(); }
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
const getById = (id: number) => features.find(f => f.id === id);
const getSel = () => selId === null ? undefined : getById(selId);
// Kernlochdurchmesser für metrische Regelgewinde in mm
const THREADS: Record<string, number> = { M3: 2.5, M4: 3.3, M5: 4.2, M6: 5, M8: 6.8, M10: 8.5, M12: 10.2 };

function shapeOf(f: Extrude) {
  const s = new THREE.Shape(), p = f.p;
  if (f.type === 'rect') {
    s.moveTo(p.x, p.y); s.lineTo(p.x + p.w, p.y); s.lineTo(p.x + p.w, p.y + p.h); s.lineTo(p.x, p.y + p.h); s.closePath();
  } else if (f.type === 'circle') s.absellipse(p.cx, p.cy, p.r, p.ry ?? p.r, 0, Math.PI * 2, false);
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
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))); // unsichtbar, zum Anklicken
  const fat = new LineSegments2(new LineSegmentsGeometry().setPositions(m.lines), new LineMaterial({ color: 0x1a1d22, linewidth: 1.6 }));
  fat.raycast = () => {};
  mesh.add(fat);
  // Hervorheben beim Überfahren: teilen sich die Puffer des Körpers, zeigen per drawRange nur eine Fläche bzw. Kante
  const hf = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: 0xff9a3c, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  hf.geometry.setAttribute('position', g.attributes.position); hf.geometry.setIndex(g.index);
  const he = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff9a3c, depthTest: false }));
  he.geometry.setAttribute('position', eg.attributes.position);
  for (const o of [hf, he]) { o.visible = false; o.raycast = () => {}; o.renderOrder = 3; mesh.add(o); }
  // Schnittfläche: im Schnitt sieht man durch die Öffnung auf die Innenseiten; einfarbig wirken sie wie eine gefüllte Fläche
  const cap = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xd9822b, side: THREE.BackSide }));
  cap.raycast = () => {}; cap.visible = false; mesh.add(cap);
  Object.assign(mesh.userData, { body: m.body, faces: m.faces, edges: m.edges, hf, he, fat, cap });
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
let pathPreview: Sweep | null = null; // Zug, dessen Pfad gerade gezeichnet wird: wird zur Vorschau mitberechnet
function requestBuild() {
  if (!ready || busy) { pending = true; return; }
  busy = true; pending = false;
  send({ type: 'build', features: pathPreview ? [...live(), pathPreview] : live() });
}
worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
  if (data.type === 'ready') { ready = true; setTool(tool); requestBuild(); }
  else if (data.type === 'error') $('hint').textContent = 'CAD-Kern konnte nicht geladen werden: ' + data.message;
  else if (data.type === 'built') {
    disposeGroup(bodyGroup);
    for (const m of data.meshes) bodyGroup.add(bodyMesh(m));
    bodyGroup.updateMatrixWorld(true);
    bodyIds = data.meshes.map(m => m.body);
    bodyVol = Object.fromEntries(data.meshes.map(m => [m.body, m.volume]));
    if (selBody !== null && !bodyIds.includes(selBody)) { selBody = null; renderPanel(); }
    if (gizmo.object) attachGizmo(gizmo.mode as 'translate' | 'rotate'); // Griffe an die neue Lage setzen
    applyDisplay();
    bodyInfo = data.volume ? ` · ${(data.volume / 1000).toFixed(2)} cm³ · ${(data.area / 100).toFixed(1)} cm²` : '';
    problems = new Map(data.unsure.map(id => [id, { bad: false, why: 'Bezug nur unsicher wiedergefunden – bitte prüfen' }]));
    for (const [id, why] of data.errors) problems.set(id, { bad: true, why });
    renderTree();
    showHint(data.errors.length ? data.errors.map(([id, why]) => `Schritt #${id}: ${why}`).join(' · ') : notice || (poly?.path !== undefined ? PATH_HINT : HINTS[tool]));
    notice = '';
    busy = false;
    // Vom Kern nachgetragene Bezüge und mitgewanderte Lagen übernehmen (kein Rückgängig-Schritt, ergibt sich aus dem Modell).
    // Liegt schon eine neuere Änderung an, verwerfen: der nächste Lauf rechnet sie neu.
    // shortcut: danach rechnet der Kern einmal mehr (ohne neue Korrekturen); erst bei langsamen Modellen spürbar → Netz direkt behalten
    if (data.fixes.length && !pending) {
      for (const [id, p] of data.fixes) { const f = features.find(g => g.id === id); if (f) Object.assign(f, p); }
      rebuild(); save();
    } else if (pending) requestBuild();
  } else if (data.type === 'sheet') showSheet(data);
  else if (data.blob && data.format === 'dxf') data.blob.text().then(t => download('zeichnung.dxf', new Blob([svgToDXF(t)], { type: 'application/dxf' })));
  else if (data.blob && data.format === 'svg' && printNext) { printNext = false; data.blob.text().then(printSVG); }
  else if (data.blob) download(data.format === 'svg' ? 'zeichnung.svg' : `modell.${data.format}`, data.blob);
  else alert('Noch kein Körper vorhanden.');
};

function rebuild() {
  requestBuild();
  disposeGroup(group);
  const L = live();
  L.forEach((f, i) => {
    if (f.type === 'plane' && !f.hidden) return void group.add(planeMesh(f));
    if (f.type === 'import' || f.hidden) return;
    const M = moveMatrix(movesAfter(L, i));
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
      .premultiply(new THREE.Matrix4().makeScale(m.s ?? 1, m.s ?? 1, m.s ?? 1))
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

// Hilfsebene als halbdurchsichtiges Quadrat (60 mm), anklickbar zum Skizzieren und Verschieben
function planeMesh(f: RefPlane) {
  const sel = f.id === selId || multi.has(f.id), g = new THREE.PlaneGeometry(60, 60);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: sel ? 0xff9a3c : 0x8cc4ff, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: sel ? 0xff9a3c : 0x8cc4ff })));
  m.children[0].raycast = () => {};
  m.matrixAutoUpdate = false;
  m.matrix.makeBasis(V(f.u), V(f.v), V(f.n)).setPosition(V(f.c).addScaledVector(V(f.n), f.off));
  m.userData.id = f.id;
  return m;
}

function refresh() { rebuild(); renderPanel(); renderTree(); save(); }

// ---------- Feature-Baum: alle Schritte in Reihenfolge; anklicken = auswählen, ↑ = früher, ● = ein/aus ----------
const tree = $('tree');
let bodyInfo = ''; // Volumen und Oberfläche aller Körper, vom Kern gemeldet
// Schritte mit Problemen, vom Kern gemeldet: bad = nicht berechnet, sonst Bezug nur unsicher gefunden
let problems = new Map<number, { bad: boolean; why: string }>();
let bodyIds: number[] = [], selBody: number | null = null; // vorhandene Körper (vom Kern) und der ausgewählte
let bodyVol: Record<number, number> = {}; // Volumen je Körper in mm³
const bodyName = (b: number) => meta[b]?.name || `Körper #${b}`;
// Masse in g aus Volumen (mm³) und Dichte (g/cm³); ohne Werkstoff leer
const massText = (b: number) => { const d = MATERIALS[meta[b]?.mat ?? '']; return d && bodyVol[b] ? ` · ${(bodyVol[b] / 1000 * d).toFixed(1)} g` : ''; };
function nameOf(f: Feature) {
  if (f.name) return f.name;
  if (f.type === 'import') return 'Import';
  if (f.type === 'shell') return 'Schale';
  if (f.type === 'split') return `${bodyName(f.body)} teilen`;
  if (f.type === 'loft') return 'Übergang';
  if (f.type === 'sweep') return f.sub ? 'Zug (abziehen)' : 'Zug entlang Pfad';
  if (f.type === 'plane') return 'Ebene';
  if (f.type === 'move') return `${bodyName(f.body)} ${f.s ? 'skalieren' : 'bewegen'}`;
  if (f.type === 'combine') return `#${f.a} ${{ fuse: '+', cut: '−', common: '∩' }[f.op]} #${f.b}`;
  if (!isExtrude(f)) return f.type === 'fillet' ? 'Rundung' : 'Fase';
  if (f.rev) return f.sub ? 'Nut' : 'Drehkörper';
  if (Math.abs(f.d) < 1e-6) return 'Skizze';
  if (f.p.ry) return isCut(f) ? 'Tasche' : 'Ellipse';
  return isCut(f) ? (f.type === 'circle' ? 'Bohrung' : 'Tasche') : f.and ? 'Bereich' : f.smooth ? 'Spline' : { rect: 'Rechteck', circle: 'Kreis', poly: 'Profil' }[f.type];
}
function renderTree() {
  tree.innerHTML = (bodyIds.length ? '<h3>Körper</h3>' + bodyIds.map(b =>
    `<div class="row${b === selBody ? ' on' : ''}${meta[b]?.hidden ? ' off' : ''}" data-b="${b}"><span></span>` +
    `<button data-a="eye" title="ein-/ausblenden">${meta[b]?.hidden ? '○' : '●'}</button></div>`).join('') : '') +
    `<h3>Schritte${bodyInfo}</h3>` + (roll !== null ? `<button class="rollEnd">⏭ zurückgespult – alle Schritte berechnen</button>` : '') + (features.map((f, i) =>
    `<div draggable="true" class="row${f.id === selId || multi.has(f.id) ? ' on' : ''}${f.hidden ? ' off' : ''}${roll !== null && i >= roll ? ' later' : ''}${problems.has(f.id) ? problems.get(f.id)!.bad ? ' bad' : ' unsure' : ''}" data-i="${i}" title="Doppelklick = umbenennen · ziehen = Reihenfolge ändern"><span></span>` +
    `<button data-a="roll" title="bis hier zurückspulen">⏮</button><button data-a="eye" title="ein-/ausschalten">${f.hidden ? '○' : '●'}</button></div>`).join('')
    || '<em>Noch keine Schritte</em>');
  tree.querySelector<HTMLButtonElement>('.rollEnd')?.addEventListener('click', () => { pushHistory(); roll = null; refresh(); });
  tree.querySelectorAll<HTMLElement>('.row[data-b]').forEach(row => {
    const b = +row.dataset.b!;
    row.querySelector('span')!.textContent = bodyName(b) + massText(b); // Name als Text, nicht als HTML
    row.onclick = ev => {
      if ((ev.target as HTMLElement).dataset.a === 'eye') { pushHistory(); (meta[b] ??= {}).hidden = !meta[b].hidden; refresh(); return applyDisplay(); }
      clearSel(); selBody = b; detachGizmo(); refresh();
    };
  });
  tree.querySelectorAll<HTMLElement>('.row[data-i]').forEach(row => {
    const i = +row.dataset.i!, f = features[i], span = row.querySelector('span')!;
    span.textContent = (problems.has(f.id) ? '⚠ ' : '') + (f.name ? `${f.name}` : `${nameOf(f)} #${f.id}`);
    if (problems.has(f.id)) span.title = problems.get(f.id)!.why; // Grund beim Überfahren
    span.ondblclick = () => { // umbenennen; leer = wieder Standardname
      span.contentEditable = 'true'; span.textContent = nameOf(f); span.focus(); getSelection()?.selectAllChildren(span);
      span.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); span.blur(); } };
      span.onblur = () => { const t = span.textContent!.trim(); delete f.name; if (t && t !== nameOf(f)) { pushHistory(); f.name = t; } refresh(); };
    };
    row.ondragstart = e => e.dataTransfer!.setData('text/plain', String(i));
    row.ondragover = e => e.preventDefault();
    row.ondrop = e => { // Schritt an diese Stelle verschieben
      e.preventDefault();
      const from = +e.dataTransfer!.getData('text/plain');
      if (from === i || isNaN(from)) return;
      pushHistory(); features.splice(i, 0, ...features.splice(from, 1)); refresh();
    };
  });
  tree.querySelectorAll<HTMLElement>('.row[data-i]').forEach(row => row.onclick = ev => {
    const i = +row.dataset.i!, f = features[i], a = (ev.target as HTMLElement).dataset.a;
    if ((ev.target as HTMLElement).isContentEditable) return;
    if (a === 'eye') { pushHistory(); f.hidden = !f.hidden; }
    else if (a === 'roll') { pushHistory(); roll = i + 1 >= features.length ? null : i + 1; }
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
  const hs = ray.intersectObjects([...bodyGroup.children.filter(m => m.visible), ...group.children], true); // Raycaster prüft Sichtbarkeit nicht
  const faces = hs.filter(h => h.face), eh = hs.find(h => !h.face);
  const fh = faces.find(h => h.object.userData.id && h.distance < faces[0].distance + 0.05) ?? faces[0];
  let face: Hit | null = null, edge: EdgeHit | null = null;
  lastPick = { fh, eh: eh && (!fh || eh.distance < fh.distance + 12 * px) ? eh : undefined };
  if (fh) {
    const n = fh.face!.normal.clone().transformDirection(fh.object.matrixWorld).normalize();
    const id = fh.object.userData.id, f = features.find(f => f.id === id);
    const grip: Grip | null = f && isExtrude(f) ? { f, part: 'end', k: 1 } : f?.type === 'plane' ? { f, part: 'plane', k: 0 } : ownerOf(live(), fh.point.toArray(), n.toArray());
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
let gridStep = 1; // Rastergröße in mm (Auswahl unten links)
// Einheit nur für Anzeige und Eingabe; das Modell rechnet immer in mm
const U = () => display.unit === 'in' ? 25.4 : 1;
const fmt = (mm: number, d = 1) => (mm / U()).toFixed(U() > 1 ? d + 2 : d);      // Zahl in der Anzeigeeinheit
const len = (mm: number, d = 1) => `${fmt(mm, d)} ${display.unit}`;              // mit Einheit
const uval = (mm: number) => +(mm / U()).toFixed(U() > 1 ? 4 : 2);               // Wert für Eingabefelder
const mmOf = (inp: HTMLInputElement) => parseFloat(inp.value) * U();             // Eingabe → mm
const snap = (x: number, e: PointerEvent, s = gridStep) => e.shiftKey ? x : Math.round(x / s) * s;
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
  if (tool === 'ellipse') return ellipseFeature(pl, a, b, nextId, onFace);
  return sketchFeature(tool as 'rect' | 'circle', pl, a, b, nextId, onFace);
}
function hudText(f: Extrude) {
  return f.type === 'rect' ? `${fmt(f.p.w)} × ${len(f.p.h)}` : f.p.ry ? `${fmt(f.p.r)} × ${len(f.p.ry)}` : f.type === 'circle' ? `R ${len(f.p.r)}`
    : tool === 'ngon' ? `${sides}-Eck R ${len(Math.hypot(f.pts![0][0] - drag.a[0], f.pts![0][1] - drag.a[1]))}` : 'Langloch';
}
function finishSketch(b?: number[]) {
  if (b) drag.b = b;
  disposeGroup(preview);
  const f = toolFeature(drag.pl, drag.a, drag.b, drag.onFace);
  if (f) { f.body = drag.body ?? f.id; pushHistory(); nextId++; add(f); selId = f.id; setTool('select'); }
}
// Eingetippte Maße als Felder im HUD: Rechteck/Langloch zwei Felder (Tab wechselt), sonst eins
function showTyped() {
  const two = drag?.kind === 'sketch' && (tool === 'rect' || tool === 'slot' || tool === 'ellipse'), parts = typed.split('x');
  const field = (v: string | undefined, on: boolean) => `<b class="${on ? 'on' : ''}">${v || '…'}</b>`;
  hud.style.display = 'block';
  hud.innerHTML = (two ? `B ${field(parts[0], parts.length === 1)} × T ${field(parts[1], parts.length === 2)}` : field(parts[0], true)) + ` ${display.unit} ⏎`;
}
// Eingetippte Maße anwenden: Rechteck/Langloch „B x T“, Kreis/n-Eck Radius (Richtung der Maus), Linie Länge in Mausrichtung
function applyTyped() {
  const v = typed.split(/[x*; ]+/).map(Number).filter(n => isFinite(n) && n > 0).map(n => n * U());
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
    const end = tool === 'ellipse' ? [a[0] + v[0], a[1] + (v[1] ?? v[0])] : tool === 'rect' || tool === 'slot' ? [a[0] + (Math.sign(dx) || 1) * v[0], a[1] + (Math.sign(dy) || 1) * (v[1] ?? v[0])]
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
// path = ID der Profilskizze: der Linienzug wird Pfad eines Zugs (Sweep) statt Skizze
let poly: { pl: Frame; pts: number[][]; onFace: boolean; smooth: boolean; hover?: number[]; body?: number; arcEnd?: number[]; path?: number } | null = null;
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
// Pfad für einen Zug zeichnen: Ebene durch die Mitte des Profils, aufgespannt von seiner Normalen und einer seiner Achsen;
// der Pfad beginnt in der Profilmitte und läuft zuerst senkrecht vom Profil weg
function startPath(f: Extrude, ax: 'u' | 'v') {
  const p = f.p, c2 = f.type === 'rect' ? [p.x + p.w / 2, p.y + p.h / 2] : f.type === 'circle' ? [p.cx, p.cy]
    : [0, 1].map(k => f.pts!.reduce((s, q) => s + q[k], 0) / f.pts!.length);
  const o = V(f.o).addScaledVector(V(f.u), c2[0]).addScaledVector(V(f.v), c2[1]), u = V(f.n), v = V(f[ax]);
  setTool('line');
  poly = { pl: { o: o.toArray() as Vec, u: u.toArray() as Vec, v: v.toArray() as Vec, n: u.clone().cross(v).toArray() as Vec }, pts: [[0, 0]], onFace: false, smooth: false, path: f.id };
  showPoly(poly.pts);
  showHint(PATH_HINT);
}
const PATH_HINT = 'Zug: Pfad Punkt für Punkt klicken (vom Profil weg) · Enter = offen fertig · Klick auf den Anfang = geschlossen · Esc = abbrechen';
// Zug-Pfad als Feature; closed = über Klick auf den Anfang geschlossen
function sweepOf(pts: number[][], closed: boolean): Sweep | null {
  const P = poly?.path !== undefined ? getById(poly.path) : undefined;
  if (!P || !isExtrude(P) || pts.length < (closed ? 3 : 2)) return null;
  return { id: nextId, type: 'sweep', profile: P.id, ...structuredClone(poly!.pl), pts: structuredClone(pts), ...closed && { closed }, body: P.body ?? nextId };
}
function previewPath(pts: number[][]) { pathPreview = sweepOf(pts, false); requestBuild(); }
function finishPoly(closed = true) {
  if (poly?.path !== undefined) { // Zug anlegen
    const s = sweepOf(poly.pts, closed);
    cancelPoly();
    if (s) { pushHistory(); nextId++; add(s); selId = s.id; setTool('select'); refresh(); }
    return;
  }
  const f = poly && polyFeature(poly.pl, poly.pts, nextId, poly.onFace, poly.smooth);
  if (f) f.body = poly!.body ?? f.id;
  if (f && !f.smooth) { // genau waagrechte/senkrechte Seiten (durch Einrasten) bleiben es: Abhängigkeit setzen
    const pts = f.pts!, cons = pts.flatMap((a, i): Con[] => {
      const b = pts[(i + 1) % pts.length];
      return a[2] ? [] : Math.abs(a[1] - b[1]) < 1e-9 ? [{ t: 'h', i }] : Math.abs(a[0] - b[0]) < 1e-9 ? [{ t: 'v', i }] : [];
    });
    if (cons.length) f.cons = cons;
  }
  cancelPoly();
  if (f) { pushHistory(); nextId++; add(f); selId = f.id; setTool('select'); refresh(); }
}
function cancelPoly() { poly = null; disposeGroup(preview); hud.style.display = 'none'; if (pathPreview) { pathPreview = null; requestBuild(); } }

// ---------- Werkzeuge ----------
function onDown(e: PointerEvent) {
  if (e.button !== 0 || !ready) return;
  setRay(e);
  if (gizmo.object) (gizmo as any).pointerHover({ x: ndc.x, y: ndc.y, button: 0 }); // Treffer auch ohne vorherige Mausbewegung
  if (gizmo.axis) return; // Griffe zum Verschieben/Drehen bedienen sich selbst
  const { face: h, edge } = pick();
  const hp = tool === 'select' ? ray.intersectObjects(handles.children)[0] : undefined;
  if (tool === 'line' || tool === 'spline') {
    if (!poly) poly = { pl: planeFor(h), pts: [], onFace: !!h && h.grip?.part !== 'plane', smooth: tool === 'spline', body: h?.body };
    const q = polyPoint(e), last = poly.pts.at(-1);
    // Druck auf den letzten Punkt: beim Ziehen entsteht ein Bogen; sonst setzt der Klick einen Punkt
    const arc = !poly.smooth && poly.pts.length >= 2 && nearPt(q, last);
    drag = { kind: 'line', arc, sx: e.clientX, sy: e.clientY, started: false }; // drag hält auch die Kamera still
    if (!arc && poly.pts.length >= 3 && nearPt(q, poly.pts[0])) finishPoly();
    else if (!arc && q && !(last && q[0] === last[0] && q[1] === last[1])) poly.pts.push(q);
  } else if (tool === 'arc') { // Bogen durch drei Punkte: Anfang (nur beim ersten Mal), Ende, Punkt auf dem Bogen
    if (!poly) poly = { pl: planeFor(h), pts: [], onFace: !!h && h.grip?.part !== 'plane', smooth: false, body: h?.body };
    const q = polyPoint(e);
    if (!q) return;
    drag = { kind: 'line', arc: false, sx: e.clientX, sy: e.clientY, started: false };
    const pts = poly.pts, last = pts.at(-1);
    if (!last) pts.push(q);
    else if (!poly.arcEnd) { if (!nearPt(q, last)) poly.arcEnd = nearPt(q, pts[0]) ? pts[0] : q; }
    else {
      const b = bulge3(last, poly.arcEnd, q);
      if (b) {
        pts[pts.length - 1] = [last[0], last[1], b];
        if (poly.arcEnd === pts[0]) { poly.arcEnd = undefined; finishPoly(); } else { pts.push(poly.arcEnd); poly.arcEnd = undefined; }
      }
    }
    if (poly) showPoly(pts);
  } else if (tool === 'rect' || tool === 'circle' || tool === 'ngon' || tool === 'slot' || tool === 'ellipse') {
    const pl = planeFor(h); // auf Boden oder Fläche skizzieren
    const a = sketchPoint(pl, e);
    if (!a) return;
    drag = { kind: 'sketch', pl, a, b: a, onFace: !!h && h.grip?.part !== 'plane', body: h?.body };
  } else if (tool === 'measure') { // Punkt auf Fläche/Kante, eingerastet an Ecken; zwei Punkte = Abstand
    const P = edge ? V(edge.at) : h?.point;
    if (!P) return;
    const pts = [...features.filter(isExtrude).filter(f => !f.hidden).flatMap(keyPoints), ...snapSegs(null).flat()];
    const s = snapTo(P.toArray() as Vec, pts, [], 8 * pxSize());
    if (measure.length === 2) { measure = []; measureN = []; }
    measure.push(s ? V(s.p) : P.clone());
    measureN.push(!edge && h ? h.n.clone() : null);
    showMeasure();
    return;
  } else if (tool === 'plane') {
    if (!h) return;
    const pl = planeFor(h), f: RefPlane = { id: nextId++, type: 'plane', c: h.point.toArray() as Vec, n: pl.n, u: pl.u, v: pl.v, off: 10 };
    pushHistory(); add(f); clearSel(); selId = f.id; setTool('select'); refresh();
    return;
  } else if (tool === 'shell') { // Körper aushöhlen, angeklickte Fläche bleibt offen
    if (!h || h.grip?.f && isExtrude(h.grip.f) && isFlat(h.grip.f)) return;
    const cur = getSel();
    if (e.shiftKey && cur?.type === 'shell') { pushHistory(); (cur.more ??= []).push(h.point.toArray() as Vec); refresh(); return; }
    const f: Shell = { id: nextId++, type: 'shell', at: h.point.toArray() as Vec, t: 1, body: h.body };
    pushHistory(); add(f); selId = f.id; setTool('select'); refresh();
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
    if (g.part === 'plane') { drag = { kind: 'plane', f: g.f, off0: g.f.off, P0: h.point, D: V(g.f.n), sx: e.clientX, sy: e.clientY, started: false }; controls.enabled = false; el.setPointerCapture(e.pointerId); return; }
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
  if (!drag && ['rect', 'circle', 'ngon', 'slot', 'ellipse'].includes(tool)) sketchPoint(planeFor(pick().face), e); // Einrasten schon vor dem Klick zeigen
  if (poly && !drag) {
    const q = polyPoint(e);
    if (!q || !poly.pts.length) return;
    const last = poly.pts.at(-1)!;
    poly.hover = q;
    if (poly.arcEnd) { // Vorschau des Bogens durch q
      const b = bulge3(last, poly.arcEnd, q);
      showPoly([...poly.pts.slice(0, -1), [last[0], last[1], b], poly.arcEnd]);
      return showHud(e, b ? 'Punkt auf dem Bogen' : 'auf einer Linie');
    }
    showPoly([...poly.pts, q]);
    if (poly.path !== undefined) previewPath([...poly.pts, q]);
    if (typed) return showTyped();
    return showHud(e, `${len(Math.hypot(q[0] - last[0], q[1] - last[1]))} · Zahl tippen`);
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
    return showHud(e, `Bogen R ${len(L / 2 / Math.abs(Math.sin(2 * Math.atan(b[2])) || 1e-9))}`);
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
      if (r) { nextId++; add(r); drag.f = r; drag.f0 = structuredClone(r); selId = r.id; } // nur den Bereich ziehen
    }
    if (drag.kind === 'edge') { // Radius = Abstand des Mauszeigers von der Kante
      if (!drag.f) {
        // Erste Bewegung entscheidet: vom Körper weg = Rundung, in den Körper hinein = Fase
        const out = edgeOutward(drag.P0), a = drag.P0.clone().project(camera), b = out && drag.P0.clone().add(out).project(camera);
        const inward = b && (b.x - a.x) * (e.clientX - drag.sx) - (b.y - a.y) * (e.clientY - drag.sy) < 0;
        drag.f = { id: nextId++, type: inward ? 'chamfer' : 'fillet', at: drag.edge.at, dir: drag.edge.dir, r: 1, body: drag.edge.body } satisfies EdgeOp;
        add(drag.f); selId = drag.f.id;
      }
      drag.f.r = Math.max(0.5, snap(ray.ray.distanceToPoint(drag.P0), e, Math.min(0.5, gridStep)));
      rebuild();
      return showHud(e, `${drag.f.type === 'fillet' ? 'Radius' : 'Fase'}: ${len(drag.f.r)}`);
    }
    if (drag.kind === 'plane') { // Ebene entlang ihrer Normalen verschieben
      const s = lineParam(drag.P0, drag.D);
      if (s === null) return;
      drag.f.off = drag.off0 + snap(s, e, Math.min(0.5, gridStep));
      rebuild();
      return showHud(e, `Abstand: ${len(drag.f.off)}`);
    }
    if (drag.kind === 'point') {
      const p = planeHit(drag.f);
      if (!p) return;
      const q = toLocal(drag.f, p).map(x => snap(x, e));
      movePoint(drag.f, drag.f0, drag.i, q);
      if (constrain(drag.f, [drag.i])) drag.last = drag.f.pts; else drag.f.pts = drag.last ?? drag.f0.pts; // gezogener Punkt bleibt, Rest folgt
      rebuild();
      return showHud(e, `Punkt ${fmt(q[0])} / ${len(q[1])}`);
    }
    const s = lineParam(drag.P0, drag.D);
    if (s === null) return;
    const [label, val] = applyPush(drag.f, drag.f0, drag.part, drag.k, snap(s, e, Math.min(0.5, gridStep)), drag.i);
    if (drag.part === 'seg' || drag.part === 'arc') { // verschobene Seite bleibt, Abhängigkeiten ziehen den Rest nach
      if (constrain(drag.f, [drag.i, (drag.i + 1) % drag.f.pts.length])) drag.last = drag.f.pts; else drag.f.pts = drag.last ?? drag.f0.pts;
    }
    rebuild();
    if (typed) showTyped(); else showHud(e, `${label}: ${len(val)}${isCut(drag.f) ? ' (Schnitt)' : ''} · Zahl tippen`);
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
  const keep = poly && !poly.smooth && ['line', 'arc'].includes(t) && ['line', 'arc'].includes(tool); // zwischen Linie und Bogen wechseln
  if (t !== tool && !keep) { cancelPoly(); measure = []; measureN = []; }
  if (poly) poly.arcEnd = undefined;
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
  if (f.type === 'sweep') {
    panel.innerHTML = `<h3>${nameOf(f)} #${f.id}</h3><p style="color:var(--muted);margin:4px 0">Profil #${f.profile} · Pfad ${f.closed ? 'geschlossen' : 'offen'}, ${f.closed ? f.pts.length : f.pts.length - 1} Abschnitte</p>` +
      `<label>Abziehen <input type="checkbox" class="sub"${f.sub ? ' checked' : ''} style="width:auto"></label><button class="del">Löschen</button>`;
    panel.querySelector<HTMLInputElement>('.sub')!.onchange = e => { pushHistory(); f.sub = (e.target as HTMLInputElement).checked || undefined; refresh(); };
    return panel.querySelector<HTMLButtonElement>('.del')!.onclick = deleteSel;
  }
  if (f.type === 'move' || f.type === 'combine' || f.type === 'split' || f.type === 'loft') {
    panel.innerHTML = `<h3>${nameOf(f)}</h3><button class="del">Löschen</button>`;
    return panel.querySelector<HTMLButtonElement>('.del')!.onclick = deleteSel;
  }
  if (f.type === 'import') return renderImportPanel(f);
  if (f.type === 'shell') return renderShellPanel(f);
  if (f.type === 'plane') {
    panel.innerHTML = `<h3>Ebene #${f.id}</h3><label>Abstand <input type="number" step="0.5" value="${uval(f.off)}"></label><button class="del">Löschen</button>`;
    const inp = panel.querySelector('input')!;
    inp.onchange = () => { const v = mmOf(inp); if (isFinite(v)) { pushHistory(); f.off = v; refresh(); } };
    return panel.querySelector<HTMLButtonElement>('.del')!.onclick = deleteSel;
  }
  if (!isExtrude(f)) return renderEdgePanel(f);
  const fields = f.type === 'rect' ? [['X', 'p.x'], ['Y', 'p.y'], ['Breite', 'p.w'], ['Tiefe', 'p.h'], ['Höhe', 'd']]
    : f.p.ry ? [['Mitte X', 'p.cx'], ['Mitte Y', 'p.cy'], ['Halbachse X', 'p.r'], ['Halbachse Y', 'p.ry'], ['Höhe', 'd']]
    : f.type === 'circle' ? [['Mitte X', 'p.cx'], ['Mitte Y', 'p.cy'], ['Radius', 'p.r'], ['Höhe', 'd']]
    : [['Höhe', 'd']];
  if (f.rev) fields.splice(-1, 1, ['Winkel °', 'rev']);
  const get = (k: string): number => k.split('.').reduce((o: any, p) => o[p], f);
  const name = nameOf(f);
  const other = multi.size === 1 ? getById([...multi][0]) : undefined, loftTo = isFlat(f) && other && isExtrude(other) && isFlat(other) ? other : null;
  panel.innerHTML = `<h3>${name} #${f.id}</h3>` +
    fields.map(([l, k]) => `<label>${l} <input type="number" step="0.5" data-k="${k}" value="${k === 'rev' ? get(k) : uval(get(k))}"></label>`).join('') +
    (isFlat(f) && !f.and && !f.smooth ? `<label>Versatz <input type="number" step="0.5" value="${uval(2)}" class="off"></label><button class="addOff">Versatz anlegen</button>` : '') +
    (isFlat(f) || f.rev ? `<label>Drehen um <select class="revAx"><option value="">–</option><option value="u">x-Achse der Skizze</option><option value="v">y-Achse der Skizze</option></select></label>` : '') +
    (f.type === 'poly' && !f.smooth ? consHtml(f) : '') +
    (isFlat(f) ? `<button class="act sw" data-ax="u">Zug: Pfad zeichnen</button><button class="act sw" data-ax="v">Zug: Pfad quer dazu</button>` : '') +
    (loftTo ? `<button class="act loft">Übergang (Loft) zu ${nameOf(loftTo)} #${loftTo.id}</button>` : isFlat(f) ? `<p style="color:var(--muted);margin:4px 0">Übergang: zweite Skizze mit Shift+Klick dazu</p>` : '') +
    (f.type === 'circle' && isCut(f) && !f.rev ? `<label>Gewinde <select class="thr"><option value="">–</option>${Object.keys(THREADS).map(m => `<option>${m}</option>`).join('')}</select></label>
      <button class="act cb">Senkung anlegen</button>` : '') +
    (f.rev ? `<label>Abziehen (Nut) <input type="checkbox" class="sub"${f.sub ? ' checked' : ''} style="width:auto"></label>` : '') +
    `<details><summary>Muster / Spiegeln</summary>
      <label>Achse <select class="ax"><option>X</option><option>Y</option><option selected>Z</option></select></label>
      <label>Anzahl <input class="cnt" type="number" min="2" value="3"></label>
      <label>Abstand <input class="dist" type="number" step="0.5" value="${uval(20)}"></label>
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
    add(...cs); selId = cs.at(-1)!.id; refresh();
  };
  panel.querySelector<HTMLButtonElement>('.lin')!.onclick = () => addCopies((n, ax) =>
    Array.from({ length: n - 1 }, (_, i) => movedCopy(f, nextId++, ax.map(x => x * num('.dist') * U() * (i + 1)) as Vec)));
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
  panel.querySelectorAll<HTMLButtonElement>('.sw').forEach(b => b.onclick = () => startPath(f, b.dataset.ax as 'u' | 'v'));
  panel.querySelector<HTMLButtonElement>('.loft')?.addEventListener('click', () => {
    pushHistory(); const id = nextId++; add({ id, type: 'loft', a: f.id, b: loftTo!.id, body: f.body ?? id }); clearSel(); selId = id; refresh();
  });
  const thr = panel.querySelector<HTMLSelectElement>('.thr');
  if (thr) { // Kernloch für metrisches Gewinde (Bohrung bekommt den Namen, Gewinde selbst wird nicht modelliert)
    thr.value = Object.keys(THREADS).find(m => f.name === `Gewinde ${m}`) ?? '';
    thr.onchange = () => { pushHistory(); if (thr.value) { f.p.r = THREADS[thr.value] / 2; f.name = `Gewinde ${thr.value}`; } else delete f.name; refresh(); };
  }
  panel.querySelector<HTMLButtonElement>('.cb')?.addEventListener('click', () => { // Senkung: weitere Bohrung, 1,8-facher Durchmesser, 1/3 so tief
    pushHistory(); const g: Extrude = { ...structuredClone(f), id: nextId++, p: { ...f.p, r: f.p.r * 1.8 }, d: -Math.max(1, Math.abs(f.d) / 3) };
    delete (g as Feature).name; add(g); selId = g.id; refresh();
  });
  const sub = panel.querySelector<HTMLInputElement>('.sub');
  if (sub) sub.onchange = () => { pushHistory(); f.sub = sub.checked; refresh(); };
  const addOff = panel.querySelector<HTMLButtonElement>('.addOff');
  if (addOff) addOff.onclick = () => { // neue Skizze außen (> 0) bzw. innen (< 0) um die ausgewählte
    const g = offsetFeature(f, mmOf(panel.querySelector<HTMLInputElement>('.off')!) || 0, nextId);
    if (!g) return showNotice('Versatz zu groß: von der Skizze bleibt nichts übrig');
    pushHistory(); nextId++; add(g); selId = g.id; refresh();
  };
  panel.querySelectorAll<HTMLInputElement>('input[data-k]').forEach(inp => inp.onchange = () => {
    const v = inp.dataset.k === 'rev' ? parseFloat(inp.value) : mmOf(inp);
    if (!isFinite(v)) return;
    pushHistory();
    const ks = inp.dataset.k!.split('.'), key = ks.at(-1)!;
    const obj: any = ks.length > 1 ? f.p : f;
    obj[key] = ['w', 'h', 'r', 'ry'].includes(key) ? Math.max(0.5, v) : key === 'rev' ? Math.max(1, Math.min(360, v)) : v;
    refresh();
  });
  panel.querySelector<HTMLButtonElement>('.del')!.onclick = deleteSel;
}
// Maße und Abhängigkeiten eines Vielecks: je gerade Seite Länge (eingeben = festlegen), waagrecht, senkrecht;
// zwei Seiten parallel, rechtwinklig, gleich lang; Liste der gesetzten Abhängigkeiten mit ✕
const sideLen = (pts: number[][], i: number) => { const a = pts[i], b = pts[(i + 1) % pts.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); };
const CON_TEXT = { len: 'Länge', h: 'waagrecht', v: 'senkrecht', par: '∥', perp: '⟂', eq: '=' };
const conText = (c: Con) => c.t === 'len' ? `Seite ${c.i + 1} = ${len(c.val!, 2)}` : c.j === undefined ? `Seite ${c.i + 1} ${CON_TEXT[c.t]}` : `Seite ${c.i + 1} ${CON_TEXT[c.t]} Seite ${c.j + 1}`;
function consHtml(f: Extrude) {
  const pts = f.pts!, sides = pts.map((_, i) => i).filter(i => !pts[i][2]), has = (t: Con['t'], i: number) => f.cons?.some(c => c.t === t && c.i === i);
  const opts = sides.map(i => `<option value="${i}">${i + 1}</option>`).join('');
  return `<details open class="cons"><summary>Maße und Abhängigkeiten</summary>` +
    sides.map(i => `<label>Seite ${i + 1} <span><input type="number" step="0.5" class="len${has('len', i) ? ' lock' : ''}" data-i="${i}" value="${uval(sideLen(pts, i))}">` +
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
    const i = +inp.dataset.i!, v = mmOf(inp);
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
    el.textContent = `${fmt(sideLen(pts, i))}${c('h') ? ' —' : ''}${c('v') ? ' |' : ''}`;
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
    <label>${f.type === 'fillet' ? 'Radius' : 'Abstand'} <input type="number" step="0.5" value="${uval(f.r)}"></label>
    <button class="del">Löschen</button>`;
  const sel = panel.querySelector('select')!, inp = panel.querySelector('input')!;
  sel.value = f.type;
  sel.onchange = () => { pushHistory(); f.type = sel.value as EdgeOp['type']; refresh(); };
  inp.onchange = () => {
    const v = mmOf(inp);
    if (!isFinite(v)) return;
    pushHistory(); f.r = Math.max(0.5, v); refresh();
  };
  panel.querySelector<HTMLButtonElement>('.del')!.onclick = deleteSel;
}
function renderShellPanel(f: Shell) {
  panel.innerHTML = `<h3>Schale #${f.id}</h3><p style="color:var(--muted);margin:0 0 6px">${1 + (f.more?.length ?? 0)} offene Fläche(n) · weitere: H, dann Shift+Klick</p><label>Wandstärke <input type="number" step="0.5" value="${uval(f.t)}"></label><button class="del">Löschen</button>`;
  const inp = panel.querySelector('input')!;
  inp.onchange = () => { const v = mmOf(inp); if (isFinite(v) && v > 0) { pushHistory(); f.t = v; refresh(); } };
  panel.querySelector<HTMLButtonElement>('.del')!.onclick = deleteSel;
}
// Mehrere Kanten auf einmal runden oder fasen (Shift+Klick auf Kanten)
function renderEdgeSetPanel() {
  panel.innerHTML = `<h3>${edgeSel.length} Kante${edgeSel.length > 1 ? 'n' : ''}</h3><p style="color:var(--muted);margin:0 0 6px">Shift+Klick = weitere Kanten</p>
    <label>Maß <input type="number" step="0.5" value="${uval(2)}" class="r"></label>
    <button class="act" data-t="fillet">Runden</button><button class="act" data-t="chamfer">Fasen</button>`;
  panel.querySelectorAll<HTMLButtonElement>('button[data-t]').forEach(b => b.onclick = () => {
    const r = Math.max(0.5, mmOf(panel.querySelector<HTMLInputElement>('.r')!) || 2);
    pushHistory();
    for (const a of edgeSel) add({ id: nextId++, type: b.dataset.t as EdgeOp['type'], at: a.at, dir: a.dir, r, body: a.body });
    selId = (features.at(-1) as EdgeOp).id; edgeSel = []; refresh();
  });
}
function deleteSel() {
  const ids = new Set([selId, ...multi]);
  if (!features.some(f => ids.has(f.id))) return;
  pushHistory();
  if (roll !== null) roll -= features.slice(0, roll).filter(f => ids.has(f.id)).length;
  features = features.filter(f => !ids.has(f.id)); clearSel(); refresh();
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
  add(...out);
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
    const b = sel.type === 'move' ? sel.body : sel.type !== 'combine' && sel.type !== 'plane' ? bodyOf(sel) : null;
    if (b !== null && bodyIds.includes(b)) items.push([`Körper #${b} auswählen`, () => { clearSel(); selBody = b; refresh(); }]);
    if (isExtrude(sel)) items.push(['Muster / Spiegeln …', () => { const d = panel.querySelector<HTMLDetailsElement>('details:not(.cons)'); if (d) d.open = true; }]);
    items.push(null);
  } else if (edge) items.push(['Kante runden / fasen …', () => { clearSel(); edgeSel = [edge]; refresh(); }], null);
  if (selBody !== null) items.push(['Körper duplizieren (Strg+D)', () => { copySel(); paste(); }], null);
  if (clip.length) items.push(['Einfügen (Strg+V)', paste]);
  items.push(['Einpassen (F)', fitView], ['Rückgängig (Strg+Z)', undo], ['Werkzeugsuche (Strg+K)', openPalette]);
  showMenu(e.clientX, e.clientY, items);
}
function showMenu(x: number, y: number, items: ([string, () => void] | null)[]) {
  ctx.replaceChildren(...items.map(it => {
    if (!it) return document.createElement('hr');
    const b = document.createElement('button');
    b.textContent = it[0];
    b.onclick = () => { ctx.style.display = 'none'; it[1](); };
    return b;
  }));
  ctx.style.display = 'block';
  ctx.style.left = `${Math.min(x, innerWidth - ctx.offsetWidth - 8)}px`;
  ctx.style.top = `${Math.min(y, innerHeight - ctx.offsetHeight - 8)}px`;
}

// Exporte: in der Desktop-App über den Speichern-Dialog, im Browser als Download
function download(name: string, blob: Blob) {
  if (isDesktop) return void saveAs(name, blob).catch(e => alert('Speichern fehlgeschlagen: ' + e));
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('bNew').onclick = () => { if (features.length) { pushHistory(); features = []; meta = {}; roll = null; sheetDims = []; setFile(null); clearSel(); refresh(); } };
$('bUndo').onclick = undo;
$('bRedo').onclick = redo;
// Modell als .ofc (dasselbe JSON wie im Autosave). Desktop: Speichern schreibt in die geöffnete Datei, sonst Dialog
let filePath: string | null = null;
function setFile(path: string | null) { filePath = path; void setTitle(path ? `${baseName(path)} – OpenForm CAD` : 'OpenForm CAD'); }
async function saveModel(as = false) {
  if (!isDesktop) return download('modell.ofc', new Blob([snapshot()], { type: 'application/json' }));
  try {
    if (filePath && !as) { await writeFile(filePath, snapshot()); return showHint(`Gespeichert: ${baseName(filePath)}`); }
    const p = await saveAs(filePath ? baseName(filePath) : 'modell.ofc', snapshot());
    if (p) { setFile(p); showHint(`Gespeichert: ${baseName(p)}`); }
  } catch (e) { alert('Speichern fehlgeschlagen: ' + e); }
}
$('bSave').onclick = () => saveModel();
const fileIn = $<HTMLInputElement>('fileIn');
$('bOpen').onclick = async () => {
  if (!isDesktop) return fileIn.click();
  try { const f = await openFile(); if (f) opened(f.path, f.text); } catch (e) { alert('Öffnen fehlgeschlagen: ' + e); }
};
// .ofc/.json = eigenes Modell öffnen, .step/.stp = Körper ins Modell importieren; path = Desktop-Pfad zum späteren Speichern
function opened(name: string, text: string, path: string | null = null) {
  pushHistory();
  if (!/\.(step|stp)$/i.test(name)) { restore(text); return setFile(path); }
  const f: Import = { id: nextId, type: 'import', name: baseName(name), step: text, body: nextId++ };
  add(f); selId = f.id; refresh();
}
fileIn.onchange = async () => {
  const file = fileIn.files?.[0];
  fileIn.value = '';
  if (file) opened(file.name, await file.text());
};
$('bStl').onclick = () => send({ type: 'export', format: 'stl' });
$('bStep').onclick = () => send({ type: 'export', format: 'step' });
// ---------- Zeichnung: Blatt als SVG oder drucken (PDF), Ansichten als DXF ----------
let printNext = false; // nächstes Blatt drucken statt speichern
function sheetInfo(format: 'A4' | 'A3') {
  const b = bodyIds.find(b => !meta[b]?.hidden) ?? bodyIds[0];
  return { sheet: format, title: (b !== undefined && meta[b]?.name) || 'Modell', material: b !== undefined ? meta[b]?.mat ?? '' : '', date: new Date().toLocaleDateString('de-DE'), unit: display.unit };
}
function sheet(format: 'A4' | 'A3', print: boolean) {
  printNext = print;
  send({ type: 'export', format: 'svg', info: sheetInfo(format), dims: sheetDims });
}
function editSheet() {
  if (!bodyIds.length) return alert('Noch kein Körper vorhanden.');
  openSheetEditor({
    request: f => send({ type: 'sheet', info: sheetInfo(f), dims: sheetDims }),
    dims: () => sheetDims,
    change: (d, history) => { if (history) pushHistory(); sheetDims = d; save(); },
    print: f => sheet(f, true), save: f => sheet(f, false),
  });
}
$('bSvg').onclick = e => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  showMenu(r.left, r.bottom + 4, [['Zeichnung bemaßen …', editSheet], null, ['Blatt A4 als SVG', () => sheet('A4', false)], ['Blatt A3 als SVG', () => sheet('A3', false)],
    ['A4 drucken / als PDF speichern', () => sheet('A4', true)], ['A3 drucken / als PDF speichern', () => sheet('A3', true)], null,
    ['Ansichten als DXF (1:1)', () => send({ type: 'export', format: 'dxf' })], ['Körper als OBJ', exportOBJ]]);
};
// Drucken über einen unsichtbaren Rahmen; „Als PDF speichern“ im Druckdialog ergibt die PDF-Datei
function printSVG(svg: string) {
  const size = svg.match(/width="(\d+)mm" height="(\d+)mm"/)!, f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0';
  document.body.append(f);
  f.contentDocument!.write(`<html><head><style>@page{size:${size[1]}mm ${size[2]}mm;margin:0}body{margin:0}svg{display:block}</style></head><body>${svg}</body></html>`);
  f.contentDocument!.close();
  setTimeout(() => { f.contentWindow!.print(); setTimeout(() => f.remove(), 1000); }, 100);
}
// SVG-Pfade (y nach unten) → DXF-Linien in mm (y nach oben); Bögen und Kurven als kurze Strecken
// shortcut: Bögen werden zu Strecken (0,5 mm) → echte ARC-Elemente, wenn jemand die DXF weiterbearbeiten will
function svgToDXF(svg: string) {
  const NS = 'http://www.w3.org/2000/svg', host = document.createElementNS(NS, 'svg'), out = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  host.style.cssText = 'position:absolute;visibility:hidden';
  document.body.append(host);
  for (const p of new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('path')) {
    const layer = p.hasAttribute('stroke-dasharray') ? 'VERDECKT' : 'SICHTBAR';
    for (const d of p.getAttribute('d')!.split(/(?=M)/)) {
      let pts: number[][];
      if (/^[\sML\d.eE+-]*$/.test(d)) { const n = d.match(/-?[\d.]+(e-?\d+)?/gi)!.map(Number); pts = Array.from({ length: n.length / 2 }, (_, i) => [n[2 * i], n[2 * i + 1]]); }
      else {
        const el = host.appendChild(document.createElementNS(NS, 'path'));
        el.setAttribute('d', d);
        const L = el.getTotalLength(), m = Math.min(2000, Math.max(8, Math.ceil(L / 0.5)));
        pts = Array.from({ length: m + 1 }, (_, i) => { const q = el.getPointAtLength(L * i / m); return [q.x, q.y]; });
        el.remove();
      }
      for (let i = 1; i < pts.length; i++)
        out.push('0', 'LINE', '8', layer, '10', String(pts[i - 1][0]), '20', String(-pts[i - 1][1]), '30', '0', '11', String(pts[i][0]), '21', String(-pts[i][1]), '31', '0');
    }
  }
  host.remove();
  return [...out, '0', 'ENDSEC', '0', 'EOF'].join('\n');
}
// Sichtbare Körper als OBJ, Z oben wie STEP/STL
function exportOBJ() {
  const g = new THREE.Group();
  g.rotation.x = Math.PI / 2; // Szene Y-oben → Z-oben
  for (const m of bodyGroup.children as THREE.Mesh[]) if (m.visible) g.add(new THREE.Mesh(m.geometry));
  if (!g.children.length) return alert('Noch kein Körper vorhanden.');
  g.updateMatrixWorld(true);
  download('modell.obj', new Blob([new OBJExporter().parse(g)], { type: 'text/plain' }));
}

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
  if (e.ctrlKey && k === 's') { e.preventDefault(); return void saveModel(e.shiftKey); } // Strg+Umschalt+S = speichern unter
  if (e.ctrlKey && k === 'o') { e.preventDefault(); return $('bOpen').click(); }
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
  else if (k === 'i') setTool('ellipse');
  else if (k === 'a') setTool('arc');
  else if (k === 'n') setTool('ngon');
  else if (k === 'o') setTool('slot');
  else if (k === 'h') setTool('shell');
  else if (k === 'm') setTool('measure');
  else if (k === 'e') setTool('plane');
  else if (k === 'f') fitView();
  else if (k in { 0: 1, 1: 1, 2: 1, 3: 1 }) setView(['iso', 'front', 'top', 'right'][+k]);
  else if (k === 'l') setTool('line');
  else if (k === 's') setTool('spline');
  else if (k === 'enter' && poly) finishPoly(poly.path === undefined); // Zug-Pfad: Enter = offen fertig
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
function addMove(q: THREE.Quaternion, t: THREE.Vector3, s = 1) {
  if (selBody === null || t.length() < 1e-6 && Math.abs(q.w) > 1 - 1e-9 && s === 1) return;
  pushHistory();
  add({ id: nextId++, type: 'move', body: selBody, c: gizmoStart.toArray() as Vec, q: q.toArray(), t: t.toArray() as Vec, ...s !== 1 && { s } });
  refresh();
}
function commitGizmo() { addMove(pivot.quaternion.clone(), pivot.position.clone().sub(gizmoStart)); }
function renderBodyPanel(b: number) {
  const others = bodyIds.filter(o => o !== b), planes = live().filter(f => f.type === 'plane');
  const bm = meta[b] ?? {};
  panel.innerHTML = `<h3>Körper #${b}</h3>
    <label>Name <input class="nm" placeholder="Körper #${b}"></label>
    <label>Werkstoff <select class="mat"><option value="">–</option>${Object.keys(MATERIALS).map(m => `<option>${m}</option>`).join('')}</select></label>
    <label>Farbe <input type="color" class="col" value="${bm.color ?? display.color}" style="width:40px;padding:0"></label>
    <p class="info" style="margin:4px 0;color:var(--muted)"></p>
    <button class="gT">Verschieben (Griffe)</button><button class="gR">Drehen (Griffe)</button>
    <details><summary>Genau verschieben / drehen</summary>
      <label>ΔX <input type="number" step="0.5" value="0" class="dx"></label><label>ΔY <input type="number" step="0.5" value="0" class="dy"></label>
      <label>ΔZ <input type="number" step="0.5" value="0" class="dz"></label><button class="mv">Verschieben</button>
      <label>Achse <select class="ax"><option>X</option><option>Y</option><option selected>Z</option></select></label>
      <label>Winkel ° <input type="number" step="5" value="90" class="ang"></label><button class="rt">Drehen um Mitte</button>
      <label>Maßstab % <input type="number" step="10" value="200" class="sc"></label><button class="scl">Skalieren um Mitte</button>
    </details>` +
    (planes.length ? `<label>an <select class="pl">${planes.map(p => `<option value="${p.id}">${nameOf(p)} #${p.id}</option>`).join('')}</select></label><button class="split">Teilen</button>`
      : `<p style="color:var(--muted)">Teilen: erst mit E eine Ebene anlegen</p>`) +
    (others.length ? `<label>mit <select class="other">${others.map(o => `<option value="${o}">Körper #${o}</option>`).join('')}</select></label>
    <button class="op" data-op="fuse">Vereinigen</button><button class="op" data-op="cut">Abziehen</button><button class="op" data-op="common">Schnittmenge</button>` : '');
  panel.querySelectorAll<HTMLButtonElement>('button').forEach(x => x.classList.add('act'));
  const q = <T extends HTMLElement>(c: string) => panel.querySelector<T>(c)!;
  q<HTMLButtonElement>('.gT').onclick = () => attachGizmo('translate');
  q<HTMLButtonElement>('.gR').onclick = () => attachGizmo('rotate');
  const num = (c: string) => parseFloat(q<HTMLInputElement>(c).value) || 0;
  const setMeta = (k: keyof BodyMeta, v: any) => { pushHistory(); meta[b] = { ...meta[b], [k]: v || undefined }; refresh(); applyDisplay(); };
  q<HTMLInputElement>('.nm').value = bm.name ?? '';
  q<HTMLInputElement>('.nm').onchange = e => setMeta('name', (e.target as HTMLInputElement).value.trim());
  q<HTMLSelectElement>('.mat').value = bm.mat ?? '';
  q<HTMLSelectElement>('.mat').onchange = e => setMeta('mat', (e.target as HTMLSelectElement).value);
  q<HTMLInputElement>('.col').onchange = e => setMeta('color', (e.target as HTMLInputElement).value);
  const split = panel.querySelector<HTMLButtonElement>('.split');
  if (split) split.onclick = () => { pushHistory(); add({ id: nextId++, type: 'split', body: b, plane: +q<HTMLSelectElement>('.pl').value }); detachGizmo(); refresh(); };
  q('.info').textContent = bodyVol[b] ? `${(bodyVol[b] / 1000).toFixed(2)} cm³${massText(b)}` : '';
  q<HTMLButtonElement>('.scl').onclick = () => {
    const s = num('.sc') / 100;
    if (s <= 0) return;
    attachGizmo('translate');
    addMove(new THREE.Quaternion(), new THREE.Vector3(), s);
  };
  // Achsen wie in der Exportdatei: X = x, Y = −z, Z = y
  q<HTMLButtonElement>('.mv').onclick = () => { attachGizmo('translate'); addMove(new THREE.Quaternion(), new THREE.Vector3(num('.dx'), num('.dz'), -num('.dy')).multiplyScalar(U())); };
  q<HTMLButtonElement>('.rt').onclick = () => {
    attachGizmo('rotate');
    const ax = V({ X: [1, 0, 0], Y: [0, 0, -1], Z: [0, 1, 0] }[q<HTMLSelectElement>('.ax').value]!);
    addMove(new THREE.Quaternion().setFromAxisAngle(ax, num('.ang') * Math.PI / 180), new THREE.Vector3());
  };
  panel.querySelectorAll<HTMLButtonElement>('.op').forEach(x => x.onclick = () => { // b nimmt den anderen Körper auf
    const f: Combine = { id: nextId++, type: 'combine', op: x.dataset.op as Combine['op'], a: b, b: +q<HTMLSelectElement>('.other').value };
    pushHistory(); add(f); detachGizmo(); refresh();
  });
}

// ---------- Messen ----------
let measure: THREE.Vector3[] = [], measureN: (THREE.Vector3 | null)[] = []; // Punkte und, auf Flächen, deren Normalen
function showMeasure() {
  disposeGroup(preview);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff9a3c, depthTest: false });
  for (const p of measure) { const m = new THREE.Mesh(new THREE.SphereGeometry(4 * pxSize(), 12, 6), mat.clone()); m.position.copy(p); m.renderOrder = 2; preview.add(m); }
  if (measure.length < 2) return showHint('Zweiten Punkt anklicken');
  const [a, b] = measure, d = b.clone().sub(a);
  preview.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0xff9a3c, depthTest: false })));
  // Achsen wie in der Exportdatei: X = x, Y = −z, Z = y
  const [n1, n2] = measureN, ang = n1 && n2 ? ` · Winkel der Flächen ${(Math.acos(Math.max(-1, Math.min(1, n1.dot(n2)))) * 180 / Math.PI).toFixed(1)}°` : '';
  showHint(`Abstand ${len(d.length(), 2)} · ΔX ${fmt(d.x, 2)} · ΔY ${fmt(-d.z, 2)} · ΔZ ${fmt(d.y, 2)}${ang}`);
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
  const h = ray.intersectObjects([...bodyGroup.children.filter(m => m.visible), ...group.children], true).find(x => x.face);
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
const display = { wire: false, glass: false, edges: true, section: 0, secOff: 0, render: false, color: '#c9ced6', grid: 1, unit: 'mm' as 'mm' | 'in' };
try { Object.assign(display, JSON.parse(localStorage.getItem('openform-view') ?? '{}')); } catch {}
let envMap: THREE.Texture | null = null;
const cut = new THREE.Plane();
function applyDisplay() {
  localStorage.setItem('openform-view', JSON.stringify(display));
  envMap ??= new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = display.render ? 1 : 0.3;
  renderer.toneMapping = display.render ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  grid.visible = fine.visible = !display.render && !display.section; // Raster schiene durch die Schnittfläche
  renderer.localClippingEnabled = !!display.section;
  if (bodyGroup.children.length && display.section) { // Schnittebene durch die Mitte aller Körper; Achsen wie in der Exportdatei (X, Y = −z, Z = y)
    const box = new THREE.Box3().setFromObject(bodyGroup), n = V([[1, 0, 0], [0, 0, 1], [0, -1, 0]][display.section - 1]);
    const half = Math.abs(box.getSize(new THREE.Vector3()).dot(n)) / 2; // Regler −1 … 1 = ganze Tiefe des Modells
    cut.setFromNormalAndCoplanarPoint(n, box.getCenter(new THREE.Vector3()).addScaledVector(n, display.secOff * half * 0.999));
  }
  for (const mesh of bodyGroup.children as THREE.Mesh[]) {
    const m = mesh.material as THREE.MeshStandardMaterial, lines = mesh.children[0] as THREE.LineSegments;
    const bm = meta[mesh.userData.body];
    m.color.set(bm?.color ?? display.color);
    mesh.visible = !bm?.hidden;
    m.emissive.set(mesh.userData.body === selBody ? 0x5a2a00 : 0x000000);
    m.wireframe = display.wire;
    m.transparent = display.glass; m.opacity = display.glass ? 0.35 : 1; m.depthWrite = !display.glass;
    m.metalness = display.render ? 0.35 : 0.1; m.roughness = display.render ? 0.35 : 0.6;
    m.clippingPlanes = (lines.material as THREE.Material).clippingPlanes = mesh.userData.fat.material.clippingPlanes = display.section ? [cut] : null;
    m.side = display.section && !display.wire ? THREE.FrontSide : THREE.DoubleSide; // im Schnitt zeigt cap die Innenseiten
    mesh.userData.cap.visible = !!display.section && !display.wire && !display.glass;
    mesh.userData.cap.material.clippingPlanes = display.section ? [cut] : null;
    m.needsUpdate = true;
    mesh.userData.fat.visible = display.edges;
  }
  document.querySelectorAll<HTMLButtonElement>('#views button[data-show]').forEach(b => {
    const v = display[b.dataset.show as 'wire'];
    b.classList.toggle('on', !!v);
    if (b.dataset.show === 'section') b.textContent = display.section ? `Schnitt ${'XYZ'[display.section - 1]}` : 'Schnitt';
  });
  $<HTMLInputElement>('bodyColor').value = display.color;
  $('secOff').style.display = display.section ? '' : 'none';
  $<HTMLInputElement>('secOff').value = String(display.secOff);
  gridStep = display.grid; $<HTMLSelectElement>('gridStep').value = String(display.grid);
  $<HTMLSelectElement>('unit').value = display.unit;
}
$<HTMLInputElement>('secOff').oninput = e => { display.secOff = +(e.target as HTMLInputElement).value; applyDisplay(); };
$<HTMLSelectElement>('unit').onchange = e => { display.unit = (e.target as HTMLSelectElement).value as 'mm' | 'in'; applyDisplay(); renderPanel(); buildDims(); };
$<HTMLSelectElement>('gridStep').onchange = e => { display.grid = +(e.target as HTMLSelectElement).value; applyDisplay(); };

// Symbole und Tooltips für die Werkzeugleiste
const ICONS: Partial<Record<Tool, string>> = {
  select: '<path d="M4 2l9 6-4 1 2 5-2 1-2-5-3 3z"/>', rect: '<rect x="2" y="4" width="12" height="8"/>', circle: '<circle cx="8" cy="8" r="5.5"/>',
  ngon: '<path d="M8 2l5.2 3v6L8 14l-5.2-3V5z"/>', slot: '<rect x="1.5" y="5" width="13" height="6" rx="3"/>', line: '<path d="M2 13L6 4l8 5"/><circle cx="6" cy="4" r="1"/>',
  spline: '<path d="M2 12c3-9 6 3 12-8"/>', ellipse: '<ellipse cx="8" cy="8" rx="6.5" ry="4"/>', arc: '<path d="M2 12A7 7 0 0 1 14 12"/><circle cx="8" cy="5" r="1"/>', plane: '<path d="M1.5 12l4-8h9l-4 8z"/>', shell: '<path d="M2 5l6-3 6 3v6l-6 3-6-3z M5 6.5l3 1.5 3-1.5"/>', measure: '<path d="M2 11L11 2l3 3-9 9z M5 8l1.5 1.5 M7 6l1.5 1.5 M9 4l1.5 1.5"/>',
};
document.querySelectorAll<HTMLButtonElement>('#toolbar button').forEach(b => {
  const t = b.dataset.tool as Tool;
  b.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 16 16">${ICONS[t] ?? ''}</svg>`);
  b.title = HINTS[t];
});
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
  .map(b => ({ label: [...b.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').replace(/[↶↷]/g, '').trim(), run: () => b.click() }));
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

try { const s = localStorage.getItem('openform'); if (s) load(s); } catch {}
refresh();
// Desktop: per Doppelklick auf eine .ofc-Datei gestartet → diese öffnen
if (isDesktop) initialFile().then(async p => { if (p) opened(p, await readFile(p), p); }).catch(e => alert('Datei konnte nicht geöffnet werden: ' + e));

// Maßstab: runde Länge (1, 2 oder 5 × 10ⁿ mm), die auf Höhe des Drehpunkts etwa 100 Pixel lang ist
const scaleBar = $('scale');
function updateScale() {
  const u = 100 * pxSize() / U(), e = 10 ** Math.floor(Math.log10(u)), nice = [5, 2, 1].find(k => k * e <= u)! * e; // in Anzeigeeinheit
  const label = `${+nice.toFixed(4)} ${display.unit}`;
  (scaleBar.firstElementChild as HTMLElement).style.width = `${nice * U() / pxSize()}px`;
  if (scaleBar.lastElementChild!.textContent !== label) scaleBar.lastElementChild!.textContent = label;
}
