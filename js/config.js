// All tuning constants live here so they're easy to find during playtest.
const CONFIG = {
  GRID_WIDTH: 384,
  GRID_HEIGHT: 384,

  SIM_HZ: 10,

  MIN_ZOOM: 0.5,
  MAX_ZOOM: 24,
  DEFAULT_ZOOM: 1.6,

  TAP_MAX_MOVE: 10,
  TAP_MAX_DURATION: 250,
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
};
