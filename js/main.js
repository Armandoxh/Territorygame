(function () {
  const territory = new Territory(CONFIG.GRID_WIDTH, CONFIG.GRID_HEIGHT);
  const game = new Game(territory);
  game.generateTerrain(CONFIG.TERRAIN_SEED);
  game.spawnAll();

  const canvas = document.getElementById('game');
  const renderer = new Renderer(canvas, territory);
  const ui = new UI(territory, renderer, game);
  const input = new InputController(canvas, renderer);

  // Center the camera on the human spawn for the first view.
  renderer.cameraX = territory.width  * CONFIG.HUMAN_SPAWN_X_FRAC;
  renderer.cameraY = territory.height * CONFIG.HUMAN_SPAWN_Y_FRAC;

  let firstTap = true;
  let lastTapFlash = null;
  input.on('tap', (x, y, sx, sy) => {
    lastTapFlash = { sx, sy, time: performance.now() };
    ui.setLastTap(x, y);
    if (game.outcome) return;
    if (!territory.inBounds(x, y)) {
      ui.toast('off-map');
      return;
    }
    game.setHumanTarget(x, y);
    if (firstTap) { ui.hideHint(); firstTap = false; }
  });
  input.on('tripletap-debug', () => ui.toggleDebug());
  input.on('longpress', (x, y) => {
    if (game.outcome) return;
    if (!territory.inBounds(x, y)) return;
    ui.showBuildSheet(x, y);
  });

  // Sim tick at SIM_HZ — economy, expansion, AI, combat.
  setInterval(() => {
    game.tick();
    ui.noteTick();
  }, 1000 / CONFIG.SIM_HZ);

  function loop() {
    renderer.draw();
    drawBuildings();
    drawCapitals();
    drawTargetMarker();
    drawTapFlash();
    ui.update();
    requestAnimationFrame(loop);
  }
  loop();

  function drawBuildings() {
    const ctx = renderer.ctx;
    const dpr = renderer.dpr;
    for (const b of game.buildings) {
      const s = renderer.worldToScreen(b.x + 0.5, b.y + 0.5);
      const c = CONFIG.PLAYER_COLORS[b.owner];
      const cx = s.x * dpr, cy = s.y * dpr;
      const r = Math.max(6, Math.min(18, renderer.zoom * 1.1)) * dpr;
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(1.2, dpr * 1.1);

      if (b.type === 'settlement') {
        // House: pentagon-ish roof shape
        ctx.beginPath();
        ctx.moveTo(cx - r,        cy + r);
        ctx.lineTo(cx - r,        cy - r * 0.25);
        ctx.lineTo(cx,            cy - r);
        ctx.lineTo(cx + r,        cy - r * 0.25);
        ctx.lineTo(cx + r,        cy + r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (b.type === 'turret') {
        // Triangle
        ctx.beginPath();
        ctx.moveTo(cx,        cy - r);
        ctx.lineTo(cx + r,    cy + r * 0.7);
        ctx.lineTo(cx - r,    cy + r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (b.type === 'airstrip') {
        // Plus sign
        const t = r * 0.4;
        ctx.beginPath();
        ctx.moveTo(cx - r,  cy - t);
        ctx.lineTo(cx - t,  cy - t);
        ctx.lineTo(cx - t,  cy - r);
        ctx.lineTo(cx + t,  cy - r);
        ctx.lineTo(cx + t,  cy - t);
        ctx.lineTo(cx + r,  cy - t);
        ctx.lineTo(cx + r,  cy + t);
        ctx.lineTo(cx + t,  cy + t);
        ctx.lineTo(cx + t,  cy + r);
        ctx.lineTo(cx - t,  cy + r);
        ctx.lineTo(cx - t,  cy + t);
        ctx.lineTo(cx - r,  cy + t);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (b.type === 'wonder') {
        // Big diamond + progress arc
        const wr = r * 1.4;
        ctx.beginPath();
        ctx.moveTo(cx, cy - wr);
        ctx.lineTo(cx + wr, cy);
        ctx.lineTo(cx, cy + wr);
        ctx.lineTo(cx - wr, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Progress ring
        const prog = (b.progress || 0) / CONFIG.WONDER_BUILD_TIME_TICKS;
        const ringR = wr * 1.65;
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = Math.max(2, dpr * 1.6);
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawCapitals() {
    const ctx = renderer.ctx;
    const dpr = renderer.dpr;
    const t  = (performance.now() / 900) % 1;
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    for (const cap of game.capitals) {
      const s = renderer.worldToScreen(cap.x + 0.5, cap.y + 0.5);
      const c = CONFIG.PLAYER_COLORS[cap.owner];
      const r = Math.max(7, Math.min(22, renderer.zoom * 1.6)) * dpr;
      const cx = s.x * dpr, cy = s.y * dpr;
      // outer pulse ring
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.4 * pulse})`;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.55, 0, Math.PI * 2);
      ctx.stroke();
      // diamond body
      ctx.fillStyle = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(1.5, dpr * 1.2);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawTargetMarker() {
    const me = game.human();
    if (!me.target || !me.expanding) return;
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
    ctx.beginPath();
    const cx = s.x * dpr, cy = s.y * dpr;
    ctx.moveTo(cx - r,        cy); ctx.lineTo(cx - r * 0.35, cy);
    ctx.moveTo(cx + r * 0.35, cy); ctx.lineTo(cx + r,        cy);
    ctx.moveTo(cx, cy - r);        ctx.lineTo(cx, cy - r * 0.35);
    ctx.moveTo(cx, cy + r * 0.35); ctx.lineTo(cx, cy + r);
    ctx.stroke();
  }

  function drawTapFlash() {
    if (!lastTapFlash) return;
    const elapsed = performance.now() - lastTapFlash.time;
    if (elapsed > CONFIG.TAP_FLASH_MS) return;
    const t = elapsed / CONFIG.TAP_FLASH_MS;
    const dpr = renderer.dpr;
    const ctx = renderer.ctx;
    const r = (14 + 32 * t) * dpr;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.85 * (1 - t)})`;
    ctx.lineWidth = 2.5 * dpr;
    ctx.beginPath();
    ctx.arc(lastTapFlash.sx * dpr, lastTapFlash.sy * dpr, r, 0, Math.PI * 2);
    ctx.stroke();
  }
})();
