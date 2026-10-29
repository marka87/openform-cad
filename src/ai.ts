// KI-Assistent (Epic 8, ADR 0002): Adapter für die OpenAI-kompatible Chat-Completions-Schnittstelle und das Einstellungsfenster.
// Kein fest eingebauter Anbieter; standardmäßig aus. Gesendet wird nur, was der Nutzer bewusst abschickt.

export type AiSettings = { on: boolean; base: string; model: string; key: string };
export type ToolCall = { id: string; name: string; args: Record<string, unknown> | null; raw: string }; // args null = kein gültiges JSON
export type Msg = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_call_id?: string;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] };
export type Tool = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

// Voreinstellungen zum Anklicken; Modellnamen ändern sich bei den Anbietern, deshalb bleiben alle Felder editierbar
export const PRESETS: { name: string; s: Omit<AiSettings, 'on' | 'key'>; note: string }[] = [
  { name: 'Groq', s: { base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' }, note: 'Schlüssel auf console.groq.com. Gratis-Stufe: Anfragen können vom Anbieter ausgewertet werden.' },
  { name: 'Lokal (Ollama)', s: { base: 'http://localhost:11434/v1', model: 'qwen2.5:7b' }, note: 'Läuft auf diesem Rechner, nichts verlässt ihn. Kein Schlüssel nötig; Modell vorher mit „ollama pull“ holen.' },
  { name: 'Eigener Anbieter', s: { base: '', model: '' }, note: 'Jede OpenAI-kompatible Schnittstelle (OpenAI, Mistral, OpenRouter …): Basis-URL bis einschließlich /v1.' },
];
export const OFF: AiSettings = { on: false, base: '', model: '', key: '' };

const KEY = 'openform-ai'; // shortcut: Schlüssel im App-Speicher (Entscheidung des Nutzers für v1) → Windows-Schlüsselspeicher, falls gewünscht
export function loadSettings(): AiSettings {
  try { return { ...OFF, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...OFF }; }
}
export function saveSettings(s: AiSettings) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

// Desktop: über tauri-plugin-http (keine CORS-Sperren des WebViews), Browser: normales fetch
const defaultFetch: Fetch = async (url, init) => '__TAURI_INTERNALS__' in globalThis ? (await import('@tauri-apps/plugin-http')).fetch(url, init) : fetch(url, init);

// Eine Anfrage; Antwort als Text und/oder Werkzeugaufrufe. Fehler als verständliche Meldung (Error.message)
export async function chat(s: AiSettings, messages: Msg[], tools: Tool[] = [], doFetch: Fetch = defaultFetch, timeoutMs = 60000) {
  if (!s.on) throw new Error('KI ist ausgeschaltet');
  if (!s.base || !s.model) throw new Error('Basis-URL und Modell eintragen');
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await doFetch(s.base.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', ...s.key && { Authorization: `Bearer ${s.key}` } },
      body: JSON.stringify({ model: s.model, messages, ...tools.length && { tools, tool_choice: 'auto' }, temperature: 0 }),
    });
  } catch (e) {
    throw new Error(ctl.signal.aborted ? `Keine Antwort nach ${Math.round(timeoutMs / 1000)} s` : `Anbieter nicht erreichbar (${e instanceof Error ? e.message : e})`);
  } finally { clearTimeout(timer); }
  if (!res.ok) {
    const why = res.status === 401 || res.status === 403 ? 'Schlüssel abgelehnt' : res.status === 404 ? 'Adresse oder Modell nicht gefunden'
      : res.status === 429 ? 'Zu viele Anfragen oder Kontingent erschöpft' : 'Fehler beim Anbieter';
    throw new Error(`${why} (${res.status})`);
  }
  const m = (await res.json())?.choices?.[0]?.message;
  if (!m) throw new Error('Antwort ohne Inhalt');
  const toolCalls: ToolCall[] = (m.tool_calls ?? []).map((t: any) => {
    let args: Record<string, unknown> | null = null;
    try { const a = JSON.parse(t.function?.arguments ?? ''); args = a && typeof a === 'object' && !Array.isArray(a) ? a : null; } catch {}
    return { id: t.id, name: t.function?.name ?? '', args, raw: t.function?.arguments ?? '' };
  });
  return { content: (m.content as string | null) ?? null, toolCalls, message: m as Msg };
}

// Einstellungsfenster: an/aus, Voreinstellungen, drei Felder, Verbindung testen
let dlg: HTMLDivElement | null = null;
export function openAiSettings() {
  if (!dlg) {
    dlg = document.createElement('div');
    dlg.id = 'aiDlg';
    dlg.innerHTML = `<div class="box"><h3>KI-Assistent</h3>
      <label class="row"><input type="checkbox" class="on"> KI einschalten</label>
      <p class="warn">Gratis-Stufen werten Anfragen in der Regel aus, z. B. fürs Training. Gesendet werden nur die Schritte des Modells mit ihren Maßen,
      die Hüllmaße der Körper und die Auswahl, nie STEP-Daten oder Dateipfade, und nur, wenn du eine Anfrage abschickst.</p>
      <div class="presets">${PRESETS.map((p, i) => `<button data-p="${i}">${p.name}</button>`).join('')}</div>
      <p class="note"></p>
      <label>Basis-URL <input class="base" placeholder="https://…/v1"></label>
      <label>Modell <input class="model"></label>
      <label>Schlüssel <input class="key" type="password" autocomplete="off" placeholder="leer bei Ollama"></label>
      <p class="keynote">Der Schlüssel wird nur auf diesem Rechner im Speicher der App abgelegt.</p>
      <div class="row"><button class="test">Verbindung testen</button><span class="res"></span><span style="flex:1"></span><button class="close">Schließen</button></div></div>`;
    document.body.append(dlg);
    const q = <T extends HTMLElement>(c: string) => dlg!.querySelector<T>(c)!;
    const read = (): AiSettings => ({ on: q<HTMLInputElement>('.on').checked, base: q<HTMLInputElement>('.base').value.trim(),
      model: q<HTMLInputElement>('.model').value.trim(), key: q<HTMLInputElement>('.key').value.trim() });
    dlg.addEventListener('input', () => saveSettings(read()));
    dlg.querySelectorAll<HTMLButtonElement>('[data-p]').forEach(b => b.onclick = () => {
      const p = PRESETS[+b.dataset.p!];
      q<HTMLInputElement>('.base').value = p.s.base; q<HTMLInputElement>('.model').value = p.s.model;
      q('.note').textContent = p.note;
      saveSettings(read());
    });
    q('.close').onclick = () => { dlg!.style.display = 'none'; };
    q('.test').onclick = async () => {
      const out = q('.res');
      out.textContent = '…';
      try { const r = await chat({ ...read(), on: true }, [{ role: 'user', content: 'Antworte nur mit: OK' }], [], undefined, 20000); out.textContent = `✓ ${(r.content ?? '').slice(0, 40)}`; }
      catch (e) { out.textContent = `✗ ${e instanceof Error ? e.message : e}`; }
    };
  }
  const s = loadSettings(), q = <T extends HTMLElement>(c: string) => dlg!.querySelector<T>(c)!;
  q<HTMLInputElement>('.on').checked = s.on; q<HTMLInputElement>('.base').value = s.base;
  q<HTMLInputElement>('.model').value = s.model; q<HTMLInputElement>('.key').value = s.key;
  q('.res').textContent = ''; q('.note').textContent = '';
  dlg.style.display = 'flex';
}
