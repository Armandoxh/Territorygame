// End-of-game modal overlay. VICTORY / DEFEAT result with a "new map"
// button. Sits in screen space (HTML overlay), separate from battle
// menu so the two never conflict.

export type GameOverKind = 'victory' | 'defeat';

export interface GameModalActions {
  // Called when the user taps NEW MAP. The host typically calls
  // loadMap(newRandomSeed) in response.
  onRetry(): void;
}

export interface GameModal {
  show(kind: GameOverKind, subtitle: string): void;
  hide(): void;
}

export function createGameModal(actions: GameModalActions): GameModal {
  const root = document.getElementById('game-modal') as HTMLDivElement | null;
  const titleEl = document.getElementById('game-modal-title') as HTMLDivElement | null;
  const subEl = document.getElementById('game-modal-sub') as HTMLDivElement | null;
  const retryBtn = document.getElementById('game-modal-retry') as HTMLButtonElement | null;
  if (!root || !titleEl || !subEl || !retryBtn) {
    throw new Error('game modal DOM nodes missing');
  }

  retryBtn.addEventListener('click', () => actions.onRetry());

  function show(kind: GameOverKind, subtitle: string) {
    titleEl!.textContent = kind === 'victory' ? 'VICTORY' : 'DEFEAT';
    titleEl!.dataset.kind = kind;
    subEl!.textContent = subtitle;
    root!.classList.add('visible');
  }

  function hide() {
    root!.classList.remove('visible');
  }

  return { show, hide };
}
