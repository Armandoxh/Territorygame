(function () {
  const territory = new Territory(CONFIG.GRID_WIDTH, CONFIG.GRID_HEIGHT);
  const game = new Game(territory);
  game.spawnHuman();

  const canvas = document.getElementById('game');
  const renderer = new Renderer(canvas, territory);
  const ui = new UI(territory, renderer, game);
  const input = new InputController(canvas, renderer);

  // Center the camera on the human spawn for the first view.
  renderer.cameraX = territory.width  * CONFIG.HUMAN_SPAWN_X_FRAC;
  renderer.cameraY = territory.height * CONFIG.HUMAN_SPAWN_Y_FRAC;

  let firstTap = true;
  input.on('tap', (x, y) => {
    ui.setLastTap(x, y);
    if (!territory.inBounds(x, y)) return;
    game.setHumanTarget(x, y);
    if (firstTap) { ui.hideHint(); firstTap = false; }
  });
  input.on('tripletap-debug', () => ui.toggleDebug());

  // Sim tick at SIM_HZ — advances economy and expansion.
  setInterval(() => {
    game.tick();
    ui.noteTick();
  }, 1000 / CONFIG.SIM_HZ);

  function loop() {
    renderer.draw();
    drawTargetMarker();
    ui.update();
    requestAnimationFrame(loop);
  }
  loop();

  function drawTargetMarker() {
    const me = game.human();
    if (!me.target) return;
    const ctx = renderer.ctx;
    const dpr = renderer.dpr;
    const s = renderer.worldToScreen(me.target.x + 0.5, me.target.y + 0.5);
    const t = (performance.now() / 700) % 1;
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    const baseR = Math.max(10, renderer.zoom * 2.5) * dpr;
    const r = baseR + pulse * 6 * dpr;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + 0.4 * pulse})`;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(s.x * dpr, s.y * dpr, r, 0, Math.PI * 2);
    ctx.stroke();
    // crosshair gap arms
    ctx.beginPath();
    const cx = s.x * dpr, cy = s.y * dpr;
    ctx.moveTo(cx - r,        cy); ctx.lineTo(cx - r * 0.35, cy);
    ctx.moveTo(cx + r * 0.35, cy); ctx.lineTo(cx + r,        cy);
    ctx.moveTo(cx, cy - r);        ctx.lineTo(cx, cy - r * 0.35);
    ctx.moveTo(cx, cy + r * 0.35); ctx.lineTo(cx, cy + r);
    ctx.stroke();
  }
})();
