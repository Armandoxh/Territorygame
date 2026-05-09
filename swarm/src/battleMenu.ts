// Battle action menu (#6.2). Three floating cards centered over the
// dirt: Attack, Simulate, Intimidate. Picking Simulate replaces the
// cards with a result panel that animates regiment counts down to
// their post-sim values.
//
// All HTML, no Pixi — sits in screen space outside worldContainer so
// pan/zoom doesn't move it. Mounted statically in index.html and
// shown / hidden via the .visible class.

import { UNIT_DEFS, type UnitType } from './units';
import type { Regiment } from './army';
import type { SimResult, SimOutcome } from './battleSim';

const OUTCOME_LABELS: Record<SimOutcome, string> = {
  enemy_destroyed: 'ENEMY ANNIHILATED',
  player_destroyed: 'PLAYER ANNIHILATED',
  mutual_destruction: 'MUTUAL DESTRUCTION',
};

export interface BattleMenuActions {
  onAttack(): void;
  onSimulate(): void;
  onIntimidate(): void;
  // Called when the user dismisses the result panel. The menu hides
  // itself; the host decides what to do next (typically: exit battle).
  onResultDismiss(): void;
}

export interface BattleMenu {
  show(): void;
  hide(): void;
  // Replace the three cards with the result panel and animate the
  // counters from `before` values to `after` values.
  showResult(result: SimResult): void;
}

const COUNTER_ANIM_MS = 800;

function regimentLine(label: string, count: number): string {
  return `${UNIT_DEFS[label as UnitType]?.shortLabel ?? label} ${count}`;
}

function formatRegimentLines(regs: readonly Regiment[]): string {
  if (regs.length === 0) return '∅';
  return regs.map((r) => regimentLine(r.type, r.count)).join(' · ');
}

export function createBattleMenu(actions: BattleMenuActions): BattleMenu {
  const root = document.getElementById('battle-menu') as HTMLDivElement | null;
  const cardsEl = document.getElementById('battle-menu-cards') as HTMLDivElement | null;
  const resultEl = document.getElementById('battle-menu-result') as HTMLDivElement | null;
  const titleEl = document.getElementById('battle-result-title') as HTMLDivElement | null;
  const playerLineEl = document.getElementById('battle-result-player') as HTMLDivElement | null;
  const enemyLineEl = document.getElementById('battle-result-enemy') as HTMLDivElement | null;
  const dismissBtn = document.getElementById('battle-result-dismiss') as HTMLButtonElement | null;

  if (!root || !cardsEl || !resultEl || !titleEl || !playerLineEl || !enemyLineEl || !dismissBtn) {
    throw new Error('battle menu DOM nodes missing');
  }

  cardsEl.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'attack') actions.onAttack();
      else if (action === 'simulate') actions.onSimulate();
      else if (action === 'intimidate') actions.onIntimidate();
    });
  });

  dismissBtn.addEventListener('click', () => actions.onResultDismiss());

  function show() {
    cardsEl!.hidden = false;
    resultEl!.hidden = true;
    root!.classList.add('visible');
  }

  function hide() {
    root!.classList.remove('visible');
    // Reset for next time.
    cardsEl!.hidden = false;
    resultEl!.hidden = true;
  }

  function showResult(result: SimResult) {
    cardsEl!.hidden = true;
    resultEl!.hidden = false;

    titleEl!.textContent = OUTCOME_LABELS[result.outcome];
    // Initial render: pre-sim counts. Then animate to post-sim.
    playerLineEl!.textContent = formatRegimentLines(result.player.before);
    enemyLineEl!.textContent = formatRegimentLines(result.enemy.before);

    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / COUNTER_ANIM_MS);
      // ease-out cubic so counts drop fast and settle.
      const e = 1 - Math.pow(1 - t, 3);
      const interp = (before: readonly Regiment[], after: readonly Regiment[]): Regiment[] => {
        return before.map((b, i) => {
          const a = after[i];
          const target = a ? a.count : 0;
          const v = Math.round(b.count + (target - b.count) * e);
          return { type: b.type, count: v };
        });
      };
      playerLineEl!.textContent = formatRegimentLines(interp(result.player.before, result.player.after));
      enemyLineEl!.textContent = formatRegimentLines(interp(result.enemy.before, result.enemy.after));
      if (t < 1) requestAnimationFrame(tick);
      else {
        // Snap to exact final values to avoid rounding drift.
        playerLineEl!.textContent = formatRegimentLines(result.player.after);
        enemyLineEl!.textContent = formatRegimentLines(result.enemy.after);
      }
    };
    requestAnimationFrame(tick);
  }

  return { show, hide, showResult };
}
