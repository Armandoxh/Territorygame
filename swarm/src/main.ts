import { Application, Container, Graphics } from 'pixi.js';
import { createCamera } from './camera';
import { generateWorld, type World } from './world';
import { buildMapLayers, type MapLayers } from './mapRender';
import { attachInput, type DragHandler } from './input';
import { createArmy, type Army, type Regiment } from './army';
import { UNIT_DEFS } from './units';
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

// One stationary placeholder enemy at the player's first graph-neighbor.
// Test rig only — real enemy battalions, AI, recruitment all land later.
const ENEMY_GLYPH_SIZE = 12;
const ENEMY_OFFSET_X = 14;
// Combat triggers when the player's army center comes within this many
// world units of the enemy center. Slightly larger than the glyph so the
// player feels the engagement before the squares overlap pixel-for-pixel.
const COMBAT_TRIGGER_RADIUS = 16;

interface EnemyState {
  glyph: Graphics;
  pos: { x: number; y: number };
  regionId: number;
  // Per Q2 of nail #6.1: identical composition to the player. When AI /
  // recruitment / asymmetric matchups land in their own nails this seed
  // becomes per-nation config.
  regiments: Regiment[];
}

function spawnEnemy(w: World): EnemyState | null {
  const playerRegion = w.regions[w.playerRegionId]!;
  if (playerRegion.neighbors.length === 0) return null;
  const enemyRegionId = playerRegion.neighbors[0]!;
  const enemyRegion = w.regions[enemyRegionId]!;
  const x = enemyRegion.centroidX * TILE_SIZE + TILE_SIZE / 2 + ENEMY_OFFSET_X;
  const y = enemyRegion.centroidY * TILE_SIZE + TILE_SIZE / 2;

  const half = ENEMY_GLYPH_SIZE / 2;
  const glyph = new Graphics();
  glyph.rect(-half, -half, ENEMY_GLYPH_SIZE, ENEMY_GLYPH_SIZE).fill(enemyRegion.color);
  glyph
    .rect(-half, -half, ENEMY_GLYPH_SIZE, ENEMY_GLYPH_SIZE)
    .stroke({ width: 1.5, color: 0x111111 });
  glyph.position.set(x, y);

  return {
    glyph,
    pos: { x, y },
    regionId: enemyRegionId,
    regiments: [
      { type: 'infantry', count: 50 },
      { type: 'cavalry', count: 20 },
    ],
  };
}

function formatRegiments(regs: readonly Regiment[]): string {
  if (regs.length === 0) return '∅';
  return regs.map((r) => `${UNIT_DEFS[r.type].shortLabel} ${r.count}`).join(' · ');
}

function addLayers(l: MapLayers) {
  worldContainer.addChild(l.terrainLayer);
  worldContainer.addChild(l.tintLayer);
  worldContainer.addChild(l.borderLayer);
  worldContainer.addChild(l.playerLayer);
  worldContainer.addChild(l.capitalLayer);
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
let enemy: EnemyState | null = spawnEnemy(world);
type CombatState = 'idle' | 'engaged' | 'retreating';
let combatState: CombatState = 'idle';
addLayers(layers);
worldContainer.addChild(army.container);
if (enemy) worldContainer.addChild(enemy.glyph);

function loadMap(seed: number) {
  currentSeed = seed;
  // Tear down old layers (releases GPU buffers).
  layers.terrainLayer.destroy();
  layers.tintLayer.destroy();
  layers.borderLayer.destroy();
  layers.playerLayer.destroy();
  layers.capitalLayer.destroy();
  army.destroy();
  if (enemy) enemy.glyph.destroy();
  worldContainer.removeChildren();

  world = generateWorld({
    width: WORLD_TILES_X,
    height: WORLD_TILES_Y,
    regionCount: REGION_COUNT,
    seed,
  });
  layers = buildMapLayers(world, TILE_SIZE);
  army = createArmy({ world, tileSize: TILE_SIZE, screenToWorld, worldToScreen });
  enemy = spawnEnemy(world);
  combatState = 'idle';
  addLayers(layers);
  worldContainer.addChild(army.container);
  if (enemy) worldContainer.addChild(enemy.glyph);

  // Recenter camera; new map may have a different land shape.
  camera.panX = WORLD_W / 2;
  camera.panY = WORLD_H / 2;
  camera.zoom = initialZoom;

  const s = army.getStatus();
  lastArmyMarching = s.marching;
  lastArmyRegionId = s.regionId;
  lastArmyTarget = s.targetRegionId;
  renderReadout();
}

// Bridge the army to the input layer. `army` is reassigned by loadMap, so
// we re-derive the handler each pointerdown rather than capturing a stale
// reference.
const armyDragHandler: DragHandler = {
  hitTest: (sx, sy) => army.hitTest(sx, sy),
  onStart: (sx, sy) => army.startDrag(sx, sy),
  onMove: (sx, sy) => army.updateDrag(sx, sy),
  onEnd: (sx, sy) => army.endDrag(sx, sy),
};

attachInput({
  target: app.canvas as HTMLCanvasElement,
  camera,
  getViewport: () => ({ w: app.screen.width, h: app.screen.height }),
  getDragHandler: () => armyDragHandler,
});

let lastArmyMarching = army.getStatus().marching;
let lastArmyRegionId = army.getStatus().regionId;
let lastArmyTarget = army.getStatus().targetRegionId;

app.ticker.add(() => {
  const vw = app.screen.width;
  const vh = app.screen.height;

  army.tick(app.ticker.deltaMS / 1000);

  if (enemy) {
    const ap = army.getPos();
    const dx = ap.x - enemy.pos.x;
    const dy = ap.y - enemy.pos.y;
    const inRange = Math.hypot(dx, dy) <= COMBAT_TRIGGER_RADIUS;
    if (inRange && combatState !== 'engaged') {
      combatState = 'engaged';
      console.log('[combat] engaged with region', enemy.regionId);
      renderReadout();
    } else if (!inRange && combatState === 'engaged') {
      // First step out of the engagement zone after touching the enemy.
      combatState = 'retreating';
      console.log('[combat] retreating from region', enemy.regionId);
      renderReadout();
    }
  }

  worldContainer.scale.set(camera.zoom);
  worldContainer.position.set(vw / 2 - camera.panX * camera.zoom, vh / 2 - camera.panY * camera.zoom);

  const cellPixelSize = TILE_SIZE * camera.zoom;
  const view: ViewLabel = cellPixelSize <= TIER_THRESHOLD_PX ? 'STRATEGIC' : 'OPERATIONAL';

  const prev = readoutStore.getState();
  if (prev.view !== view || Math.abs(prev.zoom - camera.zoom) > 0.001) {
    readoutStore.setState({ zoom: camera.zoom, view });
  }

  // Re-render the readout only on march transitions or when the army
  // crosses a region boundary, not every frame.
  const status = army.getStatus();
  if (
    status.marching !== lastArmyMarching ||
    status.regionId !== lastArmyRegionId ||
    status.targetRegionId !== lastArmyTarget
  ) {
    lastArmyMarching = status.marching;
    lastArmyRegionId = status.regionId;
    lastArmyTarget = status.targetRegionId;
    renderReadout();
  }
});

const readoutEl = document.getElementById('readout')!;
function renderReadout() {
  const { zoom, view } = readoutStore.getState();
  const playerRegion = world.regions[world.playerRegionId]!;
  const status = army.getStatus();
  let armyLine: string;
  if (status.marching) {
    const target = status.targetRegionId >= 0 ? `#${status.targetRegionId}` : '?';
    armyLine = `army marching → ${target}`;
  } else {
    const where =
      status.regionId === world.playerRegionId
        ? 'home'
        : status.regionId >= 0
          ? `#${status.regionId}`
          : '?';
    armyLine = `army @ ${where} · drag to march`;
  }
  const armyComp = formatRegiments(army.getRegiments());
  let enemyLine: string;
  if (!enemy) {
    enemyLine = 'no enemy (no neighbors)';
  } else if (combatState === 'engaged') {
    enemyLine = '>>> BATTLE TRIGGERED <<<';
  } else if (combatState === 'retreating') {
    enemyLine = `RETREATING from #${enemy.regionId}`;
  } else {
    enemyLine = `enemy @ #${enemy.regionId} · march onto it`;
  }
  const enemyComp = enemy ? formatRegiments(enemy.regiments) : '';
  readoutEl.textContent =
    `swarm v2 · ${view} · ${zoom.toFixed(2)}x\n` +
    `seed ${currentSeed}\n` +
    `nation #${world.playerRegionId} · ${playerRegion.neighbors.length} borders\n` +
    armyLine + '\n' +
    `  yours: ${armyComp}\n` +
    enemyLine +
    (enemyComp ? `\n  theirs: ${enemyComp}` : '');
}
readoutStore.subscribe(renderReadout);
renderReadout();

const newMapBtn = document.getElementById('newmap')!;
newMapBtn.addEventListener('click', () => {
  loadMap(Math.floor(Math.random() * 0x7fffffff));
});
