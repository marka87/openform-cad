// Kern im Web Worker, damit Ziehen und Drehen flüssig bleiben, während OpenCascade rechnet.
import opencascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { setOC, type Shape3D } from 'replicad';
import { buildBody, forExport, loadStep } from './kernel';
import type { Feature } from './model';

export type ToWorker =
  | { type: 'build'; features: Feature[] }
  | { type: 'export'; format: 'step' | 'stl' };
export type FromWorker =
  | { type: 'ready' }
  | { type: 'built'; failed: number[]; mesh: { vertices: Float32Array; normals: Float32Array; triangles: Uint32Array; lines: Float32Array } | null }
  | { type: 'export'; format: 'step' | 'stl'; blob: Blob | null }
  | { type: 'error'; message: string };

const post = (m: FromWorker, transfer: Transferable[] = []) => postMessage(m, { transfer });
const MESH = { tolerance: 0.05, angularTolerance: 0.2 };
let body: Shape3D | null = null;
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
    body?.delete();
    const r = buildBody(data.features, imports);
    body = r.body;
    if (!body) return post({ type: 'built', failed: r.failed, mesh: null });
    const m = body.mesh(MESH);
    const mesh = {
      vertices: new Float32Array(m.vertices), normals: new Float32Array(m.normals),
      triangles: new Uint32Array(m.triangles), lines: new Float32Array(body.meshEdges(MESH).lines),
    };
    post({ type: 'built', failed: r.failed, mesh }, [mesh.vertices.buffer, mesh.normals.buffer, mesh.triangles.buffer, mesh.lines.buffer]);
  } else {
    if (!body) return post({ type: 'export', format: data.format, blob: null });
    const s = forExport(body);
    const blob = data.format === 'step' ? s.blobSTEP() : s.blobSTL({ binary: true, tolerance: 0.01, angularTolerance: 0.1 });
    s.delete();
    post({ type: 'export', format: data.format, blob });
  }
};
