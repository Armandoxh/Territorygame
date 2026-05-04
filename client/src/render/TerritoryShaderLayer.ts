import { Sprite, Texture, Filter, GlProgram, UniformGroup } from 'pixi.js';
import { Territory, TERRAIN_LAND, TERRAIN_WATER, TERRAIN_DEEP } from '@territorygame/shared';
import type { GameConfig } from '@territorygame/shared';

// GPU-driven territory rendering. The territory texture stores per-tile
// state in three channels:
//
//   R = owner id (0 = unclaimed, 1..254 = player)
//   G = terrain kind (0 = land, 1 = shallow water, 2 = deep water)
//   B = tick stamp byte (tickCount & 0xFF) — written every time a tile is
//       repainted from the dirty set. The shader compares this against the
//       current uTickByte uniform to fade in a pulse highlight on tiles
//       that were just claimed (or lost). Wraps every 256 ticks (~25.6s
//       at 10 Hz) — fine since the pulse duration is ~1.5s.
//
// A custom fragment shader reads those bytes plus a player-color palette
// uniform and renders the gritty parchment / ink-border / water look without
// any per-tile CPU work after the initial fill. Per-tick cost is just a
// canvas patch over the dirty tiles, same as before.

const VERT = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition() {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord() {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main() {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;        // (w, h, 1/w, 1/h)

uniform float uTime;
uniform float uTickByte;
uniform float uPulseDuration;
uniform float uPlayerCount;
uniform vec3 uPalette[64];
uniform vec3 uParchment;
uniform vec3 uWaterShallow;
uniform vec3 uWaterDeep;
uniform vec3 uInk;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p *= 2.05;
    a *= 0.55;
  }
  return v;
}

void main() {
  vec2 uv = vTextureCoord;
  vec2 texel = uInputSize.zw;

  vec4 src = texture(uTexture, uv);
  float ownerF   = src.r * 255.0;
  float terrainF = src.g * 255.0;
  int owner   = int(ownerF + 0.5);
  int terrain = int(terrainF + 0.5);

  vec2 tileP = uv * uInputSize.xy;
  float grain = fbm(tileP * 0.45) * 0.5 + fbm(tileP * 1.7) * 0.18 - 0.34;

  vec3 col;
  if (terrain >= 1) {
    // Layered water: long swell + small chop + faux directional waves.
    // Each octave drifts at a different speed/direction so they don't
    // resonate into a tiled pattern.
    float t = (terrain == 2) ? 0.0 : 1.0;
    vec2 swellP = tileP * 0.08 + vec2(uTime * 0.040, uTime * 0.028);
    float swell = fbm(swellP);
    vec2 chopP  = tileP * 0.45 + vec2(-uTime * 0.075, uTime * 0.05);
    float chop  = fbm(chopP);
    float dir   = sin((tileP.x * 0.16 + tileP.y * 0.10) - uTime * 0.55) * 0.5 + 0.5;

    float waveMix = swell * 0.60 + chop * 0.30 + dir * 0.10;

    col = mix(uWaterDeep, uWaterShallow, t * 0.55 + waveMix * 0.40);

    // Specular-ish highlights on wave crests
    float crest = smoothstep(0.62, 0.88, waveMix);
    col = mix(col, vec3(0.82, 0.90, 1.0), crest * 0.20);

    // Trough darkening for depth
    float trough = smoothstep(0.20, 0.05, waveMix);
    col *= (1.0 - trough * 0.18);
  } else {
    // Land — parchment, then tint by owner
    col = uParchment * (1.0 + grain * 0.35);
    if (owner > 0 && float(owner) <= uPlayerCount + 0.5) {
      vec3 tint = uPalette[owner - 1];
      // Multiply tint over parchment, keep grain alive
      vec3 wash = col * (tint * 1.5 + 0.05);
      col = mix(col, wash, 0.88);
      col *= 0.85 + grain * 0.30;
    }
  }

  // 4-tap neighbor read for borders + coastlines
  vec4 sN = texture(uTexture, uv + vec2(0.0, -texel.y));
  vec4 sS = texture(uTexture, uv + vec2(0.0,  texel.y));
  vec4 sE = texture(uTexture, uv + vec2( texel.x, 0.0));
  vec4 sW = texture(uTexture, uv + vec2(-texel.x, 0.0));
  float oN = sN.r * 255.0;
  float oS = sS.r * 255.0;
  float oE = sE.r * 255.0;
  float oW = sW.r * 255.0;
  float tN = sN.g * 255.0;
  float tS = sS.g * 255.0;
  float tE = sE.g * 255.0;
  float tW = sW.g * 255.0;

  if (terrain == 0) {
    float ownerEdge = 0.0;
    if (abs(oN - ownerF) > 0.5 && tN < 0.5) ownerEdge += 1.0;
    if (abs(oS - ownerF) > 0.5 && tS < 0.5) ownerEdge += 1.0;
    if (abs(oE - ownerF) > 0.5 && tE < 0.5) ownerEdge += 1.0;
    if (abs(oW - ownerF) > 0.5 && tW < 0.5) ownerEdge += 1.0;
    if (ownerEdge > 0.0) {
      // Heavier ink for owner-vs-owner edges; lighter for owned-vs-unclaimed
      float strength = (owner > 0) ? 0.55 : 0.30;
      col = mix(col, uInk, strength + grain * 0.18);
    }

    // Coastline ink rim — land tile bordering water
    float waterAdj = 0.0;
    if (tN >= 0.5) waterAdj += 1.0;
    if (tS >= 0.5) waterAdj += 1.0;
    if (tE >= 0.5) waterAdj += 1.0;
    if (tW >= 0.5) waterAdj += 1.0;
    if (waterAdj > 0.0) col = mix(col, uInk, 0.55);
  } else {
    // Water-side coast: animated foam where adjacent to land
    float landAdj = 0.0;
    if (tN < 0.5) landAdj += 1.0;
    if (tS < 0.5) landAdj += 1.0;
    if (tE < 0.5) landAdj += 1.0;
    if (tW < 0.5) landAdj += 1.0;
    if (landAdj > 0.0) {
      vec2 foamP = tileP * 0.7 + vec2(uTime * 0.20, uTime * 0.13);
      float foamMask = fbm(foamP) * 0.55 + 0.45;
      float foam = clamp(landAdj * 0.35, 0.0, 1.0) * foamMask;
      col = mix(col, vec3(0.86, 0.80, 0.62), foam * 0.32);
    }
  }

  // Frontier-claim pulse — recently-stamped tiles glow briefly. Sample
  // self + 4 neighbors and use the freshest age so the pulse softens
  // across an edge instead of being boxy. Wrap-safe via mod(..., 256).
  float ageSelf = mod(uTickByte - src.b * 255.0 + 256.0, 256.0);
  float ageN    = mod(uTickByte - sN.b  * 255.0 + 256.0, 256.0);
  float ageS    = mod(uTickByte - sS.b  * 255.0 + 256.0, 256.0);
  float ageE    = mod(uTickByte - sE.b  * 255.0 + 256.0, 256.0);
  float ageW    = mod(uTickByte - sW.b  * 255.0 + 256.0, 256.0);
  float age = min(ageSelf, min(min(ageN, ageS), min(ageE, ageW)));
  if (age < uPulseDuration && uPulseDuration > 0.0) {
    float t = 1.0 - age / uPulseDuration;
    t *= t; // ease-out
    // Warm highlight; lighter near the freshly-claimed tile, falls off on
    // neighbors because the min-age above pulls the freshest stamp in.
    vec3 pulseTint = vec3(1.0, 0.92, 0.70);
    col = mix(col, col + pulseTint * 0.55, t * 0.55);
  }

  finalColor = vec4(col, 1.0);
}
`;

export class TerritoryShaderLayer {
  readonly sprite: Sprite;
  private readonly territory: Territory;
  private readonly config: GameConfig;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imageData: ImageData;
  private readonly texture: Texture;
  private readonly filter: Filter;
  private readonly uniforms: UniformGroup;
  private readonly palette: Float32Array;

  constructor(territory: Territory, config: GameConfig) {
    this.territory = territory;
    this.config = config;

    this.canvas = document.createElement('canvas');
    this.canvas.width = territory.width;
    this.canvas.height = territory.height;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.imageData = this.ctx.createImageData(territory.width, territory.height);

    this._fillFromGrid();
    this.ctx.putImageData(this.imageData, 0, 0);
    // Drop dirty entries that fired while the simulation was being set up
    // (spawn radii, capitals). _fillFromGrid already painted them with
    // stamp=0, so we don't want a second flush re-stamping them with the
    // current tick byte and triggering a "everything just got claimed"
    // pulse on the very first frame.
    this.territory.dirty.clear();

    this.texture = Texture.from(this.canvas);
    // Nearest filtering preserves the per-tile encoded values (owner-id in R)
    // so neighbor sampling reads exact bytes, not bilinear-blended garbage.
    this.texture.source.scaleMode = 'nearest';
    this.sprite = new Sprite(this.texture);
    this.sprite.roundPixels = true;

    // Build palette as flat floats (rgb per slot, 64 slots = 64 player colors).
    this.palette = new Float32Array(64 * 3);
    this._writePalette();

    const parchment = new Float32Array([0.46, 0.40, 0.30]);
    const water = config.WATER_COLOR;
    const deep = config.WATER_COLOR_DEEP;
    const waterShallow = new Float32Array([water[0]/255, water[1]/255, water[2]/255]);
    const waterDeep = new Float32Array([deep[0]/255, deep[1]/255, deep[2]/255]);
    const ink = new Float32Array([0.10, 0.07, 0.05]);

    this.uniforms = new UniformGroup({
      uTime:          { value: 0, type: 'f32' },
      uTickByte:      { value: 0, type: 'f32' },
      uPulseDuration: { value: 15, type: 'f32' }, // ~1.5s at 10Hz
      uPlayerCount:   { value: Math.max(1, this.config.PLAYER_COLORS.length - 1), type: 'f32' },
      uPalette:       { value: this.palette, type: 'vec3<f32>', size: 64 },
      uParchment:     { value: parchment, type: 'vec3<f32>' },
      uWaterShallow:  { value: waterShallow, type: 'vec3<f32>' },
      uWaterDeep:     { value: waterDeep, type: 'vec3<f32>' },
      uInk:           { value: ink, type: 'vec3<f32>' },
    });

    this.filter = new Filter({
      glProgram: GlProgram.from({ vertex: VERT, fragment: FRAG }),
      resources: { territoryUniforms: this.uniforms },
    });
    this.sprite.filters = [this.filter];
  }

  /** Push the canvas owner/terrain/stamp bytes for any dirty tile, then
   *  bump the texture so the GPU re-uploads. The stamp byte (B channel)
   *  is the current tickCount mod 256 — the shader reads it to fade in
   *  the frontier-claim pulse on freshly-flipped tiles. */
  flushDirty(tickByte: number): void {
    const dirty = this.territory.dirty;
    if (dirty.size === 0) return;
    const data = this.imageData.data;
    const owners = this.territory.owners;
    const terrain = this.territory.terrain;
    for (const i of dirty) {
      const di = i * 4;
      data[di]     = owners[i]!;
      data[di + 1] = terrain[i]!;
      data[di + 2] = tickByte;
      data[di + 3] = 255;
    }
    this.ctx.putImageData(this.imageData, 0, 0);
    this.texture.source.update();
    dirty.clear();
  }

  /** Tick the time + tick uniforms each frame (water drift animation
   *  + claim-pulse decay). */
  tickTime(now: number, tickCount: number): void {
    this.uniforms.uniforms['uTime'] = now * 0.001;
    this.uniforms.uniforms['uTickByte'] = tickCount & 0xFF;
    (this.uniforms as { _dirtyId: number })._dirtyId++;
  }

  /** Refresh the palette uniform when player colors change (e.g. on
   *  game restart with a different opponent count). */
  refreshPalette(): void {
    this._writePalette();
    this.uniforms.uniforms['uPalette'] = this.palette;
    this.uniforms.uniforms['uPlayerCount'] = Math.max(1, this.config.PLAYER_COLORS.length - 1);
    (this.uniforms as { _dirtyId: number })._dirtyId++;
  }

  private _fillFromGrid(): void {
    const data = this.imageData.data;
    const owners = this.territory.owners;
    const terrain = this.territory.terrain;
    const N = owners.length;
    for (let i = 0; i < N; i++) {
      const di = i * 4;
      data[di]     = owners[i]!;
      data[di + 1] = terrain[i]!;
      data[di + 2] = 0;
      data[di + 3] = 255;
    }
    void TERRAIN_LAND; void TERRAIN_WATER; void TERRAIN_DEEP;
  }

  private _writePalette(): void {
    const colors = this.config.PLAYER_COLORS;
    // Slot 0 of the palette uniform = player id 1 (we subtract 1 in the shader).
    for (let pid = 1; pid < Math.min(colors.length, 65); pid++) {
      const c = colors[pid];
      if (!c) continue;
      const off = (pid - 1) * 3;
      this.palette[off]     = c[0] / 255;
      this.palette[off + 1] = c[1] / 255;
      this.palette[off + 2] = c[2] / 255;
    }
  }
}
