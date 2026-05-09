import { Application } from 'pixi.js';

const app = new Application();
await app.init({
  resizeTo: window,
  background: '#0a0a0a',
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});

document.getElementById('app')!.appendChild(app.canvas);
document.getElementById('readout')!.textContent = 'swarm v2 — scaffold ok';
