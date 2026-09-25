import { BUILDABLE, BUILDINGS, PEASANT_COST, PEASANT_TRAIN_SECONDS, type BuildingKind, type Cost } from './config';
import type { Game } from './game';

/**
 * The single source of "what does my next tap do". Exactly one of these is
 * active; the bottom panel always spells it out (lesson #2).
 */
export type Mode =
  | { type: 'none' }
  | { type: 'units'; ids: Set<number> }
  | { type: 'building'; id: number }
  | { type: 'place'; kind: BuildingKind; tx: number; ty: number; builders: Set<number> };

export type HudAction =
  | 'idle' | 'all' | 'clear' | 'train' | 'confirm' | `build:${BuildingKind}`;

const costText = (c: Cost) =>
  Object.entries(c).map(([k, v]) => `${v} ${k}`).join(' · ') || 'free';

export class Hud {
  private top = document.getElementById('top')!;
  private panel = document.getElementById('panel')!;
  private toast = document.getElementById('toast')!;
  private lastTop = '';
  private lastPanel = '';
  private lastNotice = -1;

  constructor(onAction: (a: HudAction) => void) {
    this.panel.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (btn && !btn.disabled && btn.dataset.act) onAction(btn.dataset.act as HudAction);
    });
  }

  update(game: Game, mode: Mode): void {
    const top =
      `<span class="res wood">${Math.floor(game.stock.wood)}<small>wood</small></span>` +
      `<span class="res gold">${Math.floor(game.stock.gold)}<small>gold</small></span>` +
      `<span class="res pop">${game.popUsed}/${game.popCap}<small>pop</small></span>`;
    if (top !== this.lastTop) { this.top.innerHTML = top; this.lastTop = top; }

    const panel = this.panelHtml(game, mode);
    if (panel !== this.lastPanel) { this.panel.innerHTML = panel; this.lastPanel = panel; }

    if (game.notice && game.notice.at !== this.lastNotice) {
      this.lastNotice = game.notice.at;
      this.toast.textContent = game.notice.text;
      this.toast.classList.remove('show');
      void this.toast.offsetWidth; // restart the fade animation
      this.toast.classList.add('show');
    }
  }

  private panelHtml(game: Game, mode: Mode): string {
    const close = `<button class="x" data-act="clear" aria-label="deselect">✕</button>`;
    switch (mode.type) {
      case 'none': {
        const idle = game.idleUnits().length;
        return `<div class="hint">Tap a peasant or building to select it</div>
          <div class="row">
            <button data-act="idle" ${idle ? '' : 'disabled'}>Idle peasants: ${idle}</button>
            <button data-act="all">All peasants</button>
          </div>`;
      }
      case 'units': {
        const n = mode.ids.size;
        const builds = BUILDABLE.map((k) => {
          const d = BUILDINGS[k];
          const ok = game.canAfford(d.cost);
          return `<button class="card ${ok ? '' : 'poor'}" data-act="build:${k}">
            <b>${d.name}</b><small>${costText(d.cost)}</small></button>`;
        }).join('');
        return `<div class="head"><span>${n} peasant${n === 1 ? '' : 's'}</span>${close}</div>
          <div class="hint">Tap tree / mine = gather · site = build · ground = move</div>
          <div class="row">${builds}</div>`;
      }
      case 'building': {
        const b = game.buildings.get(mode.id);
        if (!b) return '';
        const d = BUILDINGS[b.kind];
        if (b.progress < 1) {
          return `<div class="head"><span>${d.name} — building ${Math.floor(b.progress * 100)}%</span>${close}</div>
            <div class="hint">Select peasants, then tap the site to help build</div>`;
        }
        let body = `<div class="hint">${d.blurb}</div>`;
        if (b.kind === 'hall') {
          const left = b.queue > 0 ? ` · next in ${Math.ceil(PEASANT_TRAIN_SECONDS - b.trainTimer)}s` : '';
          body += `<div class="row"><button class="card ${game.canAfford(PEASANT_COST) ? '' : 'poor'}" data-act="train">
            <b>Train peasant</b><small>${costText(PEASANT_COST)}</small></button>
            <div class="queue">queue ${b.queue}${left}</div></div>`;
        }
        return `<div class="head"><span>${d.name}</span>${close}</div>${body}`;
      }
      case 'place': {
        const d = BUILDINGS[mode.kind];
        const ok = game.canPlace(mode.kind, mode.tx, mode.ty);
        return `<div class="head"><span>Place ${d.name} <small>${costText(d.cost)}</small></span>${close}</div>
          <div class="hint">${ok ? 'Tap the map to move it · drag to pan' : 'Blocked — tap open grass'}</div>
          <div class="row"><button class="go" data-act="confirm" ${ok ? '' : 'disabled'}>✓ Build here</button></div>`;
      }
    }
  }
}
