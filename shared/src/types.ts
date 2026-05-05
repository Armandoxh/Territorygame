// Owner ID 0 = unclaimed; 1..254 = players. Stored as a single byte.
export type PlayerId = number;

// 0 = land (passable, claimable), 1 = water, 2 = deep water (visual only).
export type TerrainKind = 0 | 1 | 2;
export const TERRAIN_LAND = 0;
export const TERRAIN_WATER = 1;
export const TERRAIN_DEEP = 2;

export type BuildingType = 'settlement' | 'turret' | 'airstrip' | 'aa';

export type BombType = 'small' | 'large' | 'ac130';

export type ShipKind = 'scout' | 'skirmisher' | 'warship' | 'submarine' | 'destroyer';

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
  | 'gold' | 'dead' | 'oob' | 'bad-type' | 'not-coastal' | 'no-water' | 'cap' | 'locked';

/** Internal vassal-to-vassal trade route (Phase 2 of the trade empire
 *  overhaul). Auto-established between any two of an owner's connected
 *  dominant regions, picked as the MST edges of the connected component
 *  so the count stays bounded (~N-1 routes per N vassals).
 *
 *  Centroid coords are snapshotted at scan time so the renderer doesn't
 *  have to look them up per frame. Treasury flow is added per tick to
 *  the route's owner. */
export interface TradeRoute {
  ownerId: PlayerId;
  regionA: number;
  regionB: number;
  /** Treasury gold per tick this route generates. */
  flow: number;
  /** Cached centroid distance for the visualisation + diagnostics. */
  distance: number;
  ax: number; ay: number;
  bx: number; by: number;
}

/** A bomber in flight. Spawned by dropBomb; flies from an airstrip toward
 *  the target tile at PLANE_SPEED tiles/tick. On arrival it detonates
 *  (radius damage); along the way enemy AA buildings can shoot it down. */
export interface Plane {
  id: number;
  owner: PlayerId;
  bombType: BombType;
  /** Float world coordinates — sub-tile precision so movement reads smooth. */
  x: number;
  y: number;
  destX: number;
  destY: number;
  /** Tiles per tick. */
  speed: number;
  /** Set of AA building ids that have already rolled against this plane,
   *  so each AA gets one chance per plane (not one per tick of overlap). */
  rolledAA: Set<number>;
  /** AC-130 only. tickCount when the orbit ends (0 = not orbiting yet).
   *  While orbiting, the gunship hovers near destX/destY and strafes
   *  periodically; AA gets fresh chances on each pass through range. */
  orbitUntilTick: number;
  /** AC-130 only. tickCount when the next strafe fires. */
  nextStrafeTick: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Player {
  id: PlayerId;
  name: string;
  isHuman: boolean;
  /** Operational gold — funds builds, manual attacks, bombs, ships.
   *  Fed by your own non-vassal land + AI base income. */
  gold: number;
  /** Commander treasury — funds doctrines and active abilities. Fed by
   *  vassal tribute. Strictly separate from `gold`: never drains except
   *  by clicking a commander action. */
  treasury: number;
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
  /** tickCount when this ability becomes ready again. Missing/0 = ready. */
  abilityCooldowns: Record<string, number>;
  /** tickCount when each active buff/debuff expires. */
  activeBuffs: Record<string, number>;
  /** Strategic specialization. null = unchosen (humans get prompted on
   *  first launch; AIs are picked at spawn). One of 'ground'|'air'|'naval'. */
  mastery: 'ground' | 'air' | 'naval' | null;
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
  | { type: 'ship-sunk';        shipKind: ShipKind; ownerId: PlayerId; x: number; y: number }
  | { type: 'plane-launched';   bombType: BombType; ownerId: PlayerId; x: number; y: number; destX: number; destY: number }
  | { type: 'plane-shot-down';  bombType: BombType; ownerId: PlayerId; byOwner: PlayerId; x: number; y: number }
  | { type: 'ability-fired';    abilityId: string; ownerId: PlayerId; targetId?: PlayerId }
  | { type: 'alliance-formed';  a: PlayerId; b: PlayerId }
  | { type: 'alliance-broken';  a: PlayerId; b: PlayerId; brokenBy: PlayerId }
  | { type: 'trade-completed';  fromId: PlayerId; toId: PlayerId; gold: number; troops: number };

export type RGBA = readonly [number, number, number, number];

export type BuildError =
  | 'gold' | 'not-yours' | 'occupied' | 'on-capital'
  | 'oob' | 'dead' | 'bad-type' | 'no-building' | 'max-level' | 'locked';

export type BombError =
  | 'no-airstrip' | 'cooldown' | 'gold' | 'oob' | 'dead' | 'bad-type' | 'locked';
