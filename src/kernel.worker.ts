// Kern im Web Worker, damit Ziehen und Drehen flüssig bleiben, während OpenCascade rechnet.
import opencascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { measureArea, measureVolume, setOC, type Shape3D } from 'replicad';
import { buildBody, drawingSVG, forExport, loadStep } from './kernel';
import type { Feature } from './model';

export type ToWorker =
  | { type: 'build'; features: Feature[] }
  | { type: 'export'; format: 'step' | 'stl' | 'svg' };
export type FromWorker =
  | { type: 'ready' }
  | { type: 'built'; failed: number[]; volume: number; area: number; meshes: BodyMesh[] }
  | { type: 'export'; format: 'step' | 'stl' | 'svg'; blob: Blob | null }
  | { type: 'error'; message: string };

// faces/edges: je Fläche bzw. Kante [Start, Anzahl] in Dreiecks-Indizes bzw. Linienpunkten, zum Hervorheben
export type BodyMesh = { body: number; volume: number; vertices: Float32Array; normals: Float32Array; triangles: Uint32Array; lines: Float32Array; faces: Int32Array; edges: Int32Array };
const post = (m: FromWorker, transfer: Transferable[] = []) => postMessage(m, { transfer });
const MESH = { tolerance: 0.05, angularTolerance: 0.2 };
let body: Shape3D | null = null, bodies = new Map<number, Shape3D>();
const imports = new Map<number, Shape3D>(); // eingelesene STEP-Dateien, damit sie nicht bei jedem Ziehen neu geparst werden

const ready = opencascade({ locateFile: () => wasmUrl }).then(oc => { setOC(oc); post({ type: 'ready' }); },
  e => post({ type: 'error', message: String(e) }));

onmessage = async ({ data }: MessageEvent<ToWorker>) => {
  await ready;
  if (data.type === 'build') {
    for (const f of data.features) {
      if (f.type !== 'import' || imports.has(f.id)) continue;
      try { imports.set(f.id, await loadStep(f.step)); } catch (e) { console.warn('STEP-Import fehlgeschlagen', e); }
    }
    for (const [id, s] of imports) if (!data.features.some(f => f.id === id)) { s.delete(); imports.delete(id); }
    if (body && bodies.size > 1) body.delete(); // Verbund; ein einzelner Körper wird unten mit gelöscht
    for (const s of bodies.values()) s.delete();
    const r = buildBody(data.features, imports);
    body = r.body; bodies = r.bodies;
    const meshes: BodyMesh[] = [...bodies].map(([id, s]) => {
      const m = s.mesh(MESH), e = s.meshEdges(MESH);
      return { body: id, volume: measureVolume(s), vertices: new Float32Array(m.vertices), normals: new Float32Array(m.normals),
        triangles: new Uint32Array(m.triangles), lines: new Float32Array(e.lines),
        faces: new Int32Array(m.faceGroups.flatMap(g => [g.start, g.count])), edges: new Int32Array(e.edgeGroups.flatMap(g => [g.start, g.count])) };
    });
    const volume = meshes.reduce((v, m) => v + m.volume, 0);
    let area = 0;
    for (const s of bodies.values()) area += measureArea(s);
    post({ type: 'built', failed: r.failed, volume, area, meshes }, meshes.flatMap(m => [m.vertices.buffer, m.normals.buffer, m.triangles.buffer, m.lines.buffer, m.faces.buffer, m.edges.buffer]));
  } else {
    if (!body) return post({ type: 'export', format: data.format, blob: null });
    if (data.format === 'svg') return post({ type: 'export', format: 'svg', blob: new Blob([drawingSVG(body)], { type: 'image/svg+xml' }) });
    const s = forExport(body);
    const blob = data.format === 'step' ? s.blobSTEP() : s.blobSTL({ binary: true, tolerance: 0.01, angularTolerance: 0.1 });
    s.delete();
    post({ type: 'export', format: data.format, blob });
  }
};
