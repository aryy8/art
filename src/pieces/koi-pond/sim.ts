/**
 * Koi pond simulation — pure TS.
 *
 * Tunables:
 *   KOI_LEN, cruise/burst speeds, turn rate, wave A/k,
 *   burst/glide timing, separation, boundary inset.
 */

export const W = 800;
export const H = 600;
/** Match the painted koi: ~38% of pond width, thick body + massive veil. */
export const KOI_LEN = W * 0.37;
export const SPINE_N = 16;
export const TAIL_N = 12;
/** koi.png: peduncle at x≈416 of the 1014px-wide fish → body = head-side 59%, veil = 41%. s=0 at head. */
export const S_TAIL_ROOT = 0.59;
/** head-path history used so the body follows exactly where the head has been */
const HIST = 1400;

export const SPEED_BURST = 72;
export const SPEED_GLIDE_MIN = 16;
export const TURN_MAX = 1.45;
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
    finL: 0.7,
    finR: 0.7,
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
  };
  initSpine(f, bend);
  return f;
}

/** Visible half-width of the painted koi at spine point i (body + fanned veil). */
export function halfWidth(f: Fish, i: number) {
  const L = bodyLen(f);
  const s = i / (SPINE_N - 1);
  if (s < 0.1) return L * (0.05 + 0.7 * s);
  // pectoral fins reach ~0.2L out from the body around s 0.2–0.45
  if (s < 0.5) return L * (0.125 + 0.09 * Math.max(0, 1 - Math.abs(s - 0.32) / 0.16));
  if (s < S_TAIL_ROOT) return L * 0.125;
  const t = (s - S_TAIL_ROOT) / (1 - S_TAIL_ROOT);
  return L * (0.1 + 0.24 * t); // feathery veil fans out to ~0.34L at the tip
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

/** Hard constraint: if the outlines still come closer than MIN_GAP, push the whole fish apart. */
const MIN_GAP = 4;
const SOFT_GAP = 30;
/** diagnostics for scripts/koi-overlap-test.mts */
export const hardStats = { pushes: 0, px: 0, maxPx: 0 };
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
/** Hard keep-out: bend the veil / slide the fish out of the lotus corner. */
function lotusHard(f: Fish) {
  const root = Math.ceil(S_TAIL_ROOT * (SPINE_N - 1));
  for (let iter = 0; iter < 16; iter++) {
    const g = lotusGap(f);
    if (g.gap >= LOTUS_MARGIN) return iter > 0;
    const sd = lotusSdf(f.spineX[g.i], f.spineY[g.i]);
    const need = LOTUS_MARGIN - g.gap + 0.3;
    if (g.i >= root && iter < 6) bendTail(f, g.i, sd.nx * need, sd.ny * need);
    else translateFish(f, sd.nx * need, sd.ny * need);
  }
  return true;
}

/** Keep the head inside the pond by sliding the whole fish (never teleport / re-pose it). */
const WALL_X = 70;
const WALL_Y = 58;
function containHard(f: Fish) {
  const dx = Math.max(0, WALL_X - f.pos.x) - Math.max(0, f.pos.x - (W - WALL_X));
  const dy = Math.max(0, WALL_Y - f.pos.y) - Math.max(0, f.pos.y - (H - WALL_Y));
  if (dx || dy) translateFish(f, dx, dy);
  return dx !== 0 || dy !== 0;
}

/** Displace the veil around spine point k by (dx,dy), fading in from the tail root. */
function bendTail(f: Fish, k: number, dx: number, dy: number) {
  const root = Math.ceil(S_TAIL_ROOT * (SPINE_N - 1));
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
  for (let iter = 0; iter < 48; iter++) {
    // walls first; if two pinned fish still touch after many tries, never-overlap wins over walls
    // walls + lotus corner are absolute; fish-vs-fish is solved around them
    // priority: lotus corner (absolute) > no overlap (absolute) > pond walls (soft, may yield a little)
    const ca = Number(iter < 24 && containHard(a)) + Number(lotusHard(a)) > 0;
    const cb = Number(iter < 24 && containHard(b)) + Number(lotusHard(b)) > 0;
    const g = fishGap(a, b);
    if (iter === 0 && g.gap < SOFT_GAP && g.gap >= MIN_GAP) {
      // soft cushion: a gentle sub-pixel nudge long before the hard limit is reached
      const dx = a.spineX[g.i] - b.spineX[g.j];
      const dy = a.spineY[g.i] - b.spineY[g.j];
      const d = Math.hypot(dx, dy) || 1;
      const k = (SOFT_GAP - g.gap) * 0.04;
      translateFish(a, (dx / d) * k * 0.5, (dy / d) * k * 0.5);
      translateFish(b, (-dx / d) * k * 0.5, (-dy / d) * k * 0.5);
      return;
    }
    if (g.gap >= MIN_GAP) return;
    let dx = a.spineX[g.i] - b.spineX[g.j];
    let dy = a.spineY[g.i] - b.spineY[g.j];
    let d = Math.hypot(dx, dy);
    if (d < 1e-3) {
      dx = a.pos.x - b.pos.x;
      dy = a.pos.y - b.pos.y;
      d = Math.hypot(dx, dy) || 1;
    }
    const need = MIN_GAP - g.gap + 0.5;
    const root = Math.ceil(S_TAIL_ROOT * (SPINE_N - 1));
    if ((g.i >= root && !ca) || (g.j >= root && !cb)) {
      // a veil is in the way: the flexible veil(s) bend aside instead of shoving whole fish
      const ux = dx / d;
      const uy = dy / d;
      const bi = g.i >= root && !ca;
      const bj = g.j >= root && !cb;
      const both = bi && bj;
      if (bi) bendTail(a, g.i, ux * need * (both ? 0.5 : 1), uy * need * (both ? 0.5 : 1));
      if (bj) bendTail(b, g.j, -ux * need * (both ? 0.5 : 1), -uy * need * (both ? 0.5 : 1));
      hardStats.pushes++;
      continue;
    }
    // whole-fish push: sum the correction over EVERY violating pair (position-based solve), so
    // crossing bodies get one consistent separating direction instead of oscillating
    let sx = 0;
    let sy = 0;
    let worst = 0;
    for (let p = 0; p < SPINE_N; p++) {
      for (let q = 0; q < SPINE_N; q++) {
        const ex = a.spineX[p] - b.spineX[q];
        const ey = a.spineY[p] - b.spineY[q];
        const ed = Math.hypot(ex, ey);
        const def = MIN_GAP + 0.5 - (ed - halfWidth(a, p) - halfWidth(b, q));
        if (def <= 0) continue;
        worst = Math.max(worst, def);
        sx += (ed > 1e-3 ? ex / ed : dx / d) * def;
        sy += (ed > 1e-3 ? ey / ed : dy / d) * def;
      }
    }
    let sl = Math.hypot(sx, sy);
    if (sl < 1e-6) {
      // last resort: slide the whole fish apart along the centroid line — always terminates
      let cax = 0, cay = 0, cbx = 0, cby = 0;
      for (let p = 0; p < SPINE_N; p++) {
        cax += a.spineX[p]; cay += a.spineY[p]; cbx += b.spineX[p]; cby += b.spineY[p];
      }
      sx = cax - cbx;
      sy = cay - cby;
      sl = Math.hypot(sx, sy);
    }
    if (sl < 1e-6) {
      sx = a.pos.x - b.pos.x;
      sy = a.pos.y - b.pos.y;
      sl = Math.hypot(sx, sy) || 1;
    }
    const ux = sx / sl;
    const uy = sy / sl;
    const step = Math.min(Math.max(need, worst) * 0.6, 12);
    hardStats.pushes++;
    hardStats.px += step;
    hardStats.maxPx = Math.max(hardStats.maxPx, step);
    // a fish pinned on the wall does not move; the other one takes the whole push
    const wa = ca && !cb ? 0 : !ca && cb ? 1 : 0.5;
    translateFish(a, ux * step * wa, uy * step * wa);
    translateFish(b, -ux * step * (1 - wa), -uy * step * (1 - wa));
    const away = Math.atan2(uy, ux);
    a.heading += clamp(angDiff(a.heading, away), -0.02, 0.02);
    b.heading += clamp(angDiff(b.heading, away + Math.PI), -0.02, 0.02);
  }
  lotusHard(a);
  lotusHard(b);
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
export function createSim(reduced: boolean): SimState {
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
  };
}

function inWater(x: number, y: number): boolean {
  if (x < INSET || x > W - INSET || y < INSET || y > H - INSET) return false;
  return lotusSdf(x, y).d > 40;
}

function steerFish(sim: SimState, f: Fish, other: Fish, dt: number) {
  const speedMul = sim.reduced ? 0.4 : 1;
  const L = bodyLen(f);
  let desireX = 0;
  let desireY = 0;
  let wSum = 0;

  // wander circle
  f.wanderTheta += (0.35 + noise1(sim.time * 0.3, f.noiseSeed)) * dt;
  const wx = f.pos.x + Math.cos(f.heading) * 90;
  const wy = f.pos.y + Math.sin(f.heading) * 90;
  const wtx = wx + Math.cos(f.wanderTheta) * 40;
  const wty = wy + Math.sin(f.wanderTheta) * 40;
  let n = norm(wtx - f.pos.x, wty - f.pos.y);
  desireX += n.x;
  desireY += n.y;
  wSum += 1;

  // containment
  const look = 1.2 * L;
  const lx = f.pos.x + Math.cos(f.heading) * look;
  const ly = f.pos.y + Math.sin(f.heading) * look;
  if (!inWater(lx, ly) || !inWater(f.pos.x, f.pos.y)) {
    n = norm(W * 0.5 - f.pos.x, H * 0.55 - f.pos.y);
    desireX += n.x * 6;
    desireY += n.y * 6;
    wSum += 6;
  }
  // lotus corner: predictive keep-out for the head path and the whole current outline
  {
    let worst = Infinity;
    let wx = 0;
    let wy = 0;
    for (const k of [0, 0.4, 0.8, 1.2]) {
      const sd = lotusSdf(f.pos.x + Math.cos(f.heading) * L * k, f.pos.y + Math.sin(f.heading) * L * k);
      const g = sd.d - L * 0.35;
      if (g < worst) {
        worst = g;
        wx = sd.nx;
        wy = sd.ny;
      }
    }
    for (let i = 0; i < SPINE_N; i += 3) {
      const sd = lotusSdf(f.spineX[i], f.spineY[i]);
      const g = sd.d - halfWidth(f, i) - 20;
      if (g < worst) {
        worst = g;
        wx = sd.nx;
        wy = sd.ny;
      }
    }
    const zone = L * 0.5;
    if (worst < zone) {
      const w = 10 * Math.pow(1 - Math.max(-zone, worst) / zone, 2);
      desireX += wx * w;
      desireY += wy * w;
      wSum += w;
    }
  }

  // separation — predictive and body-aware: every spine point of this fish (now and ~0.8s
  // ahead) against every spine point of the other, using the real body/veil half-widths.
  {
    const ahead = 0.8;
    const fvx = Math.cos(f.heading) * f.speed * ahead;
    const fvy = Math.sin(f.heading) * f.speed * ahead;
    const ovx = Math.cos(other.heading) * other.speed * ahead;
    const ovy = Math.sin(other.heading) * other.speed * ahead;
    let best = Infinity;
    let ax = 0;
    let ay = 0;
    for (let i = 0; i < SPINE_N; i += 1) {
      // head region is what steers, so weight the front half more
      const wi = i < SPINE_N / 2 ? 1 : 0.6;
      for (let j = 0; j < SPINE_N; j += 1) {
        for (let k = 0; k < 2; k++) {
          const px = f.spineX[i] + (k ? fvx : 0);
          const py = f.spineY[i] + (k ? fvy : 0);
          const qx = other.spineX[j] + (k ? ovx : 0);
          const qy = other.spineY[j] + (k ? ovy : 0);
          const gap = (Math.hypot(px - qx, py - qy) - halfWidth(f, i) - halfWidth(other, j)) / wi;
          if (gap < best) {
            best = gap;
            ax = px - qx;
            ay = py - qy;
          }
        }
      }
    }
    const zone = L * 0.7;
    if (best < zone) {
      n = norm(ax, ay);
      const w = 12 * Math.pow(1 - Math.max(-zone, best) / zone, 2);
      desireX += n.x * w;
      desireY += n.y * w;
      wSum += w;
      if (best < zone * 0.4) f.burstT = Math.max(f.burstT, 0.4);
    } else {
      const dist = Math.hypot(f.pos.x - other.pos.x, f.pos.y - other.pos.y);
      if (dist < L * 2.4) {
        // loose companionship: drift roughly the same way, never toward each other
        desireX += Math.cos(other.heading) * 0.25;
        desireY += Math.sin(other.heading) * 0.25;
        wSum += 0.25;
      }
    }
  }

  // flee
  let fleeing = f.fleeT > 0;
  if (sim.pointer && !sim.reduced && sim.pointerVel > FLEE_SPEED) {
    const pd = Math.hypot(f.pos.x - sim.pointer.x, f.pos.y - sim.pointer.y);
    if (pd < FLEE_RADIUS) {
      f.fleeT = Math.max(f.fleeT, 1.6);
      f.burstT = Math.max(f.burstT, 0.9);
      f.curiousT = 0;
      fleeing = true;
    }
  }
  if (fleeing && sim.pointer) {
    n = norm(f.pos.x - sim.pointer.x, f.pos.y - sim.pointer.y);
    desireX += n.x * 3.5;
    desireY += n.y * 3.5;
    wSum += 3.5;
  }

  // curiosity
  if (!fleeing && sim.pointer && sim.pointerStill > CURIOSITY_STILL && lotusSdf(sim.pointer.x, sim.pointer.y).d > bodyLen(f) * 0.45) {
    const pd = Math.hypot(f.pos.x - sim.pointer.x, f.pos.y - sim.pointer.y);
    const od = Math.hypot(other.pos.x - sim.pointer.x, other.pos.y - sim.pointer.y);
    // only the nearer koi comes to look; the other keeps its distance (never into the lotus)
    if ((pd < L * 2.5 || f.curiousT > 0) && !(other.curiousT > 0 && od < pd)) {
      f.curiousT += dt;
      if (f.curiousT < 6) {
        const ax = sim.pointer.x - f.pos.x;
        const ay = sim.pointer.y - f.pos.y;
        const ad = Math.hypot(ax, ay);
        if (ad > HOVER_DIST) {
          n = norm(ax, ay);
          desireX += n.x * 1.6;
          desireY += n.y * 1.6;
          wSum += 1.6;
        } else {
          f.turnRate += (clamp(angDiff(f.heading, Math.atan2(ay, ax)) * 1.2, -0.6, 0.6) - f.turnRate) * 0.05;
          f.burstT = 0;
          f.glideT = 1;
        }
      } else {
        f.curiousT = -3;
      }
    }
  } else if (f.curiousT < 0) {
    f.curiousT += dt;
    if (f.curiousT > 0) f.curiousT = 0;
  }

  if (wSum > 1e-5) {
    desireX /= wSum;
    desireY /= wSum;
  }
  const desiredAng = Math.atan2(desireY, desireX);
  // koi turn by bending: the tightest path radius is ~0.3 body lengths, and the turn rate
  // eases in/out (no snapping). Slow fish can still pivot a little.
  const rMin = L * (fleeing ? 0.22 : 0.3);
  const turnCap = Math.min(fleeing ? 3.0 : TURN_MAX, Math.max(0.6, f.speed / rMin));
  const err = angDiff(f.heading, desiredAng);
  const wantRate = clamp(err * 1.6, -turnCap, turnCap);
  f.turnRate += (wantRate - f.turnRate) * Math.min(1, dt * (fleeing ? 8 : 3));
  f.heading += f.turnRate * dt;

  // burst / glide rhythm
  if (sim.reduced) {
    f.speed = lerp(f.speed, SPEED_GLIDE_MIN * 1.2, dt * 2);
    f.beatEnergy = 0.2;
  } else if (fleeing) {
    f.speed = lerp(f.speed, SPEED_BURST * (fleeing ? 1.15 : 1), dt * 3);
    f.beatEnergy = lerp(f.beatEnergy, 1, dt * 4);
    f.burstT = Math.max(f.burstT, 0.3);
  } else if (f.curiousT > 0 && f.glideT > 0) {
    f.speed = lerp(f.speed, 14, dt * 2);
    f.beatEnergy = lerp(f.beatEnergy, 0.25, dt * 2);
  } else if (f.burstT > 0) {
    f.burstT -= dt;
    f.speed = lerp(f.speed, SPEED_BURST, dt * 4);
    f.beatEnergy = lerp(f.beatEnergy, 1, dt * 5);
    if (f.burstT <= 0) f.glideT = 1 + Math.random() * 1.5;
  } else {
    f.glideT -= dt;
    f.speed = Math.max(SPEED_GLIDE_MIN, f.speed - 20 * dt);
    f.beatEnergy = lerp(f.beatEnergy, 0.15, dt * 1.5);
    if (f.glideT <= 0) f.burstT = 0.35 + Math.random() * 0.55; // 2–4 quick beats ≈ 0.4–0.9s
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

  const freq = lerp(0.55, 1.9, f.beatEnergy) * (fleeing ? 1.6 : 1) * (sim.reduced ? 0.45 : 1);
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

  // depth drift
  // keep most time near the surface so colour matches the painting
  const dTarget = 0.05 + 0.28 * (0.5 + 0.5 * noise1(sim.time * 0.06, f.noiseSeed + 2));
  f.depth += (dTarget - f.depth) * dt * 0.3;

  // pectorals: fold on burst, spread on glide/turn (~55°)
  const turning = Math.abs(angDiff(f.heading, desiredAng)) > 0.2;
  const bursting = f.burstT > 0 || fleeing;
  // glide: slow sculling paddle; burst: tucked; turn/curious: braking spread
  const paddle = 0.12 * Math.sin(sim.time * 2.3 + f.noiseSeed * 5);
  const want = bursting ? 0.12 : turning || f.curiousT > 0 ? 0.95 : 0.6 + paddle;
  f.finL += (want - f.finL) * dt * 6;
  f.finR += (want - (turning ? paddle : -paddle) - f.finR) * dt * 6;

  if (f.fleeT > 0) f.fleeT -= dt;
  f.headScale += (1 - f.headScale) * dt * 5;
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

export function pokeAt(sim: SimState, x: number, y: number) {
  sim.pendingDrops.push({ x: x / W, y: y / H, r: 0.05, s: 0.35 });
  for (const f of sim.fish) {
    if (Math.hypot(f.pos.x - x, f.pos.y - y) < FLEE_RADIUS) {
      f.fleeT = 1.8;
      f.burstT = 1;
      f.curiousT = 0;
    }
  }
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
    steerFish(sim, sim.fish[0], sim.fish[1], h);
    steerFish(sim, sim.fish[1], sim.fish[0], h);
    for (const f of sim.fish) {
      updateSpine(f);
    }
    for (const f of sim.fish) lotusHard(f);
    separateHard(sim.fish[0], sim.fish[1]);
  }
  return 0;
}
