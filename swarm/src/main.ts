import { Application, Container } from 'pixi.js';
import { createCamera } from './camera';
import { generateWorld, type World } from './world';
import { buildMapLayers, type MapLayers } from './mapRender';
import { attachInput, type DragHandler } from './input';
import { createArmy, type Army } from './army';
import { readoutStore, type ViewLabel } from './store';

const TILE_SIZE = 16;
const WORLD_TILES_X = 100;
const WORLD_TILES_Y = 100;
const REGION_COUNT = 25;
const DEFAULT_SEED = 1337;

const WORLD_W = TILE_SIZE * WORLD_TILES_X;
const WORLD_H = TILE_SIZE * WORLD_TILES_Y;

// Manual zoom caps at OPERATIONAL — never reaches the sprite-art TACTICAL
// view (which is reserved for battle camera). Tier label flips at the
// midpoint between min and max manual zoom.
const MAX_MANUAL_ZOOM = 2.0;
const TIER_THRESHOLD_PX = 18;  // strategic if cellPixelSize <= this, else operational

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

const initialZoom = Math.min(window.innerWidth / WORLD_W, window.innerHeight / WORLD_H) * 0.9;

const camera = createCamera({
  initialZoom,
  initialPanX: WORLD_W / 2,
  initialPanY: WORLD_H / 2,
  minZoom: initialZoom * 0.5,
  maxZoom: MAX_MANUAL_ZOOM,
});

function screenToWorld(sx: number, sy: number) {
  return {
    x: (sx - app.screen.width / 2) / camera.zoom + camera.panX,
    y: (sy - app.screen.height / 2) / camera.zoom + camera.panY,
  };
}

function worldToScreen(wx: number, wy: number) {
  return {
    x: (wx - camera.panX) * camera.zoom + app.screen.width / 2,
    y: (wy - camera.panY) * camera.zoom + app.screen.height / 2,
  };
}

let currentSeed = DEFAULT_SEED;
let world: World = generateWorld({
  width: WORLD_TILES_X,
  height: WORLD_TILES_Y,
  regionCount: REGION_COUNT,
  seed: currentSeed,
});
let layers: MapLayers = buildMapLayers(world, TILE_SIZE);
let army: Army = createArmy({ world, tileSize: TILE_SIZE, screenToWorld, worldToScreen });
addLayers(layers);
worldContainer.addChild(army.container);

function addLayers(l: MapLayers) {
  worldContainer.addChild(l.terrainLayer);
  worldContainer.addChild(l.tintLayer);
  worldContainer.addChild(l.borderLayer);
  worldContainer.addChild(l.playerLayer);
  worldContainer.addChild(l.capitalLayer);
}

function loadMap(seed: number) {
  currentSeed = seed;
  // Tear down old layers (releases GPU buffers).
  layers.terrainLayer.destroy();
  layers.tintLayer.destroy();
  layers.borderLayer.destroy();
  layers.playerLayer.destroy();
  layers.capitalLayer.destroy();
  army.destroy();
  worldContainer.removeChildren();

  world = generateWorld({
    width: WORLD_TILES_X,
    height: WORLD_TILES_Y,
    regionCount: REGION_COUNT,
    seed,
  });
  layers = buildMapLayers(world, TILE_SIZE);
  army = createArmy({ world, tileSize: TILE_SIZE, screenToWorld, worldToScreen });
  addLayers(layers);
  worldContainer.addChild(army.container);

  // Recenter camera; new map may have a different land shape.
  camera.panX = WORLD_W / 2;
  camera.panY = WORLD_H / 2;
  camera.zoom = initialZoom;

  renderReadout();
}

// Bridge the army to the input layer. `army` is reassigned by loadMap, so
// we re-derive the handler each pointerdown rather than capturing a stale
// reference.
const armyDragHandler: DragHandler = {
  hitTest: (sx, sy) => army.hitTest(sx, sy),
  onStart: (sx, sy) => army.startDrag(sx, sy),
  onMove: (sx, sy) => army.updateDrag(sx, sy),
  onEnd: (sx, sy) => {
    const moved = army.endDrag(sx, sy);
    if (moved !== null) renderReadout();
  },
};

attachInput({
  target: app.canvas as HTMLCanvasElement,
  camera,
  getViewport: () => ({ w: app.screen.width, h: app.screen.height }),
  getDragHandler: () => armyDragHandler,
});

app.ticker.add(() => {
  const vw = app.screen.width;
  const vh = app.screen.height;
  worldContainer.scale.set(camera.zoom);
  worldContainer.position.set(vw / 2 - camera.panX * camera.zoom, vh / 2 - camera.panY * camera.zoom);

  const cellPixelSize = TILE_SIZE * camera.zoom;
  const view: ViewLabel = cellPixelSize <= TIER_THRESHOLD_PX ? 'STRATEGIC' : 'OPERATIONAL';

  const prev = readoutStore.getState();
  if (prev.view !== view || Math.abs(prev.zoom - camera.zoom) > 0.001) {
    readoutStore.setState({ zoom: camera.zoom, view });
  }
});

const readoutEl = document.getElementById('readout')!;
function renderReadout() {
  const { zoom, view } = readoutStore.getState();
  const playerRegion = world.regions[world.playerRegionId]!;
  const armyRegion = world.regions[army.getRegionId()]!;
  const inHome = army.getRegionId() === world.playerRegionId;
  readoutEl.textContent =
    `swarm v2 · ${view} · ${zoom.toFixed(2)}x\n` +
    `seed ${currentSeed}\n` +
    `nation #${world.playerRegionId} · ${playerRegion.neighbors.length} borders\n` +
    `army @ ${inHome ? 'home' : `#${armyRegion.id}`} · drag to a neighbor`;
}
readoutStore.subscribe(renderReadout);
renderReadout();

const newMapBtn = document.getElementById('newmap')!;
newMapBtn.addEventListener('click', () => {
  loadMap(Math.floor(Math.random() * 0x7fffffff));
});
