import { defineConfig } from 'vite';
// Der Kern-Worker importiert Module und WASM, braucht also das ES-Format.
// src-tauri (Rust-Build, riesig) nicht beobachten, sonst lädt jeder Desktop-Build die Seite neu
export default defineConfig({ worker: { format: 'es' }, server: { watch: { ignored: ['**/src-tauri/**'] } } });
