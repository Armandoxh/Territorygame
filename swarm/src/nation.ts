// A faction in the game. The player is nation 0; AI nations follow.
// Designed for extensibility — new fields (gold, recruitment cooldown,
// unit upgrades, diplomacy) plug in without touching the engagement
// loop. Per the v2 big picture, battles aren't the only thing nations
// do; this struct should hold all the per-faction state that future
// systems care about.
//
// Per-nation army count is currently fixed at 1 (single Army instance).
// Multi-army support (drag-select / split / merge) is a future nail.

import type { Army } from './army';
import type { UnitType } from './units';

export interface Nation {
  id: number;
  // Display color. Map tints, capital marker, army glyph all derive
  // from this.
  color: number;
  // Where this nation started. Region id (not a tile coord). The
  // capital tile is the region's centroid — derived once at spawn.
  capitalRegionId: number;
  capitalX: number;
  capitalY: number;
  // The nation's army. null when the army has been destroyed in
  // combat. Per the design pick, destruction removes the visual but
  // keeps the Nation alive — the nation can still own regions and
  // lose its capital.
  army: Army | null;
  // Player vs AI behavior split.
  isPlayer: boolean;
  // True once another nation has captured this nation's capital
  // region. Set once, never unset. Eliminated AIs stop deciding;
  // an eliminated player triggers DEFEAT.
  eliminated: boolean;
  // For AIs: ms timestamp (performance.now scale) of the next
  // expansion decision. Jittered to avoid all AIs ticking in lockstep.
  nextDecideAtMs: number;
  // For AIs: when their capital is being besieged, an army from
  // elsewhere is recalled to defend. This stamp tracks the last
  // siege response so we don't redirect every frame.
  lastSiegeResponseAtMs: number;
  // Active capital-occupation in progress. Each nation can have at
  // most one capture in flight (their single army can only be near
  // one capital at a time). Capture progresses while the army stays
  // in radius and the target hasn't changed; resets on either change.
  captureProgress: { targetNationId: number; startedAtMs: number } | null;
  // Recruitment state. Each frame, recruitmentProgress accumulates at
  // getRecruitmentRate(nation) unit-time per second. When it reaches
  // the recruitmentPick unit's recruitCost, one soldier is added and
  // the cost is subtracted. Player can toggle the pick mid-game; AIs
  // stick to 'infantry' for now.
  recruitmentPick: UnitType;
  recruitmentProgress: number;
}
