import { expect, test } from 'vitest';
import { chat, type AiSettings, type ToolCall } from './ai';
import { aiContext, applyCalls, explainMsgs, runRequest } from './aiTools';

const S: AiSettings = { on: true, base: 'https://example.test/v1/', model: 'm', key: 'k' };
const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

test('KI-Adapter: Anfrage im OpenAI-Format, Werkzeugaufrufe gelesen (T8.2)', async () => {
  let url = '', init: RequestInit = {};
  const r = await chat(S, [{ role: 'user', content: 'Platte' }], [{ type: 'function', function: { name: 'skizze_rechteck', description: '', parameters: {} } }],
    async (u, i) => { url = u; init = i; return reply(200, { choices: [{ message: { content: null, tool_calls: [
      { id: 'a', type: 'function', function: { name: 'skizze_rechteck', arguments: '{"breite":100}' } },
      { id: 'b', type: 'function', function: { name: 'extrudieren', arguments: '{kaputt' } }] } }] })(); });
  expect(url).toBe('https://example.test/v1/chat/completions');                 // Schrägstrich am Ende stört nicht
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
  const body = JSON.parse(init.body as string);
  expect([body.model, body.tools.length, body.temperature]).toEqual(['m', 1, 0]);
  expect(r.toolCalls.map(t => [t.name, t.args])).toEqual([['skizze_rechteck', { breite: 100 }], ['extrudieren', null]]); // kaputtes JSON → null
});

test('KI-Adapter: verständliche Fehler, kein Senden wenn aus (T8.2)', async () => {
  await expect(chat({ ...S, on: false }, [])).rejects.toThrow('ausgeschaltet');
  await expect(chat(S, [], [], reply(401, {}))).rejects.toThrow('Schlüssel abgelehnt (401)');
  await expect(chat(S, [], [], reply(429, {}))).rejects.toThrow('Kontingent erschöpft (429)');
  await expect(chat({ ...S, base: 'http://localhost:11434/v1' }, [], [], reply(403, {}))).rejects.toThrow('OLLAMA_ORIGINS'); // nicht „Schlüssel“
  await expect(chat({ ...S, base: 'http://localhost:11434/v1' }, [], [], reply(404, {}))).rejects.toThrow('ollama pull');
  await expect(chat(S, [], [], async () => { throw new TypeError('Failed to fetch'); })).rejects.toThrow('nicht erreichbar');
  const hang = (_u: string, i: RequestInit) => new Promise<Response>((_, no) => i.signal!.addEventListener('abort', () => no(new Error('abgebrochen'))));
  await expect(chat(S, [], [], hang, 20)).rejects.toThrow('Keine Antwort nach 0 s');
  const noKey = await chat({ ...S, key: '' }, [], [], async (_u, i) => { expect((i.headers as Record<string, string>).Authorization).toBeUndefined(); return reply(200, { choices: [{ message: { content: 'OK' } }] })(); });
  expect(noKey.content).toBe('OK');                                             // Ollama: ohne Schlüssel kein Authorization-Kopf
});

test('KI-Ablauf: ein Aufruf je Antwort, Fehler werden korrigiert, Ende mit Text (T8.3)', async () => {
  const call = (name: string, args: Record<string, unknown>): ToolCall => ({ id: name + Math.random(), name, args, raw: '' });
  const answers = [[call('skizze_rechteck', { breite: 100, tiefe: 60, hoehe: 5 })], [call('bohrung', { schritt: 7, x: 8, y: 8, gewinde: 'M5', tiefe: 'durch' })],
    [call('bohrung', { schritt: 1, x: 8, y: 8, gewinde: 'M5', tiefe: 'durch' })], []];
  let seen = 0;
  const r = await runRequest(async m => { seen = m.length; const a = answers.shift()!; return { content: a.length ? null : 'Fertig.', toolCalls: a, message: { role: 'assistant', content: null } }; }, [], 1, 'mm', 'Platte');
  expect([r.made, r.fs.length, r.reply, r.problems]).toEqual([2, 2, 'Fertig.', []]); // Platte ohne x/y = Ursprung, falsche Bohrung korrigiert
  expect(seen).toBe(2 + 3 * 2);                                                        // jede Runde: Antwort + Ergebnis zurück
});

test('KI-Ablauf: Kernfehler gehen höchstens zweimal zurück, nur eigene Schritte entfernbar (T8.6)', async () => {
  const call = (name: string, args: Record<string, unknown>): ToolCall => ({ id: name + Math.random(), name, args, raw: '' });
  const old = { id: 1, type: 'rect', p: { x: 0, y: 0, w: 10, h: 10 }, d: 5 } as never; // Schritt des Nutzers, darf nicht entfernt werden
  const answers = [[call('skizze_kreis', { radius: 5, hoehe: 3 })], [], [call('schritt_entfernen', { schritt: 1 }), call('schritt_entfernen', { schritt: 2 }), call('skizze_kreis', { radius: 4, hoehe: 3 })], [], []];
  const sent: string[] = [];
  let checks = 0;
  const r = await runRequest(async m => { sent.push(String(m.at(-1)!.content)); const a = answers.shift()!; return { content: a.length ? null : 'fertig', toolCalls: a, message: { role: 'assistant', content: null } }; },
    [old], 2, 'mm', 'Zylinder', undefined, async fs => { checks++; return fs.map(f => [f.id, 'zu groß'] as [number, string]); }); // Kern lehnt alles ab, auch Schritt 1
  expect(sent[2]).toBe('Der CAD-Kern lehnt ab: Schritt 2: zu groß. Korrigiere das (schritt_entfernen und neu anlegen, oder extrudieren mit anderer Höhe), dann antworte mit „fertig“.'); // Schritt 1 ist nicht von der KI
  expect(r.problems).toEqual(['Schritt 1 wurde nicht in diesem Auftrag angelegt']);
  expect(r.fs.map(f => f.id)).toEqual([1, 3]);
  expect(checks).toBe(2);                                                              // danach Schluss, der Fehler bleibt sichtbar
});

test('KI ändert vorhandene Schritte über aendern, Auswahl steht im Kontext (T8.4)', () => {
  const call = (args: Record<string, unknown>): ToolCall => ({ id: String(Math.random()), name: 'aendern', args, raw: '' });
  const plate = applyCalls([], [{ id: 'a', name: 'skizze_rechteck', args: { breite: 100, tiefe: 60, hoehe: 5 }, raw: '' }], 1).fs[0];
  const fs = [plate, { id: 2, type: 'shell', at: [0, 0, 5], t: 3 }, { id: 3, type: 'fillet', at: [0, 0, 0], dir: [1, 0, 0], r: 2 }] as never[];
  const ctx = JSON.parse(aiContext(fs, 4, 'mm', [2]));
  expect(ctx.auswahl).toEqual([2]);
  expect(ctx.schritte.map((s: Record<string, unknown>) => [s.breite, s.dicke, s.radius])).toEqual([[100, undefined, undefined], [undefined, 3, undefined], [undefined, undefined, 2]]);
  const r = applyCalls(fs, [call({ schritt: 2, dicke: 5 }), call({ schritt: 1, breite: 120, hoehe: 8 }), call({ schritt: 3, radius: 4 }),
    call({ schritt: 2, breite: 5 }), call({ schritt: 1, hoehe: -2 }), call({ schritt: 9, dicke: 1 })], 4);
  expect(r.results.map(x => x.text)).toEqual(['ok, Schritt 2 geändert', 'ok, Schritt 1 geändert', 'ok, Schritt 3 geändert',
    'Schritt 2 (shell) lässt sich nur über dicke ändern', 'Skizze auf dem Boden: nur nach oben', 'Schritt 9 gibt es nicht']);
  const [p, sh, fi] = r.fs as never as [{ p: { w: number; h: number }; d: number }, { t: number }, { r: number }];
  expect([p.p.w, p.p.h, p.d, sh.t, fi.r]).toEqual([120, 60, 8, 5, 4]);
  expect((fs[1] as { t: number }).t).toBe(3);                                         // Original unverändert (Kopie)
});

test('Fehler erklären: roter Schritt, Meldung und Nachbarn, ohne Werkzeuge (T8.5)', () => {
  const fs = [1, 2, 3, 4, 5, 6, 7].map(id => ({ id, type: 'fillet', at: [0, 0, 0], dir: [1, 0, 0], r: id })) as never[];
  const m = explainMsgs(fs, 5, 'Rundung fehlgeschlagen', 'in');
  expect(m[0].content).toContain('Zoll');
  expect(m[1].content).toContain('Schritt 5 scheitert mit der Meldung „Rundung fehlgeschlagen“');
  expect(JSON.parse(m[1].content!.split('drumherum: ')[1]).map((s: { schritt: number }) => s.schritt)).toEqual([2, 3, 4, 5, 6]); // 3 davor, 1 danach
});
