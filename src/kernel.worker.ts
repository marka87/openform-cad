// Kern im Web Worker, damit Ziehen und Drehen flüssig bleiben, während OpenCascade rechnet.
import opencascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { loadFont, measureArea, measureVolume, setOC, type Shape3D } from 'replicad';
import fontUrl from '../vendor/fonts/DejaVuSans.ttf?url';
import { shownEdges, newCache, buildBody, drawingSVG, forExport, loadStep, projectBody, to3MF, resolveDims, sheetCands, sheetSVG, type Cands, type SheetInfo , invalidBodies } from './kernel';
import type { Dim, Feature, Frame } from './model';
import type { EdgeRef, Named } from './topo';

export type ToWorker =
  | { type: 'build'; features: Feature[] }
  | { type: 'export'; format: 'step' | 'stl' | '3mf' | 'svg' | 'dxf'; info?: SheetInfo; dims?: Dim[]; force?: boolean }
  | { type: 'sheet'; info: SheetInfo; dims: Dim[] } // Blatt für den Maß-Editor
  | { type: 'project'; body: number; pl: Frame } // Kanten eines Körpers in eine Ebene projizieren (P)
  | { type: 'check'; features: Feature[] }; // nur rechnen, Fehler zurück, Anzeige bleibt (KI-Korrekturrunde, T8.6)
export type FromWorker =
  | { type: 'ready' }
  | { type: 'built'; failed: number[]; errors: [number, string][]; unsure: number[]; fixes: [number, Record<string, unknown>][]; confirm: [number, Record<string, unknown>][]; volume: number; area: number; meshes: BodyMesh[] }
  | { type: 'export'; format: 'step' | 'stl' | '3mf' | 'svg' | 'dxf'; blob: Blob | null; invalid?: number[] }
  | { type: 'error'; message: string }
  | { type: 'checked'; errors: [number, string][] }
  | { type: 'notice'; text: string }
  | { type: 'projected'; lines: { pts: number[][]; closed: boolean; src: EdgeRef | null }[] }
  // geo: Punkte jedes darstellbaren Maßes in Blattkoordinaten (zum Verschieben); bad: nicht auflösbare Maße mit Grund
  | { type: 'sheet'; svg: string; cands: Cands; geo: [number, number[][], number][]; bad: [number, string][] }; // geo: id, Punkte, Kreisradius auf dem Blatt

// faces/edges: je Fläche bzw. Kante [Start, Anzahl] in Dreiecks-Indizes bzw. Linienpunkten, zum Hervorheben
export type BodyMesh = { body: number; volume: number; vertices: Float32Array; normals: Float32Array; triangles: Uint32Array; lines: Float32Array; faces: Int32Array; edges: Int32Array };
const post = (m: FromWorker, transfer: Transferable[] = []) => postMessage(m, { transfer });
const MESH = { tolerance: 0.05, angularTolerance: 0.2 };
let body: Shape3D | null = null, bodies = new Map<number, Shape3D>(), names = new Map<number, Named>();
const imports = new Map<number, Shape3D>(); // eingelesene STEP-Dateien, damit sie nicht bei jedem Ziehen neu geparst werden

// Schrift für Text-Features gleich mitladen; fehlt sie, schlagen nur Texte sichtbar fehl
const ready = opencascade({ locateFile: () => wasmUrl }).then(async oc => {
  setOC(oc);
  await loadFont(fontUrl).catch(e => console.warn('Schrift nicht geladen', e));
  post({ type: 'ready' });
}, e => post({ type: 'error', message: String(e) }));

const free = (r: { body: Shape3D | null; bodies: Map<number, Shape3D> }) => {
  if (r.body && r.bodies.size > 1) r.body.delete();
  for (const s of r.bodies.values()) s.delete();
};

const buildCache = newCache();
onmessage = async ({ data }: MessageEvent<ToWorker>) => {
  await ready;
  if (data.type === 'build') {
    for (const f of data.features) {
      if (f.type !== 'import' || imports.has(f.id)) continue;
      try { imports.set(f.id, await loadStep(f.step, n => post({ type: 'notice', text: `${f.name}: ${n} überlappende Körper weggelassen (Zwischenstände aus dem Export)` }))); } catch (e) { console.warn('STEP-Import fehlgeschlagen', e); }
    }
    for (const [id, s] of imports) if (!data.features.some(f => f.id === id)) { s.delete(); imports.delete(id); }
    if (body && bodies.size > 1) body.delete(); // Verbund; ein einzelner Körper wird unten mit gelöscht
    for (const s of bodies.values()) s.delete();
    const r = buildBody(data.features, imports, buildCache);
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
  } else if (data.type === 'check') {
    // wie in main.ts: nachgetragene Bezüge übernehmen und ein zweites Mal rechnen, erst dann zählen die Fehler
    // Antwort kommt immer, sonst hängt die KI-Anfrage bei „CAD-Kern prüft …“; der normale Lauf zeigt den Fehler danach ohnehin
    try {
      let fs = data.features, r = buildBody(fs, imports);
      if (r.fixes.size) {
        fs = fs.map(f => r.fixes.has(f.id) ? { ...f, ...r.fixes.get(f.id) } as Feature : f);
        free(r); r = buildBody(fs, imports);
      }
      free(r);
      post({ type: 'checked', errors: [...r.errors] });
    } catch (e) {
      console.warn('Prüflauf fehlgeschlagen', e);
      post({ type: 'checked', errors: [] });
    }
  } else if (data.type === 'project') {
    const s = bodies.get(data.body);
    post({ type: 'projected', lines: s ? projectBody(s, names.get(data.body) ?? [], data.pl) : [] });
  } else if (data.type === 'sheet') {
    if (!body) return post({ type: 'export', format: 'svg', blob: null });
    const d = resolveDims(data.dims, bodies, names), L: { S?: (i: number, p: number[]) => number[]; k?: number } = {};
    const svg = sheetSVG(body, data.info, d.ok, L);
    post({ type: 'sheet', svg, cands: sheetCands(bodies, names, L.S!, L.k!), geo: d.ok.map(g => [g.id, g.pts.map(p => L.S!(g.v, p)), (g.rv ?? 0) * L.k!]), bad: d.bad });
  } else {
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
  }
};
