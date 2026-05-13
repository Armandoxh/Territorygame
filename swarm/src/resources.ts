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

// Glyph styles for the grand-map (per-tile) renderer. Adding a new
// glyph kind: add an entry here and a matching draw function in
// mapResourceLayer.ts. 'circle' is the always-works fallback (small
// colored circle with the resource letter) so a freshly added
// resource is visible even before a custom glyph lands.
export type ResourceGlyph = 'mountain' | 'tree' | 'farm' | 'circle';

// Building line key — duplicated here as a string union so this
// module can stand alone (no circular import with buildings.ts).
// Keep in sync with BuildingLine in buildings.ts.
export type BuildingLineKey =
  | 'settlement'
  | 'farmland'
  | 'forestry'
  | 'mining'
  | 'merchant';

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
    // Bold wheat-gold. Punchy against grass green; reads at a
    // glance even with the player's tint stacked over it.
    color: 0xf2c11f,
    letter: 'F',
    glyph: 'farm',
    scatterOnMap: true,
    patchCount: 10,
    patchSize: 32,
    matchingLine: 'farmland',
  },
  {
    id: 1,
    key: 'woods',
    label: 'forest',
    // Deep saturated forest green. Distinct from the lighter
    // grass terrain underneath.
    color: 0x14541a,
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
    // Cool slate. Reads as rock against grass / forest greens.
    color: 0x4a4540,
    letter: 'O',
    glyph: 'mountain',
    scatterOnMap: true,
    patchCount: 14,
    patchSize: 18,
    matchingLine: 'mining',
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

// Build-eligibility rule:
//   - 'settlement' is universal (people live everywhere).
//   - All other lines REQUIRE the state's resource to match the
//     line. Farmland-only-on-farmland, mining-only-on-ore, etc.
// This is the core strategic constraint: to get a line's output
// you must control a matching state, which means the map's
// resource distribution dictates where the player needs to
// expand. Loosen this rule only by widening the predicate here.
export function canBuildOnState(resourceId: number, line: BuildingLineKey): boolean {
  if (line === 'settlement') return true;
  return matchingLineFor(resourceId) === line;
}

// Human-readable name of the resource a line needs to be buildable.
// Returns null for 'settlement' (no requirement) so callers can
// skip the hint. Used by the menu to show "requires X state".
export function requiredResourceLabelFor(line: BuildingLineKey): string | null {
  if (line === 'settlement') return null;
  for (const def of RESOURCE_DEFS) {
    if (def.matchingLine === line) return def.label;
  }
  return null;
}

// Fallback resource for states whose tiles contain no scattered
// resource at all. With farmland now also scattering, the natural
// fallback is TRADE — a "wherever nothing else grows, people set
// up commerce" interpretation. Kept as a function (taking rng) so
// it's trivial to widen later (e.g. multiple non-scatter fallbacks).
export function fallbackResource(_rng: () => number): number {
  return RES_TRADE;
}
