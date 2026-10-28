// Bemaßungen und Abhängigkeiten in Vieleck-Skizzen, gelöst mit planegcs (dem Skizzen-Löser aus FreeCAD)
import { SolveStatus, type GcsWrapper, type SketchPrimitive } from '@salusoft89/planegcs';
import { area, outline, type Con } from './model';

// Punkte so verschieben, dass alle Abhängigkeiten gelten. fixed = Punkte, die stehen bleiben (z. B. der gezogene).
// Ergebnis: neue Punkte (Bögen behalten ihren bulge) oder null, wenn sich die Abhängigkeiten widersprechen.
// shortcut: Bögen zählen als Sehne (Winkel bleibt, Radius folgt den Endpunkten) → Bogen als planegcs-arc mit Radius-Maß
export function solveSketch(gcs: GcsWrapper, pts: number[][], cons: Con[], fixed: number[] = []): number[][] | null {
  const n = pts.length, P = (i: number) => `p${i % n}`, L = (i: number) => `l${i}`;
  const prims: SketchPrimitive[] = pts.map((q, i) => ({ id: P(i), type: 'point', x: q[0], y: q[1], fixed: fixed.includes(i) }));
  pts.forEach((_, i) => prims.push({ id: L(i), type: 'line', p1_id: P(i), p2_id: P(i + 1) }));
  cons.forEach((c, k) => {
    const id = `c${k}`, l1_id = L(c.i), l2_id = L(c.j ?? 0);
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
  const out = pts.map((q, i) => {
    const p = gcs.sketch_index.get_primitive(P(i)) as { x: number; y: number };
    return [p.x, p.y, ...q.slice(2)];
  });
  // zusammengefallene Seite oder Form (z. B. waagrecht und senkrecht zugleich) gilt nicht
  const ok = out.every((q, i) => Math.hypot(out[(i + 1) % n][0] - q[0], out[(i + 1) % n][1] - q[1]) > 1e-3) && Math.abs(area(outline(out))) > 0.25;
  return ok ? out : null;
}
