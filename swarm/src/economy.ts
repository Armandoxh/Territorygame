// Per-nation economy: the five currencies produced by buildings, and
// the rate table that says how fast each tier yields.
//
// Currency layout is 1:1 with BuildingLine — each line produces one
// currency. The matching-line rule (resources.ts) gates buildability;
// THIS module gates output. Production rates are constant — the only
// variability comes from tier (base rate per tier) and the matching
// boost (2x when the state's resource matches the line).
//
// No costs / no spending this nail. Resources accumulate; future
// nails (build costs, army costs, victory conditions) consume from
// the same accumulator.

import type { BuildingLine } from './buildings';

export type Currency = 'pop' | 'food' | 'wood' | 'ore' | 'gold';

export const CURRENCIES: readonly Currency[] = ['pop', 'food', 'wood', 'ore', 'gold'];

export interface Economy {
  pop: number;
  food: number;
  wood: number;
  ore: number;
  gold: number;
}

export function emptyEconomy(): Economy {
  return { pop: 0, food: 0, wood: 0, ore: 0, gold: 0 };
}

// Each line's output is paid into exactly one currency. Settlement
// makes people; farmland feeds them; forestry/mining produce raw
// materials; merchant generates gold.
const LINE_CURRENCY: Record<BuildingLine, Currency> = {
  settlement: 'pop',
  farmland: 'food',
  forestry: 'wood',
  mining: 'ore',
  merchant: 'gold',
};

export function currencyForLine(line: BuildingLine): Currency {
  return LINE_CURRENCY[line];
}

// Base output rate in units/sec, indexed by tier (0..3). Tier 0
// means "not built" — outputs nothing. Tuning intent:
//   - Tier 1 = a trickle, visible-but-slow
//   - Tier 2 = noticeable income from a single state
//   - Tier 3 = a fully-developed state is a real economic engine
const BASE_RATE_PER_TIER: readonly number[] = [0, 1, 3, 7];

// Multiplier applied when the line matches the state's resource.
// 2x is the "★ pays off" payoff for taking the right kind of land.
// Settlement is universal (no matching resource) — it never gets
// this boost; see productionRate below.
const MATCH_BOOST = 2;

// Output rate (units/sec) for a building of this line+tier on a
// state. `isMatching` should be true iff the state's resource maps
// to this line via resources.matchingLineFor — caller does the
// lookup so this module stays decoupled from resources.ts.
export function productionRate(
  line: BuildingLine,
  tier: number,
  isMatching: boolean,
): number {
  if (tier <= 0) return 0;
  const base = BASE_RATE_PER_TIER[tier] ?? 0;
  // Settlement is universal — the matching-boost rule doesn't apply
  // (settlement has no resource match by definition).
  if (line === 'settlement') return base;
  return isMatching ? base * MATCH_BOOST : base;
}

// Pretty short label for the currency. Used in the readout.
const CURRENCY_LABEL: Record<Currency, string> = {
  pop: 'pop',
  food: 'food',
  wood: 'wood',
  ore: 'ore',
  gold: 'gold',
};

export function currencyLabel(c: Currency): string {
  return CURRENCY_LABEL[c];
}
