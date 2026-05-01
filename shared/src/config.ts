import type { BuildingType, RGBA } from './types.js';

export interface GameConfig {
  GRID_WIDTH: number;
  GRID_HEIGHT: number;

  SIM_HZ: number;

  // Spawn (player 1 / human anchors west; others fill clockwise)
  SPAWN_RADIUS: number;
  AI_PLAYER_COUNT: number;
  CAPITALS_PER_PLAYER: number;

  // Economy
  STARTING_GOLD: number;
  GOLD_PER_TILE_PER_TICK: number;
  EXPANSION_COST_PER_CLAIM: number;
  EXPANSION_CHANCE_PER_FRONTIER_TILE: number;
  EXPANSION_TARGET_BIAS: number;
  EXPANSION_DIRECTIONAL_EXP: number;

  // Combat
  ATTACK_COST_PER_CLAIM: number;
  ATTACK_RATE_MULT: number;

  // Buildings
  BUILDING_COSTS: Record<BuildingType, number>;
  SETTLEMENT_RADIUS: number;
  SETTLEMENT_BONUS: number;
  TURRET_RADIUS: number;
  TURRET_DEFENSE_BONUS: number;
  WONDER_BUILD_TIME_TICKS: number;
  WONDER_MAX_PER_PLAYER: number;

  // AI behavior
  AI_RETARGET_TICKS: number;

  // Terrain
  TERRAIN_NOISE_SCALE: number;
  TERRAIN_OCTAVES: number;
  TERRAIN_PERSISTENCE: number;
  TERRAIN_WATER_THRESHOLD: number;
  TERRAIN_DEEP_THRESHOLD: number;
  TERRAIN_SEED: number;          // 0 → randomize per game

  // Color palette (index 0 = unclaimed land; 1..N = players). Generated at boot.
  PLAYER_COLORS: RGBA[];
  WATER_COLOR: RGBA;
  WATER_COLOR_DEEP: RGBA;
}

export const DEFAULT_CONFIG: GameConfig = {
  GRID_WIDTH: 384,
  GRID_HEIGHT: 384,

  SIM_HZ: 10,

  SPAWN_RADIUS: 5,
  AI_PLAYER_COUNT: 3,
  CAPITALS_PER_PLAYER: 2,

  STARTING_GOLD: 120,
  GOLD_PER_TILE_PER_TICK: 0.05,
  EXPANSION_COST_PER_CLAIM: 1,
  EXPANSION_CHANCE_PER_FRONTIER_TILE: 0.22,
  EXPANSION_TARGET_BIAS: 0.95,
  EXPANSION_DIRECTIONAL_EXP: 1.5,

  ATTACK_COST_PER_CLAIM: 4,
  ATTACK_RATE_MULT: 0.55,

  BUILDING_COSTS: {
    settlement: 50,
    turret:     80,
    airstrip:   150,
    wonder:     500,
  },
  SETTLEMENT_RADIUS: 5,
  SETTLEMENT_BONUS: 0.5,
  TURRET_RADIUS: 3,
  TURRET_DEFENSE_BONUS: 2,
  WONDER_BUILD_TIME_TICKS: 900,
  WONDER_MAX_PER_PLAYER: 1,

  AI_RETARGET_TICKS: 80,

  TERRAIN_NOISE_SCALE: 0.025,
  TERRAIN_OCTAVES: 4,
  TERRAIN_PERSISTENCE: 0.55,
  TERRAIN_WATER_THRESHOLD: 0.42,
  TERRAIN_DEEP_THRESHOLD: 0.25,
  TERRAIN_SEED: 0,

  PLAYER_COLORS: [
    [0x3d, 0x33, 0x24, 0xff],
    [0xe8, 0x4a, 0x4a, 0xff],
    [0x4a, 0x9b, 0xe8, 0xff],
    [0x55, 0xc8, 0x6e, 0xff],
    [0xe8, 0xc0, 0x4a, 0xff],
  ],
  WATER_COLOR:      [0x16, 0x2a, 0x42, 0xff],
  WATER_COLOR_DEEP: [0x10, 0x1f, 0x33, 0xff],
};
