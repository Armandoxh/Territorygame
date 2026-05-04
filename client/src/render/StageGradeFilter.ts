import { Filter, GlProgram, UniformGroup } from 'pixi.js';

// Stage-level pass that takes the rendered scene (territory + ships +
// world overlay + capital/building icons) and lays a "look" pass over it:
//
//   - Soft radial vignette at the screen edges
//   - Warm sepia multiply (subtle — keeps player colors readable)
//   - Tiny per-pixel film grain that drifts on uTime so the paper feels
//     alive
//
// HTML HUD elements sit ABOVE the canvas and are not affected.

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
uniform vec4 uInputSize;

uniform float uTime;
uniform float uVignetteStrength;
uniform float uVignetteRadius;
uniform float uGrainAmount;
uniform vec3 uTint;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec4 src = texture(uTexture, vTextureCoord);
  vec3 col = src.rgb;

  // Radial vignette. Aspect-corrected so the falloff stays roughly
  // circular on wide screens instead of pinching the sides.
  vec2 d = vTextureCoord - 0.5;
  float aspect = uInputSize.x / max(uInputSize.y, 1.0);
  d.x *= aspect;
  float r = length(d) / max(uVignetteRadius, 0.001);
  float v = clamp(1.0 - r * r * uVignetteStrength, 0.30, 1.0);
  col *= v;

  // Warm tint applied as a soft multiply so the original hues read through.
  col *= mix(vec3(1.0), uTint, 0.18);

  // Film grain — animated, very subtle. uGrainAmount = 0 disables.
  if (uGrainAmount > 0.0) {
    float g = hash21(vTextureCoord * uInputSize.xy + vec2(uTime * 13.13, uTime * 7.79));
    col += (g - 0.5) * uGrainAmount;
  }

  finalColor = vec4(col, src.a);
}
`;

export class StageGradeFilter extends Filter {
  private readonly _grade: UniformGroup;

  constructor() {
    const grade = new UniformGroup({
      uTime:              { value: 0,    type: 'f32' },
      uVignetteStrength:  { value: 0.85, type: 'f32' },
      uVignetteRadius:    { value: 0.95, type: 'f32' },
      uGrainAmount:       { value: 0.025, type: 'f32' },
      uTint:              { value: new Float32Array([0.94, 0.85, 0.70]), type: 'vec3<f32>' },
    });
    super({
      glProgram: GlProgram.from({ vertex: VERT, fragment: FRAG }),
      resources: { gradeUniforms: grade },
    });
    this._grade = grade;
  }

  tickTime(now: number): void {
    this._grade.uniforms['uTime'] = now * 0.001;
    (this._grade as { _dirtyId: number })._dirtyId++;
  }
}
