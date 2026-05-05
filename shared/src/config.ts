import type { BuildingType, BombType, ShipKind, RGBA } from './types.js';

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

  /** Defense bonus applied to every tile of a player's fully-owned region
   *  (equivalent to having a turret stack but covering the whole district). */
  FULL_REGION_DEFENSE_BONUS: number;
  /** Flat troops/tick added per fully-owned region (the "garrison"). */
  FULL_REGION_TROOP_BONUS: number;

  /** Ticks between vassal AI decisions (re-target + maybe build). */
  VASSAL_THINK_INTERVAL: number;
  /** Leader gold reserve vassals won't dip below. */
  VASSAL_GOLD_RESERVE: number;
  /** Min leader fraction-of-map for human vassals to remain loyal. */
  VASSAL_LOYALTY_THRESHOLD: number;
  /** Multiplier on per-tile chance for vassal-driven expansion. */
  VASSAL_EXPANSION_BOOST: number;
  /** Fraction of vassal income forwarded as tribute to the leader each tick. */
  VASSAL_TRIBUTE_FRACTION: number;
  /** Cost of a Production Decree (one stack = +10% gold). */
  DECREE_PRODUCTION_COST: number;
  /** Per-stack income boost from Production Decree. */
  DECREE_PRODUCTION_BOOST: number;
  /** Cost of a Conscription Decree (instant troops). */
  DECREE_CONSCRIPT_COST: number;
  /** Troops added to the leader pool per Conscription. */
  DECREE_CONSCRIPT_TROOPS: number;
  /** Max tier any building can be upgraded to. Linear stacking effects. */
  BUILDING_MAX_LEVEL: number;

  // Buildings
  BUILDING_COSTS: Record<BuildingType, number>;
  SETTLEMENT_RADIUS: number;
  SETTLEMENT_BONUS: number;
  /** Flat troops/tick added per owned settlement (independent of radius). */
  SETTLEMENT_TROOP_BONUS: number;
  /** Flat gold/tick added per owned settlement (in addition to multiplier). */
  SETTLEMENT_GOLD_BONUS: number;
  TURRET_RADIUS: number;
  TURRET_DEFENSE_BONUS: number;
  /** Attacker troop loss per defending turret on every successful capture
   *  inside that turret's radius. Turrets bite back. */
  TURRET_RETALIATION_DAMAGE: number;

  // Bombs (require an airstrip; fired by player, hit ANY claimed tile in
  // radius — own or enemy — and destroy buildings on those tiles. Capitals
  // are immune.)
  BOMB_COSTS: Record<BombType, number>;
  BOMB_RADII: Record<BombType, number>;
  BOMB_COOLDOWN_TICKS: Record<BombType, number>;

  // --- Planes (bomb delivery) ---
  /** Tiles per tick a plane flies. */
  PLANE_SPEED: Record<BombType, number>;

  // --- Anti-aircraft ---
  /** Tiles around an AA building inside which planes are vulnerable. */
  AA_RADIUS: number;
  /** Probability that any single AA succeeds against a plane in range. */
  AA_HIT_CHANCE: number;

  // --- AC-130 gunship ---
  /** Ticks the gunship orbits the target after arrival. */
  AC130_ORBIT_TICKS: number;
  /** Ticks between successive strafes while orbiting. */
  AC130_STRAFE_INTERVAL: number;

  // --- Ships ---
  // Naval units patrol water tiles, bombard coastal land, and (warships
  // only) make landfall by claiming the coastal tile they hit.
  SHIP_COSTS:      Record<ShipKind, number>;
  SHIP_HP:         Record<ShipKind, number>;
  /** Manhattan-ish max range a ship will fire at coastal land tiles. */
  SHIP_RANGE:      Record<ShipKind, number>;
  /** Damage applied to defender troops per fire event. */
  SHIP_DAMAGE:     Record<ShipKind, number>;
  /** Ticks between successive moves (lower = faster). */
  SHIP_MOVE_TICKS: Record<ShipKind, number>;
  /** Ticks between successive shots. */
  SHIP_FIRE_TICKS: Record<ShipKind, number>;
  /** Max ships a single player can have at once. */
  SHIP_PLAYER_CAP: number;

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
  GOLD_PER_TILE_PER_TICK: 0.018,
  EXPANSION_COST_PER_CLAIM: 1,
  EXPANSION_TROOP_COST: 3, // troops drained per unclaimed claim — settling new land needs people
  EXPANSION_CHANCE_PER_FRONTIER_TILE: 0.05,
  EXPANSION_TARGET_BIAS: 0.95,
  EXPANSION_DIRECTIONAL_EXP: 1.5,

  ATTACK_COST_PER_CLAIM: 4,
  ATTACK_RATE_MULT: 0.18,

  STARTING_TROOPS: 100,
  TROOP_GROWTH_PER_TILE_PER_TICK: 0.38, // ~3.8/sec per tile
  TROOP_CAP_PER_TILE: 100,
  TROOP_COST_PER_ATTACK: 5,
  TROOP_DAMAGE_PER_ATTACK: 3,
  ATTACK_RATIO_EXP: 0.4,
  ATTACK_RATIO_MIN: 0.25,
  ATTACK_RATIO_MAX: 4,

  WIN_TERRITORY_FRACTION: 0.95,

  FULL_REGION_DEFENSE_BONUS: 1.5,
  FULL_REGION_TROOP_BONUS: 3,

  // --- Vassal autonomy ---
  /** Ticks between vassal AI decisions (re-target + maybe build). */
  VASSAL_THINK_INTERVAL: 50,
  /** Per-vassal gold reserve they keep before opting to spend on buildings. */
  VASSAL_GOLD_RESERVE: 30,
  /** Min leader-fraction-of-map for human vassals to stay loyal/active. */
  VASSAL_LOYALTY_THRESHOLD: 0.5,
  /** Multiplier on per-tile expansion chance when expansion is driven by a
   *  vassal target (no manual override). > 1.0 makes vassals push faster. */
  VASSAL_EXPANSION_BOOST: 1.4,
  /** Fraction of vassal income forwarded to the leader as tribute each tick. */
  VASSAL_TRIBUTE_FRACTION: 0.10,

  /** Commander decree costs and effects. */
  DECREE_PRODUCTION_COST: 500,
  DECREE_PRODUCTION_BOOST: 0.10,
  DECREE_CONSCRIPT_COST: 300,
  DECREE_CONSCRIPT_TROOPS: 1000,

  BUILDING_MAX_LEVEL: 3,

  BUILDING_COSTS: {
    settlement: 60,
    turret:     90,
    airstrip:   150,
    aa:         110,
  },
  SETTLEMENT_RADIUS: 6,
  SETTLEMENT_BONUS: 0.5,        // +50% gold in radius
  SETTLEMENT_TROOP_BONUS: 5,    // +50 troops/sec per settlement (flat)
  SETTLEMENT_GOLD_BONUS: 0.20,  // +2.0 gold/sec flat per settlement
  TURRET_RADIUS: 5,             // covers ~78 tiles (was 28)
  TURRET_DEFENSE_BONUS: 4,      // (1 + 4) = 5x cost / 1/5 rate per stacked turret
  TURRET_RETALIATION_DAMAGE: 8, // attacker troops lost per turret on successful capture in radius

  BOMB_COSTS:          { small: 60,  large: 240, ac130: 350 },
  BOMB_RADII:          { small: 3,   large: 6,   ac130: 4   }, // ac130 = single-strafe radius
  BOMB_COOLDOWN_TICKS: { small: 80,  large: 250, ac130: 320 }, // 32s @ 10Hz
  PLANE_SPEED:         { small: 0.45, large: 0.30, ac130: 0.35 },

  AA_RADIUS:     7,    // a bit bigger than turret radius — defensive umbrella
  AA_HIT_CHANCE: 0.75, // single 75% roll per AA per plane

  /** AC-130 only. Ticks the gunship orbits the target after arrival. */
  AC130_ORBIT_TICKS:    100,  // 10s on station
  /** AC-130 only. Ticks between strafes during orbit. */
  AC130_STRAFE_INTERVAL: 14,  // ~1.4s

  SHIP_COSTS:      { scout: 80,  skirmisher: 200, warship: 500, submarine: 350, destroyer: 280 },
  SHIP_HP:         { scout: 30,  skirmisher: 80,  warship: 280, submarine: 60,  destroyer: 110 },
  SHIP_RANGE:      { scout: 3,   skirmisher: 5,   warship: 9,   submarine: 9,   destroyer: 6   },
  SHIP_DAMAGE:     { scout: 4,   skirmisher: 10,  warship: 35,  submarine: 0,   destroyer: 12  },
  SHIP_MOVE_TICKS: { scout: 1,   skirmisher: 2,   warship: 3,   submarine: 2,   destroyer: 2   },
  SHIP_FIRE_TICKS: { scout: 25,  skirmisher: 18,  warship: 14,  submarine: 35,  destroyer: 14  },
  SHIP_PLAYER_CAP: 8,

  AI_RETARGET_TICKS: 120,

  TERRAIN_NOISE_SCALE: 0.025,
  TERRAIN_OCTAVES: 4,
  TERRAIN_PERSISTENCE: 0.55,
  TERRAIN_WATER_THRESHOLD: 0.42,
  TERRAIN_DEEP_THRESHOLD: 0.25,
  TERRAIN_SEED: 0,

  PLAYER_COLORS: [
    [0x4a, 0x3e, 0x2e, 0xff], // 0: unclaimed land — warm parchment
    [0xe8, 0x4a, 0x4a, 0xff],
    [0x4a, 0x9b, 0xe8, 0xff],
    [0x55, 0xc8, 0x6e, 0xff],
    [0xe8, 0xc0, 0x4a, 0xff],
  ],
  WATER_COLOR:      [0x2c, 0x4d, 0x70, 0xff], // shallow ocean
  WATER_COLOR_DEEP: [0x18, 0x33, 0x52, 0xff], // deep ocean
};
