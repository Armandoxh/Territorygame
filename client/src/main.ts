import { Application } from 'pixi.js';
import {
  DEFAULT_CONFIG, generatePalette, generateTeamPalette, Game,
  type GameConfig, type BuildingType, type BombType,
} from '@territorygame/shared';
import { Renderer } from './render/Renderer.js';
import { PointerInput } from './input/PointerInput.js';
import { HUD } from './ui/HUD.js';

const BUILD_KEYS: Record<string, BuildingType> = {
  s: 'settlement',
  t: 'turret',
  a: 'airstrip',
  q: 'aa',
  p: 'port',
  g: 'barracks',
};

const BOMB_KEYS: Record<string, BombType> = {
  b: 'small',
  l: 'large',
  c: 'ac130',
  x: 'stealth', // 's' is taken by settlement
};

async function boot(): Promise<void> {
  const host = document.getElementById('app');
  if (!host) throw new Error('#app missing');

  // --- Config from URL + localStorage ---
  const config: GameConfig = { ...DEFAULT_CONFIG };
  const params = new URLSearchParams(location.search);
  const ai = parseInt(params.get('ai') ?? '', 10);
  if (Number.isFinite(ai)) {
    config.AI_PLAYER_COUNT = Math.max(0, Math.min(254, ai));
  } else {
    const saved = parseInt(localStorage.getItem('territory:ai') ?? '', 10);
    if (Number.isFinite(saved)) config.AI_PLAYER_COUNT = Math.max(0, Math.min(254, saved));
  }
  const seed = parseInt(params.get('seed') ?? '', 10);
  if (Number.isFinite(seed)) config.TERRAIN_SEED = seed;
  const w = parseInt(params.get('w') ?? '', 10);
  const h = parseInt(params.get('h') ?? '', 10);
  if (Number.isFinite(w) && w > 64) config.GRID_WIDTH = w;
  if (Number.isFinite(h) && h > 64) config.GRID_HEIGHT = h;
  // Team mode (URL ?team=N or localStorage). N must be 1, 2, 4, 8, or 16.
  const teamRaw = parseInt(params.get('team') ?? '', 10);
  if (Number.isFinite(teamRaw)) {
    config.TEAM_SIZE = Math.max(1, Math.min(16, teamRaw));
  } else {
    const savedTeam = parseInt(localStorage.getItem('territory:team') ?? '', 10);
    if (Number.isFinite(savedTeam)) config.TEAM_SIZE = Math.max(1, Math.min(16, savedTeam));
  }
  // Total players (human + AIs) must be divisible by team size.
  // Bump the AI count up to the nearest multiple if needed.
  if (config.TEAM_SIZE > 1) {
    const total = config.AI_PLAYER_COUNT + 1;
    const remainder = total % config.TEAM_SIZE;
    if (remainder !== 0) {
      config.AI_PLAYER_COUNT += (config.TEAM_SIZE - remainder);
    }
  }
  config.PLAYER_COLORS = config.TEAM_SIZE > 1
    ? generateTeamPalette(config.AI_PLAYER_COUNT + 1, config.TEAM_SIZE)
    : generatePalette(config.AI_PLAYER_COUNT + 1);

  // --- Game ---
  const game = new Game(config);
  game.generateTerrain();
  game.spawnAll();

  // --- Pixi ---
  const app = new Application();
  await app.init({
    background: '#0c0f12',
    resizeTo: window,
    // antialias: true smooths the vector overlay graphics (region borders,
    // capital outlines). The territory sprite stays crisp because its texture
    // uses nearest-neighbour sampling.
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    // Snap renderable positions to integer pixels so adjacent tiles never
    // smear into each other from sub-pixel offsets while panning.
    roundPixels: true,
  });
  host.appendChild(app.canvas);

  const renderer = new Renderer(app, game);

  // Center on the human spawn for the initial view.
  const human = game.spawnSpots()[0];
  if (human) renderer.centerOn(human.x, human.y);

  const hud = new HUD(game);
  hud.onHaltRequested = () => game.haltHuman();
  hud.onBombEvent = (x, y, radius) => renderer.overlay.pushExplosion(x, y, radius);

  let firstTap = true;
  const input = new PointerInput(app.canvas as HTMLCanvasElement, renderer, {
    onTap: (wx, wy, sx, sy) => {
      renderer.overlay.flashTap(sx, sy);
      if (game.outcome) return;
      if (!game.territory.inBounds(wx, wy)) { hud.toast('off-map'); return; }
      if (hud.tryBombAt(wx, wy)) return;
      if (hud.tryGroundOpAt(wx, wy)) return;
      if (hud.tryBuildShipAt(wx, wy)) return;
      if (hud.tryPlaceAt(wx, wy)) return;

      // Ship interaction: if a ship is already selected, ANY tap retargets
      // it. Otherwise, a tap close to one of our ships selects it (and is
      // consumed — does not also retarget territory).
      const sel = renderer.ships.selected();
      if (sel > 0) {
        if (game.setShipTarget(sel, wx, wy, 1)) {
          hud.toast('ordered');
          return;
        }
        // Tap landed somewhere unreachable — drop the selection so the
        // next tap can do something else (like target a region).
        renderer.ships.setSelected(0);
      } else {
        const ship = game.shipNear(wx, wy, 1, 6 / Math.max(1, renderer.zoom * 0.4));
        if (ship) {
          renderer.ships.setSelected(ship.id);
          hud.toast(`${ship.kind} selected · tap destination`);
          return;
        }
      }

      // If the tapped region is enemy-dominated and we're at peace,
      // setHumanTargetRegion will auto-declare war. Toast the player
      // before the engine call so the message reads as cause→effect.
      const tappedRegion = game.regionAt(Math.floor(wx), Math.floor(wy));
      const dom = tappedRegion > 0 ? game.regionDominantOwnerOf(tappedRegion) : 0;
      const willDeclareWar = dom > 0 && dom !== 1
        && !game.areAllied(1, dom)
        && !game.areAtWar(1, dom);
      const region = game.setHumanTargetRegion(wx, wy);
      if (region <= 0) { hud.toast('No region here'); return; }
      if (willDeclareWar) {
        const target = game.players[dom];
        const allies = game.alliesOf(dom);
        if (target) {
          if (allies.length > 0) {
            hud.toast(`War on ${target.name} — ${allies.length} of their allies joined`);
          } else {
            hud.toast(`War declared on ${target.name}`);
          }
          if (navigator.vibrate) try { navigator.vibrate(40); } catch { /* ignore */ }
        }
      }
      if (firstTap) { hud.hideHint(); firstTap = false; }
    },
    onLongPress: (wx, wy) => {
      if (game.outcome) return;
      if (!game.territory.inBounds(wx, wy)) return;
      // If the long-press lands on enemy territory, treat it as a quick
      // trade-alliance gesture: propose alliance + open trade route in
      // one action. Long-press on your own / neutral land still opens
      // the build sheet.
      const tx = Math.floor(wx);
      const ty = Math.floor(wy);
      const owner = game.territory.getOwner(tx, ty);
      if (owner > 0 && owner !== 1) {
        // Long-press enemy land opens the resource-trade prompt
        // (pauses the game). Allies get redirected to the alliance
        // shortcut by showTradePrompt.
        if (game.areAllied(1, owner)) {
          hud.quickProposeTradeAlliance(owner);
        } else {
          hud.showTradePrompt(owner);
        }
        return;
      }
      hud.showBuildSheet(wx, wy);
    },
    onTripleTapCorner: () => hud.toggleDebug(),
  });
  void input;

  // Keyboard shortcuts: S/T/A/W = build, B = small bomb, L = large bomb, Esc = cancel.
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const buildType = BUILD_KEYS[k];
    const bombType  = BOMB_KEYS[k];
    if (buildType) {
      hud.togglePlaceMode(buildType);
      e.preventDefault();
    } else if (bombType) {
      hud.toggleBombMode(bombType);
      e.preventDefault();
    } else if (k === 'escape') {
      hud.clearPlaceMode();
      hud.clearBombMode();
      hud.clearGroundOpMode();
      e.preventDefault();
    } else if (k === 'm') {
      // Toggle between crisp tile fill and bilinear smooth (prototype
      // de-pixelation). Press M to A/B the look.
      const layer = renderer.territoryLayer;
      const next = !layer.isSmoothMode();
      layer.setSmoothMode(next);
      hud.toast(next ? 'Smooth fill ON' : 'Smooth fill OFF');
      e.preventDefault();
    }
  });

  // --- Sim tick (10 Hz) ---
  // Pause sim when the page is hidden — phone tabs in the background
  // shouldn't burn battery on simulation; resumes on visibility change.
  let tickCount = 0;
  let lastTickStamp = performance.now();
  const tickIntervalMs = 1000 / config.SIM_HZ;
  setInterval(() => {
    if (document.hidden) return;
    game.tick();
    tickCount++;
    const now = performance.now();
    const dt = now - lastTickStamp;
    if (dt >= 1000) {
      hud.tickRate = (tickCount * 1000) / dt;
      tickCount = 0;
      lastTickStamp = now;
    }
  }, tickIntervalMs);

  // --- Render loop ---
  // Capped to ~30 fps. The simulation runs at 10 Hz so anything above 30
  // is wasted GPU work — and on phones the territory + grade fragment
  // shaders are the dominant cost. Halving frames roughly halves shader
  // load and visibly stabilises framerate on lower-end mobiles.
  const RENDER_INTERVAL_MS = 1000 / 30;
  let frameCount = 0;
  let lastFpsStamp = performance.now();
  let lastDrawStamp = 0;
  app.ticker.add(() => {
    const now = performance.now();
    if (now - lastDrawStamp < RENDER_INTERVAL_MS) return;
    lastDrawStamp = now;
    if (document.hidden) return;
    renderer.draw(now);
    hud.update();
    frameCount++;
    const dt = now - lastFpsStamp;
    if (dt >= 500) {
      hud.fps = Math.round((frameCount * 1000) / dt);
      frameCount = 0;
      lastFpsStamp = now;
    }
  });
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#e84a4a;padding:20px;font:13px monospace">boot failed: ${(err as Error).message}\n${(err as Error).stack ?? ''}</pre>`;
});
