import { Application, Container } from 'pixi.js';
import { createCamera } from './camera';
import { generateWorld } from './world';
import { buildMapLayers } from './mapRender';
import { attachInput } from './input';
import { readoutStore, type ViewLabel } from './store';

const TILE_SIZE = 16;
const WORLD_TILES_X = 100;
const WORLD_TILES_Y = 100;
const REGION_COUNT = 25;
const WORLD_SEED = 1337;

const WORLD_W = TILE_SIZE * WORLD_TILES_X;
const WORLD_H = TILE_SIZE * WORLD_TILES_Y;

// Crossfade — strategic content (region tints, borders) fades out as cells
// get bigger on screen. At MIN_PX or below: fully visible (strategic).
// At MAX_PX or above: fully gone (tactical).
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

const worldContainer = new Container();
app.stage.addChild(worldContainer);

const world = generateWorld({
  width: WORLD_TILES_X,
  height: WORLD_TILES_Y,
  regionCount: REGION_COUNT,
  seed: WORLD_SEED,
});

const layers = buildMapLayers(world, TILE_SIZE);
worldContainer.addChild(layers.terrainLayer);
worldContainer.addChild(layers.tintLayer);
worldContainer.addChild(layers.borderLayer);

// Initial zoom fits the world in the viewport with a small margin.
const initialZoom = Math.min(window.innerWidth / WORLD_W, window.innerHeight / WORLD_H) * 0.9;

const camera = createCamera({
  initialZoom,
  initialPanX: WORLD_W / 2,
  initialPanY: WORLD_H / 2,
  minZoom: initialZoom * 0.5,
  maxZoom: 8,
});

attachInput({
  target: app.canvas as HTMLCanvasElement,
  camera,
  getViewport: () => ({ w: app.screen.width, h: app.screen.height }),
});

app.ticker.add(() => {
  const vw = app.screen.width;
  const vh = app.screen.height;
  worldContainer.scale.set(camera.zoom);
  worldContainer.position.set(vw / 2 - camera.panX * camera.zoom, vh / 2 - camera.panY * camera.zoom);

  const cellPixelSize = TILE_SIZE * camera.zoom;
  const fadeOut = Math.max(0, Math.min(1, (cellPixelSize - CROSSFADE_MIN_PX) / (CROSSFADE_MAX_PX - CROSSFADE_MIN_PX)));
  layers.tintLayer.alpha = 1 - fadeOut;
  layers.borderLayer.alpha = 1 - fadeOut;

  const view: ViewLabel = fadeOut < 0.05 ? 'STRATEGIC' : fadeOut > 0.95 ? 'TACTICAL' : 'MID';
  const prev = readoutStore.getState();
  if (
    Math.abs(prev.crossfade - fadeOut) > 0.01 ||
    prev.view !== view ||
    Math.abs(prev.zoom - camera.zoom) > 0.001
  ) {
    readoutStore.setState({ zoom: camera.zoom, view, crossfade: fadeOut });
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
  readoutEl.textContent = `swarm v2 — zoom ${zoom.toFixed(2)}x — ${label} — ${world.regions.length} regions`;
}
readoutStore.subscribe(renderReadout);
renderReadout();
