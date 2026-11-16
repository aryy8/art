// Fast-forward the koi sim (no rendering) and measure how close the two fish ever get.
//   node scripts/koi-overlap-test.mts [minutes=5]
import { createSim, stepSim, setPointer, pokeAt, fishGap, lotusGap, hardStats, SPINE_N, W, H } from "../src/pieces/koi-pond/sim.ts";
const minutes = +(process.argv[2] ?? 5);
const idle = process.argv[3] === "idle";
const FRAME_DT = 1 / +(process.env.FPS ?? 60); // e.g. FPS=120 to test high-refresh screens
const sim = createSim(false);
let acc = 0;
let hardFrames = 0;
let minLotus = Infinity, lotusViolations = 0;
let minGap = Infinity, minGapT = 0, minRaw = Infinity, frames = 0, overlapFrames = 0;
let rnd = 1;
const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
let px = 400, py = 300;
outer: for (let t = 0; t < minutes * 60; t += 1 / 60) {
  // pointer: wander, sometimes still (curiosity), sometimes fast flicks (flee), clicks
  const phase = idle ? 0 : Math.floor(t / 7) % 4;
  if (phase === 0) setPointer(sim, null, 0);
  else if (phase === 1) { px += (rand() - 0.5) * 8; py += (rand() - 0.5) * 8; setPointer(sim, { x: px, y: py }, 20); }
  else if (phase === 2) { setPointer(sim, { x: px, y: py }, 0); }
  else { px = 100 + rand() * 600; py = 100 + rand() * 400; setPointer(sim, { x: px, y: py }, 1500); }
  if (!idle && rand() < 0.003) pokeAt(sim, 100 + rand() * 600, 100 + rand() * 400);
  acc = stepSim(sim, FRAME_DT, acc);
  sim.pendingDrops.length = 0;
  frames++;
  const [a, b] = sim.fish;
  const g = fishGap(a, b).gap;
  if (g < minGap) { minGap = g; minGapT = t; }
  if (g < 4.6) hardFrames++;
  for (const f of sim.fish) { const lg = lotusGap(f).gap; minLotus = Math.min(minLotus, lg); if (lg <= 0) lotusViolations++; }
  if (g < 0) { overlapFrames++; if (overlapFrames < 3) console.log("overlap", t.toFixed(2), g.toFixed(1), JSON.stringify(fishGap(a, b)), [a.pos.x|0, a.pos.y|0, a.heading.toFixed(2), a.speed|0], [b.pos.x|0, b.pos.y|0, b.heading.toFixed(2), b.speed|0], lotusGap(a).gap|0, lotusGap(b).gap|0); }
  for (let i = 0; i < SPINE_N; i++) for (let j = 0; j < SPINE_N; j++)
    minRaw = Math.min(minRaw, Math.hypot(a.spineX[i] - b.spineX[j], a.spineY[i] - b.spineY[j]));
  for (const f of sim.fish) if (!Number.isFinite(f.pos.x) || f.pos.x < -50 || f.pos.x > W + 50 || f.pos.y < -50 || f.pos.y > H + 50) { console.log("ESCAPE", t.toFixed(1), JSON.stringify(sim.fish.map((f) => [f.pos.x.toFixed(0), f.pos.y.toFixed(0), f.heading.toFixed(2), f.speed.toFixed(0), f.fleeT.toFixed(1)]))); break outer; }
}
console.log(JSON.stringify({ simulatedSeconds: minutes * 60, frames, minOutlineGapPx: +minGap.toFixed(2), atSecond: +minGapT.toFixed(1), overlapFrames, framesAtHardLimit: hardFrames, minSpinePointDistancePx: +minRaw.toFixed(1), minLotusClearancePx: +minLotus.toFixed(2), lotusViolationFrames: lotusViolations, hardPushes: hardStats.pushes, meanPushPx: +(hardStats.px / Math.max(1, hardStats.pushes)).toFixed(2), maxPushPx: +hardStats.maxPx.toFixed(2) }));
