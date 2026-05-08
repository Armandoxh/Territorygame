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
  // Sandbox / playtest mode: ?test or ?sandbox in URL. Tiny map + 4
  // nations + huge starting gold + fast generation. Overrides further
  // user query params. Use this to iterate the army loop without
  // waiting 5 minutes for an empire to mature.
  const sandbox = params.has('test') || params.has('sandbox');
  if (sandbox) {
    config.GRID_WIDTH = 128;
    config.GRID_HEIGHT = 128;
    config.AI_PLAYER_COUNT = 3;          // 1 human + 3 AIs = 4 nations
    config.STARTING_GOLD = 999_999;
    config.GOLD_PER_TILE_PER_TICK = 5;   // 50× normal so anything is buildable instantly
    config.TEAM_SIZE = 1;                // FFA
  }
  const ai = parseInt(params.get('ai') ?? '', 10);
  if (!sandbox && Number.isFinite(ai)) {
    config.AI_PLAYER_COUNT = Math.max(0, Math.min(254, ai));
  } else if (!sandbox) {
    const saved = parseInt(localStorage.getItem('territory:ai') ?? '', 10);
    if (Number.isFinite(saved)) config.AI_PLAYER_COUNT = Math.max(0, Math.min(254, saved));
  }
  const seed = parseInt(params.get('seed') ?? '', 10);
  if (Number.isFinite(seed)) config.TERRAIN_SEED = seed;
  const w = parseInt(params.get('w') ?? '', 10);
  const h = parseInt(params.get('h') ?? '', 10);
  if (!sandbox && Number.isFinite(w) && w > 64) config.GRID_WIDTH = w;
  if (!sandbox && Number.isFinite(h) && h > 64) config.GRID_HEIGHT = h;
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

  // Wait for the bundled emoji font (resource map icons) to load
  // before PIXI rasterizes any text — otherwise the first frame
  // bakes the OS fallback emoji and we'd need to recreate every
  // icon on font swap. Don't block forever; race a short timeout
  // so an offline reload still boots.
  if ('fonts' in document) {
    try {
      await Promise.race([
        document.fonts.load('30px "Noto Color Emoji"'),
        new Promise((res) => setTimeout(res, 800)),
      ]);
    } catch { /* offline / blocked — fall back to OS emoji */ }
  }

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

      // Unified unit interaction. Taps near ANY of the player's units
      // (army or ship) take priority over "issue order at this tile" —
      // a tap that lands on a unit always means "select that unit",
      // even if a different unit is currently selected. Without this,
      // tapping a ship while an army was selected got treated as a
      // march order to the ship's tile and the ship was never selected.
      //
      //   tap on your selected army's tile → DESELECT
      //   tap on a different friendly army → switch to that army
      //   tap on a friendly ship          → switch to that ship
      //   tap on empty terrain w/ unit selected → issue order
      //   tap on empty terrain w/ nothing selected → fall through
      const armySel = renderer.armies.selected();
      const shipSel = renderer.ships.selected();
      const tx = Math.floor(wx), ty = Math.floor(wy);
      const armyTol = 4 / Math.max(1, renderer.zoom * 0.4);
      const shipTol = 6 / Math.max(1, renderer.zoom * 0.4);
      const tappedArmy = game.armyNear(wx, wy, 1, armyTol);
      const tappedShip = game.shipNear(wx, wy, 1, shipTol);
      // Pick the closer hit when both armies and ships are nearby —
      // avoids ambiguous picks at coastal tiles.
      let tappedKind: 'army' | 'ship' | 'none' = 'none';
      if (tappedArmy && tappedShip) {
        const dA = Math.hypot(tappedArmy.x + 0.5 - wx, tappedArmy.y + 0.5 - wy);
        const dS = Math.hypot(tappedShip.x + 0.5 - wx, tappedShip.y + 0.5 - wy);
        tappedKind = dA <= dS ? 'army' : 'ship';
      } else if (tappedArmy) tappedKind = 'army';
      else if (tappedShip) tappedKind = 'ship';

      if (tappedKind === 'army') {
        const a = tappedArmy!;
        // Tap on the same army → deselect (the "esc" gesture).
        if (a.id === armySel) {
          renderer.armies.setSelected(0);
          hud.toast('deselected');
          return;
        }
        // Switching from a different unit type or another army.
        if (shipSel > 0) renderer.ships.setSelected(0);
        renderer.armies.setSelected(a.id);
        hud.toast('Army selected · tap army again to deselect');
        return;
      }
      if (tappedKind === 'ship') {
        const s = tappedShip!;
        if (s.id === shipSel) {
          // Same-ship tap → deselect for symmetry with armies.
          renderer.ships.setSelected(0);
          hud.toast('deselected');
          return;
        }
        if (armySel > 0) renderer.armies.setSelected(0);
        renderer.ships.setSelected(s.id);
        hud.toast(`${s.kind} selected · tap destination`);
        return;
      }

      // No unit tapped → if something IS selected, the tap is an order.
      if (armySel > 0) {
        if (game.setArmyTarget(armySel, tx, ty, 1) === null) {
          hud.toast('marching');
          return;
        }
        renderer.armies.setSelected(0);
      }
      if (renderer.ships.selected() > 0) {
        if (game.setShipTarget(renderer.ships.selected(), wx, wy, 1)) {
          hud.toast('ordered');
          return;
        }
        renderer.ships.setSelected(0);
      }

      // Legacy flood mode only: tap sets your manual region target,
      // territory flows that way. In ARMY_MODE there's no flood — tile
      // ownership only changes via army movement, so a stray tap on
      // empty land does nothing (other than possibly hide the hint).
      if (!game.config.ARMY_MODE) {
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
      }
      if (firstTap) { hud.hideHint(); firstTap = false; }
    },
    onLongPress: (wx, wy) => {
      if (game.outcome) return;
      if (!game.territory.inBounds(wx, wy)) return;
      // Long-press on enemy / ally land opens the Nation Profile
      // sheet — at-a-glance intel (tiles, troops, gold, buildings,
      // resources, trade flow) plus diplomacy actions (trade, ally,
      // war, peace). Long-press on own / neutral land still opens
      // the build sheet.
      const tx = Math.floor(wx);
      const ty = Math.floor(wy);
      const owner = game.territory.getOwner(tx, ty);
      if (owner > 0 && owner !== 1) {
        hud.showNationSheet(owner);
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
