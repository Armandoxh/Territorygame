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
