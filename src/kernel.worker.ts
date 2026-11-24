// Kern im Web Worker, damit Ziehen und Drehen flüssig bleiben, während OpenCascade rechnet.
import opencascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { loadFont, makeCompound, measureArea, measureVolume, setOC, type Shape3D } from 'replicad';
import fontUrl from '../vendor/fonts/DejaVuSans.ttf?url';
import { shownEdges, newCache, dropCache, buildBody, maxEdgeSize, drawingSVG, forExport, loadStep, projectBody, to3MF, resolveDims, sheetCands, sheetSVG, type Cands, type SheetInfo, type SheetLayout , invalidBodies, ocDead } from './kernel';
import type { Dim, Feature, Frame } from './model';
import type { EdgeRef, Named } from './topo';

export type ToWorker =
  | { type: 'build'; features: Feature[] }
  | { type: 'export'; format: 'step' | 'stl' | '3mf' | 'svg' | 'dxf'; info?: SheetInfo; dims?: Dim[]; force?: boolean; skip?: number[] } // skip: ausgeblendete Körper
  | { type: 'sheet'; info: SheetInfo; dims: Dim[]; skip?: number[] } // Blatt für den Maß-Editor
  | { type: 'project'; body: number; pl: Frame } // Kanten eines Körpers in eine Ebene projizieren (P)
  | { type: 'maxEdge'; features: Feature[]; id: number }; // größtes Maß, bei dem Rundung/Fase id noch gelingt (I2)
export type FromWorker =
  | { type: 'ready' }
  | { type: 'built'; failed: number[]; errors: [number, string][]; unsure: number[]; fixes: [number, Record<string, unknown>][]; confirm: [number, Record<string, unknown>][]; volume: number; area: number; meshes: BodyMesh[] }
  | { type: 'export'; format: 'step' | 'stl' | '3mf' | 'svg' | 'dxf'; blob: Blob | null; invalid?: number[]; error?: string }
  | { type: 'error'; message: string }
  | { type: 'maxEdge'; id: number; r: number | null }
  | { type: 'notice'; text: string }
  | { type: 'projected'; lines: { pts: number[][]; closed: boolean; src: EdgeRef | null }[] }
  // geo: Punkte jedes darstellbaren Maßes in Blattkoordinaten (zum Verschieben); bad: nicht auflösbare Maße mit Grund
  | { type: 'sheet'; svg: string; cands: Cands; geo: [number, number[][], number][]; bad: [number, string][]; lay: { k: number; o: number[][]; box: number[][] } }; // lay: Lage der Ansichten 0–2 (Schnittlinie ziehen, Einzelheit setzen) // geo: id, Punkte, Kreisradius auf dem Blatt

// faces/edges: je Fläche bzw. Kante [Start, Anzahl] in Dreiecks-Indizes bzw. Linienpunkten, zum Hervorheben
export type BodyMesh = { body: number; volume: number; vertices: Float32Array; normals: Float32Array; triangles: Uint32Array; lines: Float32Array; faces: Int32Array; edges: Int32Array };
const post = (m: FromWorker, transfer: Transferable[] = []) => postMessage(m, { transfer });
const MESH = { tolerance: 0.05, angularTolerance: 0.2 };
let body: Shape3D | null = null, bodies = new Map<number, Shape3D>(), names = new Map<number, Named>();
const imports = new Map<number, Shape3D>(); // eingelesene STEP-Dateien, damit sie nicht bei jedem Ziehen neu geparst werden
const importText = new Map<number, string>(); // STEP-Text je Import: gleiche Nummer, anderer Text (andere Datei geöffnet) = neu einlesen (A6)

// Schrift für Text-Features gleich mitladen; fehlt sie, schlagen nur Texte sichtbar fehl
const boot = () => opencascade({ locateFile: () => wasmUrl }).then(oc => setOC(oc));
const ready = boot().then(async () => {
  await loadFont(fontUrl).catch(e => console.warn('Schrift nicht geladen', e));
  post({ type: 'ready' });
}, e => post({ type: 'error', message: String(e) }));
// Neuer Kern statt des abgestürzten; alte Formen nicht mehr anfassen (gehören zur toten Instanz), nur loslassen
async function restart() {
  post({ type: 'notice', text: 'CAD-Kern war abgestürzt und wurde neu gestartet · Modell wird neu gerechnet' });
  body = null; bodies = new Map(); names = new Map(); buildCache = newCache(); imports.clear(); importText.clear();
  await boot();
}

const free = (r: { body: Shape3D | null; bodies: Map<number, Shape3D> }) => {
  if (r.body && r.bodies.size > 1) r.body.delete();
  for (const s of r.bodies.values()) s.delete();
};

let buildCache = newCache(), lastBuild: ToWorker | null = null;
// Jeder Auftrag bekommt eine Antwort, auch wenn er scheitert: sonst wartet main.ts ewig (busy) und rechnet nie mehr neu (A2)
onmessage = async ({ data }: MessageEvent<ToWorker>) => {
  await ready;
  try { await handle(data); } catch (e) {
    let why = e instanceof Error ? e.message : String(e);
    if (ocDead(why)) { // einmal mit frischem Kern wiederholen; stürzt er wieder ab, gilt der normale Fehlerweg
      // erst den letzten Stand neu bauen: Export, Blatt und Projektion brauchen die Körper, die mit dem alten Kern weg sind
      try { await restart(); if (data.type !== 'build' && lastBuild) await handle(lastBuild); return await handle(data); } catch (e2) { e = e2; why = e2 instanceof Error ? e2.message : String(e2); }
    }
    console.warn('Auftrag fehlgeschlagen', data.type, e);
    if (data.type === 'build') {
      if (!ocDead(why)) try { free({ body, bodies }); dropCache(buildCache); } catch {} // Körper und Zwischenstände freigeben, sonst wächst der WASM-Speicher bei jedem Fehlschlag
      body = null; bodies = new Map(); names = new Map(); buildCache = newCache(); // Stand unklar: nächster Lauf rechnet alles neu
      post({ type: 'notice', text: `Neurechnen fehlgeschlagen: ${why}` });
      post({ type: 'built', failed: [], errors: [], unsure: [], fixes: [], confirm: [], volume: 0, area: 0, meshes: [] });
    } else if (data.type === 'project') post({ type: 'projected', lines: [] });
    else if (data.type === 'maxEdge') post({ type: 'maxEdge', id: data.id, r: null });
    else post({ type: 'export', format: data.type === 'sheet' ? 'svg' : data.format, blob: null, error: why }); // Grund mitschicken, sonst meldet main.ts „noch kein Körper“
  }
};
async function handle(data: ToWorker) {
  if (data.type === 'build') {
    lastBuild = data;
    for (const f of data.features) {
      if (f.type !== 'import') continue;
      if (imports.has(f.id) && importText.get(f.id) === f.step) continue;
      if (imports.has(f.id)) { imports.get(f.id)!.delete(); imports.delete(f.id); dropCache(buildCache); buildCache.keys = []; } // Zwischenstand kennt den STEP-Text nicht
      importText.set(f.id, f.step);
      try { imports.set(f.id, await loadStep(f.step, n => post({ type: 'notice', text: `${f.name}: ${n} überlappende Körper weggelassen (Zwischenstände aus dem Export)` }))); } catch (e) { console.warn('STEP-Import fehlgeschlagen', e); }
    }
    for (const [id, s] of imports) if (!data.features.some(f => f.id === id)) { s.delete(); imports.delete(id); importText.delete(id); }
    if (body && bodies.size > 1) body.delete(); // Verbund; ein einzelner Körper wird unten mit gelöscht
    for (const s of bodies.values()) s.delete();
    body = null; bodies = new Map(); // gelöscht: scheitert der Lauf unten, darf nichts mehr darauf zugreifen
    const r = buildBody(data.features, imports, buildCache);
    const dead = [...r.errors].find(([, m]) => ocDead(m)); // Schritte fangen ihre Fehler selbst: Absturz hier erkennen, sonst wird nie neu gestartet
    if (dead) throw new Error(dead[1]);
    body = r.body; bodies = r.bodies; names = r.names;
    const meshes: BodyMesh[] = [...bodies].map(([id, s]) => {
      const m = s.mesh(MESH), e = shownEdges(s, MESH);
      return { body: id, volume: measureVolume(s), vertices: new Float32Array(m.vertices), normals: new Float32Array(m.normals),
        triangles: new Uint32Array(m.triangles), lines: new Float32Array(e.lines),
        faces: new Int32Array(m.faceGroups.flatMap(g => [g.start, g.count])), edges: new Int32Array(e.edges) };
    });
    const volume = meshes.reduce((v, m) => v + m.volume, 0);
    let area = 0;
    for (const s of bodies.values()) area += measureArea(s);
    post({ type: 'built', failed: r.failed, errors: [...r.errors], unsure: r.unsure, fixes: [...r.fixes], confirm: [...r.confirm], volume, area, meshes }, meshes.flatMap(m => [m.vertices.buffer, m.normals.buffer, m.triangles.buffer, m.lines.buffer, m.faces.buffer, m.edges.buffer]));
  } else if (data.type === 'maxEdge') {
    post({ type: 'maxEdge', id: data.id, r: maxEdgeSize(data.features, data.id, imports) });
  } else if (data.type === 'project') {
    const s = bodies.get(data.body);
    post({ type: 'projected', lines: s ? projectBody(s, names.get(data.body) ?? [], data.pl) : [] });
  } else if (data.type === 'sheet') {
    const { body, bodies, drop } = shown(data.skip);
    try {
      if (!body) return post({ type: 'export', format: 'svg', blob: null });
      const d = resolveDims(data.dims, bodies, names), L: SheetLayout = {};
      const svg = sheetSVG(body, data.info, d.ok, L);
      post({ type: 'sheet', svg, cands: sheetCands(bodies, names, L.S!, L.k!), geo: d.ok.map(g => [g.id, g.pts.map(p => L.S!(g.v, p)), (g.rv ?? 0) * L.k!]), bad: d.bad, lay: { k: L.k!, o: L.o!, box: L.box! } });
    } finally { drop(); }
  } else {
    const { body, bodies, drop } = shown(data.skip);
    try {
      if (!body) return post({ type: 'export', format: data.format, blob: null });
      if (data.format === 'svg') return post({ type: 'export', format: 'svg', blob: new Blob([sheetSVG(body, data.info!, resolveDims(data.dims ?? [], bodies, names).ok)], { type: 'image/svg+xml' }) });
      if (data.format === 'dxf') return post({ type: 'export', format: 'dxf', blob: new Blob([drawingSVG(body)]) }); // Umwandlung im Hauptthread (braucht das DOM)
      const invalid = data.force ? [] : invalidBodies(bodies);
      if (invalid.length) return post({ type: 'export', format: data.format, blob: null, invalid });
      if (data.format === '3mf') return post({ type: 'export', format: '3mf', blob: new Blob([to3MF([...bodies.values()])], { type: 'model/3mf' }) });
      const s = forExport(body);
      const blob = data.format === 'step' ? s.blobSTEP() : s.blobSTL({ binary: true, tolerance: 0.01, angularTolerance: 0.1 });
      s.delete();
      post({ type: 'export', format: data.format, blob });
    } finally { drop(); }
  }
}
// Nur die sichtbaren Körper; drop gibt einen eigens gebauten Verbund wieder frei
function shown(skip?: number[]) {
  if (!skip?.length) return { body, bodies, drop: () => {} };
  const bs = new Map([...bodies].filter(([k]) => !skip.includes(k))), all = [...bs.values()];
  const b = all.length > 1 ? makeCompound(all.map(s => s.clone())) as Shape3D : all[0] ?? null; // makeCompound gibt seine Teile frei
  return { body: b, bodies: bs, drop: () => { if (all.length > 1) b?.delete(); } };
}
