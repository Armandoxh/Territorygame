// Strategic specialization. Each player picks ONE mastery for the game,
// which gates which buildings/units they can use and applies passive
// bonuses. The intended dynamic is rock-paper-scissors:
//
//   Air     dominates Ground (bombers reach inland turrets)
//   Naval   dominates Air    (warships shell coastal airstrips)
//   Ground  dominates Naval  (warships can't push past the coast)
//
// AI picks at spawn (weighted toward Ground so it remains the most
// common, sets up "ground vs the world" dynamics). Humans are prompted
// once on game start.

export type Mastery = 'ground' | 'air' | 'naval';

export interface MasteryDef {
  id: Mastery;
  name: string;
  /** One-line tagline shown in the picker. */
  tagline: string;
  /** Bullet list of perks shown under the tagline. */
  perks: readonly string[];
  /** Building/unit categories this mastery unlocks beyond the always-on
   *  basics (settlement, turret). */
  unlocked: {
    airstrip?: boolean;
    aa?: boolean;
    bombs?: boolean;
    ships?: boolean;
  };
}

export const MASTERIES: readonly MasteryDef[] = [
  {
    id: 'ground',
    name: 'GROUND',
    tagline: 'Fortress empire. Tank the world, strangle slowly.',
    perks: [
      '+25% troop growth',
      '+30% tile defense (compounds with turrets)',
      '+50% turret retaliation damage',
      '+50% full-region fortress bonus',
      'Locked: airstrip, AA, bombs, ships',
    ],
    unlocked: {},
  },
  {
    id: 'air',
    name: 'AIR',
    tagline: 'Strike at distance. Bombs reach inland fortresses.',
    perks: [
      'Unlocks airstrip, AA, bombers',
      '+25% bomb radius',
      'Bombs damage enemy ships caught in blast',
      'Locked: ships',
    ],
    unlocked: { airstrip: true, aa: true, bombs: true },
  },
  {
    id: 'naval',
    name: 'NAVAL',
    tagline: 'Project power from the sea. Shell coasts, hunt bombers.',
    perks: [
      'Unlocks all ships (Scout / Skirmisher / Warship)',
      '+2 ship cap, +25% reload speed',
      'Warships shell coastal tiles + capture them',
      'Skirmishers / warships shoot down enemy bombers',
      'Locked: airstrip, AA, bombs',
    ],
    unlocked: { ships: true },
  },
];

export function masteryById(id: string): MasteryDef | undefined {
  return MASTERIES.find(m => m.id === id);
}
