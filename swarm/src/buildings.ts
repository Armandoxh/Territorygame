// Per-state building data + mutation API.
//
// Each state (sub-partition of a region) can have up to one building
// of each "line." A line is a tier progression: tap to build tier 1,
// tap to upgrade to tier 2, etc. Five lines ship now — one universal
// (settlement: housing/people, no resource match) and four resource-
// tied: farmland, forestry, mining, merchant. Each resource-tied
// line is wired to its state resource via resources.ts.
//
// No costs yet — per user: "build the buildings, shape the map to
// have the resources, then decide costs." This module is where
// construction cost / production rate hooks will eventually plug in.
//
// The resource <-> matching-line mapping lives in resources.ts. This
// module only knows about the lines themselves and their tier data.

export type BuildingLine =
  | 'settlement'
  | 'farmland'
  | 'forestry'
  | 'mining'
  | 'merchant';

// Render order — tabs in the menu and badges on the state icon
// both walk this array, so changing the order changes both at once.
export const BUILDING_LINES: BuildingLine[] = [
  'settlement',
  'farmland',
  'forestry',
  'mining',
  'merchant',
];

// Per-line tier name list. Index 0 = "not built yet"; tiers 1..N
// are real built tiers. Adding a new tier = append to the array.
export const TIER_NAMES: Record<BuildingLine, readonly string[]> = {
  settlement: ['empty', 'tents', 'houses', 'town'],
  farmland: ['empty', 'subsistence farm', 'croplands', 'plantation'],
  forestry: ['empty', 'lumber mill', 'sawmill', 'timberworks'],
  mining: ['empty', 'mine shaft', 'quarry', 'mineworks'],
  merchant: ['empty', 'market stall', 'bazaar', 'grand exchange'],
};

// Max tier per line. Derived from TIER_NAMES so renaming stays in
// one place.
export function maxTier(line: BuildingLine): number {
  return TIER_NAMES[line].length - 1;
}

// Per-state building tier record. Indexed by State.id (global state
// index from world.ts). Tier 0 = nothing built.
export interface StateBuildings {
  settlement: number;
  farmland: number;
  forestry: number;
  mining: number;
  merchant: number;
}

function emptyBuildings(): StateBuildings {
  return {
    settlement: 0,
    farmland: 0,
    forestry: 0,
    mining: 0,
    merchant: 0,
  };
}

let buildings: StateBuildings[] = [];

export function initBuildings(stateCount: number): void {
  buildings = new Array(stateCount);
  for (let i = 0; i < stateCount; i++) {
    buildings[i] = emptyBuildings();
  }
}

export function getBuildings(stateId: number): StateBuildings {
  return buildings[stateId]!;
}

// Build the NEXT tier on a line. Returns true if the build/upgrade
// succeeded, false if already at max. Caller (main.ts) gates on
// ownership; this layer is data-only.
export function buildNext(stateId: number, line: BuildingLine): boolean {
  const b = buildings[stateId]!;
  const cur = b[line];
  if (cur >= maxTier(line)) return false;
  b[line] = cur + 1;
  return true;
}

// Build a SPECIFIC tier (cur+1 only — used by the tab UI so the
// tier card the user tapped is the one that gets built). Returns
// true on success. Refusing to skip tiers keeps the progression
// rule cheap and obvious: you can only build the tier directly
// after your current one.
export function buildTier(stateId: number, line: BuildingLine, tier: number): boolean {
  const b = buildings[stateId]!;
  if (tier !== b[line] + 1) return false;
  if (tier > maxTier(line)) return false;
  b[line] = tier;
  return true;
}
