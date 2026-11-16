// Koi pond capture with a virtual clock.  node scripts/koi-shots.mjs <outdir> [mode=seq|interact] [frames=24] [stepMs=100]
import { chromium } from "playwright";
import fs from "node:fs";
const [out, mode = "seq", nArg = "24", stepArg = "100"] = process.argv.slice(2);
const BASE = process.env.BASE ?? "http://127.0.0.1:5174/";
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
p.on("console", (m) => ["error", "warning"].includes(m.type()) && console.log("[console]", m.text().slice(0, 300)));
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.addInitScript(() => {
  let vt = 0, auto = !location.search.includes("still");
  const raf = window.requestAnimationFrame.bind(window);
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => raf(() => cb(vt));
  setInterval(() => auto && (vt += 16), 16);
  window.__vclock = { step: (ms) => { auto = false; vt += ms; } };
});
await p.goto(BASE + (process.env.STILL ? "?debug&still#koi-pond" : "?debug#koi-pond"));
await p.waitForTimeout(8000);
const el = p.locator('[data-slug="koi-pond"] .piece-surface, [data-slug="koi-pond"] canvas').first();
await el.scrollIntoViewIfNeeded().catch(() => {});
const box = await el.boundingBox();
console.log("box", JSON.stringify(box));
const frame = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const N = +nArg, step = +stepArg;
const sub = async (ms) => { // advance in 16ms sub-steps so sim runs normally
  for (let t = 0; t < ms; t += 16) { await p.evaluate(() => window.__vclock.step(16)); await frame(); }
};
const P = (u, v) => [box.x + box.width * u, box.y + box.height * v];
if (mode === "interact" || mode === "lotus") {
  await p.mouse.click(...P(0.5, 0.5)); await sub(600); // focus
}
for (let i = 0; i < N; i++) {
  if (mode === "lotus") {
    // stir the water right next to the lotus and the top pad, and click there
    const k = i / N;
    await p.mouse.move(...P(0.28 + 0.12 * Math.sin(k * 9), 0.33 + 0.08 * Math.cos(k * 7)), { steps: 3 });
    if (i % 4 === 2) await p.mouse.click(...P(0.36, 0.3));
  }
  if (mode === "interact") {
    if (i < 8) { const k = i / 8; await p.mouse.move(...P(0.2 + 0.6 * k, 0.45 + 0.1 * Math.sin(k * 6)), { steps: 4 }); }
    if (i === 10) await p.mouse.click(...P(0.5, 0.6));
    if (i === 14) await p.mouse.move(...P(0.6, 0.4));
  }
  await sub(step);
  await el.screenshot({ path: `${out}/${String(i).padStart(3, "0")}.png` });
}
await b.close();
console.log("done");
