import { expect, test } from 'vitest';
import { chat, type AiSettings, type ToolCall } from './ai';
import { runRequest } from './aiTools';

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
