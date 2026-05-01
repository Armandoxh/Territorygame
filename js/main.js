(function () {
  const territory = new Territory(CONFIG.GRID_WIDTH, CONFIG.GRID_HEIGHT);

  // M1 placeholder: paint the four eventual capital regions with their player
  // color so panning/zooming has clear visual landmarks. These will be
  // replaced by real spawn logic in M3.
  const W = territory.width, H = territory.height;
  const spawns = [
    { owner: 1, cx: W * 0.15, cy: H * 0.15 },
    { owner: 2, cx: W * 0.85, cy: H * 0.15 },
    { owner: 3, cx: W * 0.15, cy: H * 0.85 },
    { owner: 4, cx: W * 0.85, cy: H * 0.85 },
  ];
  for (const s of spawns) {
    const r = 6;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          territory.claim(Math.floor(s.cx + dx), Math.floor(s.cy + dy), s.owner);
        }
      }
    }
  }

  const canvas = document.getElementById('game');
  const renderer = new Renderer(canvas, territory);
  const ui = new UI(territory, renderer);
  const input = new InputController(canvas, renderer);

  input.on('tap', (x, y) => {
    ui.setLastTap(x, y);
  });
  input.on('tripletap-debug', () => ui.toggleDebug());

  // Sim tick (10 Hz) — empty for M1; will drive expansion in M2.
  setInterval(() => { ui.noteTick(); }, 1000 / CONFIG.SIM_HZ);

  function loop() {
    renderer.draw();
    ui.update();
    requestAnimationFrame(loop);
  }
  loop();
})();
