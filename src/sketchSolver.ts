// Bemaßungen und Abhängigkeiten in Vieleck-Skizzen, gelöst mit planegcs (dem Skizzen-Löser aus FreeCAD)
import { SolveStatus, type GcsWrapper, type SketchPrimitive } from '@salusoft89/planegcs';
import { area, outline, type Con } from './model';

// Punkte so verschieben, dass alle Abhängigkeiten gelten. fixed = Punkte, die stehen bleiben (z. B. der gezogene).
// Ergebnis: neue Punkte oder null, wenn sich die Abhängigkeiten widersprechen.
// Bögen mit Radius- oder Tangenten-Maß rechnet der Löser als echte Kreisbögen (Mitte, Radius) und liefert den neuen bulge;
// alle anderen Bögen zählen weiter als Sehne (Winkel bleibt, Radius folgt den Endpunkten), damit sich ohne Bogen-Maß nichts ändert
export function solveSketch(gcs: GcsWrapper, pts: number[][], cons: Con[], fixed: number[] = []): number[][] | null {
  const n = pts.length, P = (i: number) => `p${i % n}`, L = (i: number) => `l${i}`;
  const pin = new Map(cons.filter(c => c.t === 'fix').map(c => [c.i, c.p!])); // feste Punkte stehen an ihrer gespeicherten Stelle
  const prims: SketchPrimitive[] = pts.map((q, i) => { const f = pin.get(i); return { id: P(i), type: 'point', x: f ? f[0] : q[0], y: f ? f[1] : q[1], fixed: !!f || fixed.includes(i) }; });
  const dir = (i: number) => [pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1]];
  pts.forEach((_, i) => prims.push({ id: L(i), type: 'line', p1_id: P(i), p2_id: P(i + 1) }));
  const arcs = new Map<number, { s: number; e: number }>(); // Bogen-Seite → Anfangs-/Endpunkt im Gegenuhrzeigersinn (wie planegcs)
  for (const c of cons) for (const i of c.t === 'rad' || c.t === 'tan' ? [c.i, c.j] : []) {
    if (i === undefined || !pts[i][2] || arcs.has(i)) continue;
    const b = pts[i][2], A = pts[i], B = pts[(i + 1) % n], Lc = Math.hypot(B[0] - A[0], B[1] - A[1]), k = Lc / 2 * (1 - b * b) / (2 * b);
    const C = [(A[0] + B[0]) / 2 - (B[1] - A[1]) / Lc * k, (A[1] + B[1]) / 2 + (B[0] - A[0]) / Lc * k], r = Lc * (1 + b * b) / (4 * Math.abs(b));
    const [s, e] = b > 0 ? [i, i + 1] : [i + 1, i], ang = (q: number[]) => Math.atan2(q[1] - C[1], q[0] - C[0]);
    const a0 = ang(pts[s % n]), a1 = ang(pts[e % n]);
    arcs.set(i, { s, e });
    prims.push({ id: `m${i}`, type: 'point', x: C[0], y: C[1], fixed: false },
      { id: `a${i}`, type: 'arc', c_id: `m${i}`, start_id: P(s), end_id: P(e), radius: r, start_angle: a0, end_angle: a1 < a0 ? a1 + 2 * Math.PI : a1 },
      { id: `ar${i}`, type: 'arc_rules', a_id: `a${i}` });
  }
  cons.forEach((c, k) => {
    if (c.t === 'fix') return;
    if (c.t === 'rad') return void (arcs.has(c.i) && prims.push({ id: `c${k}`, type: 'arc_radius', a_id: `a${c.i}`, radius: c.val! }));
    if (c.t === 'tan') {
      const [x, y] = [c.i, c.j!].sort((p, q) => +arcs.has(q) - +arcs.has(p)); // Bogen zuerst
      if (!arcs.has(x)) return;
      return void prims.push(arcs.has(y) ? { id: `c${k}`, type: 'tangent_aa', a1_id: `a${x}`, a2_id: `a${y}` } : { id: `c${k}`, type: 'tangent_la', l_id: L(y), a_id: `a${x}` });
    }
    const id = `c${k}`, l1_id = L(c.i), l2_id = L(c.j ?? 0);
    if (c.t === 'ang') { // Drehsinn aus der aktuellen Form, damit der Winkel nicht auf die andere Seite kippt
      const a = dir(c.i), b = dir(c.j!), s = Math.sign(a[0] * b[1] - a[1] * b[0]) || 1;
      return void prims.push({ id, type: 'l2l_angle_ll', l1_id, l2_id, angle: s * c.val! * Math.PI / 180 });
    }
    prims.push(c.t === 'len' ? { id, type: 'p2p_distance', p1_id: P(c.i), p2_id: P(c.i + 1), distance: c.val! }
      : c.t === 'h' ? { id, type: 'horizontal_l', l_id: l1_id }
      : c.t === 'v' ? { id, type: 'vertical_l', l_id: l1_id }
      : c.t === 'par' ? { id, type: 'parallel', l1_id, l2_id }
      : c.t === 'perp' ? { id, type: 'perpendicular_ll', l1_id, l2_id }
      : { id, type: 'equal_length', l1_id, l2_id });
  });
  gcs.clear_data();
  gcs.push_primitives_and_params(prims);
  if (gcs.solve() !== SolveStatus.Success || gcs.has_gcs_conflicting_constraints()) return null;
  gcs.apply_solution();
  const at = (id: string) => gcs.sketch_index.get_primitive(id) as { x: number; y: number };
  const out = pts.map((q, i) => [at(P(i)).x, at(P(i)).y, ...q.slice(2)]);
  for (const [i, { s, e }] of arcs) { // neuer bulge aus Mitte und Endpunkten: Öffnungswinkel im Gegenuhrzeigersinn
    const C = at(`m${i}`), ang = (q: number[]) => Math.atan2(q[1] - C.y, q[0] - C.x);
    const th = ((ang(out[e % n]) - ang(out[s % n])) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    out[i][2] = Math.sign(pts[i][2]) * Math.tan(th / 4);
  }
  // zusammengefallene Seite oder Form (z. B. waagrecht und senkrecht zugleich) gilt nicht
  const ok = out.every((q, i) => Math.hypot(out[(i + 1) % n][0] - q[0], out[(i + 1) % n][1] - q[1]) > 1e-3) && Math.abs(area(outline(out))) > 0.25;
  return ok ? out : null;
}
