// Unit type catalog. The atomic kind of soldier. A regiment is a
// homogeneous block of one unit type; an army is a heterogeneous
// list of regiments. See port.md "Army composition model".
//
// Stats relevant to combat (speed, hp, attack, range, etc.) will land
// alongside the per-soldier sim in nail #6.6. For #6.1 we only need
// identifying info: id and display name.

export type UnitType = 'infantry' | 'cavalry';

export interface UnitDef {
  id: UnitType;
  displayName: string;
  // Short label used in dense UI (readout line, regiment cards).
  shortLabel: string;
}

export const UNIT_DEFS: Record<UnitType, UnitDef> = {
  infantry: { id: 'infantry', displayName: 'Infantry', shortLabel: 'inf' },
  cavalry: { id: 'cavalry', displayName: 'Cavalry', shortLabel: 'cav' },
};

export const UNIT_TYPES: UnitType[] = Object.keys(UNIT_DEFS) as UnitType[];
