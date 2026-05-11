import { Application, Container, Graphics } from 'pixi.js';
import { createCamera } from './camera';
import { generateWorld, makeRng, type World } from './world';
import { buildMapLayers, type MapLayers } from './mapRender';
import { attachInput, type DragHandler } from './input';
import { createArmy, type Army, type Regiment } from './army';
import { UNIT_DEFS } from './units';
import { createBattleScene } from './battleScene';
import { createBattleMenu } from './battleMenu';
import { simulateBattle } from './battleSim';
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

// Battle scene constants. Tactical zoom is well past the strategic /
// operational manual cap (2.0); user can't reach this zoom by pinching.
const TACTICAL_ZOOM = 6.0;
const BATTLE_ENTRY_DELAY_MS = 500;
const BATTLE_TRANSITION_MS = 1000;

const app = new Application();
await app.init({
  resizeTo: window,
  background: '#0a0a0a',
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});
document.getElementById('app')!.appendChild(app.canvas);

// Layer structure under the camera transform:
//   worldContainer
//     ├─ strategicLayer  — terrain, tints, borders, capitals, army glyphs
//     └─ battleSceneLayer — dirt + (later) soldier sprites
// The two crossfade during battle transitions; only one is meaningfully
// visible at a time.
const worldContainer = new Container();
const strategicLayer = new Container();
const battleSceneLayer = new Container();
battleSceneLayer.alpha = 0;
worldContainer.addChild(strategicLayer);
worldContainer.addChild(battleSceneLayer);
app.stage.addChild(worldContainer);

const battleScene = createBattleScene();
battleSceneLayer.addChild(battleScene.container);

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
    // Composition is rolled per-seed after spawn (see rollComposition);
    // this is just a placeholder so the shape is non-empty if the roll
    // ever doesn't run.
    regiments: [],
  };
}

function formatRegiments(regs: readonly Regiment[]): string {
  if (regs.length === 0) return '∅';
  return regs.map((r) => `${UNIT_DEFS[r.type].shortLabel} ${r.count}`).join(' · ');
}

// Roll a randomized regiment list. Variety per map without committing
// to per-faction config yet — that lands when AI / recruitment ships.
// Total in [40,100] and cav share in [10%,50%], integer counts.
function rollComposition(rng: () => number): Regiment[] {
  const total = 40 + Math.floor(rng() * 61);
  const cav = Math.round(total * (0.1 + rng() * 0.4));
  const inf = total - cav;
  const out: Regiment[] = [];
  if (inf > 0) out.push({ type: 'infantry', count: inf });
  if (cav > 0) out.push({ type: 'cavalry', count: cav });
  return out;
}

// Apply rolled compositions to both sides. Derives a separate RNG
// stream from the world seed (XOR'd with a constant) so the rolls
// don't share state with map generation.
function applyCompositions(seed: number) {
  const rng = makeRng(seed ^ 0x9e3779b9);
  army.setRegiments(rollComposition(rng));
  if (enemy) enemy.regiments = rollComposition(rng);
}

function addLayers(l: MapLayers) {
  strategicLayer.addChild(l.terrainLayer);
  strategicLayer.addChild(l.tintLayer);
  strategicLayer.addChild(l.borderLayer);
  strategicLayer.addChild(l.playerLayer);
  strategicLayer.addChild(l.capitalLayer);
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
// Combat lifecycle:
//   idle    — no engagement; touching the enemy starts one
//   engaged — covers BOTH the 500ms pre-roll AND the in-battle scene.
//             Army movement is frozen, the army can't be dragged,
//             zoom is locked. Once entered, the only way out is via
//             the battle menu (or via loadMap which force-exits).
// Battles are decisive (annihilation), so there's no post-battle
// cooldown — the loser is gone, re-engagement is impossible because
// the enemy/army no longer exists.
type CombatState = 'idle' | 'engaged';
let combatState: CombatState = 'idle';
addLayers(layers);
strategicLayer.addChild(army.container);
if (enemy) strategicLayer.addChild(enemy.glyph);
applyCompositions(currentSeed);

function loadMap(seed: number) {
  currentSeed = seed;
  // If a battle is in progress, abort it instantly — no fade out — since
  // the underlying world is being replaced.
  forceExitBattle();

  // Tear down old strategic content (releases GPU buffers). Leaves the
  // battleSceneLayer alone.
  layers.terrainLayer.destroy();
  layers.tintLayer.destroy();
  layers.borderLayer.destroy();
  layers.playerLayer.destroy();
  layers.capitalLayer.destroy();
  army.destroy();
  if (enemy) enemy.glyph.destroy();
  strategicLayer.removeChildren();

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
  strategicLayer.addChild(army.container);
  if (enemy) strategicLayer.addChild(enemy.glyph);
  applyCompositions(seed);

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

// ----- Battle state machine (nail #6.2) -----
// `inBattle` is true from the moment the entry transition begins to the
// moment the exit transition completes. While true, army movement is
// frozen, zoom is locked at TACTICAL_ZOOM (pan stays free per user
// pick), and the strategic layer is hidden under the dirt.
let inBattle = false;
// ms remaining before the entry crossfade starts, after the player's
// army first touches the enemy. null = no pending entry.
let battleEntryTimer: number | null = null;
// Active interpolation. null when not transitioning.
let battleTransition:
  | {
      startMs: number;
      duration: number;
      direction: 'in' | 'out';
      fromZoom: number;
      toZoom: number;
      fromPanX: number;
      toPanX: number;
      fromPanY: number;
      toPanY: number;
    }
  | null = null;
// Camera state captured at entry so we can restore on exit.
let preBattleCamera: { zoom: number; panX: number; panY: number } | null = null;

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function startEnterBattle() {
  if (inBattle || battleEntryTimer !== null || battleTransition !== null) return;
  battleEntryTimer = BATTLE_ENTRY_DELAY_MS;
}

function commitEnterBattle() {
  if (inBattle || !enemy) return;
  preBattleCamera = { zoom: camera.zoom, panX: camera.panX, panY: camera.panY };
  const ap = army.getPos();
  const midX = (ap.x + enemy.pos.x) / 2;
  const midY = (ap.y + enemy.pos.y) / 2;
  battleScene.setCenter(midX, midY);
  battleTransition = {
    startMs: performance.now(),
    duration: BATTLE_TRANSITION_MS,
    direction: 'in',
    fromZoom: camera.zoom,
    toZoom: TACTICAL_ZOOM,
    fromPanX: camera.panX,
    toPanX: midX,
    fromPanY: camera.panY,
    toPanY: midY,
  };
  inBattle = true;
}

function startExitBattle() {
  if (!inBattle || battleTransition !== null || !preBattleCamera) return;
  battleMenu.hide();
  battleTransition = {
    startMs: performance.now(),
    duration: BATTLE_TRANSITION_MS,
    direction: 'out',
    fromZoom: camera.zoom,
    toZoom: preBattleCamera.zoom,
    fromPanX: camera.panX,
    toPanX: preBattleCamera.panX,
    fromPanY: camera.panY,
    toPanY: preBattleCamera.panY,
  };
}

// Instant exit (no fade). Used when the world is replaced underneath us.
function forceExitBattle() {
  inBattle = false;
  battleEntryTimer = null;
  battleTransition = null;
  strategicLayer.alpha = 1;
  battleSceneLayer.alpha = 0;
  battleMenu.hide();
  // No cooldown — the world is being torn down anyway. loadMap resets
  // combatState to 'idle' immediately after.
  if (preBattleCamera) {
    camera.zoom = preBattleCamera.zoom;
    camera.panX = preBattleCamera.panX;
    camera.panY = preBattleCamera.panY;
    preBattleCamera = null;
  }
}

function tickBattleSystem(dtMs: number) {
  if (battleEntryTimer !== null) {
    battleEntryTimer -= dtMs;
    if (battleEntryTimer <= 0) {
      battleEntryTimer = null;
      commitEnterBattle();
    }
  }

  if (battleTransition) {
    const t = (performance.now() - battleTransition.startMs) / battleTransition.duration;
    const e = smoothstep(t);
    camera.zoom = battleTransition.fromZoom + (battleTransition.toZoom - battleTransition.fromZoom) * e;
    camera.panX = battleTransition.fromPanX + (battleTransition.toPanX - battleTransition.fromPanX) * e;
    camera.panY = battleTransition.fromPanY + (battleTransition.toPanY - battleTransition.fromPanY) * e;
    if (battleTransition.direction === 'in') {
      strategicLayer.alpha = 1 - e;
      battleSceneLayer.alpha = e;
    } else {
      strategicLayer.alpha = e;
      battleSceneLayer.alpha = 1 - e;
    }
    if (t >= 1) {
      const dir = battleTransition.direction;
      battleTransition = null;
      if (dir === 'out') {
        inBattle = false;
        preBattleCamera = null;
        combatState = 'idle';
        // Strategic layer is visible again now — apply post-battle
        // destruction. Sim already mutated regiments to .after values
        // when Simulate ran; if either side is empty, remove their
        // strategic presence so re-engagement is impossible.
        if (enemy && enemy.regiments.length === 0) {
          enemy.glyph.destroy();
          enemy = null;
        }
        // Player army hides itself via setRegiments side effect; nothing
        // to do for it here.
        renderReadout();
      } else {
        // Entry crossfade just completed — surface the action menu
        // with the current (pre-battle) compositions so the player
        // can see what they're up against before picking.
        battleMenu.show(army.getRegiments(), enemy ? enemy.regiments : []);
      }
    }
  }
}

// Battle action menu. Stays in screen-space (HTML overlay), so no camera
// wiring needed. Wires its three buttons back into the battle state
// machine. Attack and Intimidate are stubs for future nails (per
// user pick #6.2: punt Intimidate); Simulate runs the placeholder
// resolver and animates regiment counts down to survivors.
const battleMenu = createBattleMenu({
  onAttack: () => {
    console.log('[battle] attack — not implemented yet (real-time combat lands in a later nail)');
  },
  onSimulate: () => {
    if (!enemy) return;
    const result = simulateBattle(
      { regiments: army.getRegiments() },
      { regiments: enemy.regiments },
    );
    // Apply casualties immediately. The result panel animates a visual
    // tickdown over ~800ms but the underlying state is already updated,
    // which keeps the readout / future nails consistent if anything
    // queries regiment counts mid-animation.
    army.setRegiments(result.player.after);
    enemy.regiments = result.enemy.after.filter((r) => r.count > 0);
    battleMenu.showResult(result);
    renderReadout();
  },
  onIntimidate: () => {
    console.log('[battle] intimidate — design deferred to a later nail');
  },
  onResultDismiss: () => {
    startExitBattle();
  },
});

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
  // Lock zoom + drag from the moment engagement starts (covers the
  // 500ms pre-roll AND the in-battle scene). Once the battle resolves,
  // combatState returns to 'idle' and input is free again.
  getZoomLocked: () => combatState === 'engaged',
});

// Battle exit key. Only acts while in battle; otherwise B does nothing.
window.addEventListener('keydown', (e) => {
  if ((e.key === 'b' || e.key === 'B') && inBattle) {
    startExitBattle();
  }
});

let lastArmyMarching = army.getStatus().marching;
let lastArmyRegionId = army.getStatus().regionId;
let lastArmyTarget = army.getStatus().targetRegionId;

app.ticker.add(() => {
  const vw = app.screen.width;
  const vh = app.screen.height;
  const dtMs = app.ticker.deltaMS;

  // Freeze the army's march while committed to battle (covers both the
  // 500ms pre-roll and the in-battle scene). Once contact happens, the
  // army cannot walk away — "no retreat from a battle you engage."
  if (combatState !== 'engaged') {
    army.tick(dtMs / 1000);
  }

  // Engagement detection. Fires only when:
  //   - we're idle (not already in pre-roll / battle), and
  //   - an enemy still exists (was not annihilated in a prior battle),
  //   - the player still has an army (didn't lose all soldiers).
  if (
    enemy &&
    combatState === 'idle' &&
    army.getRegiments().length > 0
  ) {
    const ap = army.getPos();
    const dx = ap.x - enemy.pos.x;
    const dy = ap.y - enemy.pos.y;
    if (Math.hypot(dx, dy) <= COMBAT_TRIGGER_RADIUS) {
      combatState = 'engaged';
      console.log('[combat] engaged with region', enemy.regionId);
      startEnterBattle();
      renderReadout();
    }
  }

  tickBattleSystem(dtMs);

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
  const playerRegiments = army.getRegiments();
  let armyLine: string;
  if (playerRegiments.length === 0) {
    armyLine = 'army destroyed · new map to retry';
  } else if (status.marching) {
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
  const armyComp = formatRegiments(playerRegiments);
  let enemyLine: string;
  if (!enemy) {
    enemyLine = 'no enemy';
  } else if (combatState === 'engaged') {
    enemyLine = '>>> BATTLE TRIGGERED <<<';
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
