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
export const KOI_LEN = W * 0.38;
export const SPINE_N = 16;
export const TAIL_N = 12;
/** Body = rightmost 55% of sprite; veil = leftmost 45%. s=0 at head. */
export const S_TAIL_ROOT = 0.55;
export const MAX_PELLETS = 5;

export const SPEED_BURST = 95;
export const SPEED_GLIDE_MIN = 28;
export const TURN_MAX = 1.45;
export const WAVE_K = 4.6;
export const A_BODY = 0.055; // × L — visible swim undulation
export const A_TAIL = 0.18;
export const INSET = 40;
export const SEPARATION = KOI_LEN * 0.6;
export const FLEE_SPEED = 900;
export const FLEE_RADIUS = 120;
export const CURIOSITY_STILL = 1.5;
export const HOVER_DIST = 40;

const FISH_DT = 1 / 60;
const TWO_PI = Math.PI * 2;

export type Vec2 = { x: number; y: number };

export interface Pellet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  alive: boolean;
}

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
  eatT: number;
  reactT: number;
  targetPellet: number;
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
}

export interface SimState {
  fish: [Fish, Fish];
  pellets: Pellet[];
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

function makeFish(x: number, y: number, heading: number, seed: number, scale: number, tint: number): Fish {
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
    eatT: 0,
    reactT: 0,
    targetPellet: -1,
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
  };
  initSpine(f);
  return f;
}

function bodyLen(f: Fish) {
  return KOI_LEN * f.scale * (1 - f.depth * 0.06);
}

function initSpine(f: Fish) {
  const L = bodyLen(f);
  const seg = L / (SPINE_N - 1);
  const c = Math.cos(f.heading);
  const s = Math.sin(f.heading);
  for (let i = 0; i < SPINE_N; i++) {
    f.spineX[i] = f.pos.x - c * seg * i;
    f.spineY[i] = f.pos.y - s * seg * i;
    f.tanX[i] = c;
    f.tanY[i] = s;
    f.lat[i] = 0;
  }
  initTail(f);
}

function initTail(f: Fish) {
  const L = bodyLen(f);
  const root = Math.floor(S_TAIL_ROOT * (SPINE_N - 1));
  const rx = f.spineX[root];
  const ry = f.spineY[root];
  const tx = f.tanX[root];
  const ty = f.tanY[root];
  const nx = -ty;
  const ny = tx;
  const seg = (L * (1 - S_TAIL_ROOT)) / (TAIL_N - 1);
  for (let i = 0; i < TAIL_N; i++) {
    const flare = 0.06 + 0.08 * (i / (TAIL_N - 1));
    const ox = nx * (L * flare);
    const oy = ny * (L * flare);
    f.tailUX[i] = rx - tx * seg * i + ox;
    f.tailUY[i] = ry - ty * seg * i + oy;
    f.tailUPx[i] = f.tailUX[i];
    f.tailUPy[i] = f.tailUY[i];
    f.tailLX[i] = rx - tx * seg * i - ox;
    f.tailLY[i] = ry - ty * seg * i - oy;
    f.tailLPx[i] = f.tailLX[i];
    f.tailLPy[i] = f.tailLY[i];
  }
}

/** Start poses roughly matching target.png yin-yang. */
export function createSim(reduced: boolean): SimState {
  // Upper fish: head right-ish; lower: circling opposite
  const a = makeFish(340, 250, 0.35, 1.2, 1.0, 0);
  const b = makeFish(500, 380, -2.5, 2.8, 0.92, 1);
  a.burstT = 1.2;
  b.burstT = 0.4;
  b.glideT = 0.6;
  return {
    fish: [a, b],
    pellets: Array.from({ length: MAX_PELLETS }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, age: 0, alive: false,
    })),
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
  // soft avoid lotus top-left
  if (x < 150 && y < 140) return false;
  return true;
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
    if (f.pos.x < 160 && f.pos.y < 150) {
      n = norm(1.5, 1.2);
    }
    desireX += n.x * 2.5;
    desireY += n.y * 2.5;
    wSum += 2.5;
  }

  // separation + loose cohesion (yin-yang)
  const dx = f.pos.x - other.pos.x;
  const dy = f.pos.y - other.pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist < SEPARATION && dist > 1e-3) {
    n = norm(dx, dy);
    const sep = (SEPARATION - dist) / SEPARATION;
    desireX += n.x * sep * 2;
    desireY += n.y * sep * 2;
    wSum += sep * 2;
  } else if (dist < L * 2.2) {
    desireX += Math.cos(other.heading) * 0.3;
    desireY += Math.sin(other.heading) * 0.3;
    n = norm(other.pos.x - f.pos.x, other.pos.y - f.pos.y);
    desireX += n.x * 0.2;
    desireY += n.y * 0.2;
    wSum += 0.5;
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
  if (!fleeing && sim.pointer && sim.pointerStill > CURIOSITY_STILL && f.eatT <= 0) {
    const pd = Math.hypot(f.pos.x - sim.pointer.x, f.pos.y - sim.pointer.y);
    if (pd < L * 2.5 || f.curiousT > 0) {
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
          f.heading += angDiff(f.heading, Math.atan2(ay, ax)) * 0.1;
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

  // food
  let best = -1;
  let bestD = 400;
  for (let i = 0; i < MAX_PELLETS; i++) {
    const p = sim.pellets[i];
    if (!p.alive) continue;
    const d = Math.hypot(p.x - f.pos.x, p.y - f.pos.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best >= 0) {
    if (f.reactT > 0) f.reactT -= dt;
    else {
      f.targetPellet = best;
      const p = sim.pellets[best];
      n = norm(p.x - f.pos.x, p.y - f.pos.y);
      desireX += n.x * 2.8;
      desireY += n.y * 2.8;
      wSum += 2.8;
      f.burstT = Math.max(f.burstT, 0.6);
      if (bestD < 16) {
        p.alive = false;
        f.eatT = 0.3;
        f.headScale = 1.05;
        sim.pendingDrops.push({ x: p.x / W, y: p.y / H, r: 0.025, s: 0.2 });
      }
    }
  } else {
    f.targetPellet = -1;
  }

  if (wSum > 1e-5) {
    desireX /= wSum;
    desireY /= wSum;
  }
  const desiredAng = Math.atan2(desireY, desireX);
  const turnCap = fleeing ? 3.2 : TURN_MAX;
  const dHeading = clamp(angDiff(f.heading, desiredAng), -turnCap * dt, turnCap * dt);
  f.heading += dHeading;
  f.turnRate = dt > 1e-6 ? dHeading / dt : 0;

  // burst / glide rhythm
  if (sim.reduced) {
    f.speed = lerp(f.speed, SPEED_GLIDE_MIN * 1.2, dt * 2);
    f.beatEnergy = 0.2;
  } else if (fleeing || f.targetPellet >= 0) {
    f.speed = lerp(f.speed, SPEED_BURST * (fleeing ? 1.15 : 1), dt * 3);
    f.beatEnergy = lerp(f.beatEnergy, 1, dt * 4);
    f.burstT = Math.max(f.burstT, 0.3);
  } else if (f.curiousT > 0 && f.glideT > 0) {
    f.speed = lerp(f.speed, 12, dt * 2);
    f.beatEnergy = lerp(f.beatEnergy, 0.25, dt * 2);
  } else if (f.burstT > 0) {
    f.burstT -= dt;
    f.speed = lerp(f.speed, SPEED_BURST, dt * 4);
    f.beatEnergy = lerp(f.beatEnergy, 1, dt * 5);
    if (f.burstT <= 0) f.glideT = 1 + Math.random() * 1.5;
  } else {
    f.glideT -= dt;
    f.speed = Math.max(SPEED_GLIDE_MIN, f.speed - 28 * dt);
    f.beatEnergy = lerp(f.beatEnergy, 0.15, dt * 1.5);
    if (f.glideT <= 0) f.burstT = 0.35 + Math.random() * 0.55; // 2–4 quick beats ≈ 0.4–0.9s
  }

  f.speed *= speedMul;
  f.vel.x = Math.cos(f.heading) * f.speed;
  f.vel.y = Math.sin(f.heading) * f.speed;
  f.pos.x += f.vel.x * dt;
  f.pos.y += f.vel.y * dt;

  if (!Number.isFinite(f.pos.x) || f.pos.x < -40 || f.pos.x > W + 40 || f.pos.y < -40 || f.pos.y > H + 40) {
    f.pos.x = clamp(f.pos.x, INSET + 30, W - INSET - 30);
    f.pos.y = clamp(f.pos.y, INSET + 30, H - INSET - 30);
    initSpine(f);
  }

  const freq = lerp(1.0, 2.4, f.beatEnergy) * (fleeing ? 1.6 : 1) * (sim.reduced ? 0.45 : 1);
  f.phase += TWO_PI * freq * dt;

  // water motion from swimming — continuous trail + beat pulses at the veil tip
  const tipX = (f.tailUX[TAIL_N - 1] + f.tailLX[TAIL_N - 1]) * 0.5;
  const tipY = (f.tailUY[TAIL_N - 1] + f.tailLY[TAIL_N - 1]) * 0.5;
  const midX = (f.tailUX[Math.floor(TAIL_N * 0.45)] + f.tailLX[Math.floor(TAIL_N * 0.45)]) * 0.5;
  const midY = (f.tailUY[Math.floor(TAIL_N * 0.45)] + f.tailLY[Math.floor(TAIL_N * 0.45)]) * 0.5;
  if (!sim.reduced && f.speed > 18) {
    // continuous wake scaled by speed — water should visibly churn behind them
    const trail = (0.035 + f.speed * 0.0009) * (0.6 + f.beatEnergy * 0.5);
    // ~1 tip drop per fish per sim step keeps the pond moving without flooding the queue
    sim.pendingDrops.push({
      x: tipX / W,
      y: tipY / H,
      r: 0.022 + f.speed * 0.00015,
      s: trail,
    });
    if (f.beatEnergy > 0.45) {
      sim.pendingDrops.push({
        x: midX / W,
        y: midY / H,
        r: 0.016,
        s: trail * 0.5,
      });
    }
  }
  const wave = Math.sin(f.phase);
  if (wave > 0.82 && f.beatEnergy > 0.35 && !f.wakeReady) {
    f.wakeReady = true;
    sim.pendingDrops.push({
      x: tipX / W,
      y: tipY / H,
      r: 0.028,
      s: 0.08 + f.beatEnergy * 0.12 + f.speed * 0.0004,
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
  const want = bursting ? 0.2 : turning || f.curiousT > 0 ? 0.96 : 0.75;
  f.finL += (want - f.finL) * dt * 6;
  f.finR += ((turning ? want * 1.05 : want) - f.finR) * dt * 6;

  if (f.fleeT > 0) f.fleeT -= dt;
  if (f.eatT > 0) {
    f.eatT -= dt;
    if (f.eatT <= 0) f.headScale = 1;
  } else {
    f.headScale += (1 - f.headScale) * dt * 5;
  }
}

function updateSpine(f: Fish) {
  const L = bodyLen(f);
  const seg = L / (SPINE_N - 1);
  f.spineX[0] = f.pos.x;
  f.spineY[0] = f.pos.y;
  for (let i = 1; i < SPINE_N; i++) {
    let dx = f.spineX[i] - f.spineX[i - 1];
    let dy = f.spineY[i] - f.spineY[i - 1];
    let d = Math.hypot(dx, dy);
    if (d < 1e-6) {
      dx = -Math.cos(f.heading);
      dy = -Math.sin(f.heading);
      d = 1;
    }
    if (i >= 2) {
      const px = f.spineX[i - 1] - f.spineX[i - 2];
      const py = f.spineY[i - 1] - f.spineY[i - 2];
      const pa = Math.atan2(py, px);
      let a = Math.atan2(dy, dx);
      a = pa + clamp(angDiff(pa, a), -0.22, 0.22);
      a = lerp(a, pa, 0.08);
      dx = Math.cos(a);
      dy = Math.sin(a);
      d = 1;
    }
    const inv = seg / d;
    f.spineX[i] = f.spineX[i - 1] + dx * inv;
    f.spineY[i] = f.spineY[i - 1] + dy * inv;
  }

  const Abody = A_BODY * L * f.beatEnergy;
  const Atail = A_TAIL * L * f.beatEnergy;
  for (let i = 0; i < SPINE_N; i++) {
    const s = i / (SPINE_N - 1);
    let tx: number;
    let ty: number;
    if (i < SPINE_N - 1) {
      tx = f.spineX[i] - f.spineX[i + 1];
      ty = f.spineY[i] - f.spineY[i + 1];
    } else {
      tx = f.spineX[i - 1] - f.spineX[i];
      ty = f.spineY[i - 1] - f.spineY[i];
    }
    const t = norm(tx, ty);
    f.tanX[i] = t.x;
    f.tanY[i] = t.y;
    const bodyEnv = Math.pow(smoothstep(0.08, 0.55, s), 1.1);
    const tailEnv = Math.pow(smoothstep(0.5, 1.0, s), 1.3);
    const A = Abody * bodyEnv + Atail * Math.max(0, tailEnv - bodyEnv * 0.3);
    let lat = A * Math.sin(f.phase - WAVE_K * s);
    if (s < 0.04) lat *= 0.15;
    f.lat[i] = lat;
  }
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function updateTail(f: Fish) {
  const L = bodyLen(f);
  const root = Math.floor(S_TAIL_ROOT * (SPINE_N - 1));
  const rx = f.spineX[root];
  const ry = f.spineY[root];
  const tx = f.tanX[root];
  const ty = f.tanY[root];
  const nx = -ty;
  const ny = tx;
  const segLen = (L * (1 - S_TAIL_ROOT)) / (TAIL_N - 1);
  const drag = 0.9;
  // pair-pose veil: narrow at peduncle, very wide flame tips
  const halfAt = (i: number) => {
    const t = i / (TAIL_N - 1);
    return L * (0.06 + 0.16 * t * t);
  };

  const integrate = (
    xs: Float32Array,
    ys: Float32Array,
    px: Float32Array,
    py: Float32Array,
    side: number,
  ) => {
    xs[0] = rx + nx * halfAt(0) * side;
    ys[0] = ry + ny * halfAt(0) * side;
    px[0] = xs[0];
    py[0] = ys[0];
    for (let i = 1; i < TAIL_N; i++) {
      const vx = (xs[i] - px[i]) * drag;
      const vy = (ys[i] - py[i]) * drag;
      px[i] = xs[i];
      py[i] = ys[i];
      xs[i] += vx;
      ys[i] += vy;
      const stiff = 0.1 * (1 - i / (TAIL_N - 1));
      const restX = rx - tx * segLen * i + nx * halfAt(i) * side;
      const restY = ry - ty * segLen * i + ny * halfAt(i) * side;
      xs[i] += (restX - xs[i]) * stiff;
      ys[i] += (restY - ys[i]) * stiff;
      if (i > TAIL_N - 4) {
        xs[i] += Math.sin(f.phase * 0.5 + i * 0.4 + side) * 0.8 * f.beatEnergy;
        ys[i] += Math.cos(f.phase * 0.4 + i * 0.3) * 0.6 * f.beatEnergy;
      }
    }
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 1; i < TAIL_N; i++) {
        let dx = xs[i] - xs[i - 1];
        let dy = ys[i] - ys[i - 1];
        const d = Math.hypot(dx, dy) || 1;
        const diff = (d - segLen) / d;
        if (i === 1) {
          xs[i] -= dx * diff;
          ys[i] -= dy * diff;
        } else {
          xs[i] -= dx * 0.5 * diff;
          ys[i] -= dy * 0.5 * diff;
          xs[i - 1] += dx * 0.5 * diff;
          ys[i - 1] += dy * 0.5 * diff;
        }
      }
      xs[0] = rx + nx * halfAt(0) * side;
      ys[0] = ry + ny * halfAt(0) * side;
    }
  };

  integrate(f.tailUX, f.tailUY, f.tailUPx, f.tailUPy, 1);
  integrate(f.tailLX, f.tailLY, f.tailLPx, f.tailLPy, -1);
}

function updatePellets(sim: SimState, dt: number) {
  for (const p of sim.pellets) {
    if (!p.alive) continue;
    p.age += dt;
    p.vx += Math.sin(p.y * 0.02 + sim.time * 0.3) * 3 * dt;
    p.vy += Math.cos(p.x * 0.02 - sim.time * 0.25) * 2 * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.age > 12) p.alive = false;
  }
}

export function feedAt(sim: SimState, x: number, y: number) {
  let slot = -1;
  for (let i = 0; i < MAX_PELLETS; i++) {
    if (!sim.pellets[i].alive) {
      slot = i;
      break;
    }
  }
  if (slot < 0) return;
  const p = sim.pellets[slot];
  p.alive = true;
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  p.age = 0;
  sim.pendingDrops.push({ x: x / W, y: y / H, r: 0.03, s: 0.28 });
  for (const f of sim.fish) {
    f.reactT = 0.15 + Math.hypot(f.pos.x - x, f.pos.y - y) / 500 * 0.5;
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

export function stepSim(sim: SimState, dt: number, acc: number): number {
  const capped = Math.min(dt, 0.05);
  let a = acc + capped;
  let steps = 0;
  while (a >= FISH_DT && steps < 4) {
    sim.time += FISH_DT;
    if (sim.pointer && sim.pointerVel < 40) sim.pointerStill += FISH_DT;
    steerFish(sim, sim.fish[0], sim.fish[1], FISH_DT);
    steerFish(sim, sim.fish[1], sim.fish[0], FISH_DT);
    for (const f of sim.fish) {
      updateSpine(f);
      updateTail(f);
    }
    updatePellets(sim, FISH_DT);
    a -= FISH_DT;
    steps++;
  }
  return a;
}
