// Owner ID 0 = unclaimed; 1..254 = players. Stored as a single byte.
export type PlayerId = number;

// 0 = land (passable, claimable), 1 = water, 2 = deep water (visual only).
export type TerrainKind = 0 | 1 | 2;
export const TERRAIN_LAND = 0;
export const TERRAIN_WATER = 1;
export const TERRAIN_DEEP = 2;

export type BuildingType = 'settlement' | 'turret' | 'airstrip' | 'aa' | 'port' | 'barracks';

/** Ground deployments — fired from a Barracks like bombs are fired
 *  from an airstrip. Each has its own cost + cooldown stored on the
 *  Barracks building, parallel to airstrip's cooldownUntil. */
export type GroundOpType = 'blitzkrieg' | 'artillery' | 'tanks';

export type BombType = 'small' | 'large' | 'ac130' | 'stealth';

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
  | 'gold' | 'dead' | 'oob' | 'bad-type' | 'not-coastal' | 'no-water' | 'cap' | 'locked' | 'no-port';

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

/** External trade route (Phase 3) — a deal between two ALLIED players.
 *  Both sides earn `flow` gold per tick into their treasury. Hard-gated
 *  on alliance: the route is auto-broken the moment the alliance ends.
 *  Endpoints snapshot each player's largest dominant region centroid
 *  (re-snapshotted on the same cadence as internal routes). */
export interface ExternalTradeRoute {
  a: PlayerId;
  b: PlayerId;
  /** Per-tick gold flow added to BOTH sides' treasury. */
  flow: number;
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
  /** Where the plane spawned. Lets the stealth-bomber carpet detonate
   *  along the actual flight axis instead of an arbitrary direction. */
  originX: number;
  originY: number;
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

/** A rolling artillery unit deployed by a Barracks Artillery Strike.
 *  Phase 1: rolls to its firing position (a frontier tile near the
 *  target). Phase 2: stationary, fires shells every N ticks for M
 *  seconds — each shell is a small AOE hit on a random tile near the
 *  target zone. Acts like an AC-130 but ground-launched. */
export interface ArtilleryUnit {
  id: number;
  owner: PlayerId;
  /** Current float position. */
  x: number;
  y: number;
  /** Firing position (nearest player frontier to target). */
  destX: number;
  destY: number;
  /** Shelling aim point. */
  targetX: number;
  targetY: number;
  /** Tick at which the barrage ends (0 = still rolling). */
  fireUntilTick: number;
  /** Tick of next shell. */
  nextShotTick: number;
}

/** Strategic resources tied to terrain. Each region rolls one or two
 *  primary resources at game start; owning the region (proportional
 *  to tile share) generates that resource into the player's inventory.
 *  - oil   (brown / arid highlands)
 *  - stone (grey / mountains)
 *  - gems  (gold / rare mountain veins — premium build resource)
 *  - food  (green / plains, fertile lowlands)
 *  - wood  (forest tiles)
 */
export type ResourceKind = 'oil' | 'stone' | 'gems' | 'food' | 'wood';
export const RESOURCE_KINDS: readonly ResourceKind[] = ['oil', 'stone', 'gems', 'food', 'wood'];
export type ResourceBag = Record<ResourceKind, number>;
export function emptyResourceBag(): ResourceBag {
  return { oil: 0, stone: 0, gems: 0, food: 0, wood: 0 };
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
  /** Per-ground-op-type cooldown end-tick. Player-wide floor that
   *  prevents stacking many Barracks from spamming the same op all
   *  at once — multiple barracks still let different ops fire in
   *  parallel, but any single op type can only fire on this cadence
   *  regardless of building count. */
  groundOpCooldowns?: Partial<Record<GroundOpType, number>>;
  /** Strategic specialization. null = unchosen (humans get prompted on
   *  first launch; AIs are picked at spawn). One of 'ground'|'air'|'naval'. */
  mastery: 'ground' | 'air' | 'naval' | null;
  expanding: boolean;
  /** Strategic resources extracted from owned region tiles. Generated
   *  per tick from regions whose primary resources match. */
  resources: ResourceBag;
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
  /** Barracks only. Per-ground-op cooldown end-tick. Allows the same
   *  barracks to fire different ops independently while still capping
   *  spam of the same op. */
  opCooldowns?: Partial<Record<GroundOpType, number>>;
  /** Tick at which this building entered "starving" state because
   *  the owner couldn't pay its resource upkeep. Cleared the moment
   *  upkeep is paid again. If it stays set for STARVING_DECAY_TICKS,
   *  the building destructs. */
  starvingSinceTick?: number;
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
  | { type: 'war-declared';     declarer: PlayerId; target: PlayerId; reason: 'manual' | 'aggression' | 'bandwagon' | 'ai' }
  | { type: 'war-ended';        a: PlayerId; b: PlayerId }
  | { type: 'war-invite';       from: PlayerId; target: PlayerId }
  | { type: 'trade-completed';  fromId: PlayerId; toId: PlayerId; gold: number; troops: number }
  | { type: 'trade-route-formed'; a: PlayerId; b: PlayerId }
  | { type: 'trade-route-broken'; a: PlayerId; b: PlayerId; brokenBy: PlayerId }
  | { type: 'ground-op';        opType: GroundOpType; ownerId: PlayerId; x: number; y: number };

export type RGBA = readonly [number, number, number, number];

export type BuildError =
  | 'gold' | 'not-yours' | 'occupied' | 'on-capital' | 'not-coastal'
  | 'oob' | 'dead' | 'bad-type' | 'no-building' | 'max-level' | 'locked'
  | 'resources';

export type BombError =
  | 'no-airstrip' | 'cooldown' | 'gold' | 'oob' | 'dead' | 'bad-type' | 'locked';

/** Mirrors BombError but for Barracks-launched ground deployments. */
export type GroundOpError =
  | 'no-barracks' | 'cooldown' | 'gold' | 'oob' | 'dead' | 'bad-type';
