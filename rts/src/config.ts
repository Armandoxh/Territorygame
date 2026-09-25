// All gameplay tunables live here. Prefer changing a constant over
// hardcoding a number in game.ts.

export const TILE = 32; // world px per tile
export const MAP_W = 48;
export const MAP_H = 48;

export type ResourceKind = 'wood' | 'gold';
export type BuildingKind = 'hall' | 'house' | 'mill';
export type Cost = Partial<Record<ResourceKind, number>>;

export const PEASANT_SPEED = 72; // world px / sec
export const CARRY_CAP = 10;
/** Seconds of work to fill one load. */
export const GATHER_SECONDS: Record<ResourceKind, number> = { wood: 5, gold: 4 };
export const TREE_WOOD = 40;
export const MINE_GOLD = 1500;
export const MINE_SIZE = 2;

export const PEASANT_COST: Cost = { gold: 50 };
export const PEASANT_TRAIN_SECONDS = 10;
export const TRAIN_QUEUE_MAX = 5;
export const POP_MAX = 50;

export interface BuildingDef {
  name: string;
  size: number; // square footprint, tiles
  cost: Cost;
  buildSeconds: number; // with one peasant; more peasants stack linearly
  pop: number; // population cap provided once complete
  dropOff: ResourceKind[];
  blurb: string;
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  hall: {
    name: 'Town Hall', size: 3, cost: {}, buildSeconds: 1, pop: 5,
    dropOff: ['wood', 'gold'], blurb: 'Trains peasants. Drop-off for wood + gold.',
  },
  house: {
    name: 'House', size: 2, cost: { wood: 60 }, buildSeconds: 15, pop: 5,
    dropOff: [], blurb: '+5 population.',
  },
  mill: {
    name: 'Lumber Mill', size: 2, cost: { wood: 80 }, buildSeconds: 20, pop: 0,
    dropOff: ['wood'], blurb: 'Drop-off for wood. Build near forests.',
  },
};

/** Buildings a peasant can place, in HUD order. */
export const BUILDABLE: BuildingKind[] = ['house', 'mill'];

export const START_STOCK: Record<ResourceKind, number> = { wood: 100, gold: 150 };
export const START_PEASANTS = 3;
