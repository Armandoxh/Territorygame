/** Metro Magnate v2 — milestone 1, the render proof.
 *
 * A showcase world (whole approved network, two trains a line) running on
 * the ported deterministic sim, rendered as a 3D city with the v1 light
 * cycle. URL knobs for testing: ?t=140 starts at night, ?speed=1 runs the
 * clock in real time (default 3× so a full day passes in a minute),
 * ?nobloom disables post-processing, ?fixed parks the camera.
 */
import { CityDef } from './engine/city';
import { Game } from './engine/game';
import { CityScene } from './render/scene';
import cityJson from './data/new_meridian.json';
import { BUILD } from './version';

const params = new URLSearchParams(location.search);
const city = cityJson as CityDef;

const game = Game.showcase(city, 2);
const t0 = Number(params.get('t') ?? '40');
if (t0 > 0) game.rushClock = t0;
const simSpeed = Number(params.get('speed') ?? '3');

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = new CityScene(canvas, game, { bloom: !params.has('nobloom') });
if (params.has('fixed')) scene.controls.autoRotate = false;

window.addEventListener('resize', () => scene.resize());

const cashEl = document.getElementById('cash')!;
const phaseEl = document.getElementById('phase')!;
document.getElementById('build')!.textContent = BUILD;

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
  cashEl.textContent = `$${Math.floor(game.totalEarned).toLocaleString('en-US')} · ${Math.floor(game.totalRiders).toLocaleString('en-US')} riders`;
  const n = game.nightFactor;
  phaseEl.textContent = game.rushActive
    ? 'NIGHT RUSH'
    : n === 0
      ? 'DAY'
      : n === 1
        ? 'NIGHT'
        : game.rushClock % 180 < 110
          ? 'DAWN'
          : 'DUSK';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
