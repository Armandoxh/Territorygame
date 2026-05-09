import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Build output goes to ../docs/swarm so GH Pages (which serves /docs from
// the live branch) exposes v2 at /Territorygame/swarm/. v1 stays at
// /Territorygame/.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/Territorygame/swarm/' : '/',
  build: {
    outDir: fileURLToPath(new URL('../docs/swarm', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    host: true,
    port: 5174,
  },
}));
