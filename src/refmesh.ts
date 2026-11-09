// Referenz-Netz (F2): STL/OBJ/3MF einlesen und als Dreiecksliste speichern. Nur zum Ansehen, Messen und Skizzieren,
// nie im Kern oder im Export: ein Netz ist kein echter Volumenkörper.
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

export const isMeshFile = (name: string) => /\.(stl|obj|3mf)$/i.test(name);

// Alle Dreiecke als x,y,z je Ecke in Szenen-Lage (Datei Z oben → Szene Y oben, wie beim Export umgekehrt); Einheit mm angenommen
export async function meshPositions(name: string, buf: ArrayBuffer): Promise<Float32Array> {
  const geos: THREE.BufferGeometry[] = [];
  if (/\.stl$/i.test(name)) geos.push(new STLLoader().parse(buf));
  else {
    const root = /\.obj$/i.test(name) ? new OBJLoader().parse(new TextDecoder().decode(buf))
      : new (await import('three/examples/jsm/loaders/3MFLoader.js')).ThreeMFLoader().parse(buf); // braucht DOMParser: nur im Browser/WebView
    root.updateMatrixWorld(true);
    root.traverse(o => { if ((o as THREE.Mesh).isMesh) geos.push((o as THREE.Mesh).geometry.clone().applyMatrix4(o.matrixWorld)); });
  }
  const parts = geos.map(g => (g.index ? g.toNonIndexed() : g).getAttribute('position').array as Float32Array);
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let k = 0;
  for (const p of parts) { out.set(p, k); k += p.length; }
  for (let i = 0; i < out.length; i += 3) { const y = out[i + 1]; out[i + 1] = out[i + 2]; out[i + 2] = -y; } // (x, y, z) → (x, z, −y)
  if (!out.length) throw new Error('keine Dreiecke gefunden');
  return out;
}

// shortcut: Base64 im Modell; jeder Rückgängig-Schritt kopiert es mit (wie STEP, A8), bei sehr großen Netzen viel Speicher → Netz außerhalb der Schrittliste halten
export function toBase64(a: Float32Array) {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(s: string) {
  const bin = atob(s), b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new Float32Array(b.buffer);
}
