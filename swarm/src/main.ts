import { Application, Container } from 'pixi.js';
import { createCamera } from './camera';
import { createPlaceholder } from './placeholder';
import { attachInput } from './input';
import { readoutStore, type ViewLabel } from './store';

const TILE_SIZE = 32;
const CELLS_X = 50;
const CELLS_Y = 50;
const WORLD_W = TILE_SIZE * CELLS_X;
const WORLD_H = TILE_SIZE * CELLS_Y;

// Crossfade thresholds in cell-pixel-size on screen.
// Below MIN: pure strategic (detail alpha 0). Above MAX: pure tactical (1).
const CROSSFADE_MIN_PX = 24;
const CROSSFADE_MAX_PX = 64;

const app = new Application();
await app.init({
  resizeTo: window,
  background: '#0a0a0a',
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});
document.getElementById('app')!.appendChild(app.canvas);

const world = new Container();
app.stage.addChild(world);

// Initial zoom fits the grid in the viewport with a small margin.
const initialZoom = Math.min(window.innerWidth / WORLD_W, window.innerHeight / WORLD_H) * 0.9;

const camera = createCamera({
  initialZoom,
  initialPanX: WORLD_W / 2,
  initialPanY: WORLD_H / 2,
  minZoom: initialZoom * 0.5,
  maxZoom: 8,
});

const placeholder = createPlaceholder({ cellsX: CELLS_X, cellsY: CELLS_Y, cellSize: TILE_SIZE });
world.addChild(placeholder.strategicLayer);
world.addChild(placeholder.detailLayer);

attachInput({
  target: app.canvas as HTMLCanvasElement,
  camera,
  getViewport: () => ({ w: app.screen.width, h: app.screen.height }),
});

app.ticker.add(() => {
  const vw = app.screen.width;
  const vh = app.screen.height;
  world.scale.set(camera.zoom);
  world.position.set(vw / 2 - camera.panX * camera.zoom, vh / 2 - camera.panY * camera.zoom);

  const cellPixelSize = TILE_SIZE * camera.zoom;
  const crossfade = Math.max(0, Math.min(1, (cellPixelSize - CROSSFADE_MIN_PX) / (CROSSFADE_MAX_PX - CROSSFADE_MIN_PX)));
  placeholder.detailLayer.alpha = crossfade;

  const view: ViewLabel = crossfade < 0.05 ? 'STRATEGIC' : crossfade > 0.95 ? 'TACTICAL' : 'MID';
  const prev = readoutStore.getState();
  if (
    Math.abs(prev.crossfade - crossfade) > 0.01 ||
    prev.view !== view ||
    Math.abs(prev.zoom - camera.zoom) > 0.001
  ) {
    readoutStore.setState({ zoom: camera.zoom, view, crossfade });
  }
});

const readoutEl = document.getElementById('readout')!;
function renderReadout() {
  const { zoom, view, crossfade } = readoutStore.getState();
  let label: string = view;
  if (view === 'MID') {
    const pct = Math.round(crossfade * 100);
    label = `STRATEGIC→TACTICAL ${pct}%`;
  }
  readoutEl.textContent = `swarm v2 — zoom ${zoom.toFixed(2)}x — ${label}`;
}
readoutStore.subscribe(renderReadout);
renderReadout();
