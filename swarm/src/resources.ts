// Resource registry — the single source of truth for what a "resource"
// is, both as a tile-level grand-map feature and as a state-level
// production type.
//
// To add a new resource (e.g. coal, oil, fish, gold):
//   1. Append a ResourceDef entry below. Its `id` MUST equal its
//      array index (the array is the resource table — id == index).
//   2. If `scatterOnMap` is true, world gen will randomly place
//      `patchCount` clusters of `patchSize` tiles each on viable
//      grass terrain.
//   3. If `matchingLine` is set, the per-state build menu highlights
//      that line on states whose resource is this one (and the
//      future production hook gives those buildings a boost).
//   4. The map render layer + state-icon layer + build menu all
//      automatically pick up the new entry via getResourceDef(id).
// Nothing else needs editing.
//
// Resources are referenced by numeric id in tile / state arrays
// (Int16Array). -1 = no resource. The id constants RES_* below are
// the ergonomic handles for code that needs to refer to specific
// resources directly.

// BuildingLine kept as a string union here (not imported from
// buildings.ts) so this module can be referenced by world.ts without
// creating a cycle (world is pure data; buildings depends on world).
// When the mining line lands, add 'mining' here.
export type BuildingLineKey = 'settlement' | 'forestry' | 'merchant';

export interface ResourceDef {
  // id is the index of this entry in RESOURCE_DEFS. Used as the
  // value in World.resourceOf and State.resource arrays.
  readonly id: number;
  // Short machine key. Doubles as the rendered glyph fallback.
  readonly key: string;
  // UI label in the build menu and overlays.
  readonly label: string;
  // 0xRRGGBB. Tile-level icons, state-level icons, and menu badges
  // all share this color.
  readonly color: number;
  // Single-letter glyph rendered on icons.
  readonly letter: string;
  // If true, the world gen scatters patches of this resource on the
  // grand map. State resources are derived from the dominant tile
  // resource within each state. Resources with scatterOnMap=false
  // are state-only — assigned as fallbacks for states with no
  // dominant tile resource (FARMLAND, TRADE today).
  readonly scatterOnMap: boolean;
  // How many seed patches to place across the world. Actual count
  // may be lower if viable terrain is scarce.
  readonly patchCount: number;
  // Target tiles per patch (BFS-grown blob).
  readonly patchSize: number;
  // The building line whose buildings get a production boost on
  // states with this resource. null = no line is wired yet
  // (e.g. mining: the line ships in a later nail, but ORE states
  // already exist now — they'll just have no match-highlight
  // until then).
  readonly matchingLine: BuildingLineKey | null;
}

export const RESOURCE_DEFS: readonly ResourceDef[] = [
  {
    id: 0,
    key: 'farmland',
    label: 'farmland',
    color: 0xf3c14b,
    letter: 'F',
    scatterOnMap: false,
    patchCount: 0,
    patchSize: 0,
    matchingLine: 'settlement',
  },
  {
    id: 1,
    key: 'woods',
    label: 'forest',
    color: 0x4f8a3d,
    letter: 'W',
    scatterOnMap: true,
    patchCount: 16,
    patchSize: 22,
    matchingLine: 'forestry',
  },
  {
    id: 2,
    key: 'trade',
    label: 'trade hub',
    color: 0x3d7ab8,
    letter: 'T',
    scatterOnMap: false,
    patchCount: 0,
    patchSize: 0,
    matchingLine: 'merchant',
  },
  {
    id: 3,
    key: 'ore',
    label: 'ore',
    color: 0x8a7e6e,
    letter: 'O',
    scatterOnMap: true,
    patchCount: 14,
    patchSize: 18,
    // No mining line yet — see CLAUDE.md scoping notes.
    matchingLine: null,
  },
] as const;

// Ergonomic id constants. Keep in sync with the table above.
export const RES_FARMLAND = 0;
export const RES_WOODS = 1;
export const RES_TRADE = 2;
export const RES_ORE = 3;

// Tile-resource arrays use -1 to mean "no scattered resource on this
// tile" (most tiles).
export const RES_NONE = -1;

export function getResourceDef(id: number): ResourceDef {
  return RESOURCE_DEFS[id]!;
}

// Resources that scatter on the world grand map.
export function scatteredResourceDefs(): ResourceDef[] {
  return RESOURCE_DEFS.filter((d) => d.scatterOnMap);
}

// The matching building line for a given state resource (or null).
export function matchingLineFor(resourceId: number): BuildingLineKey | null {
  return RESOURCE_DEFS[resourceId]?.matchingLine ?? null;
}

// Fallback resources used when a state has no dominant scattered
// resource. Cycled deterministically so distribution is roughly
// even across the no-dominant states. Caller passes its own rng so
// the choice is seedable.
const FALLBACK_RESOURCES = [RES_FARMLAND, RES_TRADE];
export function fallbackResource(rng: () => number): number {
  return FALLBACK_RESOURCES[Math.floor(rng() * FALLBACK_RESOURCES.length)]!;
}
