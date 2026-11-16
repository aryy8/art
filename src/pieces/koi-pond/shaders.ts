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
 *   1. The painting itself (TARGET_FINAL with the koi removed, paper edge baked in as alpha).
 *      Only open water refracts; the displacement weight is an ERODED water mask, so it is
 *      exactly zero on and around pads / lotus / the torn edge — they never warp or smear.
 *   2. Soft, offset shadow of the koi on the pond floor.
 *   3. Koi seen THROUGH the surface: refracted by the flow/ripple field, softened, slightly
 *      desaturated and pulled toward the local water colour, with caustics on their backs and
 *      the painted surface strokes passing over them. Hidden under pads and the lotus.
 *   Mask: R = koi visible, G = displacement weight, B = open-water surface. Where B = 0
 *   (lotus, pads, paper) the output is the plate pixel, untouched.
 */
export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPlate;
uniform sampler2D uMask;
uniform sampler2D uSim;
uniform sampler2D uFish;
uniform sampler2D uFlow;
uniform vec2 uSimTexel;
uniform vec2 uRes;
uniform float uTime;
uniform float uAmp;
uniform float uFlowAmp;
${NOISE}

const float ASP = ${ASP.toFixed(5)};

vec4 plate(vec2 uv) { return texture2D(uPlate, vec2(uv.x, 1.0 - uv.y)); }
vec3 maskAt(vec2 uv) { return texture2D(uMask, vec2(uv.x, 1.0 - uv.y)).rgb; }

vec2 flowOffset(vec2 uv, float t) {
  float phase = t / 14.0;
  vec2 fA = texture2D(uFlow, uv + vec2(fract(phase), 0.0)).rg * 2.0 - 1.0;
  vec2 fB = texture2D(uFlow, uv + vec2(fract(phase + 0.5) * 0.7, 0.3)).rg * 2.0 - 1.0;
  float w = abs(fract(phase) * 2.0 - 1.0);
  vec2 f = mix(fA, fB, w);
  f += 0.25 * vec2(gnoise(uv * 2.6 + vec2(t * 0.045, 0.0)), gnoise(uv * 2.6 + vec2(0.0, t * 0.04)));
  return f * uFlowAmp * uAmp;
}

// page-fixed pastel tooth: fine grain + diagonal crayon drag, in page pixels (800×600 space)
float tooth(vec2 uv) {
  vec2 p = uv * vec2(800.0, 600.0);
  float g = gnoise(p * 0.9) * 0.55 + gnoise(p * 2.1 + 7.0) * 0.45;
  vec2 d = vec2(0.866, 0.5);
  float drag = gnoise(vec2(dot(p, d) * 0.12, dot(p, vec2(-d.y, d.x)) * 1.3));
  return g * 0.7 + drag * 0.3;
}

// gentle moving caustic network (two warped sine lattices)
float caustic(vec2 uv, float t) {
  vec2 p = uv * vec2(ASP, 1.0) * 9.0;
  p += 0.6 * vec2(gnoise(p * 0.5 + t * 0.15), gnoise(p * 0.5 - t * 0.12));
  float a = abs(sin(p.x + t * 0.7) * sin(p.y * 1.1 - t * 0.5));
  float b = abs(sin((p.x + p.y) * 0.8 - t * 0.6));
  return pow(1.0 - min(a, b), 6.0);
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y); // y down
  vec2 st = vUv;                      // GL orientation (fish RT, sim)
  float t = uTime;
  vec3 mk = maskAt(uv);
  float fishVis = step(0.5, mk.r); // 0 under pads / lotus → koi hidden there
  float fx = step(0.5, mk.b);      // 1 = open water surface; 0 = lotus / pads / paper: NO water effects
  float wDisp = mk.g * fx;         // displacement weight, 0 well before any flora

  // ripple slope
  float hx = texture2D(uSim, st + vec2(uSimTexel.x, 0.0)).r - texture2D(uSim, st - vec2(uSimTexel.x, 0.0)).r;
  float hy = texture2D(uSim, st - vec2(0.0, uSimTexel.y)).r - texture2D(uSim, st + vec2(0.0, uSimTexel.y)).r;
  float px1 = 1.0 / 800.0;
  vec2 rip = clamp(vec2(hx, hy) * px1 * 90.0 * uAmp, -px1 * 4.0, px1 * 4.0);
  float sh = (hy * 10.0 + hx * 3.0) * uAmp;
  vec2 flow = flowOffset(uv, t);

  vec4 base = plate(uv);
  float alpha = base.a;
  vec3 water = wDisp > 0.001 ? plate(uv + (flow + rip) * wDisp).rgb : base.rgb;
  // soft local water colour (for tinting what is under the surface)
  vec3 deep = texture2D(uPlate, vec2(uv.x, 1.0 - uv.y), 5.0).rgb;

  // ---- koi, seen THROUGH the surface: refracted by flow + ripples
  vec2 refr = (flow * 1.6 + rip * 2.2 + 0.0015 * vec2(gnoise(uv * 14.0 + t * 0.6), gnoise(uv * 14.0 - t * 0.5))) * fx;
  vec2 fuv = st + vec2(refr.x, -refr.y);
  vec4 fish = vec4(0.0);
  for (int i = 0; i < 5; i++) {
    float a = float(i) * 1.2566;
    vec2 o = i == 0 ? vec2(0.0) : vec2(cos(a), sin(a)) * 0.8 / uRes;
    fish += texture2D(uFish, fuv + o) * (i == 0 ? 0.6 : 0.1);
  }
  // pond-floor shadow: deeper than the fish → bigger offset, wider blur
  float sa = 0.0;
  vec2 so = vec2(16.0, -20.0) / uRes;
  for (int i = 0; i < 10; i++) {
    float a = float(i) * 0.6283;
    sa += texture2D(uFish, fuv - so + vec2(cos(a), sin(a)) * 11.0 / uRes).a;
  }
  sa = sa / 10.0;
  water *= 1.0 - sa * 0.3 * fx;

  vec3 col = water;
  float fa = fish.a * fishVis;
  if (fa > 0.002) {
    vec3 fc = fish.rgb / max(fish.a, 1e-3);
    // pastel tooth (page-fixed) — crayon skips let the water show through
    float g = tooth(uv);
    float gap = smoothstep(0.42, 0.75, g) * 0.35;
    fc *= 0.94 + 0.12 * (0.5 + 0.5 * gnoise(uv * vec2(800.0, 600.0) * 1.7));
    // submerged grade: a little desaturated, lower contrast, pulled toward the teal water
    float l = dot(fc, vec3(0.3, 0.59, 0.11));
    fc = mix(vec3(l), fc, 0.94);
    fc = mix(vec3(0.45), fc, 0.96);
    fc = mix(fc, deep, 0.10);
    fc *= vec3(0.97, 0.995, 1.01);
    // caustic light dancing on the back
    fc += vec3(0.55, 0.65, 0.55) * caustic(uv, t) * 0.10 * fx;
    float a = fa * (1.0 - gap) * 0.95;
    col = mix(col, fc, a);
    // the painted surface strokes (blue-white swirls) pass OVER the fish
    float wl = dot(water, vec3(0.3, 0.59, 0.11));
    float hl = smoothstep(0.42, 0.7, wl) * smoothstep(-0.02, 0.08, water.b - water.r);
    col = mix(col, water, fa * fx * (0.04 + 0.34 * hl));
  }

  // ripple crests catch a little pale-blue pastel light (on top of everything in the water)
  col = mix(col, vec3(0.74, 0.87, 0.92), clamp(sh, 0.0, 1.0) * 0.12 * wDisp);

  // flora / lotus / paper: exactly the plate, always
  col = mix(base.rgb, col, max(fx, fa));
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;
