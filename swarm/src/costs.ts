// Build costs — the drain side of the economy. Each line + tier
// pair has a cost in one or more currencies. Spending happens once
// at build time (no maintenance costs yet); the production rate
// then runs forever.
//
// Cost shape per tier is thematic:
//   settlement -> wood (housing timber)
//   farmland   -> pop + wood (workers + tools)
//   forestry   -> pop (workers; the trees are free)
//   mining     -> pop + wood (workers + mineshaft supports)
//   merchant   -> gold + wood (capital + market stalls)
// Growth is roughly 3x per tier so each upgrade is a real
// decision, not an automatic next-step.
//
// Adding a new line or tier: just append to COSTS. Adding a new
// CURRENCY: it auto-flows through canAfford / payCost since they
// iterate Object.entries on the cost record.

import type { BuildingLine } from './buildings';
import type { Currency, Economy } from './economy';

// Single-build cost. Sparse map (any currency missing = 0 cost in
// that currency). Empty record = totally free.
export type CostRecord = Partial<Record<Currency, number>>;

// Indexed [tier]. tier 0 is the "not built yet" placeholder — you
// can't build tier 0, so its slot is always {}.
const COSTS: Record<BuildingLine, readonly CostRecord[]> = {
  settlement: [
    {},
    { wood: 10 },
    { wood: 30 },
    { wood: 80 },
  ],
  farmland: [
    {},
    { pop: 10, wood: 5 },
    { pop: 30, wood: 15 },
    { pop: 80, wood: 40 },
  ],
  forestry: [
    {},
    { pop: 10 },
    { pop: 30 },
    { pop: 80 },
  ],
  mining: [
    {},
    { pop: 15, wood: 10 },
    { pop: 40, wood: 30 },
    { pop: 100, wood: 80 },
  ],
  merchant: [
    {},
    { gold: 5, wood: 10 },
    { gold: 20, wood: 30 },
    { gold: 60, wood: 80 },
  ],
};

export function costFor(line: BuildingLine, tier: number): CostRecord {
  return COSTS[line]?.[tier] ?? {};
}

export function canAfford(econ: Economy, line: BuildingLine, tier: number): boolean {
  const cost = costFor(line, tier);
  for (const k in cost) {
    const c = k as Currency;
    if (econ[c] < (cost[c] ?? 0)) return false;
  }
  return true;
}

// Deducts the cost from the economy in place. Caller MUST have
// checked canAfford first — this function does no validation and
// will happily drive economy negative.
export function payCost(econ: Economy, line: BuildingLine, tier: number): void {
  const cost = costFor(line, tier);
  for (const k in cost) {
    const c = k as Currency;
    econ[c] -= cost[c] ?? 0;
  }
}

// Returns "30 wood" / "30 pop, 15 wood" / "free" for the menu.
// Order is fixed by Object.keys insertion order (which is the
// table order above — kept thematic-grouped for readability).
export function formatCost(line: BuildingLine, tier: number): string {
  const cost = costFor(line, tier);
  const parts: string[] = [];
  for (const k in cost) {
    parts.push(`${cost[k as Currency]} ${k}`);
  }
  return parts.length === 0 ? 'free' : parts.join(', ');
}

// Returns "need 18 wood" if not affordable, '' if affordable.
// Shown on unaffordable tier cards to tell the player what's
// missing. Picks the LARGEST shortfall (most blocking constraint)
// so the message stays one short line.
export function shortfallText(econ: Economy, line: BuildingLine, tier: number): string {
  const cost = costFor(line, tier);
  let worstC: Currency | null = null;
  let worstShort = 0;
  for (const k in cost) {
    const c = k as Currency;
    const short = (cost[c] ?? 0) - econ[c];
    if (short > worstShort) {
      worstShort = short;
      worstC = c;
    }
  }
  if (!worstC) return '';
  return `need ${Math.ceil(worstShort)} more ${worstC}`;
}
