// Stabile Bezüge auf Flächen und Kanten (Epic 1, ADR 0001).
// Eine Fläche heißt nach ihrer Herkunft: welches Feature sie mit welchem Teil erzeugt hat.
// Die OCCT-Historie (Generated/Modified/IsDeleted) schreibt diese Herkunft beim Rebuild fort;
// der Fingerabdruck prüft das Ergebnis und entscheidet nur bei Mehrdeutigkeit.
import type { Part, Vec } from './model';

// Teil eines Features, aus dem eine Fläche hervorgeht.
// Extrusion/Drehkörper/Loft: 'start' = Boden, 'end' = Deckel, Seiten wie in Part
//   (Rechteck x0/x1/y0/y1, Kreis/Ellipse r, Vieleck seg/arc mit Seite i).
// 'fillet'/'chamfer' = von einer Rundung/Fase neu erzeugte Fläche, 'shell' = Innenwand einer Schale,
// 'split' = Schnittfläche beim Teilen, 'import' = Fläche i eines STEP-Imports (Reihenfolge aus der Datei).
export type Tag = Part | 'fillet' | 'chamfer' | 'shell' | 'split' | 'import';

export interface Origin {
  f: number;        // Feature-ID, die die Fläche erzeugt hat
  tag: Tag;
  i?: number;       // Seite bei seg/arc, Flächennummer bei import
  from?: number;    // Bereichs-Feature (and/not): ID der Original-Skizze, aus deren Rand die Seite stammt
}

// Prüfwert, gemessen beim Anlegen des Bezugs (Weltkoordinaten, mm)
export interface Fingerprint {
  kind: 'plane' | 'cylinder' | 'cone' | 'sphere' | 'torus' | 'bspline' | 'other'; // Flächen- bzw. Kurventyp
  c: Vec;           // Schwerpunkt
  n?: Vec;          // Fläche: Normale (eben) bzw. Achse (Zylinder …); Kante: Richtung, wenn gerade
  size: number;     // Flächeninhalt bzw. Kantenlänge
}

export interface FaceRef {
  o: Origin;
  via?: number[];   // Feature-IDs, die die Fläche seither verändert haben (nur zur Fehlermeldung, nicht zum Auflösen)
  fp: Fingerprint;
}

// Kante = Grenze zwischen zwei Flächen; reicht das nicht (zwei Kanten zwischen denselben Flächen,
// z. B. Zylindermantel an einer Naht), entscheidet der Fingerabdruck.
export interface EdgeRef {
  a: Origin;
  b: Origin;
  fp: Fingerprint;
}

// Ergebnis des Auflösens: sicher = genau ein Treffer über die Herkunft und Fingerabdruck passt
export type Resolved<T> = { ok: true; shape: T; sure: boolean } | { ok: false; why: 'lost' | 'ambiguous' };
