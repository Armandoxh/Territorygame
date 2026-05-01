import { Application, Graphics, Text, Container } from 'pixi.js';
import { VERSION } from '@territorygame/shared';

// Skeleton commit: prove that PixiJS is wired up end-to-end.
// We mount a single full-viewport canvas, draw a placeholder pulsing dot
// + the shared package version, and listen for resize.
//
// Next session ports the actual game (Territory grid, Terrain, Game.tick,
// expansion, combat, capitals, buildings) into shared/ and renders via
// Pixi sprites + a tile mesh.
async function boot() {
  const host = document.getElementById('app');
  if (!host) throw new Error('#app missing');

  const app = new Application();
  await app.init({
    background: '#0c0f12',
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  host.appendChild(app.canvas);

  const stage = new Container();
  app.stage.addChild(stage);

  const dot = new Graphics();
  stage.addChild(dot);

  const label = new Text({
    text: `Territory · pixi v8 · shared v${VERSION}`,
    style: {
      fill: 0x9aa3ad,
      fontSize: 14,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      letterSpacing: 1.5,
    },
  });
  label.anchor.set(0.5);
  stage.addChild(label);

  const sublabel = new Text({
    text: 'singleplayer port in progress',
    style: {
      fill: 0x4a5563,
      fontSize: 11,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      letterSpacing: 1,
    },
  });
  sublabel.anchor.set(0.5);
  stage.addChild(sublabel);

  const layout = () => {
    const cx = app.screen.width / 2;
    const cy = app.screen.height / 2;
    label.position.set(cx, cy);
    sublabel.position.set(cx, cy + 22);
    dot.position.set(cx, cy - 60);
  };
  layout();
  window.addEventListener('resize', layout);

  app.ticker.add((ticker) => {
    const t = (performance.now() / 700) % 1;
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    const r = 8 + pulse * 6;
    dot.clear();
    dot.circle(0, 0, r).fill({ color: 0xe84a4a, alpha: 0.85 });
    dot.circle(0, 0, r + 6).stroke({ color: 0xffffff, alpha: 0.15 + pulse * 0.2, width: 2 });
    void ticker;
  });

  document.getElementById('boot')?.classList.add('hidden');
}

boot().catch((err) => {
  console.error(err);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = `boot failed: ${(err as Error).message}`;
});
