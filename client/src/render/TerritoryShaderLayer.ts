import { Sprite, Texture, Filter, GlProgram, UniformGroup } from 'pixi.js';
import { Territory, TERRAIN_LAND, TERRAIN_WATER, TERRAIN_DEEP } from '@territorygame/shared';
import type { GameConfig } from '@territorygame/shared';

// GPU-driven territory rendering. The territory texture stores per-tile
// state in three channels:
//
//   R = owner id (0 = unclaimed, 1..254 = player)
//   G = terrain kind (0 = land, 1 = shallow water, 2 = deep water)
//   B = strategic resource id (0 = none, 1 = food, 2 = wood, 3 = stone,
//       4 = oil, 5 = gems). Static after game init — set once from
//       game.resourceByTile and never re-stamped.
//
// A custom fragment shader reads those bytes plus a player-color palette
// uniform and renders the painted-map look — biome color is determined
// by RESOURCE (so each region's hue tells you what it produces) plus a
// distinct procedural stylistic pattern per resource (wheat rows, tree
// blobs, rocky chunks, oil splotches, gem sparkles).

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
uniform float uSmoothMode; // 0 = crisp tile fill (legacy), 1 = bilinear smooth
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
  // 2 octaves is enough for the gritty noise look and roughly halves
  // the per-pixel cost compared with 3.
  float v = 0.5 * vnoise(p);
  v += 0.275 * vnoise(p * 2.05);
  return v;
}

// Heavier 4-octave fbm used for biome elevation. Pricier but only one
// call per fragment; gives ridged-mountain + plains variation.
float fbm4(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p *= 2.13;
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
  // Grain only used on land — compute lazily inside that branch below.
  float grain = 0.0;

  vec3 col;
  if (terrain >= 1) {
    // Layered water with depth gradient. Shallow water is lighter (closer
    // to coast); deep water is darker. Multiple wave octaves drift at
    // different speeds and angles to avoid tiled patterns.
    float depthT = (terrain == 2) ? 0.0 : 1.0;
    vec2 swellP = tileP * 0.08 + vec2(uTime * 0.040, uTime * 0.028);
    float swell = fbm(swellP);
    vec2 chopP  = tileP * 0.45 + vec2(-uTime * 0.075, uTime * 0.05);
    float chop  = fbm(chopP);
    float dir   = sin((tileP.x * 0.16 + tileP.y * 0.10) - uTime * 0.55) * 0.5 + 0.5;
    // Long, slow caustic-like ripple — evokes refraction over the seabed.
    float caustic = sin(tileP.x * 0.34 - uTime * 0.32) * sin(tileP.y * 0.27 + uTime * 0.21);
    caustic = caustic * 0.5 + 0.5;

    float waveMix = swell * 0.55 + chop * 0.28 + dir * 0.10 + caustic * 0.07;

    col = mix(uWaterDeep, uWaterShallow, depthT * 0.55 + waveMix * 0.35);

    // White-cap specular on crests
    float crest = smoothstep(0.62, 0.92, waveMix);
    col = mix(col, vec3(0.86, 0.94, 1.0), crest * 0.22);

    // Trough darkening for visible depth
    float trough = smoothstep(0.20, 0.05, waveMix);
    col *= (1.0 - trough * 0.20);

    // Subtle teal undertone on shallow water (near coast)
    if (terrain == 1) {
      col += vec3(-0.02, 0.02, 0.04) * (0.4 + waveMix * 0.6);
    }
  } else {
    // Land — biome color is determined by the region's RESOURCE (oil
    // brown, stone grey, gems silver, food gold, wood deep green).
    // Each resource also gets a procedural stylistic pattern overlay
    // so you can tell at a glance what a region produces.
    int rid = int(src.b * 255.0 + 0.5);
    grain = fbm(tileP * 0.45) - 0.36;

    vec3 base;
    if      (rid == 1) base = vec3(0.78, 0.72, 0.36); // food — golden plains
    else if (rid == 2) base = vec3(0.32, 0.45, 0.26); // wood — deep forest green
    else if (rid == 3) base = vec3(0.52, 0.52, 0.55); // stone — cool grey
    else if (rid == 4) base = vec3(0.32, 0.24, 0.18); // oil — dark earthy brown
    else if (rid == 5) base = vec3(0.78, 0.80, 0.86); // gems — silvery white
    else               base = vec3(0.62, 0.58, 0.42); // none — neutral parchment-tan

    // Stylistic pattern per resource. Each is a cheap procedural at the
    // fragment level, layered on top of the base color.
    if (rid == 1) {
      // Food: soft wheat-row striping at ~30°
      float wheat = sin((tileP.x + tileP.y * 0.6) * 1.8) * 0.5 + 0.5;
      base = mix(base, base * vec3(1.10, 1.05, 0.85), wheat * 0.18);
      // Subtle dark crop divisions
      float divs = step(0.92, fract(tileP.x * 0.18 + tileP.y * 0.05));
      base *= 1.0 - divs * 0.10;
    } else if (rid == 2) {
      // Wood: tree-blob noise — clusters of darker green for tree canopies
      float blob = vnoise(tileP * 0.85);
      float trees = smoothstep(0.45, 0.85, blob);
      base = mix(base, base * vec3(0.65, 0.85, 0.55), trees * 0.55);
      // Tiny canopy highlights
      float dot = step(0.92, vnoise(tileP * 1.7 + 3.0));
      base += vec3(0.04, 0.06, 0.03) * dot;
    } else if (rid == 3) {
      // Stone: high-contrast rocky chunks
      float rocks = vnoise(tileP * 0.55);
      float crack = abs(vnoise(tileP * 1.3) - 0.5);
      base = mix(base, base * vec3(1.20, 1.18, 1.15), smoothstep(0.55, 0.85, rocks) * 0.55);
      base *= 1.0 - smoothstep(0.0, 0.06, crack) * 0.10;
    } else if (rid == 4) {
      // Oil: viscous splotchy pattern, dark with iridescent sheen
      float splot = vnoise(tileP * 0.50);
      base = mix(base, vec3(0.10, 0.08, 0.06), smoothstep(0.45, 0.80, splot) * 0.55);
      // Faint oil-slick rainbow on highlights
      float slick = smoothstep(0.78, 0.95, splot);
      base += vec3(0.04, 0.02, 0.05) * slick;
    } else if (rid == 5) {
      // Gems: rare bright sparkle points on a cool silver base
      base += grain * vec3(0.06, 0.06, 0.08);
      float spark = step(0.985, vnoise(tileP * 3.7 + 17.0)) + step(0.985, vnoise(tileP * 5.1 - 8.0));
      base += vec3(0.55, 0.55, 0.65) * spark * (0.5 + 0.5 * sin(uTime * 2.0 + tileP.x + tileP.y));
    }

    // Grain modulation applies on top so paper-grain still reads.
    vec3 parchmentCol = base * (1.0 + grain * 0.18);
    if (uSmoothMode > 0.5) {
      // BILINEAR SMOOTH: sample the 4 nearest tile centers (tile centers
      // sit at half-integer world coords, so the half-tile grid). Look up
      // each one's tinted color, then bilinear-blend by sub-half-tile
      // fraction. This dissolves the per-tile stair-step into a smooth
      // anti-aliased gradient at boundaries — crucial since the territory
      // grid is the main source of pixelation.
      //
      // Skip the blend across land/water borders to keep the coastline
      // crisp (mush-blending sand into ocean reads bad).
      vec2 baseTile = floor(tileP - 0.5);
      vec2 frac = (tileP - 0.5) - baseTile;
      vec2 t00 = (baseTile + vec2(0.5, 0.5)) * texel;
      vec2 t10 = (baseTile + vec2(1.5, 0.5)) * texel;
      vec2 t01 = (baseTile + vec2(0.5, 1.5)) * texel;
      vec2 t11 = (baseTile + vec2(1.5, 1.5)) * texel;
      vec4 s00 = texture(uTexture, t00);
      vec4 s10 = texture(uTexture, t10);
      vec4 s01 = texture(uTexture, t01);
      vec4 s11 = texture(uTexture, t11);
      // Per-corner tint: parchment if water/unowned, else owner-color
      // dominant with biome reduced to a subtle texture so the same
      // owner reads the same regardless of biome underneath.
      vec3 c00 = parchmentCol;
      vec3 c10 = parchmentCol;
      vec3 c01 = parchmentCol;
      vec3 c11 = parchmentCol;
      int o00 = int(s00.r * 255.0 + 0.5);
      int o10 = int(s10.r * 255.0 + 0.5);
      int o01 = int(s01.r * 255.0 + 0.5);
      int o11 = int(s11.r * 255.0 + 0.5);
      int t00t = int(s00.g * 255.0 + 0.5);
      int t10t = int(s10.g * 255.0 + 0.5);
      int t01t = int(s01.g * 255.0 + 0.5);
      int t11t = int(s11.g * 255.0 + 0.5);
      // Flatten biome variance under claimed tiles so owner color
      // dominates. Biome still tints the result by ~25% so wheat
      // fields look slightly different from forests, but the
      // dominant signal is "whose flag is on this land".
      vec3 underlay = mix(vec3(dot(parchmentCol, vec3(0.33))), parchmentCol, 0.45);
      if (o00 > 0 && t00t == 0 && float(o00) <= uPlayerCount + 0.5) {
        vec3 tint = uPalette[o00 - 1];
        c00 = mix(underlay, tint, 0.78) * (0.92 + grain * 0.18);
      }
      if (o10 > 0 && t10t == 0 && float(o10) <= uPlayerCount + 0.5) {
        vec3 tint = uPalette[o10 - 1];
        c10 = mix(underlay, tint, 0.78) * (0.92 + grain * 0.18);
      }
      if (o01 > 0 && t01t == 0 && float(o01) <= uPlayerCount + 0.5) {
        vec3 tint = uPalette[o01 - 1];
        c01 = mix(underlay, tint, 0.78) * (0.92 + grain * 0.18);
      }
      if (o11 > 0 && t11t == 0 && float(o11) <= uPlayerCount + 0.5) {
        vec3 tint = uPalette[o11 - 1];
        c11 = mix(underlay, tint, 0.78) * (0.92 + grain * 0.18);
      }
      vec3 top = mix(c00, c10, frac.x);
      vec3 bot = mix(c01, c11, frac.x);
      col = mix(top, bot, frac.y);
      col *= 0.92 + grain * 0.16;
    } else {
      col = parchmentCol;
      if (owner > 0 && float(owner) <= uPlayerCount + 0.5) {
        vec3 tint = uPalette[owner - 1];
        // Owner color dominates; biome reduced to a near-monochrome
        // underlay so different biomes don't repaint the same player
        // a different color in each region.
        vec3 underlay = mix(vec3(dot(parchmentCol, vec3(0.33))), parchmentCol, 0.45);
        col = mix(underlay, tint, 0.78);
        col *= 0.92 + grain * 0.18;
      }
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

  // Inner shadow: tiles near a different-owner edge get subtle darkening
  // toward the boundary — gives owned regions a "bowl" depth like a
  // proper map illustration. Cheap: sample 2-tile diagonal neighbors and
  // count how many are different owner. More mismatches → closer to the
  // edge → more shading.
  if (terrain == 0 && owner > 0) {
    vec4 sNE = texture(uTexture, uv + vec2( texel.x * 1.5, -texel.y * 1.5));
    vec4 sNW = texture(uTexture, uv + vec2(-texel.x * 1.5, -texel.y * 1.5));
    vec4 sSE = texture(uTexture, uv + vec2( texel.x * 1.5,  texel.y * 1.5));
    vec4 sSW = texture(uTexture, uv + vec2(-texel.x * 1.5,  texel.y * 1.5));
    float diag = 0.0;
    if (abs(sNE.r * 255.0 - ownerF) > 0.5) diag += 1.0;
    if (abs(sNW.r * 255.0 - ownerF) > 0.5) diag += 1.0;
    if (abs(sSE.r * 255.0 - ownerF) > 0.5) diag += 1.0;
    if (abs(sSW.r * 255.0 - ownerF) > 0.5) diag += 1.0;
    col *= 1.0 - diag * 0.04;
  }

  // Frontier-claim pulse — recently-stamped tiles glow briefly. Sample
  // self + 4 neighbors and use the freshest age so the pulse softens
  // across an edge instead of being boxy. Wrap-safe via mod(..., 256).
  // The whole block is gated by uPulseDuration > 0 so the cost is zero
  // when the effect is disabled (it's currently off by default —
  // looked like sparkles flowing across the map and was eating fps).
  if (uPulseDuration > 0.0) {
    float ageSelf = mod(uTickByte - src.b * 255.0 + 256.0, 256.0);
    float ageN    = mod(uTickByte - sN.b  * 255.0 + 256.0, 256.0);
    float ageS    = mod(uTickByte - sS.b  * 255.0 + 256.0, 256.0);
    float ageE    = mod(uTickByte - sE.b  * 255.0 + 256.0, 256.0);
    float ageW    = mod(uTickByte - sW.b  * 255.0 + 256.0, 256.0);
    float age = min(ageSelf, min(min(ageN, ageS), min(ageE, ageW)));
    if (age < uPulseDuration) {
      float t = 1.0 - age / uPulseDuration;
      t *= t; // ease-out
      // Warm highlight; lighter near the freshly-claimed tile, falls off on
      // neighbors because the min-age above pulls the freshest stamp in.
      vec3 pulseTint = vec3(1.0, 0.92, 0.70);
      col = mix(col, col + pulseTint * 0.55, t * 0.55);
    }
  }

  // Paper texture overlay: very fine fiber noise multiplied across the
  // whole frame, gives the map a printed-on-paper feel. Only computed on
  // land (water already has its own shading). Cost: ~2 noise calls per
  // land fragment.
  if (terrain == 0) {
    float fiber = vnoise(tileP * 1.7 + 11.0) * 0.5 + vnoise(tileP * 5.3 - 4.0) * 0.5;
    col *= 0.92 + fiber * 0.16;
    // Faint warm-cool fiber tint for paper-grain authenticity.
    col += vec3(0.02, 0.01, -0.01) * (fiber - 0.5);
  }

  finalColor = vec4(col, 1.0);
}
`;

export class TerritoryShaderLayer {
  readonly sprite: Sprite;
  private readonly territory: Territory;
  private readonly config: GameConfig;
  private readonly resourceByTile: Uint8Array;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imageData: ImageData;
  private readonly texture: Texture;
  private readonly filter: Filter;
  private readonly uniforms: UniformGroup;
  private readonly palette: Float32Array;

  constructor(territory: Territory, config: GameConfig, resourceByTile: Uint8Array) {
    this.territory = territory;
    this.config = config;
    this.resourceByTile = resourceByTile;

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
      uPulseDuration: { value: 0, type: 'f32' }, // disabled — was a sparkle effect that ate fps
      uPlayerCount:   { value: Math.max(1, this.config.PLAYER_COLORS.length - 1), type: 'f32' },
      uSmoothMode:    { value: 1, type: 'f32' }, // 1 = bilinear smooth fill (de-pixelates owner boundaries)
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

  /** Push the canvas owner/terrain/resource bytes for any dirty tile,
   *  then bump the texture so the GPU re-uploads. B channel is the
   *  per-tile resource id (static after init); we still rewrite it per
   *  flush so a later expansion of the system can mutate resources
   *  without a separate code path. */
  flushDirty(_tickByte: number): void {
    const dirty = this.territory.dirty;
    if (dirty.size === 0) return;
    const data = this.imageData.data;
    const owners = this.territory.owners;
    const terrain = this.territory.terrain;
    const resByTile = this.resourceByTile;
    for (const i of dirty) {
      const di = i * 4;
      data[di]     = owners[i]!;
      data[di + 1] = terrain[i]!;
      data[di + 2] = resByTile[i]!;
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

  /** Toggle the bilinear smoothing pass. Off = crisp per-tile fills
   *  (legacy nearest-neighbor look); on = anti-aliased gradients at
   *  owner boundaries. Tied to a debug key so we can A/B compare. */
  setSmoothMode(on: boolean): void {
    this.uniforms.uniforms['uSmoothMode'] = on ? 1 : 0;
    (this.uniforms as { _dirtyId: number })._dirtyId++;
  }

  isSmoothMode(): boolean {
    return (this.uniforms.uniforms['uSmoothMode'] as number) > 0.5;
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
    const resByTile = this.resourceByTile;
    const N = owners.length;
    for (let i = 0; i < N; i++) {
      const di = i * 4;
      data[di]     = owners[i]!;
      data[di + 1] = terrain[i]!;
      data[di + 2] = resByTile[i]!;
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
