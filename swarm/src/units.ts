// Unit type catalog. The atomic kind of soldier. A regiment is a
// homogeneous block of one unit type; an army is a heterogeneous
// list of regiments. See port.md "Army composition model".
//
// Stats are per-soldier. The Simulate combat resolver in battleSim.ts
// uses them directly. The real per-soldier visible sim (#6.6+) will
// reuse the same numbers — these are not "abstract sim only" stats.

export type UnitType = 'infantry' | 'cavalry';

export interface UnitDef {
  id: UnitType;
  displayName: string;
  // Short label used in dense UI (readout line, regiment cards).
  shortLabel: string;
  // Damage dealt by one soldier per combat round.
  atk: number;
  // Armor — subtracted (scaled) from incoming damage per soldier.
  def: number;
  // Damage required to kill one soldier. Higher = harder to kill.
  hp: number;
  // Recruitment cost in "unit-time" — what a capital produces at 1/sec.
  // Stronger units cost more time per soldier (cavalry takes longer
  // than infantry). User picks the type to recruit; this is the cost.
  // Per-unit balance can shift after tactical battles ship.
  recruitCost: number;
}

export const UNIT_DEFS: Record<UnitType, UnitDef> = {
  // Baseline grunt: balanced atk + armor, soaks attacks via def. Fast
  // to recruit (1 unit-time / soldier).
  infantry: { id: 'infantry', displayName: 'Infantry', shortLabel: 'inf', atk: 1, def: 1, hp: 1, recruitCost: 1 },
  // Glass cannon: hits harder, slightly tougher individually, but
  // wears no meaningful armor. Slower to recruit (2 unit-time).
  cavalry: { id: 'cavalry', displayName: 'Cavalry', shortLabel: 'cav', atk: 2, def: 0, hp: 1.5, recruitCost: 2 },
};

export const UNIT_TYPES: UnitType[] = Object.keys(UNIT_DEFS) as UnitType[];
