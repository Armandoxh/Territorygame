import { Application, Container, Graphics } from 'pixi.js';
import { createCamera } from './camera';
import { generateWorld, makeRng, type World } from './world';
import { buildMapLayers, rebuildOwnerLayers, type MapLayers } from './mapRender';
import { attachInput, type DragHandler } from './input';
import { createArmy, type Army, type Regiment } from './army';
import { UNIT_DEFS } from './units';
import { createBattleScene } from './battleScene';
import { createBattleMenu } from './battleMenu';
import { simulateBattle } from './battleSim';
import type { Nation } from './nation';
import { createGameModal, type GameModal } from './gameModal';
import { readoutStore, type ViewLabel } from './store';

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
const CAPITAL_HOLD_MS = 15_000;
const CAPITAL_HOLD_RADIUS = 24;
// How often an AI under siege checks if they have an army to recall.
const SIEGE_RESPONSE_INTERVAL_MS = 2_000;
// Brief visual indicator for silent AI vs AI battles.
const AI_BATTLE_ICON_MS = 1200;

// Curated AI palette — high-contrast, distinct from any plausible player
// region color and from each other. Player nation uses its own region's
// generated color.
const AI_COLORS = [0xd54e3a, 0x6a5acd, 0xe6a800, 0x29a36a];

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
//     └─ battleSceneLayer (dirt + future tactical sprites)
const worldContainer = new Container();
const strategicLayer = new Container();
const battleSceneLayer = new Container();
battleSceneLayer.alpha = 0;
worldContainer.addChild(strategicLayer);
worldContainer.addChild(battleSceneLayer);
app.stage.addChild(worldContainer);

const battleScene = createBattleScene();
battleSceneLayer.addChild(battleScene.container);

// Dedicated layer for transient AI-battle-here icons (small flashing
// crossed-swords-style marker). Kept on top of strategic content so it
// reads at any zoom.
const aiBattleIconLayer = new Container();
strategicLayer.addChild(aiBattleIconLayer);

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
    const color = isPlayer ? region.color : AI_COLORS[(i - 1) % AI_COLORS.length]!;
    const army = createArmy({
      world: w,
      tileSize: TILE_SIZE,
      homeRegionId: regionId,
      color,
      screenToWorld,
      worldToScreen,
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
      nextDecideAtMs: performance.now() + AI_DECIDE_INTERVAL_MS + (Math.random() - 0.5) * 2 * AI_DECIDE_JITTER_MS,
      lastSiegeResponseAtMs: 0,
      captureProgress: null,
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
  return nations.filter((n) => !n.isPlayer && !n.eliminated && n.army !== null);
}

// Repaint ownership-dependent layers. Cheap-ish (one Graphics.clear +
// re-draw); called only on region capture events, not per frame.
function rebuildLayers() {
  rebuildOwnerLayers(layers, world, TILE_SIZE, regionOwner, nations);
}

// ===== Load map =====

function loadMap(seed: number) {
  currentSeed = seed;

  // Force-exit any in-flight battle / capture / game-over state so the
  // new world starts clean.
  forceExitBattle();
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
  // Destroy any in-flight transient AI-battle icons before clearing
  // the strategic layer (otherwise their alpha-fade rAFs leak GPU
  // resources, though they self-bail via the .destroyed guard).
  for (const c of [...aiBattleIconLayer.children]) c.destroy();
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
  // aiBattleIconLayer is shared across map loads — re-add on top.
  strategicLayer.addChild(aiBattleIconLayer);
  for (const n of nations) {
    if (n.army) strategicLayer.addChild(n.army.container);
  }

  combatState = 'idle';
  activeOpponent = null;

  // Recenter camera.
  camera.panX = WORLD_W / 2;
  camera.panY = WORLD_H / 2;
  camera.zoom = initialZoom;

  const player = playerNation();
  if (player.army) {
    const s = player.army.getStatus();
    lastArmyMarching = s.marching;
    lastArmyRegionId = s.regionId;
    lastArmyTarget = s.targetRegionId;
  }
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
        // Strategic layer is visible again — apply post-battle teardown.
        // If opponent army is gone, null out the army reference and
        // hide the visual.
        if (activeOpponent && activeOpponent.army && activeOpponent.army.getRegiments().length === 0) {
          activeOpponent.army.destroy();
          activeOpponent.army = null;
        }
        activeOpponent = null;
        // Player army auto-hidden by setRegiments side effect.
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
  // First: check player vs each AI. Player gets the menu UI.
  const player = playerNation();
  if (player.army && player.army.getRegiments().length > 0) {
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
  // Destroy armies that hit zero.
  if (a.army.getRegiments().length === 0) {
    a.army.destroy();
    a.army = null;
  }
  if (b.army.getRegiments().length === 0) {
    b.army.destroy();
    b.army = null;
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

function tickRegionClaims(_dtMs: number) {
  // Whenever a nation's army is in a region owned by another nation or
  // by no one, and is not engaged in combat, the army gradually claims
  // the region. For #6.3 we apply a simpler rule than port.md's 30-tick
  // tile claim: on the AI's march completing (no longer marching) the
  // region the AI is standing in flips IF that region is neutral OR
  // already owned by the eliminated nation. Enemy-owned regions don't
  // flip from mere presence — they require combat first (which
  // resolveAiVsAiBattle handles) or capital capture.
  if (gameOver) return;
  for (const n of nations) {
    if (n.eliminated || !n.army) continue;
    if (n.army.isMarching()) continue;
    const pos = n.army.getPos();
    const regionId = regionAtPos(pos.x, pos.y);
    if (regionId < 0) continue;
    const owner = regionOwner[regionId]!;
    if (owner === n.id) continue;
    if (owner < 0) {
      // Neutral → instant claim on standing.
      regionOwner[regionId] = n.id;
      rebuildLayers();
    }
    // Enemy-owned non-capital regions don't auto-flip; they stay enemy
    // until that nation is eliminated or the player explicitly takes
    // them later (future nail). Keeps territory contested instead of
    // ping-ponging.
  }
}

function regionAtPos(wx: number, wy: number): number {
  const tx = Math.floor(wx / TILE_SIZE);
  const ty = Math.floor(wy / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return -1;
  return world.regionOf[ty * world.width + tx]!;
}

// ===== Win / defeat =====

function checkGameOver() {
  if (gameOver) return;
  const player = playerNation();
  const playerDestroyed = !player.army || player.army.getRegiments().length === 0;
  if (playerDestroyed) {
    gameOver = 'defeat';
    gameModal.show('defeat', 'Your army was destroyed.');
    return;
  }
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
  getZoomLocked: () => combatState === 'engaged',
});

window.addEventListener('keydown', (e) => {
  if ((e.key === 'b' || e.key === 'B') && inBattle) {
    startExitBattle();
  }
});

// ===== Initial bootstrap =====

let lastArmyMarching = false;
let lastArmyRegionId = -1;
let lastArmyTarget = -1;
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

  // Throttle readout rebuilds to march/region transitions; capture
  // progress already calls renderReadout explicitly each frame it
  // updates the timer.
  const player = playerNation();
  if (player.army) {
    const status = player.army.getStatus();
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
  }
});

// ===== Readout =====

const readoutEl = document.getElementById('readout')!;
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
  readoutEl.textContent =
    `swarm v2 · ${view} · ${zoom.toFixed(2)}x\n` +
    `seed ${currentSeed}\n` +
    `home #${player.capitalRegionId} · ${playerRegion.neighbors.length} borders\n` +
    armyLine + '\n' +
    (armyComp ? `  yours: ${armyComp}\n` : '') +
    statusLine;
}
readoutStore.subscribe(renderReadout);

// ===== New-map button =====

const newMapBtn = document.getElementById('newmap')!;
newMapBtn.addEventListener('click', () => {
  loadMap(Math.floor(Math.random() * 0x7fffffff));
});
