// Desktop-App (Tauri): Dateien über den Windows-Dialog statt Download/Dateiauswahl des Browsers.
// Im Browser wird nichts davon geladen (dynamische Importe), dort bleibt alles wie bisher.
export const isDesktop = '__TAURI_INTERNALS__' in window;

const core = () => import('@tauri-apps/api/core');
const dialog = () => import('@tauri-apps/plugin-dialog');
const ext = (name: string) => name.split('.').pop()!.toLowerCase();
export const baseName = (path: string) => path.split(/[\\/]/).pop()!;

// Bytes an einen Pfad schreiben
export async function writeFile(path: string, data: Blob | string) {
  const bytes = new Uint8Array(await (typeof data === 'string' ? new Blob([data]) : data).arrayBuffer());
  // shortcut: Bytes gehen als Zahlenliste über die Brücke; bei sehr großen STL-Dateien langsam → tauri::ipc::Request mit Rohdaten
  await (await core()).invoke('write_bytes', { path, data: Array.from(bytes) });
}

// „Speichern unter“: Pfad wählen und schreiben; null = abgebrochen
export async function saveAs(name: string, data: Blob | string): Promise<string | null> {
  const e = ext(name);
  const path = await (await dialog()).save({ defaultPath: name, filters: [{ name: e === 'ofc' ? 'OpenForm-Modell' : e.toUpperCase(), extensions: [e] }] });
  if (!path) return null;
  await writeFile(path, data);
  return path;
}

export async function readFile(path: string): Promise<string> {
  return (await core()).invoke<string>('read_text', { path });
}

// „Öffnen“: Modell (.ofc, älter .json) oder STEP wählen und lesen; null = abgebrochen
// Netz (STL/OBJ/3MF) als Bytes statt Text (F2)
export async function openFile(): Promise<{ path: string; text: string; bytes?: ArrayBuffer } | null> {
  const path = await (await dialog()).open({ multiple: false, filters: [{ name: 'OpenForm-Modell, STEP, Netz oder Bild', extensions: ['ofc', 'json', 'step', 'stp', 'stl', 'obj', '3mf', 'png', 'jpg', 'jpeg', 'webp'] }] });
  if (typeof path !== 'string') return null;
  return /\.(stl|obj|3mf|png|jpe?g|webp)$/i.test(path) ? { path, text: '', bytes: await (await core()).invoke<ArrayBuffer>('read_bytes', { path }) } : { path, text: await readFile(path) };
}

// Datei, mit der die App gestartet wurde (Doppelklick auf eine .ofc-Datei)
export async function initialFile(): Promise<string | null> {
  return (await core()).invoke<string | null>('initial_file');
}

export async function setTitle(t: string) {
  document.title = t;
  if (isDesktop) await (await import('@tauri-apps/api/window')).getCurrentWindow().setTitle(t);
}

// Speichern / Nicht speichern / Abbrechen (Windows-Dialog). Je nach Version liefert der Dialog die Taste oder ihre Beschriftung
export async function askSave(text: string): Promise<'save' | 'discard' | 'cancel'> {
  const r = await (await dialog()).message(text, { title: 'OpenForm CAD', kind: 'warning', buttons: { yes: 'Speichern', no: 'Nicht speichern', cancel: 'Abbrechen' } });
  return r === 'Yes' || r === 'Speichern' ? 'save' : r === 'No' || r === 'Nicht speichern' ? 'discard' : 'cancel';
}

// Vor dem Schließen des Fensters fragen; handler liefert false = Fenster bleibt offen
export async function onCloseRequested(handler: () => Promise<boolean>) {
  if (isDesktop) await (await import('@tauri-apps/api/window')).getCurrentWindow().onCloseRequested(async e => { if (!(await handler())) e.preventDefault(); });
}
