// Per-state building data + mutation API.
//
// Each state (sub-partition of a region) can have up to one building
// of each "line." A line is a tier progression: tap-to-build the
// tier-1 building, tap again to upgrade to tier 2, etc. Three lines
// ship this nail; mining (resource-specific) lands with map resources.
//
// No costs yet — per user, "build the buildings, shape the map to
// have the resources, then decide costs." This module is the place
// where construction cost / production rate hooks will eventually
// plug in (see getRecruitmentRate in main.ts for the same pattern).
//
// The resource <-> matching-line mapping lives in resources.ts. This
// module only knows about the lines themselves and their tier data.

export type BuildingLine = 'settlement' | 'forestry' | 'merchant';

export const BUILDING_LINES: BuildingLine[] = ['settlement', 'forestry', 'merchant'];

// Per-line tier name list. Index 0 = "not built yet"; tiers 1..N
// are real built tiers. Future-friendly: longer arrays = more tiers
// without code changes here.
export const TIER_NAMES: Record<BuildingLine, readonly string[]> = {
  settlement: ['empty', 'tents', 'houses', 'town'],
  forestry: ['empty', 'lumber mill', 'lumber processing', 'lumber refinement'],
  merchant: ['empty', 'market stall', 'bazaar', 'grand exchange'],
};

// Max tier per line. Derived from TIER_NAMES so renaming stays in
// one place.
export function maxTier(line: BuildingLine): number {
  return TIER_NAMES[line].length - 1;
}

// Per-state building tier record. Indexed by State.id (global state
// index from world.ts). Tier 0 = nothing built. All states start at
// 0 for all three lines.
export interface StateBuildings {
  settlement: number;
  forestry: number;
  merchant: number;
}

let buildings: StateBuildings[] = [];

export function initBuildings(stateCount: number): void {
  buildings = new Array(stateCount);
  for (let i = 0; i < stateCount; i++) {
    buildings[i] = { settlement: 0, forestry: 0, merchant: 0 };
  }
}

export function getBuildings(stateId: number): StateBuildings {
  return buildings[stateId]!;
}

// Returns true if the build/upgrade succeeded. False if the line is
// already at max tier. Costs and ownership checks are caller-side
// (main.ts gates on "is this state in the player's owned region").
export function buildNext(stateId: number, line: BuildingLine): boolean {
  const b = buildings[stateId]!;
  const cur = b[line];
  if (cur >= maxTier(line)) return false;
  b[line] = cur + 1;
  return true;
}
