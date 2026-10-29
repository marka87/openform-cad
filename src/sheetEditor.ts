// Maß-Editor: Zeichnungsblatt im Vordergrund, Maße anklicken, ablegen, verschieben, löschen (Epic 3).
// Das Blatt rechnet der Kern-Worker; hier wird nur gezeigt, angeklickt und das Maß-Modell geändert.
import type { Cands } from './kernel';
import type { Dim } from './model';

export type SheetMsg = { svg: string; cands: Cands; geo: [number, number[][], number][]; bad: [number, string][] };
type Deps = {
  request: (sheet: 'A4' | 'A3') => void;               // Blatt neu rechnen lassen → showSheet
  dims: () => Dim[];
  change: (d: Dim[], history: boolean) => void;        // Maße übernehmen (mit/ohne Rückgängig-Schritt), speichern
  print: (sheet: 'A4' | 'A3') => void;
  save: (sheet: 'A4' | 'A3') => void;
};
type Mode = 'sel' | 'lin' | 'dia' | 'rad' | 'ang';
const LABEL: Record<Mode, string> = { sel: 'Auswählen', lin: 'Länge', dia: '⌀ Durchmesser', rad: 'R Radius', ang: '∠ Winkel' };
const HELP: Record<Mode, string> = {
  sel: 'Maß anklicken = auswählen, ziehen = verschieben, Entf = löschen; Toleranz oben eintragen',
  lin: 'Länge: zwei Eckpunkte in einer Ansicht anklicken, dann die Maßlinie ablegen (Shift = schräg entlang der Punkte)',
  dia: 'Durchmesser: Kreis anklicken, dann die Zahl ablegen',
  rad: 'Radius: Kreis anklicken, dann die Zahl ablegen',
  ang: 'Winkel: zwei Kanten anklicken, die sich treffen',
};

let deps: Deps, ed: HTMLDivElement | null = null, last: SheetMsg | null = null;
let mode: Mode = 'sel', picks: any[] = [], sel: number | null = null, drag: { id: number; moved: boolean } | null = null;
const q = <T extends HTMLElement>(s: string) => ed!.querySelector<T>(s)!;
const sheetSize = () => q<HTMLSelectElement>('.fmt').value as 'A4' | 'A3';
const redraw = () => deps.request(sheetSize());

export function openSheetEditor(d: Deps) {
  deps = d;
  if (!ed) {
    ed = document.createElement('div');
    ed.id = 'sheetEd';
    ed.innerHTML = `<div class="bar">${(Object.keys(LABEL) as Mode[]).map(m => `<button data-m="${m}">${LABEL[m]}</button>`).join('')}
      <label>Toleranz <input class="tol" placeholder="±0,1 oder H7" size="10"></label><button class="del">Maß löschen</button>
      <span style="flex:1"></span><select class="fmt"><option>A4</option><option>A3</option></select>
      <button class="pdf">Drucken / PDF</button><button class="svg">SVG</button><button class="close">Schließen</button></div>
      <div class="hint"></div><div class="area"></div>`;
    document.body.append(ed);
    ed.querySelectorAll<HTMLButtonElement>('[data-m]').forEach(b => b.onclick = () => setMode(b.dataset.m as Mode));
    q('.close').onclick = () => { ed!.style.display = 'none'; };
    q('.pdf').onclick = () => deps.print(sheetSize());
    q('.svg').onclick = () => deps.save(sheetSize());
    q<HTMLSelectElement>('.fmt').onchange = redraw;
    q('.del').onclick = remove;
    q<HTMLInputElement>('.tol').onchange = e => {
      if (sel === null) return;
      const t = (e.target as HTMLInputElement).value.trim();
      deps.change(deps.dims().map(d => d.id === sel ? { ...d, tol: t || undefined } : d), true);
      redraw();
    };
    const area = q('.area');
    area.onpointerdown = down; area.onpointermove = move; area.onpointerup = () => { drag = null; };
    // Entf löscht das gewählte Maß; die Tasten des Modellfensters bleiben dabei unberührt
    addEventListener('keydown', e => {
      if (ed?.style.display === 'none' || (e.target as HTMLElement).tagName === 'INPUT') return; // Toleranzfeld tippt normal
      e.stopPropagation();
      if (e.key === 'Delete' || e.key === 'Backspace') remove();
      if (e.key === 'Escape') setMode('sel');
    }, true);
  }
  ed.style.display = 'flex';
  setMode('sel');
  redraw();
}

export function showSheet(m: SheetMsg) {
  if (!ed || ed.style.display === 'none') return;
  last = m;
  const area = q('.area');
  area.innerHTML = m.svg;
  const svg = area.querySelector('svg')!;
  svg.removeAttribute('width'); svg.removeAttribute('height'); // auf die Fenstergröße einpassen (viewBox bleibt in mm)
  svg.insertAdjacentHTML('beforeend', '<g class="hl" fill="none" stroke="#1a7cff" stroke-width="0.5"></g>');
  if (sel !== null) svg.querySelector(`[data-dim="${sel}"]`)?.setAttribute('stroke', '#1a7cff');
  showHelp();
}

function setMode(m: Mode) {
  mode = m; picks = [];
  ed!.querySelectorAll<HTMLButtonElement>('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  showHelp();
}
function showHelp(text = HELP[mode]) {
  const bad = last?.bad.length ? ' · nicht auffindbar: ' + last.bad.map(([id, w]) => `Maß #${id} (${w})`).join(', ') : '';
  q('.hint').textContent = text + bad;
}

// Mausposition in Blatt-mm
function at(e: PointerEvent) {
  const svg = q('.area').querySelector('svg');
  if (!svg) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
  return [p.x, p.y];
}
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const segDist = (m: number[], a: number[], b: number[]) => {
  const d = [b[0] - a[0], b[1] - a[1]], t = Math.max(0, Math.min(1, ((m[0] - a[0]) * d[0] + (m[1] - a[1]) * d[1]) / (d[0] ** 2 + d[1] ** 2)));
  return dist(m, [a[0] + t * d[0], a[1] + t * d[1]]);
};
// Nächstes anklickbares Element zur Maus (4 mm Fangbereich); Folgeklicks nur in derselben Ansicht
function nearest(m: number[]) {
  const c = last!.cands, v = picks[0]?.v, ok = (x: { v: number }) => v === undefined || x.v === v;
  const best = <T>(l: T[], d: (x: T) => number) => l.map(x => [x, d(x)] as const).filter(x => x[1] < 4).sort((a, b) => a[1] - b[1])[0]?.[0];
  if (mode === 'lin') return best(c.pts.filter(ok), x => dist(m, x.p));
  if (mode === 'dia' || mode === 'rad') return best(c.circles.filter(ok), x => Math.abs(dist(m, x.c) - x.r));
  if (mode === 'ang') return best(c.lines.filter(ok), x => segDist(m, x.a, x.b));
}
function highlight(x: any) {
  const g = q('.area').querySelector('.hl');
  if (g) g.innerHTML = !x ? '' : x.p ? `<circle cx="${x.p[0]}" cy="${x.p[1]}" r="1.2"/>` : x.c ? `<circle cx="${x.c[0]}" cy="${x.c[1]}" r="${x.r}"/>` : `<path d="M${x.a.join(' ')}L${x.b.join(' ')}"/>`;
}

function add(d: Omit<Dim, 'id'>) {
  const tol = q<HTMLInputElement>('.tol').value.trim(), id = Math.max(0, ...deps.dims().map(x => x.id)) + 1;
  deps.change([...deps.dims(), { ...d, id, ...tol && { tol } } as Dim], true);
  sel = id; picks = [];
  redraw();
}
function remove() {
  if (sel === null) return;
  deps.change(deps.dims().filter(d => d.id !== sel), true);
  sel = null;
  redraw();
}

// Lage (off) eines Maßes aus der Mausposition, so wie dimSVG sie auslegt; P, R in Blattkoordinaten
function offFor(d: Pick<Dim, 't' | 'dir'>, P: number[][], R: number, m: number[], shift = false) {
  if (d.t === 'lin') {
    const [A, B] = P;
    const dir = d.dir ?? (shift ? 'al' : (m[1] < Math.min(A[1], B[1]) || m[1] > Math.max(A[1], B[1])) && Math.abs(B[0] - A[0]) > 1e-6 ? 'h' : 'v');
    if (dir === 'h') return { dir, off: A[1] - m[1] };
    if (dir === 'v') return { dir, off: A[0] - m[0] };
    const L = dist(A, B) || 1, n = [(B[1] - A[1]) / L, -(B[0] - A[0]) / L];
    return { dir, off: (m[0] - A[0]) * n[0] + (m[1] - A[1]) * n[1] };
  }
  return { off: d.t === 'ang' ? dist(m, P[0]) : dist(m, P[0]) - R };
}

function down(e: PointerEvent) {
  const m = at(e);
  if (!m || !last) return;
  if (mode === 'sel') {
    const g = (e.target as Element).closest('[data-dim]');
    sel = g ? +g.getAttribute('data-dim')! : null;
    q<HTMLInputElement>('.tol').value = deps.dims().find(x => x.id === sel)?.tol ?? '';
    if (sel !== null) { drag = { id: sel, moved: false }; q('.area').setPointerCapture(e.pointerId); }
    return showSheet(last);
  }
  // Alles gewählt: dieser Klick legt die Lage fest
  if ((mode === 'lin' && picks.length === 2) || ((mode === 'dia' || mode === 'rad') && picks.length === 1)) {
    const P = mode === 'lin' ? picks.map(p => p.p) : [picks[0].c], o = offFor({ t: mode }, P, picks[0].r ?? 0, m, e.shiftKey);
    return add(mode === 'lin' ? { v: picks[0].v, t: 'lin', a: picks[0].ref, b: picks[1].ref, ...o } : { v: picks[0].v, t: mode, e: picks[0].ref, ...o });
  }
  const x = nearest(m);
  if (!x) return;
  picks.push(x);
  if (mode === 'ang' && picks.length === 2) return add({ v: picks[0].v, t: 'ang', e: picks[0].ref, e2: picks[1].ref, off: 8 });
  showHelp(mode === 'lin' && picks.length === 1 ? 'zweiten Eckpunkt anklicken' : mode === 'ang' ? 'zweite Kante anklicken'
    : 'Klick = Lage festlegen' + (mode === 'lin' ? ' (Shift = schräg)' : ''));
}
function move(e: PointerEvent) {
  const m = at(e);
  if (!m || !last) return;
  if (drag) { // Maß verschieben: Lage live nachführen, Rückgängig-Schritt nur beim ersten Schritt
    const g = last.geo.find(x => x[0] === drag!.id), d = deps.dims().find(x => x.id === drag!.id);
    if (!g || !d) return;
    deps.change(deps.dims().map(x => x.id === d.id ? { ...x, ...offFor(d, g[1], g[2], m) } : x), !drag.moved);
    drag.moved = true;
    return redraw();
  }
  if ((mode === 'lin' && picks.length === 2) || ((mode === 'dia' || mode === 'rad') && picks.length === 1)) return preview(m, e.shiftKey);
  highlight(mode === 'sel' ? null : nearest(m));
}
// Vorschau der Maßlinie, solange nur noch die Lage fehlt (T3.6): gleiche Lage wie beim Ablegen (offFor), gestrichelt
function preview(m: number[], shift: boolean) {
  const g = q('.area').querySelector('.hl');
  if (!g) return;
  const L = (a: number[], b: number[]) => `M${a.join(' ')}L${b.join(' ')}`;
  let d: string;
  if (mode === 'lin') {
    const [A, B] = picks.map(p => p.p), o = offFor({ t: 'lin' }, [A, B], 0, m, shift), n = dist(A, B) || 1;
    const out = (P: number[]) => o.dir === 'h' ? [P[0], A[1] - o.off] : o.dir === 'v' ? [A[0] - o.off, P[1]]
      : [P[0] + (B[1] - A[1]) / n * o.off, P[1] - (B[0] - A[0]) / n * o.off];
    d = L(A, out(A)) + L(B, out(B)) + L(out(A), out(B));
  } else {
    const { c, r } = picks[0], k = dist(m, c) || 1, u = [(m[0] - c[0]) / k, (m[1] - c[1]) / k];
    d = L(mode === 'dia' ? [c[0] - u[0] * r, c[1] - u[1] * r] : c, m);
  }
  g.innerHTML = `<path d="${d}" stroke-dasharray="1 0.6"/>`;
}
