/** Metro Magnate v2 — milestone 2: the game, wired onto the 3D city.
 *
 * Default mode is the real loop: start with line 1, earn fares, buy
 * trains, open lines from the LINE DESK, tap stations to inspect.
 * Saves to localStorage with v1's offline-earnings law (50% rate, 8h
 * cap). `?showcase` restores the b38 demo world (all lines, camera
 * orbit). Other knobs: ?t=<sec>, ?speed=<mult>, ?nobloom, ?fixed,
 * ?reset wipes the save.
 */
import { CityDef } from './engine/city';
import { Game } from './engine/game';
import { CityScene } from './render/scene';
import { Console } from './ui/console';
import cityJson from './data/new_meridian.json';
import { BUILD } from './version';

const params = new URLSearchParams(location.search);
const city = cityJson as CityDef;
const showcase = params.has('showcase');
const SAVE_KEY = 'metro2_save';

let game: Game;
let offlineEarned = 0;
if (showcase) {
  game = Game.showcase(city, 2);
  game.rushClock = Number(params.get('t') ?? '40');
} else {
  if (params.has('reset')) localStorage.removeItem(SAVE_KEY);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    raw = null;
  }
  if (raw) {
    try {
      const r = Game.fromJson(city, JSON.parse(raw), Date.now());
      game = r.game;
      offlineEarned = r.offlineEarned;
    } catch {
      game = new Game(city);
    }
  } else {
    game = new Game(city);
  }
  if (params.has('t')) game.rushClock = Number(params.get('t'));
}
const simSpeed = Number(params.get('speed') ?? (showcase ? '3' : '1'));

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = new CityScene(canvas, game, { bloom: !params.has('nobloom') });
scene.controls.autoRotate = showcase && !params.has('fixed');

const ui = new Console(game);
ui.onUnlock = (lineId) => {
  scene.focusLine(lineId);
  const line = city.lines.find((l) => l.id === lineId)!;
  ui.toast(`${line.name} is OPEN — first train entering service`);
};
if (offlineEarned >= 1) {
  ui.toast(
    `While you were away: +$${Math.floor(offlineEarned).toLocaleString('en-US')}`,
  );
}
document.getElementById('build')!.textContent = BUILD;

// Tap (not drag) picks a station.
let downX = 0;
let downY = 0;
let downT = 0;
canvas.addEventListener('pointerdown', (e) => {
  downX = e.clientX;
  downY = e.clientY;
  downT = performance.now();
});
canvas.addEventListener('pointerup', (e) => {
  if (showcase) return;
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (moved > 7 || performance.now() - downT > 600) return;
  const id = scene.pickStation(e.clientX, e.clientY);
  if (id) ui.showStation(id);
  else ui.hideStation();
});

function save(): void {
  if (showcase) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.toJson(Date.now())));
  } catch {
    /* storage unavailable — play on without persistence */
  }
}
setInterval(save, 5000);
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

window.addEventListener('resize', () => scene.resize());

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  acc += dt * simSpeed;
  while (acc > 0.05) {
    game.tick(0.05);
    acc -= 0.05;
  }
  scene.render();
  ui.update(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
