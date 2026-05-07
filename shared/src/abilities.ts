// Active commander abilities — cooldown-based, paid from the leader's
// treasury (separate from operational gold). Distinct from passive
// decrees: each fire is a tactical commitment with a now-or-never cost
// and a fixed duration of effect.

export type AbilityId = 'rally' | 'reinforcements' | 'spy-report' | 'embargo' | 'blitzkrieg' | 'tank-rush';

export interface Ability {
  id: AbilityId;
  name: string;
  desc: string;
  /** Treasury cost per fire. */
  cost: number;
  /** Ticks until the ability can be fired again. */
  cooldown: number;
  /** Ticks the buff/debuff lasts (or 0 for instant effects). */
  duration: number;
  /** Whether the ability requires picking an enemy player. */
  needsEnemy: boolean;
}

export const ABILITIES: readonly Ability[] = [
  { id: 'rally',          name: 'Rally',
    desc: '+50% attack rate empire-wide for 20s.',
    cost: 800, cooldown: 600, duration: 200, needsEnemy: false },
  { id: 'reinforcements', name: 'Reinforcements',
    desc: '+3000 troops instantly. Empire-wide growth halts 20s.',
    cost: 600, cooldown: 450, duration: 200, needsEnemy: false },
  { id: 'spy-report',     name: 'Spy Report',
    desc: 'Reveal all enemy troop counts + targets, 30s.',
    cost: 200, cooldown: 300, duration: 300, needsEnemy: false },
  { id: 'embargo',        name: 'Trade Embargo',
    desc: 'Target enemy gold income −40% for 30s.',
    cost: 600, cooldown: 600, duration: 300, needsEnemy: true },
  // Ground active abilities — parallel to bomb/ship investments so
  // ground mastery has a late-game push card too.
  { id: 'blitzkrieg',     name: 'Blitzkrieg',
    desc: 'Each vassal claims up to 10 tiles deep along its frontier, ignoring defense. Per-vassal 30s cooldown.',
    cost: 900, cooldown: 300, duration: 0, needsEnemy: false },
  { id: 'tank-rush',      name: 'Tank Rush',
    desc: '+100% attacker combat power empire-wide for 15s — armor steamrolls everything in its path.',
    cost: 1100, cooldown: 800, duration: 150, needsEnemy: false },
];

export function abilityById(id: string): Ability | undefined {
  return ABILITIES.find(a => a.id === id);
}

export type AbilityError =
  | 'gold' | 'cooldown' | 'dead' | 'unknown' | 'no-target' | 'bad-target';
