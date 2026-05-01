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
  LONGPRESS_MS: 500,        // hold-time to open the build sheet

  PLAYER_COLORS: [
    [0x3d, 0x33, 0x24, 0xff], // 0: unclaimed land (warm khaki — feels like dirt)
    [0xe8, 0x4a, 0x4a, 0xff], // 1: human (red)
    [0x4a, 0x9b, 0xe8, 0xff], // 2: AI 1 (blue)
    [0x55, 0xc8, 0x6e, 0xff], // 3: AI 2 (green)
    [0xe8, 0xc0, 0x4a, 0xff], // 4: AI 3 (yellow)
  ],

  // Terrain
  WATER_COLOR:        [0x16, 0x2a, 0x42, 0xff],
  WATER_COLOR_DEEP:   [0x10, 0x1f, 0x33, 0xff],
  TERRAIN_NOISE_SCALE: 0.025,    // smaller = bigger landmasses
  TERRAIN_OCTAVES: 4,
  TERRAIN_PERSISTENCE: 0.55,
  TERRAIN_WATER_THRESHOLD: 0.42, // values BELOW are water (~25-35% of map)
  TERRAIN_DEEP_THRESHOLD: 0.25,
  TERRAIN_SEED: 0,               // 0 → randomize each game

  BG_COLOR: '#0c0f12',
  GRIDLINE_COLOR: 'rgba(255,255,255,0.04)',
  GRIDLINE_INTERVAL: 32,
  GRIDLINE_MIN_ZOOM: 1.5,

  MAP_BORDER_COLOR: 'rgba(255,255,255,0.18)',

  // Player economy
  STARTING_GOLD: 120,
  GOLD_PER_TILE_PER_TICK: 0.05,        // 0.5 gold/sec per owned tile
  EXPANSION_COST_PER_CLAIM: 1,         // gold per tile claimed
  EXPANSION_CHANCE_PER_FRONTIER_TILE: 0.22, // per tick (10Hz), base rate
  EXPANSION_TARGET_BIAS: 0.95,         // chance to pick target-aligned neighbor
  // Per-tile chance is multiplied by (alignment+1)^1.5 / 1 — tiles whose best
  // outward direction faces the target expand ~3x faster, perp ~1x, away ~0.
  EXPANSION_DIRECTIONAL_EXP: 1.5,

  // Spawn (M3: human + 3 AI in four spread positions)
  HUMAN_SPAWN_X_FRAC: 0.15,
  HUMAN_SPAWN_Y_FRAC: 0.5,
  SPAWN_RADIUS: 5,

  // Opponents
  AI_PLAYER_COUNT: 3,
  AI_RETARGET_TICKS: 80,        // AI picks a fresh target every ~8s
  CAPITALS_PER_PLAYER: 2,

  // Combat
  ATTACK_COST_PER_CLAIM: 4,      // vs 1 gold for unclaimed
  ATTACK_RATE_MULT: 0.55,        // enemy tiles fire at slower per-tick rate

  // Buildings
  BUILDING_COSTS: {
    settlement: 50,
    turret:     80,
    airstrip:   150,
    wonder:     500,
  },
  SETTLEMENT_RADIUS: 5,
  SETTLEMENT_BONUS: 0.5,         // +50% gold per overlapping settlement
  TURRET_RADIUS: 3,
  TURRET_DEFENSE_BONUS: 2,       // attack cost & rate scale by (1 + sum)
  WONDER_BUILD_TIME_TICKS: 900,  // 90s @ 10Hz
  WONDER_MAX_PER_PLAYER: 1,
};
