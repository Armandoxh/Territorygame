import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Output is committed to /docs at the repo root so GitHub Pages can serve it
// without a build step in the cloud. Toggle Pages source to "/(docs)" once.
//
// `base` is the URL prefix where the built site lives. For
// https://armandoxh.github.io/Territorygame/ this is "/Territorygame/".
// For local `vite dev` we leave it as "/" via mode check.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/Territorygame/' : '/',
  build: {
    outDir: fileURLToPath(new URL('../docs', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    host: true, // expose to LAN so we can also load on a phone during dev
    port: 5173,
  },
}));
