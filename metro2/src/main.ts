/** Metro Magnate v2 — milestone 2: the game, wired onto the 3D city.
 *
 * Default mode is the real loop: start with line 1, earn fares, buy
 * trains, open lines from the LINE DESK, tap stations to inspect.
 * Saves to localStorage with v1's offline-earnings law (50% rate, 8h
 * cap). `?showcase` restores the b38 demo world (all lines, camera
 * orbit). Other knobs: ?t=<sec>, ?speed=<mult>, ?nobloom, ?fixed,
 * ?reset wipes the save.
 */
import { Game } from './engine/game';
import { CityScene } from './render/scene';
import { Console } from './ui/console';
import { CITIES, cityById } from './data/cities';
import { sound } from './ui/sound';
import { Ticker } from './ui/ticker';

const params = new URLSearchParams(location.search);
const showcase = params.has('showcase');
const SAVE_KEY = 'metro2_save';

let game: Game;
let offlineEarned = 0;
let offlineSeconds = 0;
let offlineRiders = 0;
if (showcase) {
  // ?showcase=angel_bay demos any city on the ladder.
  game = Game.showcase(cityById(params.get('showcase') ?? undefined), 2);
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
      const j = JSON.parse(raw) as Record<string, unknown>;
      const r = Game.fromJson(cityById(j.cityId as string | undefined), j, Date.now());
      game = r.game;
      offlineEarned = r.offlineEarned;
      offlineSeconds = r.offlineSeconds;
      offlineRiders = r.offlineRiders;
    } catch {
      game = new Game(CITIES[0]);
    }
  } else {
    game = new Game(CITIES[0]);
  }
  if (params.has('t')) game.rushClock = Number(params.get('t'));
}
let simSpeed = Number(params.get('speed') ?? (showcase ? '3' : '1'));
// The ⏩ is a DEBUG tool (player's call, b64): visible only with ?dev.
// The game is balanced for honest 1× + offline earnings.
const speedBtn = document.getElementById('btn-speed') as HTMLButtonElement;
if (params.has('dev')) {
  speedBtn.addEventListener('click', () => {
    simSpeed = simSpeed >= 10 ? 1 : 10;
    speedBtn.textContent = simSpeed >= 10 ? '⏩ 10×' : '⏩ 1×';
  });
} else {
  speedBtn.hidden = true;
}


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
const city = game.city;
document.getElementById('hud-city')!.textContent = city.name.toUpperCase();
const scene = new CityScene(canvas, game, { bloom: !params.has('nobloom') });

const muteBtn = document.getElementById('btn-mute') as HTMLButtonElement;
muteBtn.textContent = sound.muted ? '🔇' : '🔊';
muteBtn.addEventListener('click', () => {
  muteBtn.textContent = sound.toggleMute() ? '🔇' : '🔊';
});

const ui = new Console(game);
ui.onMoveOn = () => {
  const next = cityById(game.nextCityId ?? undefined);
  // Swap the world FIRST: the unload path (visibilitychange + the 5s
  // autosave) saves `game`, and a reload fires it — if the old world
  // were still bound it would overwrite the handoff we just wrote.
  game = game.moveOn(next);
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.toJson(Date.now())));
  } catch {
    /* storage unavailable — the move still happens this session */
  }
  location.reload();
};
ui.onUnlock = (lineId) => {
  scene.refreshService();
  scene.focusLine(lineId);
  const line = city.lines.find((l) => l.id === lineId)!;
  ui.toast(`${line.name} is OPEN — first train entering service`);
};
if (offlineEarned >= 1) {
  // THE RETURN: the single most load-bearing moment in the genre.
  // Cash is already credited (v1 law); the header holds the
  // pre-collect figure and rolls up when the player collects.
  const fmtDur = (sec: number): string => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${Math.max(m, 1)}m`;
  };
  const cfmtBig = (v: number): string =>
    v >= 1e9 ? (v / 1e9).toFixed(1) + 'B'
    : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M'
    : v >= 1000 ? (v / 1000).toFixed(1) + 'K'
    : String(Math.floor(v));
  document.getElementById('rc-time')!.textContent =
    `your network ran for ${fmtDur(offlineSeconds)}`;
  document.getElementById('rc-cash')!.textContent = `+$${cfmtBig(offlineEarned)}`;
  document.getElementById('rc-riders')!.textContent =
    `${cfmtBig(offlineRiders)} riders carried`;
  const rc = document.getElementById('return-card')!;
  ui.holdCashAt(game.cash - offlineEarned);
  rc.hidden = false;
  document.getElementById('rc-collect')!.addEventListener(
    'click',
    () => {
      sound.collect();
      rc.hidden = true;
      ui.releaseCash();
    },
    { once: true },
  );
}

// THE WIRE — the city talks back.
const ticker = new Ticker(game, document.getElementById('ticker')!);

// Celebrate goal + commission resolutions exactly once each.
let seenGoalSeq = game.goalSeq;
let seenCommSeq = game.commissionSeq;
let rushWas = false;
function watchRush(): void {
  if (game.rushActive !== rushWas) {
    rushWas = game.rushActive;
    if (rushWas) sound.bell();
  }
}

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
    sound.chime();
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
// One-time coach: what the station fractions mean.
try {
  if (!showcase && !localStorage.getItem('metro2_coach_counts')) {
    localStorage.setItem('metro2_coach_counts', '1');
    setTimeout(
      () => ui.toast('STATION NUMBERS · riders waiting — top-left ↑ uptown ⁄ bottom-right ↓ downtown'),
      4000,
    );
  }
} catch {
  /* storage unavailable */
}

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
  watchRush();
  ticker.update(now);
  ui.update(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
