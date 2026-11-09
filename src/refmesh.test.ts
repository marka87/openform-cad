import { expect, test } from 'vitest';
import { fromBase64, isMeshFile, meshPositions, toBase64 } from './refmesh';
import { parseModel } from './model';

// Ein Dreieck als binäre STL: 80 Byte Kopf, Anzahl, je Dreieck Normale + 3 Ecken + 2 Byte
function stl(tri: number[]) {
  const b = new ArrayBuffer(84 + 50), v = new DataView(b);
  v.setUint32(80, 1, true);
  tri.forEach((x, i) => v.setFloat32(84 + 12 + i * 4, x, true));
  return b;
}

test('Referenz-Netz: STL und OBJ lesen, Z oben → Y oben, Base64 hin und zurück (F2)', async () => {
  const s = await meshPositions('teil.STL', stl([0, 0, 0, 10, 0, 0, 0, 0, 5]));
  expect([...s]).toEqual([0, 0, -0, 10, 0, -0, 0, 5, -0]); // Spitze z = 5 liegt in der Szene oben (y)
  const o = await meshPositions('a.obj', new TextEncoder().encode('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n').buffer);
  expect(o.length).toBe(2 * 9); // Viereck → 2 Dreiecke
  expect([...fromBase64(toBase64(o))]).toEqual([...o]);
  expect([isMeshFile('x.3mf'), isMeshFile('x.step')]).toEqual([true, false]);
  await expect(meshPositions('leer.obj', new ArrayBuffer(0))).rejects.toThrow('keine Dreiecke');
  expect(() => parseModel(JSON.stringify({ features: [{ id: 1, type: 'mesh', name: 'x' }] }))).toThrow('Netz fehlt');
  // Referenzbild (F3): nur Bild-Daten, Breite > 0 und eine der drei Ursprungsebenen
  const img = { id: 2, type: 'image', name: 'f.png', data: 'data:image/png;base64,AA', pl: 'xz', x: 0, y: 0, w: 50 };
  expect(parseModel(JSON.stringify({ features: [img] })).features).toHaveLength(1);
  for (const bad of [{ data: 'javascript:1' }, { w: 0 }, { pl: 'ab' }]) expect(() => parseModel(JSON.stringify({ features: [{ ...img, ...bad }] }))).toThrow('Bild unvollständig');
});
