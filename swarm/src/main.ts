import { Application, Container, Graphics } from 'pixi.js';
import { createCamera } from './camera';
import { generateWorld, makeRng, type World } from './world';
import { buildMapLayers, rebuildOwnerLayers, type MapLayers } from './mapRender';
import { attachInput, type DragHandler } from './input';
import { createArmy, type Army, type Regiment } from './army';
import { UNIT_DEFS, UNIT_TYPES, type UnitType } from './units';
import { createBattleScene } from './battleScene';
import { createBattleMenu } from './battleMenu';
import { simulateBattle } from './battleSim';
import type { Nation } from './nation';
import { createGameModal, type GameModal } from './gameModal';
import { readoutStore, type ViewLabel } from './store';
import { createStateLayer, type StateLayer } from './stateLayer';
import { initBuildings, buildNext, getBuildings, type BuildingLine } from './buildings';
import { createStateMenu, type StateMenu } from './stateMenu';

// ----- World / camera constants -----
const TILE_SIZE = 16;
const WORLD_TILES_X = 100;
const WORLD_TILES_Y = 100;
const REGION_COUNT = 25;
const DEFAULT_SEED = 1337;

const WORLD_W = TILE_SIZE * WORLD_TILES_X;
const WORLD_H = TILE_SIZE * WORLD_TILES_Y;

// Manual zoom caps at OPERATIONAL — never reaches the sprite-art TACTICAL
// view (which is reserved for battle camera).
const MAX_MANUAL_ZOOM = 2.0;
const TIER_THRESHOLD_PX = 18;

// ----- Battle scene constants -----
const TACTICAL_ZOOM = 6.0;
const BATTLE_ENTRY_DELAY_MS = 500;
const BATTLE_TRANSITION_MS = 1000;
const COMBAT_TRIGGER_RADIUS = 16;

// ----- Multi-nation constants -----
const AI_NATION_COUNT = 2;  // 1 player + 2 AIs = 3 nations total per port.md M1
// AI decides what to do every ~10s on average, jittered. Pick happens
// only when their army is idle (not mid-march); otherwise they keep
// marching and re-decide on the next interval.
const AI_DECIDE_INTERVAL_MS = 10_000;
const AI_DECIDE_JITTER_MS = 2_500;
// Time the player must hold the capital tile to capture it. AIs get a
// chance to interrupt by re-routing their nearest other army (if any)
// to defend; landing combat resets the hold timer.
const CAPITAL_HOLD_MS = 10_000;
const CAPITAL_HOLD_RADIUS = 24;
// Time to flip a NON-capital enemy region by standing in it with no
// enemy army within engagement range. Faster than capitals (capitals
// are the bigger prize). Combat naturally resets the timer because
// enemy-in-range cancels the hold.
const REGION_HOLD_MS = 5_000;
// How often an AI under siege checks if they have an army to recall.
const SIEGE_RESPONSE_INTERVAL_MS = 2_000;
// Brief visual indicator for silent AI vs AI battles.
const AI_BATTLE_ICON_MS = 1200;

// ----- Recruitment constants -----
// Base recruitment rate per owned capital, in "unit-time" per second.
// Each unit type has a recruitCost (units.ts) — infantry = 1, cav = 2,
// so a 1-capital nation produces 1 inf/sec or 1 cav per 2s. Future
// building/upgrade nail multiplies this (see getRecruitmentRate).
const RECRUIT_RATE_PER_CAPITAL = 1;
// Army cap. Base + per-region bonus → captured land translates into
// roof for your army size. Recruitment stops at cap; resumes after
// casualties drop you back under.
const ARMY_CAP_BASE = 50;
const ARMY_CAP_PER_REGION = 10;

// Curated nation palette. Player always gets PLAYER_COLOR (bright
// cyan-blue) so their territory is instantly recognizable regardless
// of map seed. AI_COLORS are picked round-robin for the remaining
// slots — all four are distinct from each other AND from PLAYER_COLOR.
const PLAYER_COLOR = 0x2ea3ee;
const AI_COLORS = [0xd54e3a, 0xa05ad0, 0xe6a800, 0x29a36a];

// ----- Pixi app + layers -----
const app = new Application();
await app.init({
  resizeTo: window,
  background: '#0a0a0a',
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});
document.getElementById('app')!.appendChild(app.canvas);

// Layer tree under the camera transform:
//   worldContainer
//     ├─ strategicLayer
//     │    ├─ MapLayers (terrain → capitals)
//     │    ├─ nation army containers
//     │    └─ aiBattleIconLayer (transient flash markers)
//     ├─ stateOverlayContainer (state borders + resource/building icons,
//     │    visible only in region-zoom mode)
//     └─ battleSceneLayer (dirt + future tactical sprites)
const worldContainer = new Container();
const strategicLayer = new Container();
// Holder for the stateLayer; the StateLayer module owns its own
// children container but we add/remove it from worldContainer here
// so we control z-order (above strategic, below battle).
const stateOverlayContainer = new Container();
const battleSceneLayer = new Container();
battleSceneLayer.alpha = 0;
worldContainer.addChild(strategicLayer);
worldContainer.addChild(stateOverlayContainer);
worldContainer.addChild(battleSceneLayer);
app.stage.addChild(worldContainer);

const battleScene = createBattleScene();
battleSceneLayer.addChild(battleScene.container);

// Dedicated layer for transient AI-battle-here icons (small flashing
// crossed-swords-style marker). Kept on top of strategic content so it
// reads at any zoom.
const aiBattleIconLayer = new Container();
strategicLayer.addChild(aiBattleIconLayer);

// Progress rings around capitals currently being captured. Redrawn
// each frame any capture is active (cheap — at most one ring per
// nation, usually 0-2 active). Color = the captor's color so it's
// obvious WHO is besieging.
const captureProgressLayer = new Container();
strategicLayer.addChild(captureProgressLayer);
const CAPTURE_RING_RADIUS = 16;

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

// ----- World state -----
let currentSeed = DEFAULT_SEED;
let world: World;
let layers: MapLayers;
let regionOwner: Int16Array;
let nations: Nation[] = [];

// ----- Battle state -----
type CombatState = 'idle' | 'engaged';
let combatState: CombatState = 'idle';
// The AI nation the player is currently fighting (or about to). Set on
// engagement; consumed by battleMenu / Simulate. Reset on exit.
let activeOpponent: Nation | null = null;

let inBattle = false;
let battleEntryTimer: number | null = null;
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
let preBattleCamera: { zoom: number; panX: number; panY: number } | null = null;

// ----- Region-zoom (territory build view) state -----
// Tap-snap into a single region to see its sub-state breakdown and
// build on individual states. Mirrors the battleTransition state
// machine: idle → entering (lerp) → active → exiting (lerp) → idle.
// stateLayer (the visual overlay) is owned by the region-zoom system.
type RegionZoom =
  | { mode: 'inactive' }
  | {
      mode: 'entering' | 'exiting';
      regionId: number;
      startMs: number;
      duration: number;
      fromZoom: number;
      toZoom: number;
      fromPanX: number;
      toPanX: number;
      fromPanY: number;
      toPanY: number;
    }
  | { mode: 'active'; regionId: number };
let regionZoom: RegionZoom = { mode: 'inactive' };
let preZoomCamera: { zoom: number; panX: number; panY: number } | null = null;
let stateLayerObj: StateLayer | null = null;
const REGION_ZOOM_TRANSITION_MS = 360;
// Cap region-zoom in-mode zoom so even very small regions don't
// over-magnify. Reusing TACTICAL_ZOOM (6.0) as the ceiling — same
// "as zoomed as battle scene" feel for symmetry.
const REGION_ZOOM_CEILING = 6.0;

// ----- Capture state is per-Nation (see nation.captureProgress). -----

// ----- Game-over state -----
let gameOver: 'victory' | 'defeat' | null = null;

// ===== Helpers =====

function formatRegiments(regs: readonly Regiment[]): string {
  if (regs.length === 0) return '∅';
  return regs.map((r) => `${UNIT_DEFS[r.type].shortLabel} ${r.count}`).join(' · ');
}

// Roll a randomized regiment list. Same shape as the per-side
// composition draw used since #6.2: total in [40,100], cav share
// [10%,50%], integer counts.
function rollComposition(rng: () => number): Regiment[] {
  const total = 40 + Math.floor(rng() * 61);
  const cav = Math.round(total * (0.1 + rng() * 0.4));
  const inf = total - cav;
  const out: Regiment[] = [];
  if (inf > 0) out.push({ type: 'infantry', count: inf });
  if (cav > 0) out.push({ type: 'cavalry', count: cav });
  return out;
}

// Pick N well-spaced starting regions. Player gets index 0 = largest
// region by tile count (stable, sensible power base). Subsequent picks
// maximize min-distance to all already-picked regions, giving AIs
// space to expand without being on top of the player.
function pickStartingRegions(w: World, count: number): number[] {
  const taken: number[] = [];
  let largest = 0;
  for (let i = 1; i < w.regions.length; i++) {
    if (w.regions[i]!.tileCount > w.regions[largest]!.tileCount) largest = i;
  }
  taken.push(largest);
  while (taken.length < count && taken.length < w.regions.length) {
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < w.regions.length; i++) {
      if (taken.includes(i)) continue;
      let minDist = Infinity;
      for (const t of taken) {
        const dx = w.regions[i]!.centroidX - w.regions[t]!.centroidX;
        const dy = w.regions[i]!.centroidY - w.regions[t]!.centroidY;
        const d = dx * dx + dy * dy;
        if (d < minDist) minDist = d;
      }
      if (minDist > bestScore) {
        bestScore = minDist;
        best = i;
      }
    }
    if (best < 0) break;
    taken.push(best);
  }
  return taken;
}

function spawnNations(w: World, seed: number): Nation[] {
  const startingRegions = pickStartingRegions(w, 1 + AI_NATION_COUNT);
  const rng = makeRng(seed ^ 0x9e3779b9);
  const out: Nation[] = [];
  for (let i = 0; i < startingRegions.length; i++) {
    const regionId = startingRegions[i]!;
    const region = w.regions[regionId]!;
    const isPlayer = i === 0;
    const color = isPlayer ? PLAYER_COLOR : AI_COLORS[(i - 1) % AI_COLORS.length]!;
    const army = createArmy({
      world: w,
      tileSize: TILE_SIZE,
      homeRegionId: regionId,
      color,
      screenToWorld,
      worldToScreen,
      // Player drag-drop must validate that the straight line from
      // army → drop point doesn't transit enemy land. AIs straight-
      // line via marchTo without validation (engagement catches
      // collisions). Multi-army future state: same hook per army.
      canMoveTo: isPlayer
        ? (fx, fy, tx, ty) => canNationMoveStraight(i, fx, fy, tx, ty)
        : undefined,
    });
    army.setRegiments(rollComposition(rng));
    const capitalX = region.centroidX * TILE_SIZE + TILE_SIZE / 2;
    const capitalY = region.centroidY * TILE_SIZE + TILE_SIZE / 2;
    out.push({
      id: i,
      color,
      capitalRegionId: regionId,
      capitalX,
      capitalY,
      army,
      isPlayer,
      eliminated: false,
      // Initial decide is sooner than the normal cadence so the map
      // feels alive within a few seconds of load. Subsequent decisions
      // use the full AI_DECIDE_INTERVAL_MS.
      nextDecideAtMs: performance.now() + 2_000 + Math.random() * 2_000,
      lastSiegeResponseAtMs: 0,
      captureProgress: null,
      regionCaptureProgress: null,
      recruitmentPick: 'infantry',
      recruitmentProgress: 0,
    });
  }
  return out;
}

function initRegionOwner(w: World, ns: Nation[]): Int16Array {
  const ro = new Int16Array(w.regions.length);
  ro.fill(-1);
  for (const n of ns) ro[n.capitalRegionId] = n.id;
  return ro;
}

function addLayers(l: MapLayers) {
  strategicLayer.addChild(l.terrainLayer);
  strategicLayer.addChild(l.tintLayer);
  strategicLayer.addChild(l.borderLayer);
  strategicLayer.addChild(l.playerLayer);
  strategicLayer.addChild(l.capitalLayer);
}

function playerNation(): Nation {
  // nations[0] is always the player. Stable invariant from spawnNations.
  return nations[0]!;
}

function aliveOpponents(): Nation[] {
  // "Alive" here means "still a nation the player has to deal with" —
  // capital intact. An AI whose army was destroyed in a sim still
  // owns their capital region and must be physically captured to be
  // eliminated. (Engagement detection separately checks army !== null
  // before triggering combat, so that path doesn't fire on armyless AIs.)
  return nations.filter((n) => !n.isPlayer && !n.eliminated);
}

// Repaint ownership-dependent layers. Cheap-ish (one Graphics.clear +
// re-draw); called only on region capture events, not per frame.
function rebuildLayers() {
  rebuildOwnerLayers(layers, world, TILE_SIZE, regionOwner, nations);
}

// ===== Load map =====

function loadMap(seed: number) {
  currentSeed = seed;

  // Force-exit any in-flight battle / capture / game-over / region-zoom
  // state so the new world starts clean.
  forceExitBattle();
  forceExitRegionZoom();
  for (const n of nations) n.captureProgress = null;
  gameOver = null;
  gameModal.hide();

  // Tear down old strategic content. battleSceneLayer is left alone.
  if (layers) {
    layers.terrainLayer.destroy();
    layers.tintLayer.destroy();
    layers.borderLayer.destroy();
    layers.playerLayer.destroy();
    layers.capitalLayer.destroy();
  }
  for (const n of nations) {
    if (n.army) n.army.destroy();
  }
  // Destroy any in-flight transient AI-battle icons and capture
  // rings before clearing the strategic layer. Otherwise the
  // detached Graphics objects leak GPU resources (their alpha-fade
  // rAFs would also try to touch them but are guarded by .destroyed).
  for (const c of [...aiBattleIconLayer.children]) c.destroy();
  for (const c of [...captureProgressLayer.children]) c.destroy();
  strategicLayer.removeChildren();

  world = generateWorld({
    width: WORLD_TILES_X,
    height: WORLD_TILES_Y,
    regionCount: REGION_COUNT,
    seed,
  });
  nations = spawnNations(world, seed);
  regionOwner = initRegionOwner(world, nations);
  layers = buildMapLayers(world, TILE_SIZE, regionOwner, nations);
  addLayers(layers);
  // Per-state buildings: fresh slate on every map load.
  initBuildings(world.states.length);
  // Tear down the old state overlay and rebuild from the new world.
  if (stateLayerObj) {
    stateOverlayContainer.removeChild(stateLayerObj.container);
    stateLayerObj.destroy();
  }
  stateLayerObj = createStateLayer(world, TILE_SIZE);
  stateOverlayContainer.addChild(stateLayerObj.container);
  // aiBattleIconLayer is shared across map loads — re-add on top.
  strategicLayer.addChild(aiBattleIconLayer);
  for (const n of nations) {
    if (n.army) strategicLayer.addChild(n.army.container);
  }
  // Re-mount capture-progress layer on top of armies + capitals so the
  // ring reads no matter what's underneath.
  strategicLayer.addChild(captureProgressLayer);

  combatState = 'idle';
  activeOpponent = null;

  // Recenter camera.
  camera.panX = WORLD_W / 2;
  camera.panY = WORLD_H / 2;
  camera.zoom = initialZoom;

  renderReadout();
}

// ===== Battle state machine =====

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function startEnterBattle() {
  if (inBattle || battleEntryTimer !== null || battleTransition !== null) return;
  battleEntryTimer = BATTLE_ENTRY_DELAY_MS;
}

function commitEnterBattle() {
  if (inBattle || !activeOpponent || !activeOpponent.army) return;
  const player = playerNation();
  if (!player.army) return;
  preBattleCamera = { zoom: camera.zoom, panX: camera.panX, panY: camera.panY };
  const ap = player.army.getPos();
  const ep = activeOpponent.army.getPos();
  const midX = (ap.x + ep.x) / 2;
  const midY = (ap.y + ep.y) / 2;
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

function forceExitBattle() {
  inBattle = false;
  battleEntryTimer = null;
  battleTransition = null;
  strategicLayer.alpha = 1;
  battleSceneLayer.alpha = 0;
  if (battleMenu) battleMenu.hide();
  preBattleCamera = null;
  combatState = 'idle';
  activeOpponent = null;
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
        // Strategic layer is visible again. With recruitment, armies
        // are NO LONGER destroyed on battle wipe — the Army instance
        // stays alive (container hidden via setRegiments side effect)
        // so the nation's recruitment can repopulate it from the
        // capital. tickRecruitment + addSoldier handles the respawn.
        activeOpponent = null;
        checkGameOver();
        renderReadout();
      } else {
        // Entry done — show the action menu with current compositions.
        const p = playerNation();
        const playerRegs = p.army ? p.army.getRegiments() : [];
        const oppRegs = activeOpponent && activeOpponent.army ? activeOpponent.army.getRegiments() : [];
        battleMenu.show(playerRegs, oppRegs);
      }
    }
  }
}

// ===== Region-zoom (territory build) state machine =====

function startEnterRegionZoom(regionId: number) {
  // Defensive: only one zoom-snap in flight; battle takes priority.
  if (regionZoom.mode !== 'inactive') return;
  if (inBattle || battleEntryTimer !== null || battleTransition !== null) return;
  if (combatState === 'engaged' || gameOver) return;
  const region = world.regions[regionId];
  if (!region) return;
  preZoomCamera = { zoom: camera.zoom, panX: camera.panX, panY: camera.panY };
  // Target zoom: enough that the region fills most of the smaller
  // viewport dimension. sqrt(tileCount) approximates region edge in
  // tiles; multiply by TILE_SIZE and add ~30% margin so the region
  // doesn't kiss the edges.
  const sideTiles = Math.max(4, Math.sqrt(region.tileCount));
  const sidePixels = sideTiles * TILE_SIZE * 1.4;
  const vp = { w: app.screen.width, h: app.screen.height };
  const fit = Math.min(vp.w, vp.h) / sidePixels;
  const toZoom = Math.max(1.2, Math.min(REGION_ZOOM_CEILING, fit));
  const toPanX = region.centroidX * TILE_SIZE + TILE_SIZE / 2;
  const toPanY = region.centroidY * TILE_SIZE + TILE_SIZE / 2;
  regionZoom = {
    mode: 'entering',
    regionId,
    startMs: performance.now(),
    duration: REGION_ZOOM_TRANSITION_MS,
    fromZoom: camera.zoom,
    toZoom,
    fromPanX: camera.panX,
    toPanX,
    fromPanY: camera.panY,
    toPanY,
  };
  if (stateLayerObj) {
    stateLayerObj.setVisibleRegion(regionId);
    stateLayerObj.container.alpha = 0;
  }
}

function startExitRegionZoom() {
  if (regionZoom.mode !== 'active') return;
  if (!preZoomCamera) return;
  stateMenu.hide();
  regionZoom = {
    mode: 'exiting',
    regionId: regionZoom.regionId,
    startMs: performance.now(),
    duration: REGION_ZOOM_TRANSITION_MS,
    fromZoom: camera.zoom,
    toZoom: preZoomCamera.zoom,
    fromPanX: camera.panX,
    toPanX: preZoomCamera.panX,
    fromPanY: camera.panY,
    toPanY: preZoomCamera.panY,
  };
}

function forceExitRegionZoom() {
  regionZoom = { mode: 'inactive' };
  preZoomCamera = null;
  strategicLayer.alpha = 1;
  if (stateLayerObj) {
    stateLayerObj.container.alpha = 1;
    stateLayerObj.setVisibleRegion(null);
  }
  stateMenu.hide();
}

function tickRegionZoomSystem(_dtMs: number) {
  if (regionZoom.mode !== 'entering' && regionZoom.mode !== 'exiting') return;
  const t = (performance.now() - regionZoom.startMs) / regionZoom.duration;
  const e = smoothstep(t);
  camera.zoom = regionZoom.fromZoom + (regionZoom.toZoom - regionZoom.fromZoom) * e;
  camera.panX = regionZoom.fromPanX + (regionZoom.toPanX - regionZoom.fromPanX) * e;
  camera.panY = regionZoom.fromPanY + (regionZoom.toPanY - regionZoom.fromPanY) * e;
  if (regionZoom.mode === 'entering') {
    // Fade other-region detail down, state layer up.
    strategicLayer.alpha = 1 - e * 0.55;  // dim to ~0.45
    if (stateLayerObj) stateLayerObj.container.alpha = e;
  } else {
    strategicLayer.alpha = 0.45 + e * 0.55;
    if (stateLayerObj) stateLayerObj.container.alpha = 1 - e;
  }
  if (t >= 1) {
    const wasEntering = regionZoom.mode === 'entering';
    const rid = regionZoom.regionId;
    if (wasEntering) {
      regionZoom = { mode: 'active', regionId: rid };
    } else {
      regionZoom = { mode: 'inactive' };
      preZoomCamera = null;
      strategicLayer.alpha = 1;
      if (stateLayerObj) {
        stateLayerObj.container.alpha = 1;
        stateLayerObj.setVisibleRegion(null);
      }
    }
  }
}

function openStateMenu(stateId: number) {
  const st = world.states[stateId];
  if (!st) return;
  const ownedByPlayer = regionOwner[st.regionId] === playerNation().id;
  const b = getBuildings(stateId);
  stateMenu.show({
    stateId,
    regionId: st.regionId,
    resource: st.resource,
    tiers: { settlement: b.settlement, forestry: b.forestry, merchant: b.merchant },
    ownedByPlayer,
  });
}

// ===== AI behavior =====

function pickExpansionTarget(n: Nation): number {
  // Pick a region adjacent (graph-wise) to one this nation owns, that
  // is NOT owned by this nation. Prefer neutrals over enemy-owned.
  const ownedSet = new Set<number>();
  for (let r = 0; r < world.regions.length; r++) {
    if (regionOwner[r] === n.id) ownedSet.add(r);
  }
  const candidates: number[] = [];
  for (const r of ownedSet) {
    for (const nb of world.regions[r]!.neighbors) {
      if (!ownedSet.has(nb)) candidates.push(nb);
    }
  }
  if (candidates.length === 0) return -1;
  const neutrals = candidates.filter((r) => regionOwner[r]! < 0);
  const pool = neutrals.length > 0 ? neutrals : candidates;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

function aiSendArmyTo(n: Nation, regionId: number) {
  if (!n.army) return;
  const r = world.regions[regionId]!;
  const x = r.centroidX * TILE_SIZE + TILE_SIZE / 2;
  const y = r.centroidY * TILE_SIZE + TILE_SIZE / 2;
  n.army.marchTo(x, y);
}

function isSiegedBy(target: Nation): Nation | null {
  // Find any non-self nation currently capturing target's capital.
  for (const n of nations) {
    if (n === target) continue;
    const cp = n.captureProgress;
    if (cp && cp.targetNationId === target.id) return n;
  }
  return null;
}

function aiIsOnEnemyCapital(n: Nation): boolean {
  if (!n.army) return false;
  const pos = n.army.getPos();
  for (const e of nations) {
    if (e === n || e.eliminated) continue;
    if (regionOwner[e.capitalRegionId]! === n.id) continue;
    const dx = pos.x - e.capitalX;
    const dy = pos.y - e.capitalY;
    if (dx * dx + dy * dy <= CAPITAL_HOLD_RADIUS * CAPITAL_HOLD_RADIUS) return true;
  }
  return false;
}

function tickAi(_dtMs: number) {
  const now = performance.now();
  for (const n of nations) {
    if (n.isPlayer || n.eliminated || !n.army) continue;
    // Fight-back: if our capital is being besieged, send army home
    // (overrides normal expansion logic).
    const besieger = isSiegedBy(n);
    if (besieger) {
      if (now - n.lastSiegeResponseAtMs >= SIEGE_RESPONSE_INTERVAL_MS) {
        n.lastSiegeResponseAtMs = now;
        n.army.marchTo(n.capitalX, n.capitalY);
      }
      continue;
    }
    if (now < n.nextDecideAtMs) continue;
    n.nextDecideAtMs = now + AI_DECIDE_INTERVAL_MS + (Math.random() - 0.5) * 2 * AI_DECIDE_JITTER_MS;
    if (n.army.isMarching()) continue;  // wait for current march
    // Already standing on an enemy capital? Sit through the capture
    // hold instead of picking a new target.
    if (aiIsOnEnemyCapital(n)) continue;
    const target = pickExpansionTarget(n);
    if (target < 0) continue;
    aiSendArmyTo(n, target);
  }
}

// ===== Engagement detection (per-pair) =====

function tickEngagements() {
  if (combatState !== 'idle') return;  // player already engaged; pairs paused
  if (gameOver) return;
  // Player-vs-AI detection is suspended while the player is in
  // region-zoom (build) mode. The battle scene transition + the
  // region-zoom transition share the camera; firing both would
  // produce a jarring scene swap. AI-vs-AI pairs still run silently.
  const playerBusy = regionZoom.mode !== 'inactive';
  // First: check player vs each AI. Player gets the menu UI.
  const player = playerNation();
  if (!playerBusy && player.army && player.army.getRegiments().length > 0) {
    const pp = player.army.getPos();
    for (const n of nations) {
      if (n.isPlayer || n.eliminated || !n.army) continue;
      if (n.army.getRegiments().length === 0) continue;
      const np = n.army.getPos();
      const dx = pp.x - np.x;
      const dy = pp.y - np.y;
      if (Math.hypot(dx, dy) <= COMBAT_TRIGGER_RADIUS) {
        combatState = 'engaged';
        activeOpponent = n;
        // Cancel any in-progress capture — combat takes priority.
        player.captureProgress = null;
        console.log('[combat] player engaged AI', n.id);
        startEnterBattle();
        renderReadout();
        return;
      }
    }
  }
  // Second: AI vs AI silent resolution. We scan all unordered pairs.
  for (let i = 1; i < nations.length; i++) {
    const a = nations[i]!;
    if (a.isPlayer || a.eliminated || !a.army) continue;
    for (let j = i + 1; j < nations.length; j++) {
      const b = nations[j]!;
      if (b.isPlayer || b.eliminated || !b.army) continue;
      const ap = a.army.getPos();
      const bp = b.army.getPos();
      const dx = ap.x - bp.x;
      const dy = ap.y - bp.y;
      if (Math.hypot(dx, dy) <= COMBAT_TRIGGER_RADIUS) {
        resolveAiVsAiBattle(a, b);
        return;  // one battle per frame to avoid cascades
      }
    }
  }
}

function resolveAiVsAiBattle(a: Nation, b: Nation) {
  if (!a.army || !b.army) return;
  console.log('[combat] AI', a.id, 'vs AI', b.id);
  const result = simulateBattle(
    { regiments: a.army.getRegiments() },
    { regiments: b.army.getRegiments() },
  );
  a.army.setRegiments(result.player.after);
  b.army.setRegiments(result.enemy.after);
  // Flash a brief icon at the midpoint.
  const ap = a.army.getPos();
  const bp = b.army.getPos();
  showAiBattleIcon((ap.x + bp.x) / 2, (ap.y + bp.y) / 2);
  // Armies are NOT destroyed on wipe anymore. The Army instance hangs
  // around (container hidden) so the nation's capital recruitment can
  // refill it. captureCapital is the only place a nation's army is
  // genuinely torn down.
}

// Repaint the per-capture progress rings. Cheap: destroy + redraw all
// rings each call. Called every frame from the ticker.
function renderCaptureProgress() {
  for (const c of [...captureProgressLayer.children]) c.destroy();
  for (const n of nations) {
    const cp = n.captureProgress;
    if (!cp) continue;
    const target = nations[cp.targetNationId];
    if (!target) continue;
    const elapsed = performance.now() - cp.startedAtMs;
    const t = Math.max(0, Math.min(1, elapsed / CAPITAL_HOLD_MS));
    const g = new Graphics();
    // Background ring — faint, full circle, hints at the radius even
    // when the progress arc hasn't grown.
    g.circle(0, 0, CAPTURE_RING_RADIUS).stroke({ width: 2, color: 0xffffff, alpha: 0.18 });
    if (t > 0) {
      const start = -Math.PI / 2;
      const end = start + t * Math.PI * 2;
      g.moveTo(CAPTURE_RING_RADIUS * Math.cos(start), CAPTURE_RING_RADIUS * Math.sin(start));
      g.arc(0, 0, CAPTURE_RING_RADIUS, start, end, false);
      g.stroke({ width: 3, color: n.color, alpha: 0.95 });
    }
    g.position.set(target.capitalX, target.capitalY);
    captureProgressLayer.addChild(g);
  }
}

function showAiBattleIcon(wx: number, wy: number) {
  const g = new Graphics();
  // Two crossed lines, small, white. Recognizable at strategic zoom.
  const s = 7;
  g.moveTo(-s, -s).lineTo(s, s).moveTo(-s, s).lineTo(s, -s)
    .stroke({ width: 2, color: 0xffffff, alpha: 0.95 });
  g.position.set(wx, wy);
  aiBattleIconLayer.addChild(g);
  // Fade and remove.
  const startedAt = performance.now();
  function step() {
    // Guard against loadMap having torn this icon down out from under
    // us — the rAF loop can outlive the icon's parent.
    if (g.destroyed) return;
    const dt = performance.now() - startedAt;
    const t = dt / AI_BATTLE_ICON_MS;
    if (t >= 1) {
      g.destroy();
      return;
    }
    g.alpha = 1 - t;
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ===== Capital occupation (symmetric — player + AI) =====

function findCaptureTargetFor(attacker: Nation): Nation | null {
  if (!attacker.army) return null;
  const pos = attacker.army.getPos();
  for (const n of nations) {
    if (n === attacker || n.eliminated) continue;
    if (regionOwner[n.capitalRegionId]! === attacker.id) continue;
    const dx = pos.x - n.capitalX;
    const dy = pos.y - n.capitalY;
    if (dx * dx + dy * dy <= CAPITAL_HOLD_RADIUS * CAPITAL_HOLD_RADIUS) return n;
  }
  return null;
}

function tickCapture(_dtMs: number) {
  if (gameOver) return;
  const now = performance.now();
  let playerCaptureChanged = false;
  for (const attacker of nations) {
    if (attacker.eliminated || !attacker.army) {
      attacker.captureProgress = null;
      continue;
    }
    // Player can't capture while in the menu battle (combat freezes them).
    if (attacker.isPlayer && combatState !== 'idle') {
      if (attacker.captureProgress) {
        attacker.captureProgress = null;
        playerCaptureChanged = true;
      }
      continue;
    }
    const target = findCaptureTargetFor(attacker);
    if (!target) {
      if (attacker.captureProgress) {
        attacker.captureProgress = null;
        if (attacker.isPlayer) playerCaptureChanged = true;
      }
      continue;
    }
    const cp = attacker.captureProgress;
    if (!cp || cp.targetNationId !== target.id) {
      attacker.captureProgress = { targetNationId: target.id, startedAtMs: now };
      if (attacker.isPlayer) playerCaptureChanged = true;
      continue;
    }
    const elapsed = now - cp.startedAtMs;
    if (elapsed >= CAPITAL_HOLD_MS) {
      captureCapital(target, attacker);
      attacker.captureProgress = null;
      if (attacker.isPlayer) playerCaptureChanged = true;
    } else if (attacker.isPlayer) {
      // Keep the timer text ticking on the player's readout.
      playerCaptureChanged = true;
    }
  }
  if (playerCaptureChanged) renderReadout();
  // Also re-render every frame the player is under siege, so the
  // countdown in the readout actually ticks.
  else if (isSiegedBy(playerNation())) renderReadout();
}

function captureCapital(target: Nation, captor: Nation) {
  console.log('[capture] nation', captor.id, 'captured capital of nation', target.id);
  // Flip the capital region.
  regionOwner[target.capitalRegionId] = captor.id;
  // Target nation is eliminated. Their army (if any) sticks around as
  // a wandering remnant per design? Cleaner: destroy it so they truly
  // vanish from the map.
  if (target.army) {
    target.army.destroy();
    target.army = null;
  }
  target.eliminated = true;
  // Also flip any other regions the eliminated nation owned, to the
  // captor. Eliminated AIs shouldn't keep painting the map. (Future:
  // could leave them as a captured-territory-pending state; not yet.)
  for (let r = 0; r < world.regions.length; r++) {
    if (regionOwner[r] === target.id) regionOwner[r] = captor.id;
  }
  rebuildLayers();
  checkGameOver();
  renderReadout();
}

// ===== Region claim on arrival (for AI expansion + future player) =====

// Straight-line drop validator. The army marches in a literal straight
// line from current position to drop point. We sample along that line
// and reject if it crosses any region owned by another nation, EXCEPT
// the destination region itself (you're allowed to land on enemy
// land — just not to transit through it).
//   - own / neutral regions: passable
//   - water / out-of-bounds (regionAt < 0): treated as passable
//     (water has no owner; visually weird but consistent)
//   - destination region: always passable (you stop there)
//   - any other enemy region the line touches: blocked
// Future war / alliance system plugs in by widening the predicate.
function canNationMoveStraight(
  nationId: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return true;
  // Sample at half-tile granularity. Tile resolution is finer than
  // region boundaries in practice, so this catches narrow corner-clips.
  const step = TILE_SIZE * 0.5;
  const steps = Math.max(1, Math.ceil(dist / step));
  const dropRegion = regionAtPos(toX, toY);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const sx = fromX + dx * t;
    const sy = fromY + dy * t;
    const r = regionAtPos(sx, sy);
    if (r < 0) continue;
    if (r === dropRegion) continue;
    const owner = regionOwner[r]!;
    if (owner === nationId) continue;
    if (owner < 0) continue;
    return false;
  }
  return true;
}

function tickRegionClaims(_dtMs: number) {
  // Three flip paths:
  //   1. Neutral region + army standing in it → instant claim.
  //   2. Enemy non-capital region + army standing in it + no enemy
  //      army within combat-trigger radius → hold for REGION_HOLD_MS,
  //      then flip. Combat resets the hold (combat-trigger logic
  //      takes priority over capture).
  //   3. Enemy capital → handled by tickCapture, NOT here.
  if (gameOver) return;
  const now = performance.now();
  for (const n of nations) {
    if (n.eliminated || !n.army) {
      n.regionCaptureProgress = null;
      continue;
    }
    if (n.army.getRegiments().length === 0 || n.army.isMarching()) {
      n.regionCaptureProgress = null;
      continue;
    }
    const pos = n.army.getPos();
    const regionId = regionAtPos(pos.x, pos.y);
    if (regionId < 0) {
      n.regionCaptureProgress = null;
      continue;
    }
    const owner = regionOwner[regionId]!;
    if (owner === n.id) {
      n.regionCaptureProgress = null;
      continue;
    }
    if (owner < 0) {
      regionOwner[regionId] = n.id;
      n.regionCaptureProgress = null;
      rebuildLayers();
      continue;
    }
    // Enemy-owned. Capital? Skip — tickCapture handles capital flips
    // (which dominoes the whole nation, not just this region).
    const ownerNation = nations[owner];
    if (ownerNation && ownerNation.capitalRegionId === regionId) {
      n.regionCaptureProgress = null;
      continue;
    }
    // Enemy army in combat radius? Combat will fire next tick; reset
    // the hold timer so the capture has to restart after combat.
    let enemyClose = false;
    for (const m of nations) {
      if (m.id === n.id || m.eliminated || !m.army) continue;
      if (m.army.getRegiments().length === 0) continue;
      const mp = m.army.getPos();
      const dx = mp.x - pos.x;
      const dy = mp.y - pos.y;
      if (Math.hypot(dx, dy) <= COMBAT_TRIGGER_RADIUS) {
        enemyClose = true;
        break;
      }
    }
    if (enemyClose) {
      n.regionCaptureProgress = null;
      continue;
    }
    // Start or continue the hold.
    if (!n.regionCaptureProgress || n.regionCaptureProgress.targetRegionId !== regionId) {
      n.regionCaptureProgress = { targetRegionId: regionId, startedAtMs: now };
      continue;
    }
    if (now - n.regionCaptureProgress.startedAtMs >= REGION_HOLD_MS) {
      regionOwner[regionId] = n.id;
      n.regionCaptureProgress = null;
      rebuildLayers();
    }
  }
}

function regionAtPos(wx: number, wy: number): number {
  const tx = Math.floor(wx / TILE_SIZE);
  const ty = Math.floor(wy / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return -1;
  return world.regionOf[ty * world.width + tx]!;
}

function stateAtPos(wx: number, wy: number): number {
  const tx = Math.floor(wx / TILE_SIZE);
  const ty = Math.floor(wy / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return -1;
  return world.stateOf[ty * world.width + tx]!;
}

// ===== Win / defeat =====

// ===== Recruitment =====

function ownedCapitalCount(nationId: number): number {
  let c = 0;
  for (const n of nations) {
    if (regionOwner[n.capitalRegionId]! === nationId) c++;
  }
  return c;
}

function ownedRegionCount(nationId: number): number {
  let c = 0;
  for (let r = 0; r < regionOwner.length; r++) {
    if (regionOwner[r]! === nationId) c++;
  }
  return c;
}

function totalSoldierCount(n: Nation): number {
  if (!n.army) return 0;
  let s = 0;
  for (const r of n.army.getRegiments()) s += r.count;
  return s;
}

// Recruitment rate in unit-time per second. Currently just +1 per
// owned capital. FUTURE: incorporate per-capital buildings/upgrades
// (e.g. `capital.buildings.reduce((r, b) => r + b.recruitBonus, base)`)
// and other modifiers the user mentioned. The shape stays stable;
// only this function's body grows.
function getRecruitmentRate(n: Nation): number {
  if (n.eliminated) return 0;
  return ownedCapitalCount(n.id) * RECRUIT_RATE_PER_CAPITAL;
}

function getArmyCap(n: Nation): number {
  return ARMY_CAP_BASE + ARMY_CAP_PER_REGION * ownedRegionCount(n.id);
}

// Add one soldier of `type` to nation n's army. If the army was empty
// (destroyed in a prior battle), the Army instance is still alive but
// hidden; we respawn it at the capital before the first recruit so
// new soldiers appear at home, not at the death site.
function addSoldier(n: Nation, type: UnitType) {
  if (!n.army) return;
  const regs = [...n.army.getRegiments()];
  const wasEmpty = regs.length === 0;
  if (wasEmpty) {
    n.army.respawnAt(n.capitalX, n.capitalY);
  }
  const idx = regs.findIndex((r) => r.type === type);
  if (idx >= 0) {
    regs[idx] = { type: regs[idx]!.type, count: regs[idx]!.count + 1 };
  } else {
    regs.push({ type, count: 1 });
  }
  n.army.setRegiments(regs);
}

function tickRecruitment(dtMs: number) {
  const dtSec = dtMs / 1000;
  for (const n of nations) {
    if (n.eliminated || !n.army) continue;
    const rate = getRecruitmentRate(n);
    if (rate <= 0) continue;
    const cap = getArmyCap(n);
    if (totalSoldierCount(n) >= cap) {
      // At cap — don't accumulate. Resets to 0 so the bar starts
      // fresh after a casualty drops us below cap.
      n.recruitmentProgress = 0;
      continue;
    }
    n.recruitmentProgress += rate * dtSec;
    const cost = UNIT_DEFS[n.recruitmentPick].recruitCost;
    let safety = 0;
    while (n.recruitmentProgress >= cost && safety < 20) {
      n.recruitmentProgress -= cost;
      addSoldier(n, n.recruitmentPick);
      safety++;
      if (totalSoldierCount(n) >= cap) {
        n.recruitmentProgress = 0;
        break;
      }
    }
  }
}

function checkGameOver() {
  if (gameOver) return;
  const player = playerNation();
  // Defeat is now capital-captured-only. Army destruction is
  // recoverable via recruitment as long as you hold your capital —
  // see the recruitment system notes. If both army AND capital are
  // gone, the capital-owner check below catches it.
  const playerCapitalOwner = regionOwner[player.capitalRegionId]!;
  if (playerCapitalOwner !== player.id) {
    gameOver = 'defeat';
    gameModal.show('defeat', 'Your capital was captured.');
    return;
  }
  const enemiesAlive = nations.some((n) => !n.isPlayer && !n.eliminated);
  if (!enemiesAlive) {
    gameOver = 'victory';
    gameModal.show('victory', 'All enemy capitals captured.');
  }
}

// ===== Battle menu (player vs AI only) =====

const battleMenu = createBattleMenu({
  onAttack: () => {
    console.log('[battle] attack — not implemented yet');
  },
  onSimulate: () => {
    const player = playerNation();
    if (!player.army || !activeOpponent || !activeOpponent.army) return;
    const result = simulateBattle(
      { regiments: player.army.getRegiments() },
      { regiments: activeOpponent.army.getRegiments() },
    );
    player.army.setRegiments(result.player.after);
    activeOpponent.army.setRegiments(result.enemy.after);
    battleMenu.showResult(result);
    renderReadout();
  },
  onIntimidate: () => {
    console.log('[battle] intimidate — design deferred');
  },
  onResultDismiss: () => {
    startExitBattle();
  },
});

// ===== Game-over modal =====

const gameModal: GameModal = createGameModal({
  onRetry: () => {
    loadMap(Math.floor(Math.random() * 0x7fffffff));
  },
});

// ===== State (territory build) menu =====

const stateMenu: StateMenu = createStateMenu({
  onBuild: (stateId, line) => {
    if (regionZoom.mode !== 'active') return;
    // Defensive: only the player can build, and only on their owned
    // regions. The menu enforces this UI-side too but the data path
    // should not trust the UI.
    const st = world.states[stateId];
    if (!st) return;
    if (regionOwner[st.regionId] !== playerNation().id) return;
    const ok = buildNext(stateId, line);
    if (!ok) return;
    stateLayerObj?.refreshRegionBuildings(st.regionId);
    // Refresh the menu in place so the new tier shows immediately.
    openStateMenu(stateId);
  },
  onClose: () => {
    stateMenu.hide();
  },
});

// ===== Input =====

// Drag handler bridge. The player nation is always nations[0]; we
// re-derive each pointerdown so a loadMap (which rebuilds nations[])
// doesn't strand the handler on a stale Army reference.
const armyDragHandler: DragHandler = {
  hitTest: (sx, sy) => {
    const p = playerNation();
    return p.army ? p.army.hitTest(sx, sy) : false;
  },
  onStart: (sx, sy) => {
    const p = playerNation();
    if (p.army) p.army.startDrag(sx, sy);
  },
  onMove: (sx, sy) => {
    const p = playerNation();
    if (p.army) p.army.updateDrag(sx, sy);
  },
  onEnd: (sx, sy) => {
    const p = playerNation();
    return p.army ? p.army.endDrag(sx, sy) : false;
  },
};

attachInput({
  target: app.canvas as HTMLCanvasElement,
  camera,
  getViewport: () => ({ w: app.screen.width, h: app.screen.height }),
  getDragHandler: () => armyDragHandler,
  // Zoom is locked during battle AND while inside region-zoom (or
  // transitioning to/from it) so the snap stays at the framed scale.
  // Pan stays free in both modes so the player can look around.
  getZoomLocked: () =>
    combatState === 'engaged' || regionZoom.mode !== 'inactive',
  onTap: (sx, sy) => handleTap(sx, sy),
});

function handleTap(sx: number, sy: number) {
  // Eat taps that would land on visible HTML overlays (battle menu,
  // game-over modal, state menu, back button). DOM stops propagation
  // already for these but we'll early-out on visible-modal anyway to
  // avoid edge cases.
  if (gameOver) return;
  if (combatState === 'engaged' || inBattle || battleEntryTimer !== null || battleTransition !== null) return;
  if (regionZoom.mode === 'entering' || regionZoom.mode === 'exiting') return;
  if (stateMenu.isVisible()) return;
  const wp = screenToWorld(sx, sy);
  if (regionZoom.mode === 'active') {
    // Inside region-zoom: tap inside the active region's footprint
    // (any of its states) → open that state's build menu. Tap
    // ANYWHERE else (other region / water / off-map) → exit the
    // zoom. No dedicated back button — the "elsewhere" tap IS the
    // back gesture.
    const sid = stateAtPos(wp.x, wp.y);
    const tappedState = sid >= 0 ? world.states[sid] : null;
    if (tappedState && tappedState.regionId === regionZoom.regionId) {
      openStateMenu(sid);
    } else {
      startExitRegionZoom();
    }
    return;
  }
  // Strategic / operational view: tap a region to snap-zoom into it.
  const rid = regionAtPos(wp.x, wp.y);
  if (rid < 0) return;
  startEnterRegionZoom(rid);
}


// (B-key dev escape removed: the new Simulate path always resolves the
// battle decisively, and re-engagement loops if you exit without
// resolving. If the user wants to bail mid-battle, the "new map"
// button is one tap away.)

// ===== Initial bootstrap =====

// readoutEl must be resolved BEFORE the first loadMap(...) call,
// since loadMap → renderReadout → readoutEl.textContent. If we let
// the const sit at the bottom of the file (next to renderReadout
// itself), it's still in TDZ when loadMap runs at module init and
// the whole boot throws, leaving the page stuck on "booting…".
const readoutEl = document.getElementById('readout')!;

loadMap(currentSeed);

// ===== Ticker =====

app.ticker.add(() => {
  const vw = app.screen.width;
  const vh = app.screen.height;
  const dtMs = app.ticker.deltaMS;
  const dtSec = dtMs / 1000;

  // Per-nation ticks. Player + AI armies all tick unless their nation
  // is currently engaged in the player-vs-AI battle scene.
  for (const n of nations) {
    if (!n.army) continue;
    if (combatState === 'engaged') {
      // Freeze both the player army and the active opponent. Other AIs
      // continue moving so the world stays alive during your battle.
      if (n.isPlayer) continue;
      if (n === activeOpponent) continue;
    }
    n.army.tick(dtSec);
  }

  if (!gameOver) {
    tickAi(dtMs);
    tickEngagements();
    tickRegionClaims(dtMs);
    tickCapture(dtMs);
    tickRecruitment(dtMs);
  }
  renderCaptureProgress();
  tickBattleSystem(dtMs);
  tickRegionZoomSystem(dtMs);

  worldContainer.scale.set(camera.zoom);
  worldContainer.position.set(vw / 2 - camera.panX * camera.zoom, vh / 2 - camera.panY * camera.zoom);

  const cellPixelSize = TILE_SIZE * camera.zoom;
  const view: ViewLabel = cellPixelSize <= TIER_THRESHOLD_PX ? 'STRATEGIC' : 'OPERATIONAL';

  const prev = readoutStore.getState();
  if (prev.view !== view || Math.abs(prev.zoom - camera.zoom) > 0.001) {
    readoutStore.setState({ zoom: camera.zoom, view });
  }

  // Render every frame — recruitment progress (% ticking) and the
  // capture countdowns both need per-frame updates, and the throttle
  // logic added more state-tracking than it saved. textContent
  // updates are cheap.
  renderReadout();
});

// ===== Readout =====

function renderReadout() {
  const { zoom, view } = readoutStore.getState();
  const player = playerNation();
  const playerRegion = world.regions[player.capitalRegionId]!;
  let armyLine: string;
  let armyComp = '';
  if (!player.army || player.army.getRegiments().length === 0) {
    armyLine = 'army destroyed';
  } else {
    const status = player.army.getStatus();
    if (status.marching) {
      const target = status.targetRegionId >= 0 ? `#${status.targetRegionId}` : '?';
      armyLine = `army marching → ${target}`;
    } else {
      const where =
        status.regionId === player.capitalRegionId
          ? 'home'
          : status.regionId >= 0
            ? `#${status.regionId}`
            : '?';
      armyLine = `army @ ${where} · drag to march`;
    }
    armyComp = formatRegiments(player.army.getRegiments());
  }
  let statusLine: string;
  const playerCapture = player.captureProgress;
  const sieger = isSiegedBy(player);
  if (gameOver === 'victory') statusLine = '>>> VICTORY <<<';
  else if (gameOver === 'defeat') statusLine = '>>> DEFEAT <<<';
  else if (combatState === 'engaged' && activeOpponent) statusLine = `>>> BATTLE: vs nation #${activeOpponent.id} <<<`;
  else if (playerCapture) {
    const remaining = Math.max(0, Math.ceil((CAPITAL_HOLD_MS - (performance.now() - playerCapture.startedAtMs)) / 1000));
    statusLine = `CAPTURING capital #${playerCapture.targetNationId} (${remaining}s)`;
  } else if (sieger) {
    const remaining = Math.max(0, Math.ceil((CAPITAL_HOLD_MS - (performance.now() - sieger.captureProgress!.startedAtMs)) / 1000));
    statusLine = `>>> CAPITAL UNDER SIEGE by #${sieger.id} (${remaining}s) <<<`;
  } else {
    const alive = aliveOpponents();
    if (alive.length === 0) statusLine = 'no enemy remaining';
    else statusLine = `enemies: ${alive.map((n) => `#${n.id}`).join(' ')}`;
  }
  // Non-capital region capture status. Player capturing an enemy
  // region, or AI capturing one of the player's regions. Capital
  // siege is handled in statusLine above.
  let regionLine = '';
  if (!gameOver) {
    const lines: string[] = [];
    const myCap = player.regionCaptureProgress;
    if (myCap) {
      const remaining = Math.max(
        0,
        Math.ceil((REGION_HOLD_MS - (performance.now() - myCap.startedAtMs)) / 1000),
      );
      lines.push(`capturing region #${myCap.targetRegionId} (${remaining}s)`);
    }
    for (const n of nations) {
      if (n.isPlayer || n.eliminated) continue;
      const rc = n.regionCaptureProgress;
      if (!rc) continue;
      if (regionOwner[rc.targetRegionId] !== player.id) continue;
      const remaining = Math.max(
        0,
        Math.ceil((REGION_HOLD_MS - (performance.now() - rc.startedAtMs)) / 1000),
      );
      lines.push(`region #${rc.targetRegionId} under siege by #${n.id} (${remaining}s)`);
    }
    if (lines.length > 0) regionLine = lines.join('\n');
  }
  let recruitLine = '';
  if (!gameOver) {
    const rate = getRecruitmentRate(player);
    const cap = getArmyCap(player);
    const total = totalSoldierCount(player);
    const cost = UNIT_DEFS[player.recruitmentPick].recruitCost;
    const pct = cost > 0 ? Math.min(100, Math.floor((player.recruitmentProgress / cost) * 100)) : 0;
    const pickLabel = UNIT_DEFS[player.recruitmentPick].shortLabel;
    if (total >= cap) {
      recruitLine = `  recruit: ${pickLabel} · AT CAP (${total}/${cap})`;
    } else if (rate <= 0) {
      recruitLine = `  recruit: ${pickLabel} · no capital (${total}/${cap})`;
    } else {
      recruitLine = `  recruit: ${pickLabel} ${pct}% · ${total}/${cap} · ${rate.toFixed(1)}/s`;
    }
  }
  readoutEl.textContent =
    `swarm v2 · ${view} · ${zoom.toFixed(2)}x\n` +
    `seed ${currentSeed}\n` +
    `home #${player.capitalRegionId} · ${playerRegion.neighbors.length} borders\n` +
    armyLine + '\n' +
    (armyComp ? `  yours: ${armyComp}\n` : '') +
    (recruitLine ? recruitLine + '\n' : '') +
    statusLine +
    (regionLine ? '\n' + regionLine : '');
}
readoutStore.subscribe(renderReadout);

// ===== New-map button =====

const newMapBtn = document.getElementById('newmap')!;
newMapBtn.addEventListener('click', () => {
  loadMap(Math.floor(Math.random() * 0x7fffffff));
});

// ===== Recruit-type toggle =====

const recruitToggleBtn = document.getElementById('recruit-toggle') as HTMLButtonElement;
function updateRecruitToggleLabel() {
  const pick = playerNation().recruitmentPick;
  const label = UNIT_DEFS[pick].shortLabel.toUpperCase();
  recruitToggleBtn.textContent = `recruit: ${label}`;
}
recruitToggleBtn.addEventListener('click', () => {
  const p = playerNation();
  const idx = UNIT_TYPES.indexOf(p.recruitmentPick);
  const next = UNIT_TYPES[(idx + 1) % UNIT_TYPES.length]!;
  p.recruitmentPick = next;
  // Tossing remaining progress would be punitive; convert it across
  // the new cost denomination so the player isn't penalized for the
  // switch.
  // (Simpler approach: keep progress as-is in unit-time. The next
  // recruit just uses the new cost.)
  updateRecruitToggleLabel();
  renderReadout();
});
updateRecruitToggleLabel();
