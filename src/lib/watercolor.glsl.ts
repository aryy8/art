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
