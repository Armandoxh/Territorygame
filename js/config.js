// All tuning constants live here so they're easy to find during playtest.
const CONFIG = {
  GRID_WIDTH: 384,
  GRID_HEIGHT: 384,

  SIM_HZ: 10,

  MIN_ZOOM: 0.5,
  MAX_ZOOM: 24,
  DEFAULT_ZOOM: 1.6,

  TAP_MAX_MOVE: 18,         // CSS px; finger jitter on phones easily exceeds 10
  TAP_MAX_DURATION: 450,    // ms; iOS finger-down taps frequently take 200-350ms
  TAP_FLASH_MS: 600,        // visual ping at every tap so we can see it landed
  TRIPLE_TAP_MS: 700,
  TRIPLE_TAP_CORNER_PX: 100,

  PLAYER_COLORS: [
    [0x1a, 0x20, 0x26, 0xff], // 0: unclaimed (dark slate, distinct from page bg)
    [0xe8, 0x4a, 0x4a, 0xff], // 1: human (red)
    [0x4a, 0x9b, 0xe8, 0xff], // 2: AI 1 (blue)
    [0x55, 0xc8, 0x6e, 0xff], // 3: AI 2 (green)
    [0xe8, 0xc0, 0x4a, 0xff], // 4: AI 3 (yellow)
  ],

  BG_COLOR: '#0c0f12',
  GRIDLINE_COLOR: 'rgba(255,255,255,0.04)',
  GRIDLINE_INTERVAL: 32,
  GRIDLINE_MIN_ZOOM: 1.5,

  MAP_BORDER_COLOR: 'rgba(255,255,255,0.18)',

  // Player economy
  STARTING_GOLD: 120,
  GOLD_PER_TILE_PER_TICK: 0.05,        // 0.5 gold/sec per owned tile
  EXPANSION_COST_PER_CLAIM: 1,         // gold per tile claimed
  EXPANSION_CHANCE_PER_FRONTIER_TILE: 0.18, // per tick (10Hz)
  EXPANSION_TARGET_BIAS: 0.75,         // chance to pick target-aligned neighbor

  // Spawn (M2: human only; M3 will add AI corners)
  HUMAN_SPAWN_X_FRAC: 0.2,
  HUMAN_SPAWN_Y_FRAC: 0.5,
  SPAWN_RADIUS: 5,
};
