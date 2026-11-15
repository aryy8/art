/**
 * Shared GLSL for watercolour pieces.
 *
 * The model: start from paper, then glaze washes on top Beer-Lambert style —
 * each wash multiplies the colour below by pow(transmittance, density). Overlapping
 * washes deepen naturally, like real transparent pigment. Density is modulated by
 *   - edge darkening (pigment migrates to the drying edge of a wash),
 *   - granulation (pigment settles into the paper's valleys),
 *   - flocculation (pigment clumps at a mid frequency),
 *   - wet-on-wet blooms (soft, warped density variations).
 */
export const NOISE = /* glsl */ `
vec2 wcHash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float wcHash1(vec2 p) {
  return fract(sin(dot(p, vec2(41.31, 289.17))) * 45758.5453);
}
// gradient noise, roughly -0.7..0.7
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(wcHash2(i), f), dot(wcHash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(wcHash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(wcHash2(i + 1.0), f - 1.0), u.x), u.y);
}
const mat2 WC_ROT = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * gnoise(p); p = WC_ROT * p; a *= 0.5; }
  return s;
}
float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * gnoise(p); p = WC_ROT * p; a *= 0.5; }
  return s;
}
// domain-warped fbm: the "wet" look, soft but structured
float wfbm(vec2 p) {
  vec2 w = vec2(fbm3(p + vec2(1.7, 9.2)), fbm3(p + vec2(8.3, 2.8)));
  return fbm(p + 1.6 * w);
}
`;

export const PAPER = /* glsl */ `
// cold-press paper height 0..1. p is in paper pixels (about 1 CSS px at 100% zoom).
float paperHeight(vec2 p) {
  float h = 0.5
    + 0.42 * gnoise(p / 2.3)
    + 0.30 * gnoise(p / 5.1 + 3.1)
    + 0.22 * gnoise(p / 11.0 + 7.7)
    + 0.12 * gnoise(p / 31.0 + 1.3);
  return clamp(h, 0.0, 1.0);
}
// subtle embossed lighting of the paper surface
float paperShade(vec2 p) {
  float h0 = paperHeight(p);
  float h1 = paperHeight(p + vec2(1.2, 1.2));
  return (h0 - h1);
}
`;

export const WASH = /* glsl */ `
uniform vec2 uPaperScale; // paper pixels per uv unit

// Glaze a wash onto col.
//   d     signed distance to the wash boundary (negative inside), in uv-ish units
//   soft  softness of the edge (wet edge -> larger)
//   dens  pigment density
//   edge  edge-darkening strength, edgeW its width
//   gran  granulation strength
vec3 glaze(vec3 col, vec3 pigment, float cover, float dens) {
  return col * pow(pigment, vec3(max(dens * cover, 0.0)));
}

float granulate(vec2 pp, float gran) {
  float h = paperHeight(pp);
  float floc = 0.5 + 0.5 * gnoise(pp / 3.5 + 17.0);
  float g = mix(1.0, (1.45 - h) * (0.75 + 0.5 * floc), gran);
  return g;
}

vec3 wash(vec3 col, vec3 pigment, float d, float soft, float dens, float edge, float edgeW, float gran, vec2 uv) {
  vec2 pp = uv * uPaperScale;
  float cover = smoothstep(soft, -soft, d);
  float inside = max(-d, 0.0);
  float rim = exp(-inside / edgeW) * cover;
  float a = cover * (1.0 + edge * rim);
  a *= granulate(pp, gran);
  return col * pow(pigment, vec3(max(dens * a, 0.0)));
}
`;

export const WC_ALL = NOISE + PAPER + WASH;

/**
 * The painted area's edge: no frame, no rectangle. A slightly tilted, organic shape whose
 * border is deckled at several scales, broken by dry-brush skips over the paper tooth,
 * and in places bleeds softly into dry paper. Returns alpha; `rim` (0..1) is where
 * pigment pools at the drying edge, so callers can darken it a touch.
 * Needs NOISE + PAPER. uv is 0..1 (y down), aspect = width/height.
 */
export const EDGE = /* glsl */ `
float deckle(vec2 uv, float aspect, float seed, float inset, float tooth, out float rim) {
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float tilt = 0.012 * sin(seed * 3.7);
  p = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * p;
  vec2 hb = vec2(aspect * 0.5, 0.5) - inset;
  // a little barrel so no side is a ruler-straight line
  hb += 0.008 * vec2(1.0 - pow(p.y / 0.5, 2.0), 1.0 - pow(p.x / (aspect * 0.5), 2.0));
  vec2 b = abs(p) - hb + 0.015;
  float d = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0) - 0.015;
  // big, slow irregularity, then deckle at finer scales
  d += 0.028 * fbm(p * 2.2 + seed) + 0.009 * fbm(p * 11.0 + seed * 2.0) + 0.0025 * gnoise(p * 95.0 + seed);
  // horizontal brush ends on the left/right sides: each stroke stops at its own place
  float side = smoothstep(hb.x - 0.08, hb.x, abs(p.x));
  d += side * 0.016 * gnoise(vec2(p.y * 70.0, seed + sign(p.x) * 3.0));
  // dry brush: near the edge the brush skips over the paper tooth, leaving white flecks
  float nearEdge = smoothstep(-0.035, 0.0, d);
  d += nearEdge * (tooth - 0.48) * 0.022 * (0.6 + 0.6 * gnoise(p * vec2(5.0, 28.0) + seed));
  float hard = smoothstep(0.0012, -0.0012, d);
  float softE = smoothstep(0.014, -0.012, d);
  float bleed = smoothstep(0.05, 0.35, gnoise(p * 2.6 + seed * 5.0));
  float m = mix(hard, softE, bleed);
  rim = exp(-max(-d, 0.0) / 0.007) * hard * (1.0 - 0.7 * bleed);
  return m;
}
`;
