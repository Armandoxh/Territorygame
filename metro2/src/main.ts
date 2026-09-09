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
let simSpeed = Number(params.get('speed') ?? (showcase ? '3' : '1'));
// v1's ⏩ fast-forward: exact physics, compressed time.
const speedBtn = document.getElementById('btn-speed') as HTMLButtonElement;
speedBtn.addEventListener('click', () => {
  simSpeed = simSpeed >= 10 ? 1 : 10;
  speedBtn.textContent = simSpeed >= 10 ? '⏩ 10×' : '⏩ 1×';
});


// iOS Safari zooms the PAGE on double-tap and pinch even with
// user-scalable=no — and then refuses to zoom back out. Block the
// browser-level gestures entirely; the game camera owns pinch.
for (const evt of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
const canvas = document.getElementById('scene') as HTMLCanvasElement;
// Double-tap suppression on the MAP only — buttons keep fast taps
// (canvas input runs on pointer events, so no click is lost here).
let lastTouchEnd = 0;
canvas.addEventListener(
  'touchend',
  (e) => {
    const now = performance.now();
    if (now - lastTouchEnd < 320) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);
const scene = new CityScene(canvas, game, { bloom: !params.has('nobloom') });

const ui = new Console(game);
ui.onUnlock = (lineId) => {
  scene.refreshService();
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

// Celebrate goal + commission resolutions exactly once each.
let seenGoalSeq = game.goalSeq;
let seenCommSeq = game.commissionSeq;
function watchSeqs(): void {
  if (game.goalSeq !== seenGoalSeq) {
    seenGoalSeq = game.goalSeq;
    const what =
      game.lastGoalBenefit === 'income'
        ? `income ×${game.lastGoalReward}`
        : game.lastGoalBenefit === 'riders'
          ? `ridership ×${game.lastGoalReward}`
          : `build costs ×${game.lastGoalReward}`;
    ui.toast(`COMMENDATION · ${game.lastGoalName} — ${what} forever`);
  }
  if (game.commissionSeq !== seenCommSeq) {
    seenCommSeq = game.commissionSeq;
    ui.toast(
      game.lastCommissionWon
        ? 'COMMISSION DELIVERED — city hall pays out'
        : 'Commission expired — the desk moves on',
    );
  }
}

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
  // A map tap first CLOSES whatever is open — one tap out of any desk.
  if (ui.isOpen) {
    ui.closeAll();
    return;
  }
  const id = scene.pickStation(e.clientX, e.clientY);
  if (id) ui.showStation(id);
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
// Debug handle for headless play tests.
(window as unknown as { __scene: CityScene }).__scene = scene;

let last = performance.now();
let acc = 0;
// The sim ticks at a fixed 20 Hz for determinism; frames INTERPOLATE
// between the last two sim states so trains glide at any refresh rate
// instead of stepping (the "pixelated" motion of b54 and earlier).
let prevDistances: number[] = [];
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  acc += dt * simSpeed;
  while (acc > 0.05) {
    prevDistances = game.trains.map((t) => t.distance);
    game.tick(0.05);
    acc -= 0.05;
  }
  scene.render(acc / 0.05, prevDistances);
  watchSeqs();
  ui.update(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
