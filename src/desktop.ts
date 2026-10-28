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
export async function openFile(): Promise<{ path: string; text: string } | null> {
  const path = await (await dialog()).open({ multiple: false, filters: [{ name: 'OpenForm-Modell oder STEP', extensions: ['ofc', 'json', 'step', 'stp'] }] });
  return typeof path === 'string' ? { path, text: await readFile(path) } : null;
}

// Datei, mit der die App gestartet wurde (Doppelklick auf eine .ofc-Datei)
export async function initialFile(): Promise<string | null> {
  return (await core()).invoke<string | null>('initial_file');
}

export async function setTitle(t: string) {
  document.title = t;
  if (isDesktop) await (await import('@tauri-apps/api/window')).getCurrentWindow().setTitle(t);
}
