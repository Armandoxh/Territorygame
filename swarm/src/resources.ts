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

// Glyph styles for the grand-map (per-tile) renderer. Adding a new
// glyph kind: add an entry here and a matching draw function in
// mapResourceLayer.ts. 'circle' is the always-works fallback (small
// colored circle with the resource letter) so a freshly added
// resource is visible even before a custom glyph lands.
export type ResourceGlyph = 'mountain' | 'tree' | 'farm' | 'circle';

export interface ResourceDef {
  // id is the index of this entry in RESOURCE_DEFS. Used as the
  // value in World.resourceOf and State.resource arrays.
  readonly id: number;
  // Short machine key. Doubles as the rendered glyph fallback.
  readonly key: string;
  // UI label in the build menu and overlays.
  readonly label: string;
  // 0xRRGGBB. Tile-level icons, state-level icons, and menu badges
  // all share this color (used both for the painted glyph and the
  // fallback circle).
  readonly color: number;
  // Single-letter glyph rendered on the circle fallback.
  readonly letter: string;
  // Style of the per-tile grand-map glyph. State-only resources
  // (scatterOnMap=false) can leave this as 'circle' — they aren't
  // drawn on the grand map anyway.
  readonly glyph: ResourceGlyph;
  // If true, the world gen scatters patches of this resource on the
  // grand map. State resources are derived from the dominant tile
  // resource within each state. Resources with scatterOnMap=false
  // are state-only — assigned as fallbacks for states with no
  // dominant tile resource (TRADE today).
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
    color: 0xd4a93a,
    letter: 'F',
    glyph: 'farm',
    scatterOnMap: true,
    patchCount: 10,
    patchSize: 32,   // larger, sprawled fields
    matchingLine: 'settlement',
  },
  {
    id: 1,
    key: 'woods',
    label: 'forest',
    color: 0x2e6520,
    letter: 'W',
    glyph: 'tree',
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
    glyph: 'circle',
    scatterOnMap: false,
    patchCount: 0,
    patchSize: 0,
    matchingLine: 'merchant',
  },
  {
    id: 3,
    key: 'ore',
    label: 'ore',
    color: 0x6e6862,
    letter: 'O',
    glyph: 'mountain',
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

// Fallback resource for states whose tiles contain no scattered
// resource at all. With farmland now also scattering, the natural
// fallback is TRADE — a "wherever nothing else grows, people set
// up commerce" interpretation. Kept as a function (taking rng) so
// it's trivial to widen later (e.g. multiple non-scatter fallbacks).
export function fallbackResource(_rng: () => number): number {
  return RES_TRADE;
}
