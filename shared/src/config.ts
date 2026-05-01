import type { BuildingType, BombType, RGBA } from './types.js';

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
  EXPANSION_TROOP_COST: number;
  EXPANSION_CHANCE_PER_FRONTIER_TILE: number;
  EXPANSION_TARGET_BIAS: number;
  EXPANSION_DIRECTIONAL_EXP: number;

  // Combat
  ATTACK_COST_PER_CLAIM: number;
  ATTACK_RATE_MULT: number;

  // Troops (per-player army strength, displayed per territory)
  STARTING_TROOPS: number;
  TROOP_GROWTH_PER_TILE_PER_TICK: number;
  TROOP_CAP_PER_TILE: number;          // troops cap = owned * this
  TROOP_COST_PER_ATTACK: number;       // attacker troops consumed per claim
  TROOP_DAMAGE_PER_ATTACK: number;     // defender troops consumed per claim
  /** Attack rate multiplier = clamp((A.troops / B.troops)^EXP, MIN, MAX). */
  ATTACK_RATIO_EXP: number;
  ATTACK_RATIO_MIN: number;
  ATTACK_RATIO_MAX: number;

  /** Win threshold: any player owning this fraction of LAND tiles wins. */
  WIN_TERRITORY_FRACTION: number;

  // Buildings
  BUILDING_COSTS: Record<BuildingType, number>;
  SETTLEMENT_RADIUS: number;
  SETTLEMENT_BONUS: number;
  /** Flat troops/tick added per owned settlement (independent of radius). */
  SETTLEMENT_TROOP_BONUS: number;
  TURRET_RADIUS: number;
  TURRET_DEFENSE_BONUS: number;

  // Bombs (require an airstrip; fired by player, hit ANY claimed tile in
  // radius — own or enemy — and destroy buildings on those tiles. Capitals
  // are immune.)
  BOMB_COSTS: Record<BombType, number>;
  BOMB_RADII: Record<BombType, number>;
  BOMB_COOLDOWN_TICKS: Record<BombType, number>;

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
  EXPANSION_TROOP_COST: 3, // troops drained per unclaimed claim — settling new land needs people
  EXPANSION_CHANCE_PER_FRONTIER_TILE: 0.22,
  EXPANSION_TARGET_BIAS: 0.95,
  EXPANSION_DIRECTIONAL_EXP: 1.5,

  ATTACK_COST_PER_CLAIM: 4,
  ATTACK_RATE_MULT: 0.55,

  STARTING_TROOPS: 100,
  TROOP_GROWTH_PER_TILE_PER_TICK: 0.5, // 5/sec per tile until cap
  TROOP_CAP_PER_TILE: 100,
  TROOP_COST_PER_ATTACK: 5,
  TROOP_DAMAGE_PER_ATTACK: 3,
  ATTACK_RATIO_EXP: 0.3,        // gentler scaling (was 0.5)
  ATTACK_RATIO_MIN: 0.3,        // smaller players still inflict some damage (was 0.1)
  ATTACK_RATIO_MAX: 3,          // cap the snowball — bigger doesn't mean unstoppable (was 10)

  WIN_TERRITORY_FRACTION: 0.95,

  BUILDING_COSTS: {
    settlement: 60,
    turret:     90,
    airstrip:   150,
  },
  SETTLEMENT_RADIUS: 6,
  SETTLEMENT_BONUS: 1.0,        // +100% gold in radius (was +50%)
  SETTLEMENT_TROOP_BONUS: 8,    // +80 troops/sec per settlement (flat)
  TURRET_RADIUS: 5,             // covers ~78 tiles (was 28)
  TURRET_DEFENSE_BONUS: 4,      // (1 + 4) = 5x cost / 1/5 rate per stacked turret

  BOMB_COSTS:          { small: 60,  large: 240 },
  BOMB_RADII:          { small: 4,   large: 12  },
  BOMB_COOLDOWN_TICKS: { small: 80,  large: 250 }, // 8s / 25s @ 10Hz

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
