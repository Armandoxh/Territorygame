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

/** Small inline icons so the HUD doesn't depend on emoji fonts. */
const ICON: Record<string, string> = {
  wood: '<svg viewBox="0 0 20 20"><rect x="2" y="6" width="16" height="8" rx="4" fill="#8a5a2e"/><ellipse cx="16" cy="10" rx="2.6" ry="4" fill="#d9ad6f"/><ellipse cx="16" cy="10" rx="1.2" ry="2" fill="#a97b45"/></svg>',
  gold: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" fill="#c79a1e"/><circle cx="10" cy="10" r="5.6" fill="#f4cc4a"/><path d="M7 8.5a3.4 3.4 0 0 1 3-2.4" stroke="#fff3c4" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>',
  pop: '<svg viewBox="0 0 20 20"><circle cx="10" cy="6" r="3.4" fill="#f1c7a0"/><path d="M4 18c0-4 2.6-7 6-7s6 3 6 7z" fill="#5b8fe6"/></svg>',
  house: '<svg viewBox="0 0 24 24"><path d="M3 11 12 4l9 7z" fill="#b2452f"/><rect x="5" y="11" width="14" height="9" fill="#eadbc0"/><rect x="10.5" y="14" width="3" height="6" fill="#4a2e18"/></svg>',
  mill: '<svg viewBox="0 0 24 24"><path d="M3 11 12 5l9 6z" fill="#5d7a55"/><rect x="5" y="11" width="14" height="9" fill="#a77a4c"/><circle cx="8" cy="18" r="2.4" fill="#6b4526"/><circle cx="12.5" cy="18" r="2.4" fill="#6b4526"/></svg>',
  peasant: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="6" ry="2" fill="#e3c56b"/><circle cx="12" cy="8" r="3.4" fill="#f1c7a0"/><rect x="7.5" y="11.5" width="9" height="9" rx="3" fill="#2f6fd6"/></svg>',
};
const icon = (k: string) => `<i class="ic">${ICON[k] ?? ''}</i>`;

const costText = (c: Cost) =>
  Object.entries(c).map(([k, v]) => `${icon(k)}${v}`).join(' ') || 'free';

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
      `<span class="res">${icon('wood')}${Math.floor(game.stock.wood)}</span>` +
      `<span class="res">${icon('gold')}${Math.floor(game.stock.gold)}</span>` +
      `<span class="res ${game.popUsed >= game.popCap ? 'full' : ''}">${icon('pop')}${game.popUsed}/${game.popCap}</span>`;
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
            ${icon(k)}<span><b>${d.name}</b><small>${costText(d.cost)}</small></span></button>`;
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
            ${icon('peasant')}<span><b>Train peasant</b><small>${costText(PEASANT_COST)}</small></span></button>
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
