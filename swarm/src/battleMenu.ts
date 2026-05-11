// Battle action menu (#6.2). Three floating cards centered over the
// dirt: Attack, Simulate, Intimidate. Above the cards, a small panel
// shows each side's composition so the player can make an informed
// pick. Picking Simulate swaps to a result panel that walks through
// the battle one round at a time, animating regiment counts and a
// force bar per side until the outcome is decided.
//
// All HTML, no Pixi — sits in screen space outside worldContainer so
// pan/zoom doesn't move it.

import { UNIT_DEFS, type UnitType } from './units';
import type { Regiment } from './army';
import type { SimResult, SimOutcome, SimSnapshot } from './battleSim';

const OUTCOME_LABELS: Record<SimOutcome, string> = {
  enemy_destroyed: 'ENEMY ANNIHILATED',
  player_destroyed: 'PLAYER ANNIHILATED',
  mutual_destruction: 'MUTUAL DESTRUCTION',
};

// Per-snapshot dwell time. Total animation is capped at ANIM_BUDGET_MS
// — for long battles (e.g. MAX_ROUNDS=60 stalemate) snapshots compress
// to fit so the user doesn't watch a 20s grind.
const PER_ROUND_MS = 300;
const ANIM_BUDGET_MS = 3500;

export interface BattleMenuActions {
  onAttack(): void;
  onSimulate(): void;
  onIntimidate(): void;
  // Called when the user dismisses the result panel. The menu hides
  // itself; the host decides what to do next (typically: exit battle).
  onResultDismiss(): void;
}

export interface BattleMenu {
  // Open the menu with each side's current composition shown above
  // the three action cards.
  show(playerRegiments: readonly Regiment[], enemyRegiments: readonly Regiment[]): void;
  hide(): void;
  // Replace the cards with the result panel and animate the battle
  // round-by-round.
  showResult(result: SimResult): void;
}

function regimentLine(label: string, count: number): string {
  return `${UNIT_DEFS[label as UnitType]?.shortLabel ?? label} ${count}`;
}

function formatRegimentLines(regs: readonly Regiment[]): string {
  if (regs.length === 0) return '∅';
  return regs.map((r) => regimentLine(r.type, r.count)).join(' · ');
}

export function createBattleMenu(actions: BattleMenuActions): BattleMenu {
  const root = document.getElementById('battle-menu') as HTMLDivElement | null;
  const preEl = document.getElementById('battle-menu-pre') as HTMLDivElement | null;
  const compPlayerEl = document.getElementById('battle-comp-player') as HTMLSpanElement | null;
  const compEnemyEl = document.getElementById('battle-comp-enemy') as HTMLSpanElement | null;
  const cardsEl = document.getElementById('battle-menu-cards') as HTMLDivElement | null;
  const resultEl = document.getElementById('battle-menu-result') as HTMLDivElement | null;
  const titleEl = document.getElementById('battle-result-title') as HTMLDivElement | null;
  const roundEl = document.getElementById('battle-result-round') as HTMLDivElement | null;
  const playerLineEl = document.getElementById('battle-result-player') as HTMLSpanElement | null;
  const enemyLineEl = document.getElementById('battle-result-enemy') as HTMLSpanElement | null;
  const playerBarEl = document.getElementById('battle-result-player-bar') as HTMLDivElement | null;
  const enemyBarEl = document.getElementById('battle-result-enemy-bar') as HTMLDivElement | null;
  const dismissBtn = document.getElementById('battle-result-dismiss') as HTMLButtonElement | null;

  if (
    !root || !preEl || !compPlayerEl || !compEnemyEl ||
    !cardsEl || !resultEl || !titleEl || !roundEl ||
    !playerLineEl || !enemyLineEl || !playerBarEl || !enemyBarEl || !dismissBtn
  ) {
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

  // Walks the snapshot list and updates the result panel on a timeout
  // schedule. Stored as a closure-scoped handle so hide() can cancel
  // any in-flight animation before reopening.
  let animTimer: ReturnType<typeof setTimeout> | null = null;
  function cancelAnim() {
    if (animTimer !== null) {
      clearTimeout(animTimer);
      animTimer = null;
    }
  }

  function renderSnapshot(s: SimSnapshot, refPower: number, roundIndex: number, totalRounds: number) {
    roundEl!.textContent = totalRounds > 0 ? `Round ${roundIndex} / ${totalRounds}` : 'Resolved';
    playerLineEl!.textContent = formatRegimentLines(s.player);
    enemyLineEl!.textContent = formatRegimentLines(s.enemy);
    const pct = (power: number) => `${Math.max(0, Math.min(100, (power / refPower) * 100))}%`;
    playerBarEl!.style.width = pct(s.playerPower);
    enemyBarEl!.style.width = pct(s.enemyPower);
  }

  function show(playerRegiments: readonly Regiment[], enemyRegiments: readonly Regiment[]) {
    cancelAnim();
    preEl!.hidden = false;
    cardsEl!.hidden = false;
    resultEl!.hidden = true;
    compPlayerEl!.textContent = formatRegimentLines(playerRegiments);
    compEnemyEl!.textContent = formatRegimentLines(enemyRegiments);
    root!.classList.add('visible');
  }

  function hide() {
    cancelAnim();
    root!.classList.remove('visible');
    // Reset internal panels so the next open starts from the cards
    // view, not whatever was last shown.
    preEl!.hidden = false;
    cardsEl!.hidden = false;
    resultEl!.hidden = true;
    dismissBtn!.hidden = true;
    titleEl!.textContent = 'IN PROGRESS';
  }

  function showResult(result: SimResult) {
    cancelAnim();
    preEl!.hidden = true;
    cardsEl!.hidden = true;
    resultEl!.hidden = false;
    dismissBtn!.hidden = true;
    titleEl!.textContent = 'IN PROGRESS';

    // Compute per-snapshot dwell so total animation fits the budget.
    const perStep =
      result.snapshots.length > 0
        ? Math.min(PER_ROUND_MS, ANIM_BUDGET_MS / result.snapshots.length)
        : PER_ROUND_MS;

    // Render snapshot 0 (pre-fight) immediately, then schedule the rest.
    renderSnapshot(result.snapshots[0]!, result.refPower, 0, result.rounds);

    let i = 1;
    function step() {
      if (i >= result.snapshots.length) {
        // Animation finished — reveal outcome label + dismiss.
        titleEl!.textContent = OUTCOME_LABELS[result.outcome];
        dismissBtn!.hidden = false;
        animTimer = null;
        return;
      }
      renderSnapshot(result.snapshots[i]!, result.refPower, i, result.rounds);
      i++;
      animTimer = setTimeout(step, perStep);
    }
    // Tiny initial pause so the user reads the pre-fight state before
    // anything moves.
    animTimer = setTimeout(step, perStep);
  }

  return { show, hide, showResult };
}
