// State build menu (DOM modal). Opens when the player taps a state
// in the region-zoom view.
//
// Layout: a tab strip across the top — one tab per building line
// (settlement / farmland / forestry / mining / merchant). The
// matching line for the state's resource gets a ★ on its tab and
// auto-activates when the menu opens.
//
// Below the tabs: three tier cards (tier 1, 2, 3) showing the
// progression for the active line. Tier states:
//   - built     — already constructed (green check)
//   - available — your current tier + 1 is buildable (tap to build)
//   - locked    — needs the prior tier first (greyed out)
//
// Mobile-target: 360×740. Card sits at the bottom, tap targets are
// generously sized.

import {
  TIER_NAMES,
  maxTier,
  BUILDING_LINES,
  type BuildingLine,
} from './buildings';
import {
  getResourceDef,
  matchingLineFor,
  canBuildOnState,
  requiredResourceLabelFor,
} from './resources';
import { canAfford, formatCost, shortfallText } from './costs';
import type { Economy } from './economy';

export interface StateMenuContext {
  stateId: number;
  regionId: number;
  resource: number;  // resource id (index into RESOURCE_DEFS)
  // Tier numbers (0..N) keyed by line name.
  tiers: Record<BuildingLine, number>;
  // True if the region containing this state is owned by the player.
  // False = readonly view (no build buttons enabled).
  ownedByPlayer: boolean;
  // Player's current currency totals. Used to compute affordability
  // for each tier card. Passed by snapshot, not by reference — the
  // menu re-renders after every build so it stays current.
  economy: Economy;
}

export interface StateMenuActions {
  // Player tapped a buildable tier. The line and tier come from the
  // user's choice — main.ts validates and bumps the tier.
  onBuild(stateId: number, line: BuildingLine, tier: number): void;
  onClose(): void;
}

export interface StateMenu {
  show(ctx: StateMenuContext): void;
  hide(): void;
  isVisible(): boolean;
}

export function createStateMenu(actions: StateMenuActions): StateMenu {
  const root = document.getElementById('state-menu') as HTMLDivElement | null;
  const titleEl = document.getElementById('state-menu-title') as HTMLDivElement | null;
  const subEl = document.getElementById('state-menu-sub') as HTMLDivElement | null;
  const tabsEl = document.getElementById('state-menu-tabs') as HTMLDivElement | null;
  const tiersEl = document.getElementById('state-menu-tiers') as HTMLDivElement | null;
  const closeBtn = document.getElementById('state-menu-close') as HTMLButtonElement | null;
  if (!root || !titleEl || !subEl || !tabsEl || !tiersEl || !closeBtn) {
    throw new Error('state menu DOM nodes missing');
  }

  let current: StateMenuContext | null = null;
  // Which line's tier list is being shown. Reset on each open to the
  // state's matching line (or settlement as the universal fallback).
  let activeLine: BuildingLine = 'settlement';

  closeBtn.addEventListener('click', () => actions.onClose());
  root.addEventListener('click', (e) => {
    if (e.target === root) actions.onClose();
  });

  function show(ctx: StateMenuContext) {
    current = ctx;
    const def = getResourceDef(ctx.resource);
    const matched = matchingLineFor(ctx.resource);
    titleEl!.textContent = `State ${ctx.regionId}.${ctx.stateId} · ${def.label}`;
    if (!ctx.ownedByPlayer) {
      subEl!.textContent = 'enemy / unclaimed territory — read-only';
    } else if (matched) {
      subEl!.textContent = `${def.label} matches ${lineLabel(matched)} — boost coming`;
    } else {
      subEl!.textContent = 'no matching production line yet';
    }
    // Default active line: matching one if there is one, else
    // settlement (universal — every state can grow people).
    activeLine = matched ?? 'settlement';
    renderTabs(matched);
    renderTiers();
    root!.classList.add('visible');
  }

  function hide() {
    current = null;
    root!.classList.remove('visible');
  }

  function isVisible() {
    return root!.classList.contains('visible');
  }

  function renderTabs(matched: BuildingLine | null) {
    if (!current) return;
    tabsEl!.innerHTML = '';
    for (const line of BUILDING_LINES) {
      const tab = document.createElement('button');
      tab.className = 'state-menu-tab';
      tab.type = 'button';
      tab.dataset.line = line;
      const isMatch = matched !== null && line === matched;
      const buildable = canBuildOnState(current.resource, line);
      // ★ marker on the matching line so the player sees the
      // resource/line pairing at a glance.
      tab.textContent = `${lineLabel(line)}${isMatch ? ' ★' : ''}`;
      if (line === activeLine) tab.classList.add('active');
      if (isMatch) tab.classList.add('match');
      if (!buildable) tab.classList.add('disabled');
      // Tabs are still tappable when disabled — the player should
      // be able to click in and see WHY the line is locked (the
      // tier cards explain it). Just visually dim them.
      tab.addEventListener('click', () => {
        if (activeLine === line) return;
        activeLine = line;
        for (const child of Array.from(tabsEl!.children)) {
          child.classList.toggle('active', (child as HTMLElement).dataset.line === line);
        }
        renderTiers();
      });
      tabsEl!.appendChild(tab);
    }
  }

  function renderTiers() {
    if (!current) return;
    tiersEl!.innerHTML = '';
    const currentTier = current.tiers[activeLine];
    const max = maxTier(activeLine);
    const tierNames = TIER_NAMES[activeLine];
    const buildable = canBuildOnState(current.resource, activeLine);
    const requiredLabel = requiredResourceLabelFor(activeLine);
    // Tiers 1..max — index 0 in TIER_NAMES is the "empty" placeholder
    // that we never show as a card.
    for (let t = 1; t <= max; t++) {
      const card = document.createElement('div');
      card.className = 'state-menu-tier';
      const isBuilt = currentTier >= t;
      const prevTierBuilt = currentTier === t - 1;
      const affordable = canAfford(current.economy, activeLine, t);
      const cost = formatCost(activeLine, t);
      // Five mutually-exclusive states. Order of checks matters:
      //   built       -> already constructed
      //   locked      -> wrong resource for the line, OR previous tier not built
      //   unaffordable -> would be available but currency shortfall
      //   available   -> tappable
      if (isBuilt) {
        card.classList.add('built');
      } else if (!buildable || !prevTierBuilt) {
        card.classList.add('locked');
      } else if (!affordable) {
        card.classList.add('unaffordable');
      } else {
        card.classList.add('available');
      }
      const head = document.createElement('div');
      head.className = 'state-menu-tier-head';
      head.textContent = `tier ${t} · ${tierNames[t] ?? '?'}`;
      card.appendChild(head);
      // Cost line. Shown for all non-built tiers (you don't see cost
      // for something you've already paid for). 'free' for tier-1
      // settlement is technically not the case (settlement t1 is
      // 10 wood), but the formatCost helper handles it generically.
      if (!isBuilt) {
        const costEl = document.createElement('div');
        costEl.className = 'state-menu-tier-cost';
        costEl.textContent = `cost: ${cost}`;
        card.appendChild(costEl);
      }
      const status = document.createElement('div');
      status.className = 'state-menu-tier-status';
      if (isBuilt) {
        status.textContent = '✓ built';
      } else if (!current.ownedByPlayer) {
        status.textContent = 'enemy territory';
      } else if (!buildable) {
        status.textContent = requiredLabel ? `requires ${requiredLabel} state` : 'unavailable';
      } else if (!prevTierBuilt) {
        status.textContent = `needs tier ${t - 1}`;
      } else if (!affordable) {
        status.textContent = shortfallText(current.economy, activeLine, t);
      } else {
        status.textContent = 'tap to build';
        card.addEventListener('click', () => {
          if (!current) return;
          actions.onBuild(current.stateId, activeLine, t);
        });
        card.classList.add('clickable');
      }
      card.appendChild(status);
      tiersEl!.appendChild(card);
    }
  }

  return { show, hide, isVisible };
}

function lineLabel(line: BuildingLine): string {
  // Direct identity for now — the type union and the displayed text
  // are the same. Branch here if we want shorter mobile names.
  return line;
}
