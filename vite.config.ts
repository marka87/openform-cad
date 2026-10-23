import { defineConfig } from 'vite';
// Der Kern-Worker importiert Module und WASM, braucht also das ES-Format
export default defineConfig({ worker: { format: 'es' } });
