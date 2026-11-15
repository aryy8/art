import { WC_ALL } from "../../lib/watercolor.glsl";
import { POND_GLSL } from "./shape";

/**
 * The static painting. Rendered once per resolution into a texture:
 *   rgb = pigment on paper, a = how much "water" is at this point (for the ripples).
 * Everything is procedural: washes, granulation, blooms, reeds, lily pads, ink.
 */
export const PAINT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
${WC_ALL}
${POND_GLSL}

const vec3 PAPER    = vec3(0.984, 0.980, 0.968);
const vec3 OCHRE    = vec3(0.965, 0.880, 0.660);
const vec3 SAP      = vec3(0.780, 0.860, 0.560);
const vec3 HOOKER   = vec3(0.560, 0.700, 0.520);
const vec3 OLIVE    = vec3(0.720, 0.740, 0.500);
const vec3 SIENNA   = vec3(0.930, 0.720, 0.560);
const vec3 UMBER    = vec3(0.700, 0.600, 0.520);
const vec3 CERULEAN = vec3(0.740, 0.880, 0.940);
const vec3 ULTRA    = vec3(0.660, 0.720, 0.930);
const vec3 INDIGO   = vec3(0.600, 0.650, 0.760);
const vec3 SEPIA    = vec3(0.420, 0.360, 0.320);
const vec3 ROSE     = vec3(0.990, 0.720, 0.760);
const vec3 TEAL     = vec3(0.700, 0.900, 0.880);
const vec3 VIOLET   = vec3(0.860, 0.800, 0.920);
const vec3 GREY     = vec3(0.800, 0.800, 0.820);

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float segT(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
}

// broken pen line along the zero set of a distance field
float inkLine(float d, float w, vec2 q, float breakup) {
  float line = 1.0 - smoothstep(w * 0.35, w, abs(d));
  float gaps = smoothstep(-0.05, 0.25, gnoise(q * 22.0) + breakup);
  float press = 0.6 + 0.4 * gnoise(q * 9.0 + 4.0);
  return line * gaps * press;
}

// a tree canopy seen from above: several lobes, wet-on-wet greens, a shadowed side
float canopySDF(vec2 p, float r, float seed) {
  float d = 1e3;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float a = fi * 1.047 + seed * 2.1 + 0.4 * sin(fi * 3.3 + seed);
    float rr = r * (0.48 + 0.18 * fract(sin(fi * 7.1 + seed) * 91.3));
    vec2 c = vec2(cos(a), sin(a)) * r * (0.42 + 0.1 * sin(fi + seed));
    d = min(d, length(p - c) - rr);
  }
  d = min(d, length(p) - r * 0.6);
  float a = atan(p.y, p.x);
  return d + r * (0.12 * fbm(p / r * 2.2 + seed * 5.0) + 0.04 * gnoise(p * 260.0 + seed));
}

vec3 tree(vec3 col, vec2 q, vec2 uv, vec2 c, float r, float seed) {
  vec2 p = q - c;
  if (length(p) > r * 2.4) return col;
  float d = canopySDF(p, r, seed);
  // cast shadow on the ground (down-right), soft and cool
  float ds = canopySDF(p - vec2(0.35, 0.45) * r, r, seed) ;
  col = wash(col, mix(HOOKER, INDIGO, 0.35), ds, 0.01, 0.45, 0.3, 0.03, 0.6, uv);
  float wet = wfbm(p / r * 1.3 + seed * 3.1);
  vec3 pig = mix(SAP, OLIVE, 0.5 + 0.5 * wet);
  col = wash(col, pig, d, 0.0025, 0.85 + 0.5 * wet, 1.3, 0.01, 0.9, uv);
  // inner shadow glaze, laid while damp: soft toward the light, crisp edge at the canopy
  float side = dot(p / r, normalize(vec2(0.6, 0.8)));
  float sh = side + 0.55 * wfbm(p / r * 2.0 + seed * 7.0) - 0.05;
  float dsh = max(d + 0.002, -sh * r * 0.25);
  col = wash(col, HOOKER, dsh, r * 0.04, 0.95, 1.2, 0.01, 1.0, uv);
  // dark accents tucked under the lobes
  float acc = max(d + 0.004, -(side - 0.55 + 0.3 * gnoise(p / r * 6.0 + seed)) * r * 0.3);
  col = wash(col, HOOKER * INDIGO, acc, 0.0015, 0.7, 1.4, 0.004, 1.0, uv);
  return col;
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 q = (uv - 0.5) * vec2(ASPECT, 1.0);
  vec2 pp = uv * uPaperScale;
  vec3 col = PAPER;

  float d = pondSDF(q);
  // the painted boundary wobbles at several scales, like a hand-held brush
  float dW = d + 0.007 * fbm(q * 18.0 + 2.0) + 0.0018 * gnoise(q * 140.0);

  // the painted area: a loose vignette that never reaches the sheet edge
  vec2 bq = abs(q) - vec2(ASPECT * 0.5 - 0.085, 0.5 - 0.075);
  float sheet = length(max(bq, 0.0)) + min(max(bq.x, bq.y), 0.0) - 0.04;
  sheet += 0.05 * fbm(q * 3.5 + 3.0) + 0.016 * fbm(q * 24.0 + 1.0);
  // dry-brush: near the outer edge the brush skips over paper tooth
  float tooth = paperHeight(pp * 0.7);
  float dry = smoothstep(-0.05, 0.0, sheet) * (tooth - 0.45) * 0.05;
  sheet += dry;

  // ---------- land ----------
  float wetL = wfbm(q * 2.4 + 11.0);
  col = wash(col, OCHRE, sheet, 0.004, 0.55 + 0.4 * wetL, 0.9, 0.02, 0.7, uv);

  // sap-green fields, wet-on-wet into the ochre
  float g = wfbm(q * 2.0 + vec2(4.0, -2.0));
  float dg = max(max(sheet + 0.02, (0.02 - g) * 0.22), -dW + 0.004);
  col = wash(col, mix(SAP, OLIVE, 0.35 + 0.3 * wfbm(q * 4.0 + 1.0)), dg, 0.012, 0.75 + 0.5 * wfbm(q * 6.0), 1.1, 0.015, 0.8, uv);
  // a second, smaller green glaze laid over the first once it dried: crisp edges
  float g2 = wfbm(q * 3.3 + vec2(-3.0, 8.0));
  float dg2 = max(max(sheet + 0.04, (0.16 - g2) * 0.18), -dW + 0.01);
  col = wash(col, OLIVE, dg2, mix(0.0015, 0.01, smoothstep(-0.1, 0.2, gnoise(q * 4.0 + 8.0))), 0.4, 1.4, 0.006, 1.0, uv);
  // grass: short dry-brush hatching in a couple of directions
  {
    float landMask = smoothstep(0.0, -0.02, sheet) * smoothstep(0.0, 0.02, dW);
    float ang = 1.15 + 0.4 * fbm3(q * 2.0);
    vec2 hq = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * q;
    float hatch = gnoise(hq * vec2(70.0, 520.0)) + 0.35 * fbm3(q * 8.0);
    float hm = smoothstep(0.22, 0.4, hatch) * landMask * smoothstep(-0.1, 0.25, wfbm(q * 3.0 + 40.0));
    col = glaze(col, OLIVE * HOOKER, hm * granulate(pp, 0.6), 0.75);
  }

  // warm sienna earth patches
  float s = wfbm(q * 3.0 + vec2(-7.0, 5.0));
  float ds = max(max(sheet + 0.03, (0.2 - s) * 0.2), -dW + 0.02);
  col = wash(col, SIENNA, ds, 0.006, 0.6, 1.4, 0.012, 1.2, uv);

  // the bank: deep green shadow hugging the water, soft outside, crisp at the waterline
  float bankW = 0.03 + 0.03 * (0.5 + fbm(q * 7.0 + 9.0));
  float dBank = max(dW - bankW, -dW - 0.002);
  col = wash(col, HOOKER, dBank, 0.012, 0.75 + 0.4 * wfbm(q * 12.0), 0.6, 0.02, 0.9, uv);
  col = wash(col, UMBER, max(dW - 0.008, -dW), 0.003, 0.45, 1.0, 0.004, 1.0, uv);

  // stones on the bank
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float ang = 0.6 + fi * 0.93 + 0.3 * sin(fi * 3.7);
    vec2 c = vec2(${"0.02"} + 1.42 * cos(ang) * pondR(ang) * 1.03, 0.015 + sin(ang) * pondR(ang) * 1.03);
    vec2 p = q - c;
    float rr = 0.007 + 0.006 * fract(sin(fi * 12.9) * 43.1);
    float dst = length(p * vec2(1.0, 1.25)) - rr * (1.0 + 0.25 * gnoise(p * 300.0 + fi));
    col = wash(col, GREY, dst, 0.0015, 0.9, 1.6, 0.003, 1.2, uv);
    col = wash(col, INDIGO, max(dst, -(p.x + p.y) * 0.7 - 0.001), 0.0015, 0.5, 0.5, 0.003, 1.0, uv);
  }

  // trees overhanging the banks
  col = tree(col, q, uv, vec2(-0.56, -0.30), 0.095, 1.0);
  col = tree(col, q, uv, vec2(-0.43, -0.37), 0.065, 2.0);
  col = tree(col, q, uv, vec2(0.58, -0.27), 0.08, 3.0);
  col = tree(col, q, uv, vec2(0.50, 0.33), 0.10, 4.0);
  col = tree(col, q, uv, vec2(0.62, 0.20), 0.06, 5.0);
  col = tree(col, q, uv, vec2(-0.55, 0.33), 0.075, 6.0);

  // ---------- water ----------
  float inW = smoothstep(0.0025, -0.0025, dW);
  float depth = smoothstep(0.0, -0.2, d);
  float wet = wfbm(q * 2.8 + 21.0);
  float wet2 = wfbm(q * 5.5 + 3.0);

  // sky lifts: horizontal-ish streaks of bare paper the painter left
  float streak = fbm(vec2(q.x * 2.8 - q.y * 0.6, q.y * 15.0) + 13.0) + 0.12 * gnoise(q * 60.0);
  float lift = smoothstep(0.16, 0.3, streak) * smoothstep(0.02, -0.06, d);

  // blooms (backruns): a wetter drop pushed pigment outward, leaving a crinkled rim
  float bloomIn = 0.0;
  float bloomRim = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 c = vec2(-0.2 + 0.24 * fi, -0.08 + 0.17 * sin(fi * 2.3 + 1.0));
    float r = 0.05 + 0.025 * fi;
    vec2 p = q - c;
    float a = atan(p.y, p.x);
    float db = length(p * vec2(0.8, 1.1)) - r * (1.0 + 0.45 * fbm(vec2(a * 1.7, fi * 7.0) + p * 6.0) + 0.08 * gnoise(p * 160.0));
    float partial = smoothstep(-0.1, 0.25, gnoise(vec2(a * 1.5, fi * 3.0)));
    bloomIn = max(bloomIn, smoothstep(0.006, -0.03, db) * 0.7);
    bloomRim = max(bloomRim, exp(-abs(db + 0.002) / 0.003) * partial * (0.5 + 0.5 * gnoise(p * 80.0)));
  }

  // cerulean ground of the water, wet edge pooled at the shore
  float wd = (0.7 + 0.5 * wet) * (1.0 - 0.85 * lift) * (1.0 - 0.3 * bloomIn) + 0.7 * bloomRim * inW;
  col = wash(col, CERULEAN, dW, 0.0015, wd, 2.0, 0.012, 1.0, uv);
  // a breath of teal, bled in while wet
  col = glaze(col, TEAL, inW * granulate(pp, 0.6), smoothstep(-0.05, 0.3, wfbm(q * 3.4 + 50.0)) * 0.55 * (1.0 - lift));

  // ultramarine deepens toward the middle, laid wet so it bleeds and granulates hard
  float ud = depth * (0.65 + 0.8 * wet2) * (1.0 - 0.75 * lift) * (1.0 - 0.3 * bloomIn) + 0.45 * bloomRim * depth;
  col = glaze(col, ULTRA, inW * granulate(pp, 1.4), ud);
  // a touch of violet in the deepest water
  col = glaze(col, VIOLET, inW * granulate(pp, 1.0), smoothstep(-0.1, -0.24, d) * 0.35 * (0.6 + wet2));

  // second washes laid once the first dried: several smaller shapes with darkened edges,
  // some edges still wet (soft), some crisp
  float sw = wfbm(q * 3.4 + vec2(31.0, -4.0)) + 0.18 * smoothstep(0.0, -0.2, d);
  float swSoft = mix(0.0012, 0.014, smoothstep(-0.1, 0.2, gnoise(q * 5.0 + 2.0)));
  float dsw = max((0.17 - sw) * 0.2, dW + 0.014);
  col = wash(col, mix(ULTRA, TEAL, 0.35), dsw, swSoft, 0.38 * (1.0 - 0.7 * lift), 1.6, 0.005, 1.2, uv);

  // reflections of the banks: indigo-green band just inside the waterline
  float refl = smoothstep(-0.07 - 0.04 * fbm(q * 6.0 + 5.0), -0.005, d);
  col = glaze(col, mix(INDIGO, HOOKER, 0.5), inW * granulate(pp, 0.9), refl * (0.85 + 0.5 * wet2));
  // tree reflections are darker where trees overhang
  float treeRefl = smoothstep(0.2, 0.0, length((q - vec2(-0.47, -0.27)) * vec2(0.8, 1.4)))
                 + smoothstep(0.22, 0.0, length((q - vec2(0.48, 0.27)) * vec2(0.8, 1.4)))
                 + smoothstep(0.16, 0.0, length((q - vec2(0.53, -0.22)) * vec2(0.8, 1.4)));
  col = glaze(col, HOOKER * INDIGO * 1.15, inW * granulate(pp, 0.8), treeRefl * 0.6 * (0.7 + 0.6 * wfbm(q * 8.0)));

  // depth contours: faint ink, like a map
  float ink = 0.0;
  ink += 0.32 * inkLine(dW + 0.055 + 0.01 * fbm(q * 5.0), 0.0012, q, -0.05) * inW;
  ink += 0.2 * inkLine(dW + 0.12 + 0.015 * fbm(q * 4.0 + 2.0), 0.0011, q + 3.0, -0.15) * inW;

  // ---------- lily pads ----------
  float padCover = 0.0;
  vec2 clusters[2];
  clusters[0] = vec2(-0.27, 0.13);
  clusters[1] = vec2(0.30, -0.12);
  for (int k = 0; k < 2; k++) {
    vec2 cc = clusters[k];
    vec2 g0 = floor((q - cc) / 0.03);
    for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 cell = g0 + vec2(float(i), float(j));
      float h = wcHash1(cell + float(k) * 19.0);
      vec2 cpos = cc + (cell + 0.5 + 0.35 * (wcHash2(cell + 7.0 + float(k))) ) * 0.03;
      float distC = length((cpos - cc) * vec2(0.8, 1.2));
      if (h > 1.0 - smoothstep(0.14, 0.02, distC) * 0.95) {
        float r = 0.008 + 0.008 * fract(h * 13.7);
        vec2 p = q - cpos;
        float ang = fract(h * 7.3) * 6.2831;
        vec2 rp = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p;
        float dp = length(p * vec2(1.0, 1.08)) - r * (1.0 + 0.06 * gnoise(p * 400.0 + h * 10.0));
        // the notch
        float notch = (abs(atan(rp.y, rp.x)) < 0.28 && rp.x > 0.0) ? 1.0 : 0.0;
        dp = mix(dp, max(dp, 0.002), notch);
        float pc = smoothstep(0.001, -0.001, dp);
        padCover = max(padCover, pc);
        col = wash(col, INDIGO, length(p - vec2(0.0025, 0.0035)) - r, 0.003, 0.35 * inW, 0.0, 0.01, 0.6, uv);
        col = wash(col, SAP * vec3(0.98, 1.0, 0.95), dp, 0.0008, 1.1 + 0.6 * gnoise(p * 120.0), 1.5, 0.003, 1.0, uv);
        col = wash(col, HOOKER, max(dp, -(rp.y) * 0.4 - 0.0), 0.002, 0.45, 0.6, 0.004, 1.0, uv);
        // veins
        ink += 0.12 * pc * (1.0 - smoothstep(0.0002, 0.0006, abs(sin(atan(rp.y, rp.x) * 4.0) * length(rp))));
        if (fract(h * 31.0) > 0.82) {
          vec2 fp = p + vec2(r * 0.25, -r * 0.2);
          float dfl = length(fp) - r * 0.42 * (1.0 + 0.25 * sin(atan(fp.y, fp.x) * 6.0));
          col = wash(col, ROSE, dfl, 0.0008, 1.4, 1.6, 0.002, 0.6, uv);
          col = wash(col, OCHRE * OCHRE, length(fp) - r * 0.12, 0.0006, 1.2, 0.0, 0.01, 0.0, uv);
        }
      }
    }
  }

  // ---------- reeds ----------
  float reedZone = smoothstep(0.05, 0.25, gnoise(vec2(atan(q.y - 0.015, (q.x - 0.02) / 1.42) * 1.6, 3.0)) + 0.1);
  if (abs(d) < 0.06 && reedZone > 0.0) {
    vec2 g0 = floor(q / 0.009);
    float rd = 1e3;
    for (int j = -2; j <= 2; j++)
    for (int i = -2; i <= 2; i++) {
      vec2 cell = g0 + vec2(float(i), float(j));
      vec2 base = (cell + 0.5 + 0.4 * wcHash2(cell)) * 0.009;
      float db = pondSDF(base);
      if (db > -0.012 && db < 0.012 && wcHash1(cell * 1.3) > 0.35) {
        vec2 c = base - vec2(0.02, 0.015);
        vec2 outw = normalize(vec2(c.x / (1.42 * 1.42), c.y));
        float a = (wcHash1(cell + 4.0) - 0.5) * 1.2;
        vec2 dir = mat2(cos(a), -sin(a), sin(a), cos(a)) * (-outw);
        float len = 0.012 + 0.024 * wcHash1(cell + 9.0);
        vec2 tip = base + dir * len;
        float t = segT(q, base, tip);
        float w = mix(0.0011, 0.0002, t);
        rd = min(rd, sdSeg(q, base, tip) - w);
      }
    }
    float reed = smoothstep(0.0004, -0.0002, rd) * reedZone;
    col = glaze(col, OLIVE * HOOKER, reed, 0.9);
  }

  // the shoreline in pen, broken and doubled
  ink += 0.5 * inkLine(dW + 0.001, 0.0014, q, 0.1);
  ink += 0.25 * inkLine(dW - 0.008 - 0.006 * fbm(q * 6.0), 0.001, q + 7.0, -0.1) * (1.0 - inW);

  col = glaze(col, SEPIA, 1.0, ink * 0.9);

  float waterA = smoothstep(0.002, -0.004, dW) * (1.0 - padCover);
  gl_FragColor = vec4(col, waterA);
}
`;
