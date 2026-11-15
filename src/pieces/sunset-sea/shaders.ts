import { WC_ALL, NOISE, PAPER, EDGE } from "../../lib/watercolor.glsl";

export const ASP = 600 / 1060; // width / height
export const HORIZON = 0.405; // uv y (down) of the horizon
export const SUN_X = 0.5; // uv x of the sun
export const MAX_GLINTS = 28;
export const MAX_DROPS = 16;

const COMMON = /* glsl */ `
const float ASP = ${ASP.toFixed(5)};
const float YH = ${HORIZON.toFixed(4)};
const float SUNX = ${(SUN_X * ASP).toFixed(5)};
const vec3 PAPER_C  = vec3(0.986, 0.976, 0.962);
// sky
const vec3 ROSE     = vec3(0.960, 0.800, 0.860);
const vec3 PEACH    = vec3(1.000, 0.860, 0.720);
const vec3 ORANGE   = vec3(1.000, 0.700, 0.500);
const vec3 CORAL    = vec3(0.995, 0.600, 0.540);
const vec3 SCARLET  = vec3(0.985, 0.480, 0.450);
const vec3 MAGENTA  = vec3(0.900, 0.540, 0.680);
const vec3 MAUVE    = vec3(0.800, 0.640, 0.820);
// sea
const vec3 PINK     = vec3(0.985, 0.760, 0.820);
const vec3 LILAC    = vec3(0.880, 0.780, 0.920);
const vec3 PURPLE   = vec3(0.760, 0.660, 0.880);
const vec3 VIOLET   = vec3(0.660, 0.600, 0.880);
const vec3 ULTRA    = vec3(0.560, 0.660, 0.950);
const vec3 DEEP     = vec3(0.440, 0.540, 0.840);
const vec3 TEALBLUE = vec3(0.500, 0.720, 0.880);
`;

/**
 * Sky and the sea's ground wash. Re-rendered every few frames (clouds drift slowly),
 * a = paper height so the per-frame pass can granulate without recomputing it.
 */
export const PAINT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
${WC_ALL}
${COMMON}

float band(float y, float c, float w) { float t = (y - c) / w; return exp(-t * t); }

// a drifting cloud layer: anisotropic, domain-warped fbm thresholded into a wash shape
float cloudField(vec2 q, float drift, vec2 freq, float seed) {
  vec2 p = vec2((q.x + drift) * freq.x, q.y * freq.y) + seed;
  return wfbm(p);
}

// a cumulus seen at sunset: scalloped puffs on a flat base, all drifting together
float puffCloud(vec2 q, float cx, float baseY, float w, float h, float seed) {
  float d = 1e3;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float f = fi / 7.0 - 0.5;
    float hs = fract(sin(fi * 12.9898 + seed * 78.233) * 43758.5453);
    float x = cx + f * w + (hs - 0.5) * w * 0.12;
    float r = h * (0.45 + 0.55 * hs) * (1.0 - 0.65 * f * f * 4.0 * 0.6);
    vec2 c = vec2(x, baseY - r * 0.45);
    d = min(d, length((q - c) * vec2(0.8, 1.0)) - r);
  }
  // flat, slightly wavering base
  d = max(d, (q.y - baseY) - 0.004 * gnoise(vec2(q.x * 40.0, seed)));
  d += 0.006 * fbm(q * 34.0 + seed) + 0.0018 * gnoise(q * 160.0 + seed);
  return d;
}
float wrapX(float x, float w) { float span = ASP + w * 1.2; return mod(x + w * 0.6, span) - w * 0.6; }

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 q = vec2(uv.x * ASP, uv.y);
  vec2 pp = uv * uPaperScale;
  float t = uTime;
  vec3 col = PAPER_C;
  float tooth = paperHeight(pp);

  // the outer edge is handled by deckle() in the composite; paint a little past it
  float sheet = -1.0;

  vec2 sunC = vec2(SUNX, YH - 0.017);
  float sunD = length(q - sunC);

  if (uv.y < YH + 0.002) {
    // ---------------- sky ----------------
    float ty = uv.y / YH;
    float wet = wfbm(q * vec2(2.2, 5.0) + vec2(t * 0.004, 0.0));
    float bands = fbm(vec2((q.x + t * 0.003) * 2.0, q.y * 15.0) + 3.0);
    float glow = exp(-pow(sunD / 0.11, 1.2));
    float hglow = exp(-pow(abs(uv.y - YH) / 0.05, 1.5)) * exp(-pow(abs(q.x - SUNX) / 0.3, 2.0));
    float lifted = smoothstep(0.1, 0.35, wfbm(q * vec2(3.0, 9.0) + vec2(t * 0.005, 0.0) + 60.0));
    float keep = (1.0 - 0.88 * glow) * (1.0 - 0.45 * hglow) * (1.0 - 0.55 * lifted);
    float g = granulate(pp, 0.7);
    float inSky = smoothstep(0.002, -0.002, sheet);

    col = glaze(col, PEACH, inSky * g, (0.4 + 0.3 * wet) * keep);
    col = glaze(col, ROSE, inSky * g, (1.0 - smoothstep(0.0, 0.55, ty)) * (0.7 + 0.5 * wet) * keep);
    col = glaze(col, ORANGE, inSky * g, smoothstep(0.3, 0.8, ty) * (0.6 + 0.5 * bands) * keep);
    col = glaze(col, CORAL, inSky * g, smoothstep(0.65, 1.0, ty) * (0.4 + 0.4 * bands) * keep);

    // hard-edged horizontal wash strokes of orange across the sky (the painter's second pass)
    float sk = fbm(vec2((q.x + t * 0.005) * 3.2, q.y * 26.0) + 11.0) + 0.1 * gnoise(q * 90.0);
    float dsk = max((0.16 - sk) * 0.04, sheet) + 0.02 * band(uv.y, 0.0, 0.08);
    col = wash(col, mix(ORANGE, CORAL, ty), dsk, 0.0008, 0.5 * keep * smoothstep(0.1, 0.4, ty), 1.6, 0.003, 1.0, uv);

    // ---- clouds ----
    // high mauve clouds: two small cumulus drifting right
    {
      float ca = wrapX(0.36 + t * 0.0045, 0.22);
      float da = puffCloud(q, ca, 0.062, 0.2, 0.03, 1.0);
      float cb = wrapX(0.05 + t * 0.0038, 0.16);
      float db = puffCloud(q, cb, 0.048, 0.15, 0.022, 4.0);
      float dc = min(da, db);
      float topSoft = smoothstep(0.05, 0.02, uv.y);
      col = wash(col, mix(MAUVE, MAGENTA, 0.25 + 0.35 * wet), dc, mix(0.001, 0.006, topSoft), 0.9, 1.7, 0.004, 1.2, uv);
      // shadowed underside, laid wet into the first wash
      float under = smoothstep(0.035, 0.06, uv.y);
      col = glaze(col, MAUVE, smoothstep(0.002, -0.006, dc) * under, 0.45);
    }

    // the big rose cloud: scalloped top bleeding soft, flat hard-edged base, coral-lit
    float d2;
    {
      float x = q.x + t * 0.007;
      vec2 cm = vec2(x - 0.24, uv.y - 0.14);
      float v = cm.y / 0.065;
      float prof = 1.0 - v * v * (v > 0.0 ? 3.0 : 0.7);
      float spread = exp(-pow(abs(cm.x) / 0.26, 2.0));
      float n = wfbm(vec2(x * 6.0, uv.y * 11.0) + 7.0);
      float puffs = 0.25 * gnoise(vec2(x * 22.0, uv.y * 14.0) + 2.0);
      float c = n * 1.0 + puffs + 0.75 * prof * spread - 0.45;
      d2 = max(min(-c * 0.045, puffCloud(q, wrapX(0.2 + t * 0.007, 0.34), 0.175, 0.3, 0.05, 9.0) + 0.004), sheet);
      float top = smoothstep(0.155, 0.11, uv.y);
      float soft = mix(0.0008, 0.007, top * smoothstep(-0.1, 0.25, gnoise(vec2(x * 9.0, 5.0))));
      col = wash(col, mix(MAGENTA, mix(SCARLET, MAUVE, step(0.0, wet)), 0.25 + 0.3 * abs(wet)), d2, soft, 0.8, 1.7, 0.004, 1.3, uv);
      col = glaze(col, CORAL, smoothstep(0.002, -0.012, d2) * smoothstep(0.17, 0.12, uv.y), 0.35);
      // a smaller, darker second glaze inside, crisp
      float d2b = max(d2 + 0.004, (0.12 - wfbm(vec2(x * 11.0, uv.y * 24.0) + 3.0)) * 0.03);
      col = wash(col, MAUVE * MAGENTA * 1.15, d2b, 0.0007, 0.55, 1.4, 0.002, 1.2, uv);
      // detached wisps to the right, drifting a little faster
      float x2 = q.x + t * 0.009;
      float v2 = (uv.y - 0.205) / 0.018;
      float w2 = wfbm(vec2(x2 * 5.0, uv.y * 30.0) + 17.0) + 0.6 * (1.0 - v2 * v2) * smoothstep(0.2, 0.45, x2 - 0.0 * x) - 0.48;
      w2 = mix(-1.0, w2, step(abs(v2), 2.0));
      float dw = max(-w2 * 0.03, sheet);
      col = wash(col, mix(ORANGE, SCARLET, 0.55), dw, 0.0008, 0.75, 1.5, 0.002, 1.1, uv);
    }
    // salt / dropped-water flecks lift the pigment in little spots
    {
      vec2 sc = floor((q + vec2(t * 0.007, 0.0)) / 0.018);
      float h = wcHash1(sc);
      vec2 cpos = (sc + 0.5 + 0.35 * wcHash2(sc + 3.0)) * 0.018 - vec2(t * 0.007, 0.0);
      float fd = length(q - cpos) - (0.0012 + 0.002 * fract(h * 17.0));
      float fleck = smoothstep(0.0006, -0.0006, fd) * step(0.9, h) * smoothstep(0.01, -0.01, d2);
      col = mix(col, mix(col, PAPER_C, 0.7), fleck);
    }

    // thin streaks lower in the sky
    {
      float x = q.x + t * 0.01;
      float v = (uv.y - 0.255) / 0.03;
      float cov = smoothstep(-0.25, 0.2, gnoise(vec2(x * 3.5, 9.0)));
      float c = wfbm(vec2(x * 3.0, uv.y * 40.0) + 13.0) + 0.55 * (1.0 - v * v) * cov - 0.45;
      float d = max(-c * 0.03, sheet);
      col = wash(col, mix(CORAL, MAGENTA, 0.35 + 0.3 * gnoise(vec2(x * 5.0, 1.0))), d, 0.0008, 0.8, 1.5, 0.002, 1.0, uv);
    }

    // lilac and coral streaks a little higher, thin and broken
    {
      float x = q.x + t * 0.008;
      float v = (uv.y - 0.315) / 0.018;
      float cov = smoothstep(-0.2, 0.2, gnoise(vec2(x * 4.0, 31.0)));
      float c = wfbm(vec2(x * 3.6, uv.y * 70.0) + 41.0) + 0.6 * (1.0 - v * v) * cov - 0.5;
      float d = max(-c * 0.02, sheet);
      col = wash(col, mix(MAUVE, CORAL, 0.5 + 0.5 * gnoise(vec2(x * 4.0, 8.0))), d, 0.0007, 0.75, 1.5, 0.002, 1.1, uv);
    }

    // low scarlet and rose streaks on the horizon, parted around the sun
    {
      float x = q.x + t * 0.012;
      float part = smoothstep(0.04, 0.1, abs(q.x - SUNX));
      float v = (uv.y - 0.36) / 0.018;
      float cov = smoothstep(-0.05, 0.3, gnoise(vec2(x * 5.0, 13.0)));
      float c = wfbm(vec2(x * 3.4, uv.y * 60.0) + 21.0) + 0.65 * (1.0 - v * v) * part * cov - 0.5;
      float d = max(-c * 0.025, sheet);
      col = wash(col, mix(SCARLET, MAGENTA, 0.45 + 0.5 * gnoise(vec2(x * 6.0, 2.0))), d, 0.0007, 0.95, 1.6, 0.002, 1.1, uv);
    }

    // the sun: bare paper, the faintest warm wash, a crisp edge
    float ds = sunD - 0.026 - 0.0008 * gnoise(q * 300.0);
    float sunIn = smoothstep(0.0008, -0.0008, ds);
    col = mix(col, PAPER_C * vec3(1.0, 0.995, 0.975), sunIn);
    col = glaze(col, PEACH, exp(-max(ds, 0.0) / 0.003) * (1.0 - sunIn), 0.25);

    // bare paper outside the painted area
    col = mix(PAPER_C, col, smoothstep(0.002, -0.002, sheet));
  } else {
    // ---------------- sea ground wash ----------------
    float S = (uv.y - YH) / (1.0 - YH);
    float wet = wfbm(q * vec2(1.5, 6.0) + 40.0);
    float inSea = smoothstep(0.002, -0.002, sheet);
    float g = granulate(pp, 1.0);
    float column = exp(-pow(abs(q.x - SUNX) / (0.04 + 0.2 * S), 2.0));
    col = glaze(col, PINK, inSea * g, (1.0 - 0.75 * smoothstep(0.0, 0.8, S)) * (0.6 + 0.4 * wet) + column * 0.45 * (1.0 - S));
    col = glaze(col, PEACH, inSea * g, column * 0.5 * (1.0 - S) + 0.25 * smoothstep(0.2, 0.5, fbm(q * vec2(3.0, 30.0) + 5.0)));
    col = glaze(col, LILAC, inSea * g, (0.5 + 0.3 * wet) * smoothstep(0.0, 0.25, S));
    col = glaze(col, PURPLE, inSea * g, band(S, 0.38, 0.25) * (0.4 + 0.4 * wet));
    col = glaze(col, VIOLET, inSea * g, smoothstep(0.35, 0.85, S) * (0.3 + 0.4 * wet));
    col = glaze(col, ULTRA, inSea * g, smoothstep(0.55, 1.0, S) * (0.45 + 0.4 * wet));
    col = glaze(col, TEALBLUE, inSea * g, smoothstep(0.7, 1.0, S) * 0.35 * smoothstep(-0.1, 0.3, wet));
    // the far water right under the horizon: a darker, crisp-topped lilac band
    float far = smoothstep(0.0, 0.004, uv.y - YH) * (1.0 - smoothstep(0.02, 0.05, uv.y - YH));
    col = glaze(col, PURPLE * PINK, inSea * g, far * 0.7 * (1.0 - 0.6 * column));
    col = mix(PAPER_C, col, smoothstep(0.002, -0.002, sheet));
  }
  gl_FragColor = vec4(col, tooth);
}
`;

/** Ripples on the sea, in a grid that is denser vertically so rings read as flattened ellipses. */
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
 * Per-frame: the sea's brush strokes (they drift and swell), the sun path's broken
 * glints, cursor glints and ripples, over the sky and ground wash.
 */
export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPaint;
uniform sampler2D uSim;
uniform vec2 uSimTexel;
uniform vec2 uPaperScale;
uniform float uTime;
uniform vec4 uGlints[${MAX_GLINTS}]; // q.x, uv.y, age 0..1, length
${NOISE}
${PAPER}
${EDGE}
${COMMON}

float tooth;

float granul(vec2 pp, float gran) {
  float floc = 0.5 + 0.5 * gnoise(pp / 3.5 + 17.0);
  return mix(1.0, (1.45 - tooth) * (0.75 + 0.5 * floc), gran);
}

// row coordinate: rows get thinner toward the horizon (perspective)
const float ROWS = 40.0;
float rowCoord(float s) { return ROWS * pow(max(s, 1e-5), 0.68); }
float rowHeight(float s) { return 1.0 / (ROWS * 0.68 * pow(max(s, 1e-4), -0.32)); }

vec3 seaPigment(float S, float h) {
  float k = clamp(S * 5.6 + (h - 0.5) * (1.4 + 2.4 * S) - 0.2, 0.0, 5.0);
  vec3 a = PINK;
  a = mix(a, LILAC, clamp(k, 0.0, 1.0));
  a = mix(a, PURPLE, clamp(k - 1.0, 0.0, 1.0));
  a = mix(a, VIOLET, clamp(k - 2.0, 0.0, 1.0));
  a = mix(a, ULTRA, clamp(k - 3.0, 0.0, 1.0));
  a = mix(a, mix(DEEP, TEALBLUE, step(0.55, fract(h * 13.0))), clamp(k - 4.0, 0.0, 1.0));
  return a;
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 q = vec2(uv.x * ASP, uv.y);
  vec2 pp = uv * uPaperScale;
  vec4 base = texture2D(uPaint, vUv);
  tooth = base.a;
  vec3 col = base.rgb;
  float t = uTime;

  if (uv.y > YH) {
    float s = uv.y - YH;
    float S = s / (1.0 - YH);
    vec2 sv = vec2(uv.x, S); // sea uv for the sim
    vec2 st = vec2(sv.x, 1.0 - sv.y);
    float hc = texture2D(uSim, st).r;
    float hx = texture2D(uSim, st + vec2(uSimTexel.x, 0.0)).r - texture2D(uSim, st - vec2(uSimTexel.x, 0.0)).r;
    float hy = texture2D(uSim, st - vec2(0.0, uSimTexel.y)).r - texture2D(uSim, st + vec2(0.0, uSimTexel.y)).r;

    float edgeMask = 1.0;
    float R = rowCoord(s) + hc * 2.2 + hy * 6.0;
    float rh = rowHeight(s);
    float column = exp(-pow(abs(q.x - SUNX) / (0.03 + 0.2 * S), 2.0));

    // ---- brush strokes ----
    float rowI = floor(R);
    for (int j = -2; j <= 2; j++) {
      float row = rowI + float(j);
      float rh1 = wcHash1(vec2(row, 3.7));
      float dir = rh1 > 0.5 ? 1.0 : -1.0;
      float drift = dir * t * (0.0025 + 0.004 * rh1) + 0.006 * sin(t * 0.35 + row * 0.9);
      float cw = 0.13 + 0.25 * wcHash1(vec2(row, 9.1));
      float xr = q.x + drift + hx * 0.02;
      float k0 = floor(xr / cw);
      for (int i = -1; i <= 1; i++) {
        float k = k0 + float(i);
        vec2 id = vec2(row, k);
        float h = wcHash1(id);
        float h2 = wcHash1(id + 31.0);
        float h3 = wcHash1(id + 77.0);
        if (h3 < 0.16) continue; // gaps let the ground wash and paper through
        float L = cw * (0.38 + 0.4 * h2);
        float cx = (k + 0.5 + (h - 0.5) * 0.4) * cw;
        float cy = row + 0.5 + (h2 - 0.5) * 0.5 + 0.12 * sin(t * 0.6 + k * 1.7 + row);
        float T = 0.26 + 0.34 * h;
        float dx = (xr - cx) / L;
        float taper = pow(max(1.0 - pow(abs(dx), 2.6), 0.0), 0.45);
        // brushy edge: wobble along the stroke, ragged dry-brush ends
        float wob = 0.18 * gnoise(vec2(xr * 70.0, row * 3.1)) + 0.12 * gnoise(vec2(xr * 260.0, row * 5.3 + 2.0));
        float up = R < cy ? 1.0 : 0.0; // crests: the upper edge is wavier
        float crest = up * 0.35 * gnoise(vec2(xr * 38.0, row * 7.7 + 5.0));
        // warm sky reflections near the sun path and scattered elsewhere: thinner slivers
        // decided per stroke (at its centre), so a stroke never changes colour midway
        float sRow = pow(max(cy, 0.0) / ROWS, 1.0 / 0.68);
        float SRow = sRow / (1.0 - YH);
        float colC = exp(-pow(abs(cx - drift - hx * 0.02 - SUNX) / (0.03 + 0.2 * SRow), 2.0));
        float warmP = 0.2 + 0.45 * colC * (1.0 - SRow * 0.5);
        bool warm = h2 * 0.7 + h3 * 0.3 < warmP;
        float dRows = abs(R - cy) - T * (warm ? 0.55 : 1.0) * taper * (1.0 + wob + crest);
        float d = dRows * rh;
        if (d > rh * 0.5) continue;
        float endDry = smoothstep(0.55, 1.0, abs(dx));
        d += endDry * (tooth - 0.35) * rh * 0.6;
        vec3 pig = warm ? (h < 0.4 ? CORAL : (h < 0.75 ? mix(PINK, CORAL, 0.5) : PEACH)) : seaPigment(SRow, h);
        float dens = warm ? 0.5 + 0.3 * h : 0.55 + 0.75 * h2;
        dens *= warm ? 1.0 : 0.9 + 0.8 * SRow;
        float softE = rh * mix(0.05, 0.35, step(0.72, fract(h * 23.0)));
        float cover = smoothstep(softE, -softE, d) * edgeMask;
        float rim = exp(-max(-d, 0.0) / (rh * T * 0.3)) * cover * (softE > rh * 0.1 ? 0.3 : 1.0);
        float a = cover * (1.0 + 1.6 * rim) * granul(pp, 1.0);
        col *= pow(pig, vec3(dens * a));
      }
    }

    // ---- the sun path: broken lifts of bare paper that twinkle ----
    float glintW = 0.016 + 0.06 * S;
    for (int j = 0; j <= 1; j++) {
      float row = floor(R) + float(j) - 0.0;
      float cw = 0.028 + 0.035 * wcHash1(vec2(row, 1.3));
      float xr = q.x - SUNX + 0.004 * sin(t * 0.5 + row);
      float k = floor(xr / cw + 0.5);
      vec2 id = vec2(row, k) + 400.0;
      float h = wcHash1(id);
      float cx = k * cw;
      float prob = exp(-pow(abs(cx) / glintW, 1.8)) + 0.006;
      float tw = 0.5 + 0.5 * sin(t * (1.2 + 1.8 * fract(h * 7.0)) + h * 40.0);
      if (h < prob * smoothstep(0.0, 0.45, tw)) {
        float L = cw * (0.3 + 0.35 * fract(h * 3.3)) * (1.0 - 0.45 * S);
        float dx = (xr - cx) / L;
        float cyr = row + 0.5 + (fract(h * 5.1) - 0.5) * 0.4;
        float T = 0.09 + 0.1 * fract(h * 9.7);
        float taper = pow(max(1.0 - dx * dx, 0.0), 0.6);
        float d = (abs(R - cyr) - T * taper) * rh + (tooth - 0.5) * rh * 0.12;
        float lift = smoothstep(rh * 0.05, -rh * 0.05, d) * edgeMask;
        float glow = smoothstep(rh * 0.6, 0.0, d) * edgeMask;
        col *= pow(PEACH, vec3(glow * 0.25));
        col = mix(col, PAPER_C * vec3(1.0, 0.99, 0.96), lift * 0.92);
      }
    }

    // ---- cursor glints: little sparks of lifted paper with a warm halo ----
    for (int i = 0; i < ${MAX_GLINTS}; i++) {
      vec4 gl = uGlints[i];
      if (gl.z <= 0.0 || gl.z >= 1.0) continue;
      float gs = gl.y - YH;
      if (gs <= 0.0) continue;
      float grh = rowHeight(gs);
      vec2 d2 = vec2((q.x - gl.x) / gl.w, (uv.y - gl.y) / (grh * 0.32));
      float a = smoothstep(0.0, 0.08, gl.z) * (1.0 - smoothstep(0.45, 1.0, gl.z));
      float r = length(d2) + (tooth - 0.5) * 0.25;
      float sp = smoothstep(1.0, 0.86, r);
      float halo = smoothstep(2.6, 0.9, length(d2 * vec2(0.8, 0.6)));
      col *= pow(CORAL, vec3(halo * a * 0.35));
      col = mix(col, PAPER_C, sp * a * 0.95);
    }

    // ---- ripples: lift on the facing slopes, pool on the far ones ----
    float shade = (hy * 9.0 - hx * 2.0) + (tooth - 0.5) * 0.12 + 0.08 * gnoise(vec2(q.x * 300.0, R * 4.0));
    float lift = smoothstep(0.08, 0.3, shade) * edgeMask;
    float pool = smoothstep(0.08, 0.32, -shade) * edgeMask;
    col = mix(col, mix(PAPER_C, PEACH, 0.3), lift * 0.7);
    col *= pow(VIOLET * DEEP, vec3(pool * 0.45));
  }

  // paper relief over everything
  float t2 = paperHeight(pp + vec2(1.2, 1.2));
  col *= 1.0 + (tooth - t2) * 0.09;

  // painted straight onto the page: deckled, tilted, dry-brushed edge, pigment pooled at the rim
  float rim;
  float m = deckle(uv, ASP, 2.0, 0.022, tooth, rim);
  col *= pow(clamp(col / PAPER_C, 0.0, 1.0), vec3(rim * 0.55));
  gl_FragColor = vec4(col * m, m);
}
`;
