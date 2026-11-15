import { NOISE, PAPER } from "../../lib/watercolor.glsl";
import { POND_GLSL } from "./shape";

export const MAX_DROPS = 24;

/**
 * Height-field ripple simulation (ping-pong). r = height now, g = height last step.
 * Classic discrete wave equation; the pond mask absorbs waves at the shore.
 */
export const SIM_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uDamping;
uniform vec4 uDrops[${MAX_DROPS}]; // xy = uv (y down), z = radius (q units), w = strength
uniform int uDropCount;
${POND_GLSL}

void main() {
  vec4 s = texture2D(uState, vUv);
  float l = texture2D(uState, vUv - vec2(uTexel.x, 0.0)).r;
  float r = texture2D(uState, vUv + vec2(uTexel.x, 0.0)).r;
  float u = texture2D(uState, vUv + vec2(0.0, uTexel.y)).r;
  float d = texture2D(uState, vUv - vec2(0.0, uTexel.y)).r;
  float h = (l + r + u + d) * 0.5 - s.g;
  h *= uDamping;

  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 q = (uv - 0.5) * vec2(ASPECT, 1.0);
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uDropCount) break;
    vec4 dp = uDrops[i];
    vec2 dq = (dp.xy - 0.5) * vec2(ASPECT, 1.0);
    float x = length(q - dq) / dp.z;
    if (x < 1.0) h += dp.w * (0.5 + 0.5 * cos(3.14159 * x));
  }
  // shore: soak up energy where there's no water
  float sd = pondSDF(q);
  h *= smoothstep(0.004, -0.02, sd);
  gl_FragColor = vec4(h, s.r, 0.0, 1.0);
}
`;

/**
 * Per-frame composite: refract the painting through the ripples, lift pigment on
 * crests, pool it in troughs, then paint the creatures on top in the same medium.
 */
export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPaint;
uniform sampler2D uSim;
uniform vec2 uSimTexel;
uniform vec2 uPaperScale;
uniform float uTime;
uniform float uMotion;
uniform vec4 uBoat;      // x, y (uv, y down), heading, paddle phase
uniform vec4 uDucks[4];  // x, y, heading, size
${NOISE}
${PAPER}
${POND_GLSL}

const vec3 PAPER    = vec3(0.984, 0.980, 0.968);
const vec3 SEPIA    = vec3(0.420, 0.360, 0.320);
const vec3 INDIGO   = vec3(0.600, 0.650, 0.760);
const vec3 ULTRA    = vec3(0.660, 0.720, 0.930);
const vec3 VERMIL   = vec3(0.980, 0.600, 0.470);
const vec3 OCHRE    = vec3(0.965, 0.880, 0.660);
const vec3 SIENNA   = vec3(0.930, 0.720, 0.560);
const vec3 HOOKER   = vec3(0.560, 0.700, 0.520);
const vec3 UMBER    = vec3(0.700, 0.600, 0.520);

vec2 flipY(vec2 u) { return vec2(u.x, 1.0 - u.y); }

float granulate(vec2 pp, float gran) {
  float h = paperHeight(pp);
  float floc = 0.5 + 0.5 * gnoise(pp / 3.5 + 17.0);
  return mix(1.0, (1.45 - h) * (0.75 + 0.5 * floc), gran);
}
vec3 wash(vec3 col, vec3 pigment, float d, float soft, float dens, float edge, float edgeW, float gran, vec2 pp) {
  float cover = smoothstep(soft, -soft, d);
  float rim = exp(-max(-d, 0.0) / edgeW) * cover;
  float a = cover * (1.0 + edge * rim) * granulate(pp, gran);
  return col * pow(pigment, vec3(max(dens * a, 0.0)));
}

float sdVesica(vec2 p, float halfLen, float halfW) {
  // long axis along x
  p = abs(p.yx);
  float r = (halfLen * halfLen + halfW * halfW) / (2.0 * halfW);
  float d = r - halfW;
  float b = halfLen;
  return ((p.y - b) * d > p.x * b) ? length(p - vec2(0.0, b)) : length(p - vec2(-d, 0.0)) - r;
}
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

float simH(vec2 uvDown) { return texture2D(uSim, flipY(uvDown)).r; }

vec3 drawBoat(vec3 col, vec2 q, vec2 pp, vec4 boat) {
  vec2 c = (boat.xy - 0.5) * vec2(ASPECT, 1.0);
  vec2 p = rot(boat.z) * (q - c);
  float wob = 0.0007 * gnoise(q * 300.0);
  // soft shadow / reflection on the water, offset down-right
  vec2 ps = rot(boat.z) * (q - c - vec2(0.004, 0.006));
  float dsh = sdVesica(ps, 0.043, 0.0095);
  col = wash(col, INDIGO, dsh, 0.006, 0.55, 0.0, 0.01, 0.6, pp);
  float hull = sdVesica(p, 0.042, 0.0088) + wob;
  col = wash(col, VERMIL, hull, 0.0006, 1.15, 1.4, 0.0028, 0.9, pp);
  // deck stripe and cockpit
  col = wash(col, VERMIL, max(hull + 0.0035, abs(p.y) - 0.0016), 0.0006, 0.5, 0.0, 0.01, 0.5, pp);
  float cockpit = length((p - vec2(-0.004, 0.0)) * vec2(0.55, 1.0)) - 0.0052;
  col = wash(col, SEPIA, cockpit, 0.0006, 0.9, 1.2, 0.002, 0.8, pp);
  // paddler: a small figure, ochre jacket and a dark head
  float body = length((p - vec2(-0.004, 0.0)) * vec2(1.1, 0.9)) - 0.0062;
  col = wash(col, OCHRE * SIENNA, body, 0.0006, 1.1, 1.2, 0.002, 0.6, pp);
  float head = length(p - vec2(-0.0025, 0.0)) - 0.0028;
  col = wash(col, SEPIA * UMBER, head, 0.0005, 1.0, 1.0, 0.0015, 0.6, pp);
  // paddle sweeps side to side
  float sw = sin(boat.w);
  vec2 dir = normalize(vec2(0.35 * sw, 1.0));
  vec2 a = vec2(-0.004 + 0.006 * sw, 0.0) - dir * 0.026;
  vec2 b = vec2(-0.004 - 0.006 * sw, 0.0) + dir * 0.026;
  float shaft = sdSeg(p, a, b) - 0.0006;
  col = wash(col, SEPIA, shaft, 0.0004, 1.2, 0.0, 0.01, 0.2, pp);
  float blade1 = length((rot(-0.3) * (p - a)) * vec2(1.0, 0.55)) - 0.0028;
  float blade2 = length((rot(-0.3) * (p - b)) * vec2(1.0, 0.55)) - 0.0028;
  col = wash(col, SEPIA, min(blade1, blade2), 0.0005, 1.1, 1.0, 0.001, 0.4, pp);
  return col;
}

vec3 drawDuck(vec3 col, vec2 q, vec2 pp, vec4 dk, float isMother) {
  vec2 c = (dk.xy - 0.5) * vec2(ASPECT, 1.0);
  float sz = dk.w;
  vec2 p = rot(dk.z) * (q - c) / sz;
  vec2 ps = rot(dk.z) * (q - c - vec2(0.003, 0.004) * sz) / sz;
  float dsh = length(ps * vec2(0.85, 1.25)) - 0.011;
  col = wash(col, INDIGO, dsh * sz, 0.004 * sz, 0.5, 0.0, 0.01, 0.6, pp);
  float wob = 0.0005 * gnoise(q * 400.0);
  float body = length((p + vec2(0.002, 0.0)) * vec2(0.85, 1.3)) - 0.0105 + wob;
  float tail = length((p + vec2(0.012, 0.0)) * vec2(1.4, 1.8)) - 0.004;
  body = min(body, tail);
  vec3 bodyPig = mix(OCHRE * vec3(1.0, 0.98, 0.95), SIENNA * UMBER, isMother);
  col = wash(col, bodyPig, body * sz, 0.0005, 0.95, 1.6, 0.0022, 0.9, pp);
  // folded wings: a darker glaze along the back
  float wing = max(body + 0.002, abs(p.y) - 0.0045 + 0.25 * (p.x + 0.004));
  col = wash(col, UMBER, wing * sz, 0.0006, mix(0.45, 0.8, isMother), 0.8, 0.002, 0.8, pp);
  float head = length(p - vec2(0.0105, 0.0)) - 0.0052;
  vec3 headPig = mix(OCHRE * SIENNA, HOOKER * HOOKER, isMother);
  col = wash(col, headPig, head * sz, 0.0005, 1.1, 1.4, 0.0015, 0.8, pp);
  float beak = length((p - vec2(0.0162, 0.0)) * vec2(1.0, 1.9)) - 0.0024;
  col = wash(col, OCHRE * OCHRE * SIENNA, beak * sz, 0.0004, 1.2, 0.5, 0.001, 0.2, pp);
  float eye = length(p - vec2(0.012, 0.0024 * sign(p.y + 1e-5))) - 0.0008;
  col = wash(col, SEPIA * SEPIA, eye * sz, 0.0003, 1.0, 0.0, 0.01, 0.0, pp);
  return col;
}

void main() {
  vec2 uv = flipY(vUv);
  vec2 q = (uv - 0.5) * vec2(ASPECT, 1.0);
  vec2 pp = uv * uPaperScale;

  // ripple gradient
  vec2 e = uSimTexel * 1.25;
  float hc = simH(uv);
  float hl = simH(uv - vec2(e.x, 0.0));
  float hr = simH(uv + vec2(e.x, 0.0));
  float hu = simH(uv - vec2(0.0, e.y));
  float hd = simH(uv + vec2(0.0, e.y));
  vec2 grad = vec2(hr - hl, hd - hu);

  float water = texture2D(uPaint, vUv).a;

  // a breath of wind keeps the water from ever being perfectly still
  float t = uTime * uMotion;
  vec2 wind = vec2(gnoise(q * vec2(9.0, 26.0) + vec2(t * 0.25, -t * 0.11)),
                   gnoise(q * vec2(9.0, 26.0) + vec2(4.0 - t * 0.21, t * 0.17))) * 0.0011;

  vec2 off = (grad * 0.16 + wind) * water;
  vec4 paint = texture2D(uPaint, flipY(uv + off));
  vec3 col = paint.rgb;

  // painterly ripple shading: streaky, broken, along the wave fronts
  float g = length(grad);
  vec2 n = g > 1e-5 ? grad / g : vec2(1.0, 0.0);
  vec2 tng = vec2(-n.y, n.x);
  float streak = gnoise(vec2(dot(q, n) * 420.0, dot(q, tng) * 70.0));
  float tooth = paperHeight(pp);
  float sh = dot(grad, normalize(vec2(-0.55, -0.85))) * 11.0;
  float lift = smoothstep(0.1, 0.42, sh + streak * 0.26 + (tooth - 0.5) * 0.32) * water;
  float pool = smoothstep(0.12, 0.48, -sh + streak * 0.22 - (tooth - 0.5) * 0.2) * water;
  col = mix(col, PAPER, lift * 0.78);
  col *= pow(ULTRA * INDIGO, vec3(pool * 0.55));
  // a thin dark ink mark on the steepest fronts, like a quick pen ripple
  float front = smoothstep(0.45, 0.7, -sh + streak * 0.2) * smoothstep(0.95, 0.7, -sh + streak * 0.2);
  col *= pow(SEPIA, vec3(front * 0.25 * water));

  // creatures (they ride the ripples a little)
  vec2 qb = q + grad * 0.02;
  col = drawBoat(col, qb, pp, uBoat);
  for (int i = 0; i < 4; i++) {
    col = drawDuck(col, qb, pp, uDucks[i], i == 0 ? 1.0 : 0.0);
  }

  // the paper itself: a whisper of relief over everything
  float ps = paperShade(pp);
  col *= 1.0 + ps * 0.10;
  col -= 0.012 * (1.0 - tooth) * (1.0 - dot(col, vec3(0.33)));
  gl_FragColor = vec4(col, 1.0);
}
`;
