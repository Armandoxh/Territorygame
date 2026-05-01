import { Application } from 'pixi.js';
import {
  DEFAULT_CONFIG, generatePalette, Game,
  type GameConfig, type BuildingType, type BombType,
} from '@territorygame/shared';
import { Renderer } from './render/Renderer.js';
import { PointerInput } from './input/PointerInput.js';
import { HUD } from './ui/HUD.js';

const BUILD_KEYS: Record<string, BuildingType> = {
  s: 'settlement',
  t: 'turret',
  a: 'airstrip',
  w: 'wonder',
};

const BOMB_KEYS: Record<string, BombType> = {
  b: 'small',
  l: 'large',
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
  config.PLAYER_COLORS = generatePalette(config.AI_PLAYER_COUNT + 1);

  // --- Game ---
  const game = new Game(config);
  game.generateTerrain();
  game.spawnAll();

  // --- Pixi ---
  const app = new Application();
  await app.init({
    background: '#0c0f12',
    resizeTo: window,
    antialias: false,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
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
      if (hud.tryPlaceAt(wx, wy)) return;
      game.setHumanTarget(wx, wy);
      if (firstTap) { hud.hideHint(); firstTap = false; }
    },
    onLongPress: (wx, wy) => {
      if (game.outcome) return;
      if (!game.territory.inBounds(wx, wy)) return;
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
      e.preventDefault();
    }
  });

  // --- Sim tick (10 Hz) ---
  let tickCount = 0;
  let lastTickStamp = performance.now();
  const tickIntervalMs = 1000 / config.SIM_HZ;
  setInterval(() => {
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
  let frameCount = 0;
  let lastFpsStamp = performance.now();
  app.ticker.add(() => {
    const now = performance.now();
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
