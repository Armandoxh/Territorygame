import { Application } from 'pixi.js';
import { Camera } from './camera';
import { BUILDINGS, TILE } from './config';
import { Game, tileCenter, tileOf, type Unit } from './game';
import { Hud, type HudAction, type Mode } from './hud';
import { attachInput } from './input';
import { Renderer } from './render';

const seed = Number(new URLSearchParams(location.search).get('seed')) || Math.floor(Math.random() * 1e9);
const game = new Game(seed);

// Wrapped in a function: top-level await in the entry chunk deadlocks
// against Pixi's lazily-loaded renderer chunks in the production build.
async function boot(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    preference: 'webgl',
    background: 0x1b2a14,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);

  const renderer = new Renderer(game);
  app.stage.addChild(renderer.world);

  const cam = new Camera(game.map.w * TILE, game.map.h * TILE);
  // ~11 tiles across on a 360px phone; more on wider screens.
  cam.zoom = Math.max(0.8, Math.min(1.4, window.innerWidth / (11 * TILE)));
  const hall = game.buildings.get(game.hallId)!;
  cam.centerOn(tileCenter(hall.tx + 1), tileCenter(hall.ty + 1), window.innerWidth, window.innerHeight);

  let mode: Mode = { type: 'none' };
  let marker: { x: number; y: number; t: number } | null = null;

  const selectedUnits = (): Unit[] =>
    mode.type === 'units' ? game.units.filter((u) => (mode as { ids: Set<number> }).ids.has(u.id)) : [];

  function onTap(sx: number, sy: number): void {
    const w = cam.toWorld(sx, sy);
    const tx = tileOf(w.x);
    const ty = tileOf(w.y);
    if (!game.map.inBounds(tx, ty)) return;

    if (mode.type === 'place') {
      const half = Math.floor(BUILDINGS[mode.kind].size / 2);
      mode = { ...mode, tx: tx - half, ty: ty - half };
      return;
    }

    const unit = game.unitAt(w.x, w.y, Math.max(14, 20 / cam.zoom));
    if (unit) {
      mode = { type: 'units', ids: new Set([unit.id]) };
      return;
    }

    if (mode.type === 'units') {
      const units = selectedUnits();
      if (units.length > 0) {
        game.orderAt(units, tx, ty);
        marker = { x: w.x, y: w.y, t: game.time };
        return;
      }
    }

    const b = game.buildings.get(game.map.occupantAt(tx, ty));
    mode = b ? { type: 'building', id: b.id } : { type: 'none' };
  }

  function onAction(a: HudAction): void {
    if (a === 'clear') {
      mode = mode.type === 'place' ? { type: 'units', ids: mode.builders } : { type: 'none' };
    } else if (a === 'idle' || a === 'all') {
      const list = a === 'idle' ? game.idleUnits() : game.units;
      if (list.length) mode = { type: 'units', ids: new Set(list.map((u) => u.id)) };
    } else if (a === 'train' && mode.type === 'building') {
      const b = game.buildings.get(mode.id);
      if (b) game.train(b);
    } else if (a === 'confirm' && mode.type === 'place') {
      const builders = game.units.filter((u) => (mode as { builders: Set<number> }).builders.has(u.id));
      if (game.placeBuilding(mode.kind, mode.tx, mode.ty, builders)) mode = { type: 'units', ids: mode.builders };
    } else if (a.startsWith('build:') && mode.type === 'units') {
      const kind = a.slice(6) as keyof typeof BUILDINGS;
      const short = game.shortfall(BUILDINGS[kind].cost);
      if (short) {
        game.notice = { text: short, at: game.time };
        return;
      }
      // Ghost starts at screen centre; user taps to move it.
      const c = cam.toWorld(window.innerWidth / 2, window.innerHeight / 2);
      const half = Math.floor(BUILDINGS[kind].size / 2);
      mode = { type: 'place', kind, tx: tileOf(c.x) - half, ty: tileOf(c.y) - half, builders: mode.ids };
    }
  }

  attachInput(app.canvas, cam, onTap);
  const hud = new Hud(onAction);

  app.ticker.add((t) => {
    game.tick(Math.min(t.deltaMS / 1000, 0.1));

    // Drop selections that no longer exist.
    if (mode.type === 'building' && !game.buildings.has(mode.id)) mode = { type: 'none' };

    cam.clamp(window.innerWidth, window.innerHeight);
    renderer.world.scale.set(cam.zoom);
    renderer.world.position.set(cam.x, cam.y);
    renderer.draw({
      selectedUnits: mode.type === 'units' ? mode.ids : new Set(),
      selectedBuilding: mode.type === 'building' ? mode.id : null,
      ghost: mode.type === 'place'
        ? { kind: mode.kind, tx: mode.tx, ty: mode.ty, ok: game.canPlace(mode.kind, mode.tx, mode.ty) }
        : null,
      marker,
    });
    hud.update(game, mode);
  });

  // Debug handle for poking at state from the console.
  Object.assign(window, { game, cam });
}

void boot();
