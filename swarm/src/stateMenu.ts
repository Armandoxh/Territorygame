// State build menu (DOM modal). Opens when the player taps a state
// in the region-zoom view. Shows the state's resource, the three
// building lines with current tier, and an upgrade button for each.
// Mobile-target: bottom-anchored card, big tap targets.
//
// No costs / no production effects this nail — buttons just bump
// the tier and refresh. The matching line gets a star marker so
// the player sees the resource/line pairing.

import { TIER_NAMES, maxTier, type BuildingLine } from './buildings';
import { getResourceDef, matchingLineFor } from './resources';

export interface StateMenuContext {
  stateId: number;
  regionId: number;
  // Resource id (index into RESOURCE_DEFS).
  resource: number;
  // Tier numbers (0..N) keyed by line name.
  tiers: Record<BuildingLine, number>;
  // True if the region containing this state is owned by the player.
  // False = readonly view (no build buttons enabled).
  ownedByPlayer: boolean;
}

export interface StateMenuActions {
  onBuild(stateId: number, line: BuildingLine): void;
  onClose(): void;
}

export interface StateMenu {
  show(ctx: StateMenuContext): void;
  hide(): void;
  isVisible(): boolean;
}

const LINES: BuildingLine[] = ['settlement', 'forestry', 'merchant'];

export function createStateMenu(actions: StateMenuActions): StateMenu {
  const root = document.getElementById('state-menu') as HTMLDivElement | null;
  const titleEl = document.getElementById('state-menu-title') as HTMLDivElement | null;
  const subEl = document.getElementById('state-menu-sub') as HTMLDivElement | null;
  const listEl = document.getElementById('state-menu-list') as HTMLDivElement | null;
  const closeBtn = document.getElementById('state-menu-close') as HTMLButtonElement | null;
  if (!root || !titleEl || !subEl || !listEl || !closeBtn) {
    throw new Error('state menu DOM nodes missing');
  }

  let current: StateMenuContext | null = null;

  closeBtn.addEventListener('click', () => {
    actions.onClose();
  });

  // Backdrop click (outside the card) also closes.
  root.addEventListener('click', (e) => {
    if (e.target === root) actions.onClose();
  });

  function show(ctx: StateMenuContext) {
    current = ctx;
    const def = getResourceDef(ctx.resource);
    titleEl!.textContent = `State ${ctx.regionId}.${ctx.stateId} · ${def.label}`;
    const matched = matchingLineFor(ctx.resource);
    if (!ctx.ownedByPlayer) {
      subEl!.textContent = 'enemy / unclaimed territory';
    } else if (matched) {
      subEl!.textContent = `match: ${lineLabel(matched)} (boost coming)`;
    } else {
      subEl!.textContent = 'no matching line yet (mining line pending)';
    }
    // Rebuild the rows from scratch each show — cheap, small list.
    listEl!.innerHTML = '';
    for (const line of LINES) {
      const tier = ctx.tiers[line];
      const max = maxTier(line);
      const row = document.createElement('div');
      row.className = 'state-menu-row';
      const label = document.createElement('div');
      label.className = 'state-menu-row-label';
      const tierName = TIER_NAMES[line][tier] ?? '?';
      const isMatch = matched !== null && line === matched;
      label.textContent = `${lineLabel(line)}${isMatch ? ' ★' : ''} · ${tierName} (${tier}/${max})`;
      row.appendChild(label);
      const btn = document.createElement('button');
      btn.className = 'state-menu-row-btn';
      if (!ctx.ownedByPlayer) {
        btn.disabled = true;
        btn.textContent = 'locked';
      } else if (tier >= max) {
        btn.disabled = true;
        btn.textContent = 'max';
      } else if (tier === 0) {
        btn.textContent = 'build';
      } else {
        btn.textContent = 'upgrade';
      }
      btn.addEventListener('click', () => {
        if (!current) return;
        actions.onBuild(current.stateId, line);
      });
      row.appendChild(btn);
      listEl!.appendChild(row);
    }
    root!.classList.add('visible');
  }

  function hide() {
    current = null;
    root!.classList.remove('visible');
  }

  function isVisible() {
    return root!.classList.contains('visible');
  }

  return { show, hide, isVisible };
}

function lineLabel(line: BuildingLine): string {
  if (line === 'settlement') return 'settlement';
  if (line === 'forestry') return 'forestry';
  if (line === 'merchant') return 'merchant';
  return line;
}
