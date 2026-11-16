import { NOISE } from "../../lib/watercolor.glsl";

export const MAX_DROPS = 24;
export const ASP = 800 / 600;

/** Hugo-Elias ripple step — same equation as Sunset sea. */
export const SIM_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uDamping;
uniform vec4 uDrops[${MAX_DROPS}];
uniform int uDropCount;
void main() {
  vec4 s = texture2D(uState, vUv);
  float l = texture2D(uState, vUv - vec2(uTexel.x, 0.0)).r;
  float r = texture2D(uState, vUv + vec2(uTexel.x, 0.0)).r;
  float u = texture2D(uState, vUv + vec2(0.0, uTexel.y)).r;
  float d = texture2D(uState, vUv - vec2(0.0, uTexel.y)).r;
  float h = ((l + r + u + d) * 0.5 - s.g) * uDamping;
  vec2 p = vec2(vUv.x, 1.0 - vUv.y);
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uDropCount) break;
    vec4 dp = uDrops[i];
    vec2 dd = (p - dp.xy) * vec2(1.0, ${ASP.toFixed(4)});
    float x = length(dd) / max(dp.z, 1e-4);
    if (x < 1.0) h += dp.w * (0.5 + 0.5 * cos(3.14159 * x));
  }
  float edge = smoothstep(0.0, 0.03, p.x) * smoothstep(1.0, 0.97, p.x)
             * smoothstep(0.0, 0.03, p.y) * smoothstep(1.0, 0.97, p.y);
  gl_FragColor = vec4(h * edge, s.r, 0.0, 1.0);
}
`;

/**
 * Layer stack (bottom → top):
 *   1. Distorted WATER plate (mask = 1)
 *   2. Static FLORA plate for pads + lotus (mask = 0) — never warps
 *   3. Soft contact shadow
 *   4. Fish (clipped under pads / outside water)
 *   5. Torn-edge coverage so the page paper shows through (no off-white box)
 */
export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uWater;
uniform sampler2D uFlora;
uniform sampler2D uWaterMask;
uniform sampler2D uSim;
uniform sampler2D uFish;
uniform sampler2D uFlow;
uniform vec2 uSimTexel;
uniform vec2 uRes;
uniform float uTime;
uniform float uAmp;
uniform float uFlowAmp;
uniform vec4 uPellets[5];
uniform int uPelletCount;
${NOISE}

const float ASP = ${ASP.toFixed(5)};

vec3 samplePlate(sampler2D tex, vec2 uv) {
  return texture2D(tex, vec2(uv.x, 1.0 - uv.y)).rgb;
}

float waterMaskAt(vec2 uv) {
  return texture2D(uWaterMask, vec2(uv.x, 1.0 - uv.y)).r;
}

// Hand-torn pastel edge (same family as Sunset sea) — page paper shows through,
// so there is no baked off-white box around the piece.
float sideOffset(float a, float seed) {
  return 0.018 * fbm3(vec2(a * 1.7, seed))
       + 0.005 * fbm3(vec2(a * 8.0, seed + 3.1))
       + 0.0012 * gnoise(vec2(a * 70.0, seed + 7.3));
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float edgeField(vec2 uv) {
  float y = uv.y, x = uv.x * ASP;
  float dl = x + sideOffset(y, 1.0) - 0.016;
  float dr = (ASP - x) + sideOffset(y, 11.0) - 0.014;
  float dt = y + sideOffset(x, 21.0) - 0.014;
  float db = (1.0 - y) + sideOffset(x, 31.0) - 0.018;
  return smin(smin(dl, dr, 0.01), smin(dt, db, 0.01), 0.01);
}

vec2 flowOffset(vec2 uv, float t) {
  float phase = t / 12.0;
  vec2 fA = texture2D(uFlow, uv + vec2(fract(phase), 0.0)).rg * 2.0 - 1.0;
  vec2 fB = texture2D(uFlow, uv + vec2(fract(phase + 0.5) * 0.7, 0.3)).rg * 2.0 - 1.0;
  float w = abs(fract(phase) * 2.0 - 1.0);
  vec2 f = mix(fA, fB, w);
  f += 0.2 * vec2(
    gnoise(uv * 2.6 + vec2(t * 0.045, 0.0)),
    gnoise(uv * 2.6 + vec2(0.0, t * 0.04))
  );
  return f * uFlowAmp * uAmp;
}

float paperGrain(vec2 uv) {
  vec2 texel = 1.0 / uRes;
  vec3 c = samplePlate(uFlora, uv);
  vec3 blur = (
    samplePlate(uFlora, uv + vec2( texel.x * 2.0, 0.0)) +
    samplePlate(uFlora, uv + vec2(-texel.x * 2.0, 0.0)) +
    samplePlate(uFlora, uv + vec2(0.0,  texel.y * 2.0)) +
    samplePlate(uFlora, uv + vec2(0.0, -texel.y * 2.0))
  ) * 0.25;
  float hp = dot(c - blur, vec3(0.333));
  float ang = 0.5236;
  vec2 dir = vec2(cos(ang), sin(ang));
  float streak = gnoise(vec2(dot(uv * uRes, dir) * 0.35, dot(uv * uRes, vec2(-dir.y, dir.x)) * 0.08));
  return clamp(0.5 + hp * 3.5 + streak * 0.06, 0.0, 1.0);
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y); // y down
  float t = uTime;
  float mask = waterMaskAt(uv);

  // torn deckle coverage → transparent outside (page #fff shows through)
  float e = edgeField(uv);
  float hard = smoothstep(-0.15, 0.25, gnoise(vec2(uv.x * 3.2, uv.y * 2.0)) + 0.1 * gnoise(uv * 11.0));
  float feather = mix(0.008, 0.0016, hard);
  float frac = fbm3(uv * vec2(ASP, 1.0) * 140.0) * 0.7 + gnoise(uv * vec2(ASP, 1.0) * 480.0) * 0.3;
  float ramp = (e + feather * 0.2) / max(feather, 1e-4);
  float cov = smoothstep(0.4, 0.58, ramp + frac * 0.9 * (1.0 - hard) + frac * 0.2 * hard);

  vec2 flow = flowOffset(uv, t);

  // ripple refraction ≤ ~3.5px, WATER ONLY
  vec2 st = vec2(uv.x, 1.0 - uv.y);
  float hx = texture2D(uSim, st + vec2(uSimTexel.x, 0.0)).r - texture2D(uSim, st - vec2(uSimTexel.x, 0.0)).r;
  float hy = texture2D(uSim, st - vec2(0.0, uSimTexel.y)).r - texture2D(uSim, st + vec2(0.0, uSimTexel.y)).r;
  // stronger refraction so swim wakes actually read as moving water
  float pxScale = 5.5 / uRes.x;
  vec2 rip = clamp(vec2(hx, hy) * pxScale * 22.0 * uAmp, -pxScale * 1.4, pxScale * 1.4);
  float sh = (hy * 16.0 + hx * 5.0) * uAmp;

  // pads / lotus / edge: always sample flora at STATIC uv — never warp
  vec3 flora = samplePlate(uFlora, uv);
  vec3 water = samplePlate(uWater, uv + (flow + rip) * mask);
  vec3 col = mix(flora, water, mask);

  // pastel crest lift on water only (no shiny specular)
  vec3 pastelHi = vec3(0.76, 0.88, 0.92);
  col = mix(col, pastelHi, clamp(sh, 0.0, 1.0) * 0.09 * mask);

  // soft contact shadow — small, tight, not a second fish
  vec2 fishUV0 = vec2(uv.x, 1.0 - uv.y);
  vec2 shadowOff = vec2(8.0, 10.0) / uRes;
  float sa = 0.0;
  for (int i = 0; i < 5; i++) {
    float a = float(i) * 6.28318 / 5.0;
    vec2 o = vec2(cos(a), sin(a)) * 3.5 / uRes;
    sa += texture2D(uFish, fishUV0 - shadowOff + o).a;
  }
  sa = smoothstep(0.2, 0.9, sa / 5.0) * mask;
  col *= mix(vec3(1.0), vec3(0.58, 0.66, 0.70), sa * 0.09);

  // fish — page-fixed stroke breakup, clipped under pads
  float ang = 0.5236;
  vec2 sdir = vec2(cos(ang), sin(ang));
  float nStroke = gnoise(uv * uRes * 0.11 * vec2(1.0, 0.4) + sdir * 2.0);
  vec2 fishUV = fishUV0 + sdir * nStroke * 1.2 / uRes.x;
  vec4 fish = texture2D(uFish, fishUV);
  float fa = fish.a * mask;
  fa = max(fa, texture2D(uFish, fishUV + vec2(1.0, 0.0) / uRes).a * mask * 0.35);
  float grain = paperGrain(uv);
  // keep bodies opaque and warm so they read as pastel ON the water, not under it
  vec3 fishCol = fish.rgb * mix(1.0, 1.06, grain) * vec3(1.14, 1.04, 0.92);
  fa = pow(clamp(fa, 0.0, 1.0), 0.85);
  col = mix(col, fishCol, fa);

  // ochre pellets on water
  for (int i = 0; i < 5; i++) {
    if (i >= uPelletCount) break;
    vec4 pe = uPellets[i];
    if (pe.w < 0.5) continue;
    vec2 d = (uv - pe.xy) * vec2(ASP, 1.0);
    float r = length(d) * uRes.y / 7.0;
    float fade = 1.0 - clamp(pe.z, 0.0, 1.0);
    float blob = smoothstep(1.0, 0.35, r) * fade * mask;
    float g = 0.85 + 0.15 * gnoise(uv * 90.0);
    col = mix(col, vec3(0.72, 0.48, 0.22) * g, blob * 0.92);
  }

  col = clamp(col, 0.0, 1.0);
  // transparent outside the torn edge → page paper shows through (no off-white box)
  gl_FragColor = vec4(col * cov, cov);
}
`;
