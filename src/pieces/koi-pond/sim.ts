/**
 * Koi pond simulation — pure TS.
 *
 * Tunables:
 *   KOI_LEN, cruise/burst speeds, turn rate, wave A/k,
 *   burst/glide timing, separation, boundary inset.
 */

import { SDF, SDF_W, SDF_H, SDF_CELL } from "./water-sdf.ts";

export const W = 800;
export const H = 600;
/** Match the painted koi: ~38% of pond width, thick body + massive veil. */
/** two-thirds of the painted size, so the pair has open water to swim in */
export const KOI_LEN = W * 0.37 * 0.67;
export const SPINE_N = 16;
export const TAIL_N = 12;
/** koi.png: peduncle at x≈416 of the 1014px-wide fish → body = head-side 59%, veil = 41%. s=0 at head. */
export const S_TAIL_ROOT = 0.59;
/** head-path history used so the body follows exactly where the head has been */
const HIST = 1400;

export const SPEED_BURST = 72;
export const SPEED_FLEE = 95;
export const SPEED_GLIDE_MIN = 22;
export const TURN_MAX = 1.1;
export const WAVE_K = 4.6;
export const A_BODY = 0.055; // × L — visible swim undulation
export const A_TAIL = 0.18;
export const INSET = 72;
export const SEPARATION = KOI_LEN * 0.85;
export const FLEE_SPEED = 900;
export const FLEE_RADIUS = 120;
export const CURIOSITY_STILL = 1.5;
export const HOVER_DIST = 40;

const FISH_DT = 1 / 60;
const TWO_PI = Math.PI * 2;

export type Vec2 = { x: number; y: number };

export interface Fish {
  pos: Vec2;
  vel: Vec2;
  heading: number;
  speed: number;
  depth: number;
  phase: number;
  beatEnergy: number;
  /** burst timer; >0 beating, else gliding */
  burstT: number;
  glideT: number;
  fleeT: number;
  curiousT: number;
  wanderTheta: number;
  noiseSeed: number;
  headScale: number;
  finL: number;
  finR: number;
  scale: number;
  tint: number; // 0 = base, 1 = redder
  spineX: Float32Array;
  spineY: Float32Array;
  tanX: Float32Array;
  tanY: Float32Array;
  lat: Float32Array;
  tailUX: Float32Array;
  tailUY: Float32Array;
  tailUPx: Float32Array;
  tailUPy: Float32Array;
  tailLX: Float32Array;
  tailLY: Float32Array;
  tailLPx: Float32Array;
  tailLPy: Float32Array;
  wakeReady: boolean;
  /** signed turn rate (rad/s), for banking */
  turnRate: number;
  histX: Float32Array;
  histY: Float32Array;
  histN: number;
  histHead: number;
  /** per-spine-point lagged positions (veil inertia) */
  qX: Float32Array;
  qY: Float32Array;
  /** signed curvature per spine point (1/px) */
  curv: Float32Array;
  /** persistent veil avoidance offsets (decay slowly) so bent-aside tails don't snap back */
  offX: Float32Array;
  offY: Float32Array;
  /** planned turn rate (rad/s) and time to the next re-plan */
  planW: number;
  planT: number;
  /** where the last scare came from */
  fleeX: number;
  fleeY: number;
  /** current wander goal and how long to keep it */
  goalX: number;
  goalY: number;
  goalT: number;
  /** free room along the planned path (0 tight … 1 open) */
  room: number;
  /** every planned path still touches the other koi: brake and pivot instead of driving in */
  blocked: boolean;
  /** this koi's head is closing in on the other one right now */
  headThreat: boolean;
  /** >0 while this koi gives way: it turns firmly away from the other and keeps gliding */
  yieldT: number;
  yieldAng: number;
}

export interface SimState {
  fish: [Fish, Fish];
  pointer: Vec2 | null;
  pointerVel: number;
  pointerStill: number;
  focused: boolean;
  reduced: boolean;
  time: number;
  pendingDrops: { x: number; y: number; r: number; s: number }[];
  /** outline gap between the koi at the last substep */
  lastGap: number;
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function norm(x: number, y: number): Vec2 {
  const l = Math.hypot(x, y);
  if (l < 1e-8) return { x: 0, y: 0 };
  return { x: x / l, y: y / l };
}
function angDiff(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}
/** small seeded PRNG so a run is reproducible (createSim reseeds it) */
let rngState = 1;
function rand() {
  rngState = (rngState * 16807) % 2147483647;
  return rngState / 2147483647;
}
function noise1(t: number, seed: number) {
  return Math.sin(t * 1.7 + seed * 12.3) * 0.5 + Math.sin(t * 0.9 + seed * 4.1) * 0.5;
}

function makeFish(x: number, y: number, heading: number, seed: number, scale: number, tint: number, bend = 0): Fish {
  const f: Fish = {
    pos: { x, y },
    vel: { x: Math.cos(heading) * 40, y: Math.sin(heading) * 40 },
    heading,
    speed: 40,
    depth: 0.25 + seed * 0.05,
    phase: seed * 2.1,
    beatEnergy: 0.5,
    burstT: 0.8 + seed * 0.4,
    glideT: 0,
    fleeT: 0,
    curiousT: 0,
    wanderTheta: seed,
    noiseSeed: seed,
    headScale: 1,
    finL: 0.35,
    finR: 0.35,
    scale,
    tint,
    spineX: new Float32Array(SPINE_N),
    spineY: new Float32Array(SPINE_N),
    tanX: new Float32Array(SPINE_N),
    tanY: new Float32Array(SPINE_N),
    lat: new Float32Array(SPINE_N),
    tailUX: new Float32Array(TAIL_N),
    tailUY: new Float32Array(TAIL_N),
    tailUPx: new Float32Array(TAIL_N),
    tailUPy: new Float32Array(TAIL_N),
    tailLX: new Float32Array(TAIL_N),
    tailLY: new Float32Array(TAIL_N),
    tailLPx: new Float32Array(TAIL_N),
    tailLPy: new Float32Array(TAIL_N),
    wakeReady: false,
    turnRate: 0,
    histX: new Float32Array(HIST),
    histY: new Float32Array(HIST),
    histN: 0,
    histHead: 0,
    qX: new Float32Array(SPINE_N),
    qY: new Float32Array(SPINE_N),
    curv: new Float32Array(SPINE_N),
    offX: new Float32Array(SPINE_N),
    offY: new Float32Array(SPINE_N),
    planW: 0,
    planT: seed * 0.05,
    fleeX: x,
    fleeY: y,
    goalX: x + Math.cos(heading) * 200,
    goalY: y + Math.sin(heading) * 200,
    goalT: 3 + seed,
    room: 1,
    blocked: false,
    headThreat: false,
    yieldT: 0,
    yieldAng: 0,
  };
  initSpine(f, bend);
  return f;
}

/**
 * Visible half-width of the painted koi (÷ body length) at the 16 spine points, measured from
 * the koi-final.webp alpha exactly as fish-mesh.ts maps it (incl. its "plump" factor):
 * head, body, slim peduncle, then the fanned veil that tapers to a soft tip.
 */
const HALF_W = [0.033, 0.085, 0.106, 0.123, 0.129, 0.126, 0.12, 0.099, 0.076, 0.055, 0.121, 0.177, 0.215, 0.224, 0.247, 0.075];
export function halfWidth(f: Fish, i: number) {
  const L = bodyLen(f);
  const k = clamp(i, 0, SPINE_N - 1);
  const k0 = Math.floor(k);
  const k1 = Math.min(SPINE_N - 1, k0 + 1);
  let w = HALF_W[k0] + (HALF_W[k1] - HALF_W[k0]) * (k - k0);
  // spread pectoral fins (fish-mesh.ts: rooted at s 0.24, 0.27 L long, up to ~70° out)
  const s = k / (SPINE_N - 1);
  if (s > 0.2 && s < 0.46) {
    const open = clamp(Math.max(f.finL, f.finR), 0, 1);
    const reach = 0.06 + 0.27 * Math.sin(0.3 + 0.75 * open);
    w = Math.max(w, reach * (1 - Math.abs(s - 0.33) / 0.13));
  }
  return L * w;
}

/** Smallest clearance (px) between the two koi outlines, plus the pair that produced it. */
export function fishGap(a: Fish, b: Fish) {
  let best = Infinity;
  let bi = 0;
  let bj = 0;
  for (let i = 0; i < SPINE_N; i++) {
    for (let j = 0; j < SPINE_N; j++) {
      const g = Math.hypot(a.spineX[i] - b.spineX[j], a.spineY[i] - b.spineY[j]) - halfWidth(a, i) - halfWidth(b, j);
      if (g < best) {
        best = g;
        bi = i;
        bj = j;
      }
    }
  }
  return { gap: best, i: bi, j: bj };
}

function translateFish(f: Fish, dx: number, dy: number) {
  f.pos.x += dx;
  f.pos.y += dy;
  for (let i = 0; i < HIST; i++) {
    f.histX[i] += dx;
    f.histY[i] += dy;
  }
  for (let i = 0; i < SPINE_N; i++) {
    f.spineX[i] += dx;
    f.spineY[i] += dy;
    f.qX[i] += dx;
    f.qY[i] += dy;
  }
}

/**
 * Last-resort constraints. The path planner in steerFish keeps every fish clear of the other
 * one, the lotus corner and the pond edge, so these should almost never fire. When they do,
 * they move a fish by a fraction of a pixel per substep, sideways only (never backwards), and
 * never touch its heading — a fish that is driving into something brakes instead.
 */
const MIN_GAP = 4;
const NUDGE_MAX = 1.5;
/** diagnostics for scripts/koi-overlap-test.mts */
export const hardStats = { pushes: 0, px: 0, maxPx: 0, bends: 0 };
/**
 * Lotus corner keep-out (lotus, its leaf and the dark foliage), in pond px — same polygon the
 * mask script uses (scripts/koi-masks.py, ×800/1448). Fish never enter it, not even a fin tip.
 */
const LOTUS_ZONE: [number, number][] = [
  [-200, -200], [287, -200], [287, 66], [276, 127], [260, 182], [199, 202], [138, 221], [83, 232], [-200, 238],
];
/** Signed distance to the lotus zone: > 0 outside, < 0 inside. Also returns the outward normal. */
export function lotusSdf(x: number, y: number) {
  let best = Infinity;
  let nx = 0;
  let ny = 0;
  let inside = false;
  const P = LOTUS_ZONE;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j];
    const [bx, by] = P[i];
    if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    const ex = bx - ax;
    const ey = by - ay;
    const t = clamp(((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey), 0, 1);
    const cx = ax + ex * t;
    const cy = ay + ey * t;
    const d = Math.hypot(x - cx, y - cy);
    if (d < best) {
      best = d;
      nx = d > 1e-6 ? (x - cx) / d : 0.7;
      ny = d > 1e-6 ? (y - cy) / d : 0.7;
    }
  }
  if (inside) {
    nx = -nx;
    ny = -ny;
  }
  return { d: inside ? -best : best, nx, ny };
}
const LOTUS_MARGIN = 6;
/** Smallest clearance between a fish outline and the lotus zone (diagnostics + constraint). */
export function lotusGap(f: Fish) {
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < SPINE_N; i++) {
    const g = lotusSdf(f.spineX[i], f.spineY[i]).d - halfWidth(f, i);
    if (g < best) {
      best = g;
      bi = i;
    }
  }
  return { gap: best, i: bi };
}

const TAIL_ROOT_I = Math.ceil(S_TAIL_ROOT * (SPINE_N - 1));

/** Slide the whole fish by at most `cap` px, dropping any part that would push it backwards. */
function nudgeFish(f: Fish, dx: number, dy: number, cap = NUDGE_MAX) {
  const hx = Math.cos(f.heading);
  const hy = Math.sin(f.heading);
  const along = dx * hx + dy * hy;
  if (along < 0) {
    dx -= along * hx;
    dy -= along * hy;
  }
  const m = Math.hypot(dx, dy);
  if (m < 1e-6 || cap <= 0) return 0;
  const k = Math.min(1, cap / m);
  translateFish(f, dx * k, dy * k);
  hardStats.pushes++;
  hardStats.px += m * k;
  hardStats.maxPx = Math.max(hardStats.maxPx, m * k);
  return m * k;
}

/** A head driving into something slows down (the only way a koi "stops"). */
function brakeIfInto(f: Fish, nx: number, ny: number) {
  if (Math.cos(f.heading) * nx + Math.sin(f.heading) * ny < 0 && f.yieldT <= 0) f.speed = Math.max(SPEED_GLIDE_MIN * 0.6, f.speed * 0.95);
}

/** Lotus corner is absolute: the veil bends away, the body slides off it sideways and brakes. */
function lotusHard(f: Fish) {
  for (let it = 0; it < 2; it++) lotusStep(f);
}
function lotusStep(f: Fish) {
  const g = lotusGap(f);
  if (g.gap >= LOTUS_MARGIN) return;
  const sd = lotusSdf(f.spineX[g.i], f.spineY[g.i]);
  const need = LOTUS_MARGIN - g.gap + 0.3;
  if (g.i >= TAIL_ROOT_I) {
    const k = Math.min(need, 1.5);
    bendTail(f, g.i, sd.nx * k, sd.ny * k);
    if (g.gap < LOTUS_MARGIN - 2) nudgeFish(f, sd.nx * need, sd.ny * need);
  } else {
    brakeIfInto(f, sd.nx, sd.ny);
    nudgeFish(f, sd.nx * need, sd.ny * need);
  }
}

/** Keep the head inside the paper edge (gently; the planner keeps well clear of it). */
const WALL_X = 70;
const WALL_Y = 58;
function containHard(f: Fish) {
  const dx = Math.max(0, WALL_X - f.pos.x) - Math.max(0, f.pos.x - (W - WALL_X));
  const dy = Math.max(0, WALL_Y - f.pos.y) - Math.max(0, f.pos.y - (H - WALL_Y));
  if (!dx && !dy) return;
  brakeIfInto(f, dx, dy);
  nudgeFish(f, dx, dy);
}

/** Displace the veil around spine point k by (dx,dy), fading in from the tail root. */
function bendTail(f: Fish, k: number, dx: number, dy: number) {
  hardStats.bends++;
  const root = TAIL_ROOT_I;
  for (let i = root; i < SPINE_N; i++) {
    const w = Math.min(1, (i - root + 1) / Math.max(1, k - root + 1));
    const ww = w * w * (3 - 2 * w);
    f.spineX[i] += dx * ww;
    f.spineY[i] += dy * ww;
    f.offX[i] += dx * ww;
    f.offY[i] += dy * ww;
    f.qX[i] = f.spineX[i];
    f.qY[i] = f.spineY[i];
  }
}

function separateHard(a: Fish, b: Fish) {
  // a few relaxation passes; each fish moves at most NUDGE_MAX px per substep in total,
  // sideways only, and whatever is left over becomes a brake
  let budA = NUDGE_MAX;
  let budB = NUDGE_MAX;
  for (let iter = 0; iter < 4; iter++) {
    const g = fishGap(a, b);
    if (g.gap >= MIN_GAP + 0.5) return;
    let dx = a.spineX[g.i] - b.spineX[g.j];
    let dy = a.spineY[g.i] - b.spineY[g.j];
    let d = Math.hypot(dx, dy);
    if (d < 1e-3) {
      dx = a.pos.x - b.pos.x;
      dy = a.pos.y - b.pos.y;
      d = Math.hypot(dx, dy) || 1;
    }
    const ux = dx / d;
    const uy = dy / d;
    const need = MIN_GAP + 0.5 - g.gap;
    const ta = g.i >= TAIL_ROOT_I;
    const tb = g.j >= TAIL_ROOT_I;
    if (ta || tb) {
      const k = Math.min(need, 1.5) * (ta && tb ? 0.5 : 1);
      if (ta) bendTail(a, g.i, ux * k, uy * k);
      if (tb) bendTail(b, g.j, -ux * k, -uy * k);
    }
    budA -= nudgeFish(a, ux * need * 0.5, uy * need * 0.5, budA);
    budB -= nudgeFish(b, -ux * need * 0.5, -uy * need * 0.5, budB);
    // the head driving in brakes
    if (g.i < TAIL_ROOT_I) brakeIfInto(a, ux, uy);
    if (g.j < TAIL_ROOT_I) brakeIfInto(b, -ux, -uy);
  }
}

function bodyLen(f: Fish) {
  return KOI_LEN * f.scale * (1 - f.depth * 0.06);
}

/**
 * Seed the head-path history with an arc behind the head (bend = total turn in radians
 * over one body length), so the fish starts in the painted C/S pose instead of a stick.
 */
function initSpine(f: Fish, bend = 0) {
  const L = bodyLen(f);
  const total = L * 1.6;
  const n = Math.min(HIST, Math.ceil(total / 2));
  // walk backwards from the head: direction = heading + PI, turning by bend per L
  let x = f.pos.x;
  let y = f.pos.y;
  let a = f.heading + Math.PI;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    pts.push(x, y);
    const st = total / n;
    a += (bend / L) * st * (i * st < L * 0.25 ? 0.3 : i * st < L ? 1.3 : 0.3);
    x += Math.cos(a) * st;
    y += Math.sin(a) * st;
  }
  // history is stored oldest → newest
  f.histN = 0;
  f.histHead = 0;
  for (let i = n - 1; i >= 0; i--) pushHist(f, pts[i * 2], pts[i * 2 + 1]);
  // forward heading continues the arc
  f.heading -= (bend / L) * 4;
  layoutSpine(f, true);
}

function pushHist(f: Fish, x: number, y: number) {
  f.histHead = (f.histHead + 1) % HIST;
  f.histX[f.histHead] = x;
  f.histY[f.histHead] = y;
  if (f.histN < HIST) f.histN++;
}

/** Start poses roughly matching target.png yin-yang. */
export function createSim(reduced: boolean, seed = 1): SimState {
  rngState = Math.max(1, Math.floor(seed)) % 2147483646;
  // Upper fish: head right-ish; lower: circling opposite
  // matched to TARGET_FINAL: upper-left koi head ≈ (381,271) heading down-right, C-curve;
  // lower-right koi head ≈ (421,342) heading left, veil sweeping up-right (yin-yang)
  const a = makeFish(384, 266, 0.5, 1.2, 1.0, 0, -2.5);
  const b = makeFish(420, 346, Math.PI + 0.05, 2.8, 0.96, 1, -2.3);
  a.burstT = 0;
  a.glideT = 1.4;
  b.burstT = 0;
  b.glideT = 2.2;
  a.speed = b.speed = 20;
  a.beatEnergy = b.beatEnergy = 0.2;
  return {
    fish: [a, b],
    pointer: null,
    pointerVel: 0,
    pointerStill: 0,
    focused: false,
    reduced,
    time: 0,
    pendingDrops: [],
    lastGap: Infinity,
  };
}

/** Visible-water clearance (px): > 0 open water, < 0 under a lily pad, the lotus or off the paper. */
export function waterClear(x: number, y: number) {
  const fx = clamp(x / SDF_CELL - 0.5, 0, SDF_W - 1.001);
  const fy = clamp(y / SDF_CELL - 0.5, 0, SDF_H - 1.001);
  const ix = fx | 0;
  const iy = fy | 0;
  const tx = fx - ix;
  const ty = fy - iy;
  const i = iy * SDF_W + ix;
  const top = SDF[i] * (1 - tx) + SDF[i + 1] * tx;
  const bot = SDF[i + SDF_W] * (1 - tx) + SDF[i + SDF_W + 1] * tx;
  return (top * (1 - ty) + bot * ty) * 2;
}
/** Distance to the painted paper edge of the pond (the hard boundary). */
const EDGE_X0 = 64;
const EDGE_X1 = 740;
const EDGE_Y0 = 46;
const EDGE_Y1 = 550;
function edgeClear(x: number, y: number) {
  return Math.min(x - EDGE_X0, EDGE_X1 - x, y - EDGE_Y0, EDGE_Y1 - y);
}

/**
 * Path planner. Every PLAN_EVERY s each koi tries a fan of smooth arcs (same turn-rate
 * limits as the real controller) PLAN_STEPS×PLAN_DT s ahead and keeps the one that stays in
 * open water, far from the paper edge, the lotus corner and the other koi's body and path,
 * while heading for its goal (or away from a click). Because the body follows the head's own
 * path, a clear head path means a clear body, so the hard constraints almost never fire.
 */
const PLAN_DT = 0.2;
const PLAN_STEPS = 12;
const PLAN_EVERY = 0.1;
const PLAN_CANDS = 13;
const ANG_ACC = 1.6;
const ANG_ACC_FLEE = 5;
const planX = new Float32Array(PLAN_STEPS + 1);
const planY = new Float32Array(PLAN_STEPS + 1);
const othX = new Float32Array(PLAN_STEPS + 1);
const othY = new Float32Array(PLAN_STEPS + 1);

/**
 * Koi turn by bending, so the head path is never tighter than the spine's joint limits allow
 * (~0.34 L radius): a slow fish turns slowly instead of pivoting on the spot, which would make
 * the body swing wide off its own path.
 */
function turnCap(f: Fish, speed: number, fleeing: boolean) {
  const rMin = bodyLen(f) * (fleeing ? 0.3 : 0.36);
  return Math.min(fleeing ? 1.6 : TURN_MAX, Math.max(fleeing ? 0.7 : 0.5, speed / rMin));
}

function placeCost(x: number, y: number, L: number) {
  let c = 0;
  const wc = waterClear(x, y);
  if (wc < 55) c += 3 * ((55 - wc) / 55) ** 2; // soft: may slip under a pad for a moment
  // each paper edge on its own (a sum, not a min, so turning back toward open water always pays)
  for (const e of [x - EDGE_X0, EDGE_X1 - x, y - EDGE_Y0, EDGE_Y1 - y]) {
    if (e < 85) c += 30 * ((85 - e) / 85) ** 2 + (e < 20 ? 200 + 10 * (20 - e) : 0);
  }
  const want = L * 0.45;
  const ld = lotusSdf(x, y).d;
  if (ld < want) c += 60 * ((want - ld) / want) ** 2 + (ld < want * 0.5 ? 200 + 4 * (want * 0.5 - ld) : 0);
  return c;
}

function pickGoal(f: Fish, other: Fish) {
  let best = -Infinity;
  for (let t = 0; t < 16; t++) {
    const x = 110 + rand() * 580;
    const y = 100 + rand() * 410;
    const wc = waterClear(x, y);
    if (wc < 60 || lotusSdf(x, y).d < bodyLen(f) * 0.6 || edgeClear(x, y) < 110) continue;
    const d = Math.hypot(x - f.pos.x, y - f.pos.y);
    const od = Math.hypot(x - other.goalX, y - other.goalY);
    const op = Math.hypot(x - other.pos.x, y - other.pos.y);
    const score = wc + Math.min(d, 320) * 0.6 + Math.min(od, 300) * 0.6 + Math.min(op, 300) * 0.5 + rand() * 40;
    if (score > best) {
      best = score;
      f.goalX = x;
      f.goalY = y;
    }
  }
  if (best === -Infinity) {
    f.goalX = 440;
    f.goalY = 340;
  }
  f.goalT = 9 + rand() * 7;
}

/** body samples used by the planner (arc position s along the fish, 0 = head) */
const BODY_S = [0, 0.12, 0.25, 0.37, 0.5, 0.62, 0.75, 0.87, 1];
const NB = BODY_S.length;
const bodyHW = new Float32Array(NB * 2);
const othBX = new Float32Array((PLAN_STEPS + 1) * NB);
const othBY = new Float32Array((PLAN_STEPS + 1) * NB);
const myBX = new Float32Array(NB);
const myBY = new Float32Array(NB);

function halfWidthAt(f: Fish, s: number) {
  return halfWidth(f, clamp(s, 0, 1) * (SPINE_N - 1));
}

/**
 * Where body point s sits k plan steps ahead, if the head follows the path hx/hy[0..k]
 * (hx[0] = head now, step length `step`) and the rest of the body follows the current spine.
 */
function bodyPoint(f: Fish, hx: Float32Array, hy: Float32Array, k: number, step: number, s: number, out: Float32Array, outY: Float32Array, o: number) {
  const L = bodyLen(f);
  const a = s * L;
  const onPath = k * step;
  if (a <= onPath) {
    const q = k - a / step;
    const q0 = Math.floor(q);
    const q1 = Math.min(k, q0 + 1);
    const t = q - q0;
    out[o] = hx[q0] + (hx[q1] - hx[q0]) * t;
    outY[o] = hy[q0] + (hy[q1] - hy[q0]) * t;
    return;
  }
  const j = clamp(((a - onPath) / L) * (SPINE_N - 1), 0, SPINE_N - 1);
  const j0 = Math.floor(j);
  const j1 = Math.min(SPINE_N - 1, j0 + 1);
  const t = j - j0;
  out[o] = f.spineX[j0] + (f.spineX[j1] - f.spineX[j0]) * t;
  outY[o] = f.spineY[j0] + (f.spineY[j1] - f.spineY[j0]) * t;
}

function planTurn(f: Fish, other: Fish, fleeing: boolean, curious: Vec2 | null) {
  const L = bodyLen(f);
  const v = clamp(f.speed, 8, fleeing ? 130 : 70);
  const cap = turnCap(f, v, fleeing);
  const acc = fleeing ? ANG_ACC_FLEE : ANG_ACC;
  for (let m = 0; m < NB; m++) {
    bodyHW[m] = halfWidthAt(f, BODY_S[m]);
    bodyHW[NB + m] = halfWidthAt(other, BODY_S[m]);
  }
  // the other koi, assumed to keep its current turn; its whole body follows its head
  const ov = Math.max(other.speed, 4);
  {
    let x = other.pos.x;
    let y = other.pos.y;
    let h = other.heading;
    othX[0] = x;
    othY[0] = y;
    for (let k = 1; k <= PLAN_STEPS; k++) {
      h += other.turnRate * PLAN_DT;
      x += Math.cos(h) * ov * PLAN_DT;
      y += Math.sin(h) * ov * PLAN_DT;
      othX[k] = x;
      othY[k] = y;
    }
    for (let k = 0; k <= PLAN_STEPS; k++)
      for (let m = 0; m < NB; m++) bodyPoint(other, othX, othY, k, ov * PLAN_DT, BODY_S[m], othBX, othBY, k * NB + m);
  }
  // keep more room at speed (a darting koi needs it to turn away in time)
  const WANT_G = 30 + 0.25 * (v + ov);
  const gNow = fishGap(f, other).gap;
  let best = Infinity;
  let bestW = f.planW;
  let bestG = Infinity;
  let bestHit = 99;
  planX[0] = f.pos.x;
  planY[0] = f.pos.y;
  for (let c = 0; c < PLAN_CANDS; c++) {
    const wc = -cap + (2 * cap * c) / (PLAN_CANDS - 1);
    let x = f.pos.x;
    let y = f.pos.y;
    let h = f.heading;
    let w = f.turnRate;
    let cost = 0;
    let minG = Infinity;
    let hitK = 99;
    for (let k = 1; k <= PLAN_STEPS; k++) {
      w += clamp(wc - w, -acc * PLAN_DT, acc * PLAN_DT);
      h += w * PLAN_DT;
      x += Math.cos(h) * v * PLAN_DT;
      y += Math.sin(h) * v * PLAN_DT;
      planX[k] = x;
      planY[k] = y;
      const wk = 1 / (1 + 0.12 * k);
      cost += wk * placeCost(x, y, L);
      if (k % 2 && k > 1) continue;
      // whole future body vs the lotus corner and vs the other koi's whole future body
      let g = Infinity;
      let lg = Infinity;
      for (let m = 0; m < NB; m++) {
        bodyPoint(f, planX, planY, k, v * PLAN_DT, BODY_S[m], myBX, myBY, m);
        lg = Math.min(lg, lotusSdf(myBX[m], myBY[m]).d - bodyHW[m]);
      }
      for (let m = 0; m < NB; m++) {
        for (let n = 0; n < NB; n++) {
          const o = k * NB + n;
          g = Math.min(g, Math.hypot(myBX[m] - othBX[o], myBY[m] - othBY[o]) - bodyHW[m] - bodyHW[NB + n]);
        }
      }
      const kw = wk * 2;
      if (lg < 30) cost += kw * 40 * ((30 - lg) / 30) ** 2 + (lg < LOTUS_MARGIN + 2 ? kw * 250 : 0);
      minG = Math.min(minG, g);
      if (g < MIN_GAP + 1 && g < gNow - 1 && hitK > k) hitK = k;
      if (g < WANT_G) {
        cost += kw * 120 * ((WANT_G - g) / WANT_G) ** 2;
        if (g < MIN_GAP + 3) cost += kw * (80 + 4 * (MIN_GAP + 3 - g));
      }
    }
    // keep going straight from the end: is there room ahead?
    for (const s of [0.5, 1]) cost += 0.5 * placeCost(x + Math.cos(h) * L * s, y + Math.sin(h) * L * s, L);
    // purpose
    if (fleeing && lotusSdf(x, y).d < L * 0.6) cost += 300;
    if (fleeing) cost -= 3 * Math.min(1, Math.hypot(x - f.fleeX, y - f.fleeY) / 260);
    else if (curious) cost += 2 * Math.min(1, Math.hypot(x - curious.x, y - curious.y) / 300);
    else cost += 1.2 * Math.min(1, Math.hypot(x - f.goalX, y - f.goalY) / 420);
    // calm, decisive turning: prefer gentle arcs and sticking with the last choice
    cost += 0.35 * (wc - f.planW) ** 2 + 0.1 * wc * wc;
    if (cost < best) {
      best = cost;
      bestW = wc;
      bestG = minG;
      bestHit = hitK;
    }
  }
  f.planW = bestW;
  f.room = clamp(bestG / WANT_G, 0, 1);
  // even the best arc touches the other koi within ~0.4 s: ease off and let it pass
  f.blocked = bestHit <= 2 || (fleeing && bestG < 40);
}


function steerFish(sim: SimState, f: Fish, other: Fish, dt: number) {
  const speedMul = sim.reduced ? 0.4 : 1;

  // flee: a fast flick of the pointer near the fish (a click calls pokeAt)
  if (sim.pointer && !sim.reduced && sim.pointerVel > FLEE_SPEED) {
    const pd = Math.hypot(f.pos.x - sim.pointer.x, f.pos.y - sim.pointer.y);
    const od = Math.hypot(other.pos.x - sim.pointer.x, other.pos.y - sim.pointer.y);
    if (pd < FLEE_RADIUS && pd <= od && f.fleeT <= -2) startFlee(f, sim.pointer.x, sim.pointer.y);
  }
  const fleeing = f.fleeT > 0;

  // curiosity: the nearer koi comes to look at a pointer held still
  let curious: Vec2 | null = null;
  const L = bodyLen(f);
  if (!fleeing && sim.pointer && sim.pointerStill > CURIOSITY_STILL && lotusSdf(sim.pointer.x, sim.pointer.y).d > L * 0.45) {
    const pd = Math.hypot(f.pos.x - sim.pointer.x, f.pos.y - sim.pointer.y);
    const od = Math.hypot(other.pos.x - sim.pointer.x, other.pos.y - sim.pointer.y);
    if ((pd < L * 2.5 || f.curiousT > 0) && !(other.curiousT > 0 && od < pd)) {
      f.curiousT += dt;
      if (f.curiousT < 6) curious = sim.pointer;
      else f.curiousT = -3;
    }
  } else if (f.curiousT < 0) {
    f.curiousT = Math.min(0, f.curiousT + dt);
  } else if (f.curiousT > 0) {
    f.curiousT = 0;
  }

  // wander goal
  f.goalT -= dt;
  if (f.goalT <= 0 || Math.hypot(f.goalX - f.pos.x, f.goalY - f.pos.y) < 90) pickGoal(f, other);

  f.planT -= dt;
  if (f.planT <= 0) {
    planTurn(f, other, fleeing, curious);
    f.planT += PLAN_EVERY;
    if (f.planT <= 0) f.planT = PLAN_EVERY;
    // reflex: head close to the paper edge or the lotus and pointing at it → full turn away
    const capNow = turnCap(f, Math.max(f.speed, 1), fleeing);
    const sd = lotusSdf(f.pos.x, f.pos.y);
    let away = NaN;
    if (sd.d < L * 0.4 && Math.cos(f.heading) * sd.nx + Math.sin(f.heading) * sd.ny < 0.2) away = Math.atan2(sd.ny, sd.nx);
    else if (edgeClear(f.pos.x, f.pos.y) < 70) away = Math.atan2(320 - f.pos.y, 400 - f.pos.x);
    if (Number.isNaN(away) && f.headThreat) away = Math.atan2(f.pos.y - other.pos.y, f.pos.x - other.pos.x);
    if (!Number.isNaN(away)) {
      const e = angDiff(f.heading, away);
      if (Math.abs(e) > 1.0) f.planW = Math.sign(e) * capNow;
    }
  }

  if (f.yieldT > 0) {
    // near the lotus corner or the paper edge, give way toward open water instead
    const ls = lotusSdf(f.pos.x, f.pos.y);
    let ya = f.yieldAng;
    if (ls.d < L * 0.5) ya = Math.atan2(ls.ny, ls.nx);
    else if (edgeClear(f.pos.x, f.pos.y) < 60) ya = Math.atan2(320 - f.pos.y, 400 - f.pos.x);
    const e = angDiff(f.heading, ya);
    f.planW = Math.abs(e) > 0.15 ? Math.sign(e) * 1.2 : 0;
  }
  // turn rate eases toward the plan (bounded angular acceleration → no heading snaps)
  const acc = fleeing ? ANG_ACC_FLEE : ANG_ACC;
  f.turnRate += clamp(f.planW - f.turnRate, -acc * dt, acc * dt);
  const cap = f.yieldT > 0 ? 1.2 : turnCap(f, Math.max(f.speed, 1), fleeing);
  if (Math.abs(f.turnRate) > cap) f.turnRate += (Math.sign(f.turnRate) * cap - f.turnRate) * Math.min(1, dt * 4);
  f.heading += f.turnRate * dt;

  // look ahead along the heading: a koi slows down before the pond edge / lotus, so it
  // always has room to turn away (slow fish turn tighter)
  let ahead = 320;
  for (let d = 20; d <= 320; d += 20) {
    const x = f.pos.x + Math.cos(f.heading) * d;
    const y = f.pos.y + Math.sin(f.heading) * d;
    if (edgeClear(x, y) < 50 || lotusSdf(x, y).d < L * 0.35) {
      ahead = d - 20;
      break;
    }
  }
  const vAhead = Math.max(10, ahead * 0.3);

  // burst / glide rhythm
  const tight = false;
  if (sim.reduced) {
    f.speed = lerp(f.speed, SPEED_GLIDE_MIN * 1.2, dt * 2);
    f.beatEnergy = 0.2;
  } else if (fleeing) {
    f.speed = lerp(f.speed, SPEED_FLEE, dt * 5);
    f.beatEnergy = lerp(f.beatEnergy, 1, dt * 6);
    f.burstT = 0;
    f.glideT = 1.5;
  } else if (curious && Math.hypot(curious.x - f.pos.x, curious.y - f.pos.y) < HOVER_DIST * 2.5) {
    f.speed = lerp(f.speed, 8, dt * 1.5);
    f.beatEnergy = lerp(f.beatEnergy, 0.2, dt * 2);
  } else if (f.burstT > 0 && !tight) {
    f.burstT -= dt;
    f.speed = lerp(f.speed, SPEED_BURST, dt * 2.5);
    f.beatEnergy = lerp(f.beatEnergy, 1, dt * 4);
    if (f.burstT <= 0) f.glideT = 1.2 + rand() * 1.8;
  } else {
    f.burstT = 0;
    f.glideT -= dt;
    const floor = tight ? 5 : SPEED_GLIDE_MIN;
    f.speed = f.speed > floor ? Math.max(floor, f.speed - (tight ? 30 : 14) * dt) : lerp(f.speed, floor, dt * 1.5);
    f.beatEnergy = lerp(f.beatEnergy, 0.2, dt * 1.5);
    if (f.glideT <= 0 && !tight) f.burstT = 0.5 + rand() * 0.7;
  }

  if (!fleeing && f.speed > vAhead) f.speed = Math.max(vAhead, f.speed - 40 * dt);
  // every arc still meets the other koi soon, or the head is closing in on it: ease right off
  // (it swims on and clears the way)
  // giving way: never stop, keep a calm glide while turning off
  if (f.yieldT > 0) {
    f.yieldT -= dt;
    f.speed = Math.max(f.speed, SPEED_GLIDE_MIN * 1.3);
  }
  f.speed *= speedMul;
  f.vel.x = Math.cos(f.heading) * f.speed;
  f.vel.y = Math.sin(f.heading) * f.speed;
  f.pos.x += f.vel.x * dt;
  f.pos.y += f.vel.y * dt;

  if (!Number.isFinite(f.pos.x) || !Number.isFinite(f.pos.y)) {
    f.pos.x = clamp(f.pos.x, INSET + 30, W - INSET - 30);
    f.pos.y = clamp(f.pos.y, INSET + 30, H - INSET - 30);
    f.histN = 0;
    initSpine(f);
  }

  const freq = lerp(0.6, 1.9, f.beatEnergy) * (fleeing ? 1.5 : 1) * (sim.reduced ? 0.45 : 1);
  f.phase += TWO_PI * freq * dt;

  // water motion from swimming — continuous trail + beat pulses at the veil tip
  const tipX = f.spineX[SPINE_N - 2];
  const tipY = f.spineY[SPINE_N - 2];
  const midX = f.spineX[Math.round(SPINE_N * 0.6)];
  const midY = f.spineY[Math.round(SPINE_N * 0.6)];
  if (!sim.reduced && f.speed > 22) {
    // continuous, gentle wake every step (no pulsing) so the water around the koi stays calm
    const trail = (0.01 + f.speed * 0.00025) * (0.5 + f.beatEnergy * 0.5);
    sim.pendingDrops.push({
      x: tipX / W,
      y: tipY / H,
      r: 0.03 + f.speed * 0.0002,
      s: trail * STEP_K,
    });
    if (f.beatEnergy > 0.4) {
      sim.pendingDrops.push({
        x: midX / W,
        y: midY / H,
        r: 0.022,
        s: trail * 0.65 * STEP_K,
      });
    }
  }
  const wave = Math.sin(f.phase);
  if (wave > 0.82 && f.beatEnergy > 0.35 && !f.wakeReady) {
    f.wakeReady = true;
    sim.pendingDrops.push({
      x: tipX / W,
      y: tipY / H,
      r: 0.05,
      s: 0.05 + f.beatEnergy * 0.06 + f.speed * 0.0002,
    });
  }
  if (wave < 0.15) f.wakeReady = false;

  // depth drift — mostly near the surface so the colour matches the painting
  const dTarget = 0.05 + 0.28 * (0.5 + 0.5 * noise1(sim.time * 0.06, f.noiseSeed + 2));
  f.depth += (dTarget - f.depth) * dt * 0.3;

  // pectorals: tucked on burst, spread on glide/turn, slow sculling paddle
  const turning = Math.abs(f.turnRate) > 0.25;
  const bursting = f.burstT > 0 || fleeing;
  const paddle = 0.12 * Math.sin(sim.time * 2.3 + f.noiseSeed * 5);
  // fins fold in when the other koi is close, so they never brush it
  const crowded = sim.lastGap < 40;
  const want = bursting || crowded ? 0.12 : turning || curious ? 0.95 : 0.6 + paddle;
  f.finL += (want - f.finL) * dt * 6;
  f.finR += (want - (turning ? paddle : -paddle) - f.finR) * dt * 6;

  if (f.fleeT > -3) f.fleeT -= dt;
  f.headScale += (1 - f.headScale) * dt * 5;
}

function startFlee(f: Fish, x: number, y: number) {
  f.fleeT = 1.1;
  f.fleeX = x;
  f.fleeY = y;
  f.curiousT = 0;
  f.planT = 0; // replan right away
}

function updateSpine(f: Fish) {
  const last = f.histHead;
  if (f.histN === 0 || Math.hypot(f.pos.x - f.histX[last], f.pos.y - f.histY[last]) > 1.5) {
    pushHist(f, f.pos.x, f.pos.y);
  }
  layoutSpine(f, false);
}

/**
 * Spine = the head's own path (follow-the-leader), plus a travelling body wave whose
 * amplitude grows toward the tail, plus inertia on the veil. Segment lengths are re-imposed
 * and joint angles are clamped, so the mesh can never stretch, tear or fold over.
 */
function layoutSpine(f: Fish, snap: boolean) {
  const L = bodyLen(f);
  const seg = L / (SPINE_N - 1);
  // 1. sample the history by arc length
  const px = new Float32Array(SPINE_N);
  const py = new Float32Array(SPINE_N);
  px[0] = f.pos.x;
  py[0] = f.pos.y;
  let k = 0;
  let hx = f.pos.x;
  let hy = f.pos.y;
  let idx = f.histHead;
  let travelled = 0;
  let want = seg;
  let i = 1;
  let lastDx = -Math.cos(f.heading);
  let lastDy = -Math.sin(f.heading);
  while (i < SPINE_N && k < f.histN) {
    const nx = f.histX[idx];
    const ny = f.histY[idx];
    const dx = nx - hx;
    const dy = ny - hy;
    const d = Math.hypot(dx, dy);
    if (d > 1e-6) {
      lastDx = dx / d;
      lastDy = dy / d;
    }
    while (i < SPINE_N && travelled + d >= want) {
      const t = (want - travelled) / Math.max(d, 1e-6);
      px[i] = hx + dx * t;
      py[i] = hy + dy * t;
      i++;
      want += seg;
    }
    travelled += d;
    hx = nx;
    hy = ny;
    idx = (idx - 1 + HIST) % HIST;
    k++;
  }
  for (; i < SPINE_N; i++) {
    px[i] = px[i - 1] + lastDx * seg;
    py[i] = py[i - 1] + lastDy * seg;
  }
  // 2. tangents of the path + travelling wave on the normal
  const be = f.beatEnergy;
  const Abase = L * (0.012 + 0.03 * be);
  for (let j = 0; j < SPINE_N; j++) {
    const s = j / (SPINE_N - 1);
    const a = Math.max(0, j - 1);
    const b = Math.min(SPINE_N - 1, j + 1);
    const t = norm(px[a] - px[b], py[a] - py[b]);
    // head barely yaws, body bends a little, veil swings wide
    const env = 0.15 + 0.6 * s * s + (s > S_TAIL_ROOT ? 1.6 * Math.pow((s - S_TAIL_ROOT) / (1 - S_TAIL_ROOT), 1.5) : 0);
    const lat = Abase * env * Math.sin(f.phase - WAVE_K * s);
    f.offX[j] *= OFF_DECAY;
    f.offY[j] *= OFF_DECAY;
    const tx = px[j] - t.y * lat + f.offX[j];
    const ty = py[j] + t.x * lat + f.offY[j];
    if (snap || j === 0) {
      f.qX[j] = tx;
      f.qY[j] = ty;
    } else {
      // veil inertia: points toward the tip follow their target more lazily
      const u = Math.max(0, (s - S_TAIL_ROOT * 0.7) / (1 - S_TAIL_ROOT * 0.7));
      const follow = 1 - Math.pow(0.8 * u, STEP_K);
      f.qX[j] += (tx - f.qX[j]) * follow;
      f.qY[j] += (ty - f.qY[j]) * follow;
    }
  }
  // 3. re-impose segment length + joint limits head → tail
  let pa = Math.atan2(f.qY[0] - f.qY[1], f.qX[0] - f.qX[1]);
  f.spineX[0] = f.qX[0];
  f.spineY[0] = f.qY[0];
  for (let j = 1; j < SPINE_N; j++) {
    const s = j / (SPINE_N - 1);
    let a = Math.atan2(f.spineY[j - 1] - f.qY[j], f.spineX[j - 1] - f.qX[j]);
    const lim = s > S_TAIL_ROOT ? 0.3 : 0.2;
    a = pa + clamp(angDiff(pa, a), -lim, lim);
    f.spineX[j] = f.spineX[j - 1] - Math.cos(a) * seg;
    f.spineY[j] = f.spineY[j - 1] - Math.sin(a) * seg;
    f.qX[j] = f.spineX[j];
    f.qY[j] = f.spineY[j];
    f.curv[j - 1] = angDiff(pa, a) / seg;
    pa = a;
  }
  f.curv[SPINE_N - 1] = f.curv[SPINE_N - 2];
  for (let j = 0; j < SPINE_N; j++) {
    const a = Math.max(0, j - 1);
    const b = Math.min(SPINE_N - 1, j + 1);
    const t = norm(f.spineX[a] - f.spineX[b], f.spineY[a] - f.spineY[b]);
    f.tanX[j] = t.x;
    f.tanY[j] = t.y;
    f.lat[j] = 0;
  }
}

/** A click in the water: koi within reach dart away from it, then calm down. */
/** A click in the water: the nearer koi (if within reach) darts away from it, then calms down. */
export function pokeAt(sim: SimState, x: number, y: number) {
  if (sim.reduced) return;
  let best: Fish | null = null;
  let bestD = FLEE_RADIUS;
  for (const f of sim.fish) {
    let near = Math.hypot(f.pos.x - x, f.pos.y - y);
    for (let i = 0; i < SPINE_N; i += 3) near = Math.min(near, Math.hypot(f.spineX[i] - x, f.spineY[i] - y));
    if (near < bestD) {
      bestD = near;
      best = f;
    }
  }
  if (best) startFlee(best, x, y);
}

export function setPointer(sim: SimState, p: Vec2 | null, vel: number) {
  sim.pointer = p;
  sim.pointerVel = vel;
  if (!p || vel > 40) sim.pointerStill = 0;
}

// per-substep scale (substep dt / (1/60)) for the frame-rate-independent springs
let STEP_K = 1;
let OFF_DECAY = 0.985;

/**
 * Advance the koi by exactly this frame's dt, split into equal substeps of <= 1/60 s.
 * (A fixed 1/60 step with an accumulator made the fish stall for a frame every so often
 * — and alternate move/stall on 120 Hz screens — which read as flicker against the water.)
 */
export function stepSim(sim: SimState, dt: number, acc: number): number {
  const capped = Math.min(dt, 0.05);
  if (capped <= 0) return acc;
  const n = Math.max(1, Math.ceil(capped / FISH_DT - 1e-6));
  const h = capped / n;
  STEP_K = h / FISH_DT;
  OFF_DECAY = Math.pow(0.985, STEP_K);
  for (let steps = 0; steps < n; steps++) {
    sim.time += h;
    if (sim.pointer && sim.pointerVel < 40) sim.pointerStill += h;
    {
      const [a, b] = sim.fish;
      const g = fishGap(a, b);
      const closing = g.gap < sim.lastGap - 1e-3;
      a.headThreat = false;
      b.headThreat = false;
      void closing;
      // deadlock breaker: touching, or both nearly stopped close together → exactly one yields
      if (a.yieldT <= 0 && b.yieldT <= 0 && (g.gap < 10 || (g.gap < 30 && a.speed < 18 && b.speed < 18))) {
        const aHead = g.i <= 5 && g.j > 5;
        const bHead = g.j <= 5 && g.i > 5;
        const y = aHead ? a : bHead ? b : a.speed <= b.speed ? a : b;
        const o = y === a ? b : a;
        const k = y === a ? g.j : g.i;
        y.yieldT = 1.6;
        y.yieldAng = Math.atan2(y.pos.y - o.spineY[k], y.pos.x - o.spineX[k]);
      }
      sim.lastGap = g.gap;
    }
    steerFish(sim, sim.fish[0], sim.fish[1], h);
    steerFish(sim, sim.fish[1], sim.fish[0], h);
    for (const f of sim.fish) {
      updateSpine(f);
    }
    for (const f of sim.fish) {
      containHard(f);
      lotusHard(f);
    }
    separateHard(sim.fish[0], sim.fish[1]);
  }
  return 0;
}
