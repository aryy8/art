import { NOISE } from "../../lib/watercolor.glsl";

export const ASP = 600 / 1060; // width / height
export const HORIZON = 0.405; // uv y (down) of the horizon
export const SUN_X = 0.5; // uv x of the sun
export const MAX_DROPS = 16;

export const SIM_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uDamping;
uniform vec4 uDrops[${MAX_DROPS}]; // x, y in sea-uv (0..1), z radius (x units), w strength
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
    vec2 dd = (p - dp.xy) * vec2(1.0, 2.6);
    float x = length(dd) / dp.z;
    if (x < 1.0) h += dp.w * (0.5 + 0.5 * cos(3.14159 * x));
  }
  // soak up energy at the borders
  float edge = smoothstep(0.0, 0.04, p.x) * smoothstep(1.0, 0.96, p.x) * smoothstep(0.0, 0.02, p.y) * smoothstep(1.0, 0.97, p.y);
  gl_FragColor = vec4(h * edge, s.r, 0.0, 1.0);
}
`;

/**
 * Per frame: sample the painting through a moving water surface.
 * Swells are defined in world space on a ground plane seen in perspective, so they
 * shrink and slow toward the horizon by themselves. They lift and shear the painted
 * strokes; the bright flecks down the sun path shimmer on the facing slopes; the
 * ripple sim refracts the paint. The sky only breathes. A soft, irregular mask gives
 * the sheet a hand-cut watercolour edge with a faint dried rim.
 */
export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uBase;
uniform sampler2D uSim;
uniform vec2 uSimTexel;
uniform float uTime;
uniform float uAmp;
${NOISE}
const float ASP = ${ASP.toFixed(5)};
const float YH = ${HORIZON.toFixed(4)};
const float SUNX = ${SUN_X.toFixed(4)};

vec3 base(vec2 uv) { return texture2D(uBase, vec2(uv.x, 1.0 - uv.y)).rgb; }

// distance (in sheet-height units) inside a gently irregular rectangle
float edgeDist(vec2 uv) {
  float dl = uv.x * ASP, dr = (1.0 - uv.x) * ASP, dt = uv.y, db = 1.0 - uv.y;
  float wl = 0.007 * fbm3(vec2(uv.y * 5.0, 1.0)) + 0.0022 * gnoise(vec2(uv.y * 38.0, 3.0));
  float wr = 0.007 * fbm3(vec2(uv.y * 5.0, 7.0)) + 0.0022 * gnoise(vec2(uv.y * 41.0, 9.0));
  float wt = 0.006 * fbm3(vec2(uv.x * 6.0, 13.0)) + 0.002 * gnoise(vec2(uv.x * 45.0, 15.0));
  float wb = 0.007 * fbm3(vec2(uv.x * 6.0, 19.0)) + 0.0022 * gnoise(vec2(uv.x * 40.0, 21.0));
  return min(min(dl + wl, dr + wr), min(dt + wt, db + wb)) - 0.011;
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  float t = uTime;
  vec2 d = vec2(0.0);
  float slope = 0.0;
  float s = (uv.y - YH) / (1.0 - YH);
  float sh = 0.0;
  float ss = max(s, 0.015);
  if (s > 0.0) {
    float X = (uv.x - 0.5) * ASP / ss;
    float Z = 1.0 / ss;
    // long rolling swells + a cross sea, world-space
    float p1 = Z * 2.6 + X * 0.45 - t * 0.85;
    float p2 = Z * 4.4 - X * 0.8 - t * 1.15 + 1.7;
    float p3 = Z * 7.5 + X * 1.6 - t * 1.6 + 4.0;
    float p4 = Z * 12.0 - X * 2.5 - t * 2.2 + 2.2;
    float h = sin(p1) + 0.6 * sin(p2) + 0.32 * sin(p3) + 0.16 * sin(p4);
    slope = cos(p1) + 0.6 * cos(p2) + 0.5 * cos(p3) + 0.3 * cos(p4);
    float fade = smoothstep(0.0, 0.12, s);
    float A = uAmp * ss * fade;
    d.y += A * 0.0055 * h;
    // the strokes sway sideways as the swell passes
    d.x += A * (0.0045 * sin(p2 * 0.5 + Z * 0.7 - t * 0.2) + 0.0026 * cos(p1 + X * 0.3));

    // pointer ripples (sea-space sim)
    vec2 st = vec2(uv.x, 1.0 - s);
    float hx = texture2D(uSim, st + vec2(uSimTexel.x, 0.0)).r - texture2D(uSim, st - vec2(uSimTexel.x, 0.0)).r;
    float hy = texture2D(uSim, st - vec2(0.0, uSimTexel.y)).r - texture2D(uSim, st + vec2(0.0, uSimTexel.y)).r;
    d += vec2(hx * 0.22, hy * 0.36) * (0.4 + ss);
    sh = (hy * 22.0 + hx * 5.0) * (0.5 + ss);
  } else {
    // the sky barely breathes: still-wet washes, clouds swaying a hair
    float k = smoothstep(0.0, -0.06, s);
    d.x += (0.0012 * sin(uv.y * 17.0 + t * 0.13) + 0.0005 * sin(uv.y * 53.0 - t * 0.21)) * k;
    d.y += 0.0005 * sin(uv.x * 7.0 + t * 0.11) * k;
  }

  vec2 suv = uv + d;
  if (s > 0.0) suv.y = max(suv.y, YH + 0.0008);
  else suv.y = min(suv.y, YH - 0.0008);
  vec3 col = base(suv);

  if (s > 0.0) {
    // the sun path: bright flecks near the centre column shimmer on the facing slopes
    float lum = dot(col, vec3(0.3, 0.5, 0.2));
    float colW = 0.035 + 0.16 * ss;
    float inPath = exp(-pow((uv.x - SUNX) / colW, 2.0));
    float bright = smoothstep(0.78, 0.93, lum) * inPath;
    float flick = gnoise(vec2(suv.x * 90.0, suv.y * 420.0) + vec2(t * 0.6, -t * 1.4));
    float sparkle = clamp(0.5 + 1.4 * flick + 0.35 * slope * 0.5, 0.0, 1.0);
    col = mix(col, vec3(1.0, 0.99, 0.97), bright * smoothstep(0.45, 1.0, sparkle) * 0.75);
    col *= 1.0 - bright * (1.0 - sparkle) * 0.12;
    // a warm lift where the swell faces the sun, broad and slow
    col = mix(col, col * vec3(1.03, 1.0, 0.98) + 0.03, inPath * smoothstep(0.4, 1.4, slope) * 0.5);
    // ripple light: facing slopes lift toward paper, the others pool a little pigment
    col = mix(col, vec3(1.0, 0.97, 0.95), clamp(sh, 0.0, 1.0) * 0.3);
    col *= mix(vec3(1.0), vec3(0.86, 0.84, 0.95), clamp(-sh, 0.0, 1.0) * 0.5);
  }

  // hand-cut sheet edge: soft but irregular, with pigment dried darker along it
  float e = edgeDist(uv);
  float m = smoothstep(-0.0015, 0.0035, e);
  col *= mix(1.0, 0.93, exp(-max(e, 0.0) / 0.004) * m);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0) * m, m);
}
`;
