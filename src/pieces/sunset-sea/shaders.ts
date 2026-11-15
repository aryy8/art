import { NOISE, PAPER } from "../../lib/watercolor.glsl";

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
 * Per frame: sample the static painting through a moving water surface.
 * Swells are defined in world space on a ground plane seen in perspective, so they
 * shrink and slow toward the horizon by themselves. They lift and shear the painted
 * strokes, glints twinkle on the facing slopes, and the ripple sim refracts the paint.
 */
export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uBase;
uniform sampler2D uGlint;
uniform sampler2D uSim;
uniform vec2 uSimTexel;
uniform vec2 uPaperScale;
uniform float uTime;
uniform float uAmp;
${NOISE}
${PAPER}
const float ASP = ${ASP.toFixed(5)};
const float YH = ${HORIZON.toFixed(4)};

vec3 base(vec2 uv) { return texture2D(uBase, vec2(uv.x, 1.0 - uv.y)).rgb; }

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  float t = uTime;
  vec2 d = vec2(0.0);
  float slope = 0.0;
  float s = (uv.y - YH) / (1.0 - YH);
  float sea = smoothstep(0.0, 0.004, s);
  vec2 simD = vec2(0.0);
  float sh = 0.0;
  if (s > 0.0) {
    float ss = max(s, 0.015);
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
    d.y += A * 0.0068 * h;
    // the strokes sway sideways as the swell passes, and drift a little
    d.x += A * (0.0055 * sin(p2 * 0.5 + Z * 0.7 - t * 0.2) + 0.0032 * cos(p1 + X * 0.3));

    // pointer ripples (sea space sim)
    vec2 st = vec2(uv.x, 1.0 - s);
    float hx = texture2D(uSim, st + vec2(uSimTexel.x, 0.0)).r - texture2D(uSim, st - vec2(uSimTexel.x, 0.0)).r;
    float hy = texture2D(uSim, st - vec2(0.0, uSimTexel.y)).r - texture2D(uSim, st + vec2(0.0, uSimTexel.y)).r;
    simD = vec2(hx, hy);
    d += vec2(hx * 0.018, hy * 0.03) * (0.4 + ss);
    sh = hy * 3.0 + hx * 0.6;
  } else {
    // the sky barely breathes: still-wet washes
    float k = smoothstep(0.0, -0.05, s);
    d.x += 0.0011 * sin(uv.y * 23.0 + t * 0.21) * k + 0.0006 * sin(uv.y * 61.0 - t * 0.33);
    d.y += 0.0007 * sin(uv.x * 9.0 + t * 0.17) * k;
  }

  vec2 suv = uv + d;
  // keep the horizon a clean line: sky never samples sea and vice versa
  if (s > 0.0) suv.y = max(suv.y, YH + 0.0003);
  vec3 col = base(suv);

  // glints twinkle on the slopes that face the sun, each fleck on its own beat
  if (s > 0.0) {
    vec2 guv = suv + vec2(0.0012 * sin(t * 2.3 + uv.y * 300.0), 0.0) * s;
    vec4 gl = texture2D(uGlint, vec2(guv.x, 1.0 - guv.y));
    float id = gl.r;
    float beat = 0.5 + 0.5 * sin(t * (1.1 + id * 2.6) + id * 61.0);
    float face = smoothstep(-0.6, 0.9, slope * 0.55 + 0.25 + (id - 0.5));
    float tw = smoothstep(0.25, 0.75, beat * 0.6 + face * 0.6);
    col = mix(col, vec3(1.0, 0.985, 0.97), gl.a * tw * 0.96);
    // ripple light: facing slopes lift toward paper, the others pool a little pigment
    col = mix(col, vec3(1.0, 0.97, 0.95), clamp(sh, 0.0, 1.0) * 0.55);
    col *= mix(vec3(1.0), vec3(0.86, 0.84, 0.95), clamp(-sh, 0.0, 1.0) * 0.6);
  }

  // un-paint against the white page: pigment becomes coverage, white stays clear
  float a = 1.0 - min(col.r, min(col.g, col.b));
  // paper tooth, only where there is pigment
  vec2 pp = uv * uPaperScale;
  float tooth = paperHeight(pp) - paperHeight(pp + vec2(1.1, 1.1));
  float dens = clamp(a * (1.0 + tooth * 0.5 + (paperHeight(pp * 0.7) - 0.5) * 0.12), 0.0, 1.0);
  vec3 pre = (col - 1.0 + a) * (dens / max(a, 1e-4));
  gl_FragColor = vec4(pre, dens);
}
`;
