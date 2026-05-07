import type { RGBA } from './types.js';

// Generates a player color palette of size playerCount + 1. Index 0 is the
// unclaimed-land color (warm khaki); index 1 is the human (red, fixed for
// consistency); indices 2..N step around the hue circle using the golden
// angle so colors remain distinct even at high N.
export function generatePalette(playerCount: number): RGBA[] {
  const palette: RGBA[] = [
    [0x4a, 0x3e, 0x2e, 0xff], // unclaimed parchment
    [0xe8, 0x4a, 0x4a, 0xff], // human red
  ];

  const golden = 137.508;
  for (let i = 2; i <= playerCount; i++) {
    let h = ((i - 1) * golden + 55) % 360;
    if (h < 18 || h > 348) h = (h + 30) % 360; // avoid red band
    const sat = 0.62 + ((i % 4) * 0.05);
    const light = 0.55 + ((i % 3) * 0.04);
    palette.push(hslToRgba(h, sat, light));
  }
  return palette;
}

/** Team-aware palette. Every player on the same team shares a hue
 *  family, with shade variation per team-slot so they're still
 *  individually distinguishable. Human always anchors team 1
 *  (red family). Index 0 is unclaimed; indices 1..playerCount
 *  follow team layout (team 1 = ids 1..teamSize, team 2 = next
 *  teamSize, etc — must match _mkPlayer's teamId assignment). */
export function generateTeamPalette(playerCount: number, teamSize: number): RGBA[] {
  if (teamSize <= 1) return generatePalette(playerCount);
  const palette: RGBA[] = [
    [0x4a, 0x3e, 0x2e, 0xff], // unclaimed parchment
  ];
  // Team hue anchors. Team 1 = red (human-anchored), then golden-angle
  // around the wheel skipping the red band so teams don't blur together.
  const teamCount = Math.ceil(playerCount / teamSize);
  const teamHues: number[] = [0]; // team 1: pure red
  const golden = 137.508;
  for (let t = 2; t <= teamCount; t++) {
    let h = ((t - 1) * golden + 55) % 360;
    if (h < 18 || h > 348) h = (h + 30) % 360;
    teamHues.push(h);
  }
  // Within each team, vary lightness/saturation so members are still
  // tellable apart. Member 0 (the team captain / first player) is the
  // brightest; later members darken slightly.
  for (let i = 1; i <= playerCount; i++) {
    const teamIdx = Math.floor((i - 1) / teamSize); // 0-based
    const memberIdx = (i - 1) % teamSize;
    const h = teamHues[teamIdx]!;
    // Rotate hue slightly per member (±10°) so each team has a small
    // hue spread instead of identical-looking shades.
    const memberHueOffset = (memberIdx - (teamSize - 1) / 2) * (8 / Math.max(1, teamSize - 1));
    const memberHue = (h + memberHueOffset + 360) % 360;
    const sat = 0.70 - memberIdx * 0.05;
    const light = 0.58 - memberIdx * 0.04;
    palette.push(hslToRgba(memberHue, Math.max(0.40, sat), Math.max(0.34, light)));
  }
  return palette;
}

function hslToRgba(h: number, s: number, l: number): RGBA {
  h /= 360;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255];
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
