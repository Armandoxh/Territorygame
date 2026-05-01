// Generates a player color palette of size n+1 (index 0 = unclaimed land).
// Player 1 is always red (the human). Other slots step around the hue circle
// using the golden angle so colors stay distinct even at high counts.
function generatePalette(playerCount) {
  const palette = [[0x3d, 0x33, 0x24, 0xff]];
  palette.push([0xe8, 0x4a, 0x4a, 0xff]);

  const golden = 137.508;
  for (let i = 2; i <= playerCount; i++) {
    const hue = ((i - 1) * golden + 55) % 360;
    // Avoid colors too close to red (human) by nudging hues in the 350-15 band.
    let h = hue;
    if (h < 18 || h > 348) h = (h + 30) % 360;
    const sat = 0.62 + ((i % 4) * 0.05);
    const light = 0.55 + ((i % 3) * 0.04);
    palette.push(hslToRgba(h, sat, light));
  }
  return palette;
}

function hslToRgba(h, s, l) {
  h /= 360;
  let r, g, b;
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

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
