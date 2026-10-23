import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import opencascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { setOC, type Shape3D } from 'replicad';
import { applyPush, GROUND, isCut, ownerOf, sketchFeature, type Feature, type Frame, type Grip, type Vec } from './model';
import { buildBody, forExport } from './kernel';

type Tool = 'select' | 'rect' | 'circle';
const V = (a: ArrayLike<number>) => new THREE.Vector3().fromArray(a as number[]);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const HINTS: Record<Tool, string> = {
  select: 'Klicken = auswählen · Fläche ziehen = extrudieren / Größe ändern · Linksziehen ins Leere = drehen · Rechts = verschieben',
  rect:   'Auf Boden oder Fläche ziehen, um ein Rechteck zu skizzieren · in eine Fläche drücken = Tasche',
  circle: 'Vom Mittelpunkt aus ziehen, um einen Kreis zu skizzieren · in eine Fläche drücken = Bohrung',
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
const group = new THREE.Group(); scene.add(group);
const preview = new THREE.Group(); scene.add(preview);

// Eigene Listener VOR OrbitControls registrieren, damit Werkzeuge Linksklicks übernehmen können
el.addEventListener('pointerdown', onDown);
const controls = new OrbitControls(camera, el);
controls.enableDamping = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
function resetView() { camera.position.set(140, 110, 160); controls.target.set(0, 0, 0); }
resetView();

// ---------- Modell ----------
let features: Feature[] = [], nextId = 1, selId: number | null = null, tool: Tool = 'select';
let drag: any = null, body: Shape3D | null = null, failed: number[] = [], dirty = false, ready = false;
const undoStack: string[] = [], redoStack: string[] = [];
const snapshot = () => JSON.stringify({ features, nextId });
function pushHistory() { undoStack.push(snapshot()); redoStack.length = 0; }
function restore(s: string) { ({ features, nextId } = JSON.parse(s)); selId = null; refresh(); }
function undo() { if (undoStack.length) { redoStack.push(snapshot()); restore(undoStack.pop()!); } }
function redo() { if (redoStack.length) { undoStack.push(snapshot()); restore(redoStack.pop()!); } }
function save() { try { localStorage.setItem('openform', snapshot()); } catch {} }
const getSel = () => features.find(f => f.id === selId);

function shapeOf(f: Feature) {
  const s = new THREE.Shape(), p = f.p;
  if (f.type === 'rect') {
    s.moveTo(p.x, p.y); s.lineTo(p.x + p.w, p.y); s.lineTo(p.x + p.w, p.y + p.h); s.lineTo(p.x, p.y + p.h); s.closePath();
  } else s.absarc(p.cx, p.cy, p.r, 0, Math.PI * 2, false);
  return s;
}

// Skizzen, Vorschau und Auswahlrahmen kommen aus Three.js; der eigentliche Körper aus dem Kern
function buildMesh(f: Feature, kind: 'sketch' | 'preview' | 'outline') {
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

function bodyMesh(b: Shape3D) {
  const m = b.mesh({ tolerance: 0.05, angularTolerance: 0.2 }), e = b.meshEdges({ tolerance: 0.05, angularTolerance: 0.2 });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.vertices, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(m.normals, 3));
  g.setIndex(m.triangles);
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: 0xc9ced6, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  }));
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(e.lines, 3));
  const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x1a1d22 }));
  edges.raycast = () => {};
  mesh.add(edges);
  return mesh;
}

function disposeGroup(gr: THREE.Object3D) {
  gr.traverse((o: any) => { o.geometry?.dispose(); o.material?.dispose(); });
  gr.clear();
}
// Kern-Neuberechnung höchstens einmal pro Bild (Ziehen erzeugt viele Mausereignisse)
function rebuild() { dirty = true; }
function rebuildNow() {
  dirty = false;
  disposeGroup(group);
  body?.delete();
  ({ body, failed } = buildBody(features));
  if (body) group.add(bodyMesh(body));
  for (const f of features) {
    if (Math.abs(f.d) < 1e-6) group.add(buildMesh(f, 'sketch'));
    else if (f.id === selId) group.add(buildMesh(f, 'outline'));
  }
  group.updateMatrixWorld(true);
  $('hint').textContent = failed.length ? `Features ${failed.join(', ')} konnten nicht berechnet werden` : HINTS[tool];
}
function refresh() { rebuild(); renderPanel(); save(); }

// ---------- Eingabe-Helfer ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function setRay(e: PointerEvent) {
  const r = el.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
// Treffer auf Körper oder Skizze; flache Skizzen liegen auf Flächen und haben Vorrang
function pick(): { point: THREE.Vector3; n: THREE.Vector3; grip: Grip | null } | null {
  if (dirty) rebuildNow();
  const hs = ray.intersectObjects(group.children, false);
  if (!hs.length) return null;
  const h = hs.find(h => h.object.userData.id && h.distance < hs[0].distance + 0.05) ?? hs[0];
  const n = h.face!.normal.clone().transformDirection(h.object.matrixWorld).normalize();
  const id = h.object.userData.id, f = features.find(f => f.id === id);
  const grip = f ? { f, part: 'end' as const, k: 1 } : ownerOf(features, h.point.toArray(), n.toArray());
  return { point: h.point.clone(), n, grip };
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

// ---------- Werkzeuge ----------
function onDown(e: PointerEvent) {
  if (e.button !== 0 || !ready) return;
  setRay(e);
  const h = pick();
  if (tool === 'rect' || tool === 'circle') {
    let pl = GROUND;
    if (h) { // auf Fläche skizzieren
      const n = h.n, helper = Math.abs(n.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const u = helper.clone().cross(n).normalize(), v = n.clone().cross(u);
      pl = { o: h.point.toArray() as Vec, n: n.toArray() as Vec, u: u.toArray() as Vec, v: v.toArray() as Vec };
    }
    const p = planeHit(pl);
    if (!p) return;
    const a = toLocal(pl, p).map(x => snap(x, e));
    drag = { kind: 'sketch', pl, a, b: a, onFace: !!h };
  } else {
    if (!h?.grip) { if (selId !== null) { selId = null; refresh(); } return; } // Leere: Orbit
    const { f, part, k } = h.grip;
    selId = f.id; refresh();
    drag = { kind: 'push', f, f0: structuredClone(f), part, k, P0: h.point, D: h.n, sx: e.clientX, sy: e.clientY, started: false };
  }
  controls.enabled = false;
  el.setPointerCapture(e.pointerId);
}

el.addEventListener('pointermove', onMove);
function onMove(e: PointerEvent) {
  if (!ready) return;
  setRay(e);
  if (!drag) {
    el.style.cursor = tool === 'select' ? (pick()?.grip ? 'grab' : 'default') : 'crosshair';
    return;
  }
  if (drag.kind === 'sketch') {
    const p = planeHit(drag.pl);
    if (!p) return;
    drag.b = toLocal(drag.pl, p).map(x => snap(x, e));
    const f = sketchFeature(tool as Feature['type'], drag.pl, drag.a, drag.b, nextId, drag.onFace);
    disposeGroup(preview);
    if (f) {
      preview.add(buildMesh(f, 'preview'));
      showHud(e, f.type === 'rect' ? `${f.p.w.toFixed(1)} × ${f.p.h.toFixed(1)} mm` : `R ${f.p.r.toFixed(1)} mm`);
    }
  } else {
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.started = true; pushHistory(); el.style.cursor = 'grabbing';
    }
    const s = lineParam(drag.P0, drag.D);
    if (s === null) return;
    const [label, val] = applyPush(drag.f, drag.f0, drag.part, drag.k, snap(s, e, 0.5));
    rebuild();
    showHud(e, `${label}: ${val.toFixed(1)} mm${isCut(drag.f) ? ' (Schnitt)' : ''}`);
  }
}

el.addEventListener('pointerup', e => {
  if (!drag) return;
  onMove(e); // Endposition übernehmen
  hud.style.display = 'none';
  if (drag.kind === 'sketch') {
    disposeGroup(preview);
    const f = sketchFeature(tool as Feature['type'], drag.pl, drag.a, drag.b, nextId, drag.onFace);
    if (f) { pushHistory(); nextId++; features.push(f); selId = f.id; setTool('select'); }
  }
  drag = null;
  controls.enabled = true;
  refresh();
});

// ---------- UI ----------
function setTool(t: Tool) {
  tool = t;
  document.querySelectorAll<HTMLButtonElement>('#toolbar button').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  $('hint').textContent = HINTS[t];
}
document.querySelectorAll<HTMLButtonElement>('#toolbar button').forEach(b => b.onclick = () => setTool(b.dataset.tool as Tool));

const panel = $('panel');
function renderPanel() {
  const f = getSel();
  if (!f) { panel.style.display = 'none'; return; }
  const fields = f.type === 'rect'
    ? [['X', 'p.x'], ['Y', 'p.y'], ['Breite', 'p.w'], ['Tiefe', 'p.h'], ['Höhe', 'd']]
    : [['Mitte X', 'p.cx'], ['Mitte Y', 'p.cy'], ['Radius', 'p.r'], ['Höhe', 'd']];
  const get = (k: string): number => k.split('.').reduce((o: any, p) => o[p], f);
  const name = isCut(f) ? (f.type === 'rect' ? 'Tasche' : 'Bohrung') : f.type === 'rect' ? 'Rechteck' : 'Kreis';
  panel.innerHTML = `<h3>${name} #${f.id}</h3>` +
    fields.map(([l, k]) => `<label>${l} <input type="number" step="0.5" data-k="${k}" value="${+get(k).toFixed(2)}"></label>`).join('') +
    `<button class="del">Löschen</button>`;
  panel.style.display = 'block';
  panel.querySelectorAll('input').forEach(inp => inp.onchange = () => {
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
function deleteSel() {
  if (!getSel()) return;
  pushHistory(); features = features.filter(f => f.id !== selId); selId = null; refresh();
}

function download(name: string, blob: Blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportBody(name: string, toBlob: (s: Shape3D) => Blob) {
  if (dirty) rebuildNow();
  if (!body) return alert('Noch kein Körper vorhanden.');
  const s = forExport(body);
  download(name, toBlob(s));
  s.delete();
}
$('bNew').onclick = () => { if (features.length) { pushHistory(); features = []; selId = null; refresh(); } };
$('bUndo').onclick = undo;
$('bRedo').onclick = redo;
$('bView').onclick = resetView;
$('bSave').onclick = () => download('modell.json', new Blob([snapshot()], { type: 'application/json' }));
const fileIn = $<HTMLInputElement>('fileIn');
$('bOpen').onclick = () => fileIn.click();
fileIn.onchange = async () => { const f = fileIn.files?.[0]; if (f) { pushHistory(); restore(await f.text()); } fileIn.value = ''; };
$('bStl').onclick = () => exportBody('modell.stl', s => s.blobSTL({ binary: true, tolerance: 0.01, angularTolerance: 0.1 }));
$('bStep').onclick = () => exportBody('modell.step', s => s.blobSTEP());

addEventListener('keydown', e => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (e.ctrlKey && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (e.ctrlKey && k === 'y') { e.preventDefault(); redo(); }
  else if (k === 'v') setTool('select');
  else if (k === 'r') setTool('rect');
  else if (k === 'c') setTool('circle');
  else if (k === 'delete' || k === 'backspace') deleteSel();
  else if (k === 'escape') { drag = null; disposeGroup(preview); controls.enabled = true; selId = null; setTool('select'); refresh(); }
});

function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
renderer.setAnimationLoop(() => {
  if (dirty && ready) rebuildNow();
  controls.update(); renderer.render(scene, camera);
});

// ---------- Kern laden ----------
// shortcut: Kern läuft im Hauptthread; bei großen Modellen ruckelt das Ziehen → Web Worker (siehe ROADMAP M1)
setOC(await opencascade({ locateFile: () => wasmUrl }));
ready = true;
try { const s = localStorage.getItem('openform'); if (s) ({ features, nextId } = JSON.parse(s)); } catch {}
setTool('select'); refresh();
