// Owner ID 0 = unclaimed; 1..254 = players. Stored as a single byte.
export type PlayerId = number;

// 0 = land (passable, claimable), 1 = water, 2 = deep water (visual only).
export type TerrainKind = 0 | 1 | 2;
export const TERRAIN_LAND = 0;
export const TERRAIN_WATER = 1;
export const TERRAIN_DEEP = 2;

export type BuildingType = 'settlement' | 'turret' | 'airstrip';

export type BombType = 'small' | 'large';

export type ShipKind = 'scout' | 'skirmisher' | 'warship';

export interface Ship {
  id: number;
  owner: PlayerId;
  kind: ShipKind;
  /** Tile-space integer position. Ships only occupy water tiles. */
  x: number;
  y: number;
  /** Manual / patrol destination. -1 = no destination (will pick a patrol). */
  destX: number;
  destY: number;
  /** True when the player explicitly set the destination — cleared on arrival
   *  so the ship returns to autopilot. */
  manual: boolean;
  hp: number;
  /** Ticks remaining until the ship can fire again. */
  fireCooldown: number;
}

export type ShipBuildError =
  | 'gold' | 'dead' | 'oob' | 'bad-type' | 'not-coastal' | 'no-water' | 'cap';

export interface Point {
  x: number;
  y: number;
}

export interface Player {
  id: PlayerId;
  name: string;
  isHuman: boolean;
  gold: number;
  /** Army strength. Grows passively from owned land, consumed on attacks. */
  troops: number;
  alive: boolean;
  /** Regions the player is actively pushing into. Multiple = parallel
   *  attacks. Empty = idle (vassals still run on their own). */
  targetRegions: number[];
  /** Stack count per Commander decree id (see shared/src/decrees.ts).
   *  Stackable nodes accumulate; one-shot purchases also increment so
   *  the UI can show how many times an action was issued. */
  decreeStacks: Record<string, number>;
  expanding: boolean;
}

export interface Building {
  x: number;
  y: number;
  owner: PlayerId;
  type: BuildingType;
  /** Upgrade tier (1..BUILDING_MAX_LEVEL). Default 1 when freshly built. */
  level: number;
  /** Airstrips only. Tick count after which this airstrip can fire again. */
  cooldownUntil?: number;
}

export interface Capital {
  x: number;
  y: number;
  owner: PlayerId;
}

export type GameOutcome = 'victory' | 'defeat' | null;

export type GameEvent =
  | { type: 'eliminated'; playerId: PlayerId; by: PlayerId }
  | { type: 'capital';    playerId: PlayerId; by: PlayerId }
  | { type: 'gameover';   outcome: 'victory' | 'defeat'; winner: PlayerId }
  | { type: 'built';      buildingType: BuildingType; ownerId: PlayerId }
  | { type: 'destroyed';  buildingType: BuildingType; ownerId: PlayerId }
  | { type: 'bomb';       bombType: BombType; x: number; y: number; radius: number; ownerId: PlayerId }
  | { type: 'region-conquered'; regionId: number; ownerId: PlayerId }
  | { type: 'region-lost';      regionId: number; ownerId: PlayerId }
  | { type: 'vassal-built';     regionId: number; ownerId: PlayerId; buildingType: BuildingType }
  | { type: 'vassal-bombed';    regionId: number; ownerId: PlayerId; bombType: BombType; x: number; y: number }
  | { type: 'ship-built';       shipKind: ShipKind; ownerId: PlayerId }
  | { type: 'ship-sunk';        shipKind: ShipKind; ownerId: PlayerId; x: number; y: number };

export type RGBA = readonly [number, number, number, number];

export type BuildError =
  | 'gold' | 'not-yours' | 'occupied' | 'on-capital'
  | 'oob' | 'dead' | 'bad-type' | 'no-building' | 'max-level';

export type BombError =
  | 'no-airstrip' | 'cooldown' | 'gold' | 'oob' | 'dead' | 'bad-type';
