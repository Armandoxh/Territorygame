// Owner ID 0 = unclaimed; 1..254 = players. Stored as a single byte.
export type PlayerId = number;

// 0 = land (passable, claimable), 1 = water, 2 = deep water (visual only).
export type TerrainKind = 0 | 1 | 2;
export const TERRAIN_LAND = 0;
export const TERRAIN_WATER = 1;
export const TERRAIN_DEEP = 2;

export type BuildingType = 'settlement' | 'turret' | 'airstrip' | 'wonder';

export interface Point {
  x: number;
  y: number;
}

export interface Player {
  id: PlayerId;
  name: string;
  isHuman: boolean;
  gold: number;
  alive: boolean;
  target: Point | null;
  expanding: boolean;
}

export interface Building {
  x: number;
  y: number;
  owner: PlayerId;
  type: BuildingType;
  /** Wonders only. Ticks toward CONFIG.WONDER_BUILD_TIME_TICKS. */
  progress?: number;
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
  | { type: 'destroyed';  buildingType: BuildingType; ownerId: PlayerId };

export type RGBA = readonly [number, number, number, number];

export type BuildError =
  | 'gold' | 'not-yours' | 'occupied' | 'on-capital'
  | 'wonder-limit' | 'oob' | 'dead' | 'bad-type';
