import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Build output goes to ../docs/rts so GH Pages exposes the RTS at
// /Territorygame/rts/, next to swarm (v2) and v1.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/Territorygame/rts/' : '/',
  build: {
    outDir: fileURLToPath(new URL('../docs/rts', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    host: true,
    port: 5175,
  },
}));
