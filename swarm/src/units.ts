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
}

export const UNIT_DEFS: Record<UnitType, UnitDef> = {
  // Baseline grunt: balanced atk + armor, soaks attacks via def.
  infantry: { id: 'infantry', displayName: 'Infantry', shortLabel: 'inf', atk: 1, def: 1, hp: 1 },
  // Glass cannon: hits harder, slightly tougher individually, but
  // wears no meaningful armor.
  cavalry: { id: 'cavalry', displayName: 'Cavalry', shortLabel: 'cav', atk: 2, def: 0, hp: 1.5 },
};

export const UNIT_TYPES: UnitType[] = Object.keys(UNIT_DEFS) as UnitType[];
