import { expect, test } from 'vitest';
import pkgText from '../package.json?raw';
import cargo from '../src-tauri/Cargo.toml?raw';
import tauriText from '../src-tauri/tauri.conf.json?raw';

// package.json ist die Quelle (tauri.conf.json verweist darauf); Cargo.toml muss von Hand mitziehen
test('Versionsnummer in package.json und Cargo.toml gleich', () => {
  expect(cargo.match(/^version = "(.+)"/m)?.[1]).toBe(JSON.parse(pkgText).version);
  expect(JSON.parse(tauriText).version).toBe('../package.json');
});
