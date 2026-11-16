// Fast-forward the koi sim and score how natural the swimming is (no rendering).
//   node scripts/koi-motion-metrics.mts [minutes=5] [idle]
// lateral slip / backward motion = head motion not along the heading (constraint shoves),
// jerk = per-frame heading change, stuck = >3s mostly hidden (under pads / off the water)
// while barely moving, visible = share of spine points over open water.
import { createSim, stepSim, setPointer, pokeAt, fishGap, lotusGap, SPINE_N, W, H } from "../src/pieces/koi-pond/sim.ts";
import { SDF, SDF_W, SDF_H, SDF_CELL } from "../src/pieces/koi-pond/water-sdf.ts";
const minutes = +(process.argv[2] ?? 5);
const idle = process.argv[3] === "idle";
const DT = 1 / +(process.env.FPS ?? 60);
const sdf = (x: number, y: number) => {
  const gx = Math.min(SDF_W - 1, Math.max(0, Math.round(x / SDF_CELL - 0.5)));
  const gy = Math.min(SDF_H - 1, Math.max(0, Math.round(y / SDF_CELL - 0.5)));
  return SDF[gy * SDF_W + gx] * 2;
};
const sim = createSim(false, +(process.env.SEED ?? 1));
let rnd = 7;
const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
let px = 400, py = 300, acc = 0;
const st = sim.fish.map(() => ({ x: 0, y: 0, h: 0, w: 0, hist: [] as { x: number; y: number; vis: number }[] }));
let frames = 0, latSum = 0, latMax = 0, backFrames = 0, slipFrames = 0, jerkMax = 0, accMax = 0, corrSum = 0, corrMax = 0;
let visSum = 0, hiddenFrames = 0, stuckFrames = 0, minGap = Infinity, overlap = 0, minLotus = Infinity, lotusBad = 0;
const jerks: number[] = [];
const pokes: { t: number; x: number; y: number; fi: number; d0: number }[] = [];
const fleeGain: number[] = [];
for (let t = 0; t < minutes * 60; t += DT) {
  const phase = idle ? 0 : Math.floor(t / 7) % 4;
  if (phase === 0) setPointer(sim, null, 0);
  else if (phase === 1) { px += (rand() - 0.5) * 8; py += (rand() - 0.5) * 8; setPointer(sim, { x: px, y: py }, 20); }
  else if (phase === 2) setPointer(sim, { x: px, y: py }, 0);
  else { px = 100 + rand() * 600; py = 100 + rand() * 400; setPointer(sim, { x: px, y: py }, 1500); }
  if (!idle && rand() < 0.004) {
    // click right next to a fish head (what a visitor does)
    const fi = rand() < 0.5 ? 0 : 1, f = sim.fish[fi];
    const cx = f.pos.x + (rand() - 0.5) * 80, cy = f.pos.y + (rand() - 0.5) * 80;
    pokeAt(sim, cx, cy);
    pokes.push({ t, x: cx, y: cy, fi, d0: Math.hypot(f.pos.x - cx, f.pos.y - cy) });
  }
  const before = sim.fish.map((f) => ({ x: f.pos.x, y: f.pos.y, h: f.heading, sp: f.speed, w: f.turnRate }));
  acc = stepSim(sim, DT, acc);
  sim.pendingDrops.length = 0;
  frames++;
  sim.fish.forEach((f, i) => {
    const b = before[i];
    const dx = f.pos.x - b.x, dy = f.pos.y - b.y;
    const hm = b.h + 0.5 * (f.heading - b.h);
    const along = dx * Math.cos(hm) + dy * Math.sin(hm);
    const lat = Math.abs(-dx * Math.sin(hm) + dy * Math.cos(hm));
    latSum += lat; latMax = Math.max(latMax, lat);
    if (lat > 0.3) slipFrames++;
    if (along < -0.05) backFrames++;
    const kin = 0.5 * (b.sp + f.speed) * DT;
    const corr = Math.hypot(dx - Math.cos(hm) * kin, dy - Math.sin(hm) * kin);
    corrSum += corr; corrMax = Math.max(corrMax, corr);
    let dh = f.heading - b.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    const w = dh / DT;
    if (frames > 2) { jerks.push(Math.abs(dh)); jerkMax = Math.max(jerkMax, Math.abs(dh)); accMax = Math.max(accMax, Math.abs(w - st[i].w) / DT); }
    st[i].w = w;
    let vis = 0;
    for (let k = 0; k < SPINE_N; k++) if (sdf(f.spineX[k], f.spineY[k]) > 0) vis++;
    vis /= SPINE_N;
    visSum += vis;
    if (vis < 0.5) hiddenFrames++;
    const hs = st[i].hist; hs.push({ x: f.pos.x, y: f.pos.y, vis });
    const win = Math.round(3 / DT);
    if (hs.length > win) hs.shift();
    if (hs.length === win && hs.every((h) => h.vis < 0.6) && Math.hypot(hs[0].x - f.pos.x, hs[0].y - f.pos.y) < 60) stuckFrames++;
    const lg = lotusGap(f).gap; minLotus = Math.min(minLotus, lg); if (lg <= 0) lotusBad++;
  });
  const g = fishGap(sim.fish[0], sim.fish[1]).gap;
  minGap = Math.min(minGap, g); if (g < 0) overlap++;
  for (const p of pokes) if (p.t >= 0 && t - p.t >= 1.0) {
    const f = sim.fish[p.fi];
    if (p.d0 < 110) fleeGain.push(Math.hypot(f.pos.x - p.x, f.pos.y - p.y) - p.d0);
    p.t = -1;
  }
}
jerks.sort((a, b) => a - b);
const n = frames * 2;
const r = (v: number, d = 3) => +v.toFixed(d);
console.log(JSON.stringify({
  minutes, fps: 1 / DT,
  lateralSlipMeanPxPerFrame: r(latSum / n, 4), lateralSlipMaxPx: r(latMax), slipFramesPct: r((100 * slipFrames) / n, 2), backwardFramesPct: r((100 * backFrames) / n, 2),
  constraintDispMeanPx: r(corrSum / n, 4), constraintDispMaxPx: r(corrMax),
  headingJerkMaxRadPerFrame: r(jerkMax, 4), headingJerkP99: r(jerks[Math.floor(jerks.length * 0.99)], 4), angAccelMaxRadS2: r(accMax, 1),
  visibleFractionPct: r((100 * visSum) / n, 1), mostlyHiddenPct: r((100 * hiddenFrames) / n, 1), stuckSeconds: r(stuckFrames * DT, 1),
  minGapPx: r(minGap, 2), overlapFrames: overlap, minLotusPx: r(minLotus, 2), lotusViolationFrames: lotusBad,
  pokes: fleeGain.length, fleeMeanGainPx1s: r(fleeGain.reduce((a, b) => a + b, 0) / Math.max(1, fleeGain.length), 1), fleeReactedPct: r((100 * fleeGain.filter((g) => g > 25).length) / Math.max(1, fleeGain.length), 0),
}));
