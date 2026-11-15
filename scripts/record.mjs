// Record a smooth clip of a page with a virtual clock: every captured frame advances time
// by exactly 1/fps, so motion can be judged even when headless rendering is slow.
//   node scripts/record.mjs <url> <name> [seconds=4] [fps=30]
//   env: DISMISS="button text" clicks through an intro, HOVER=1 sweeps the pointer, W/H viewport
// Frames go to shots/frames-<name>/, the clip to shots/<name>.mp4 (system ffmpeg).
import { chromium } from "playwright";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const [url, name, secs = "4", fps = "30"] = process.argv.slice(2);
const W = +(process.env.W ?? 1000), H = +(process.env.H ?? 1000);
const exe = ["/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: exe, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: W, height: H } });
await p.addInitScript(() => {
  let vt = 0;
  let auto = true;
  const raf = window.requestAnimationFrame.bind(window);
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => raf(() => cb(vt));
  setInterval(() => auto && (vt += 16), 16);
  window.__vclock = { step: (ms) => { auto = false; vt += ms; } };
});
await p.goto(url);
await p.waitForTimeout(9000);
if (process.env.DISMISS) {
  await p.getByText(process.env.DISMISS).click({ timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(3000);
}
const frame = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const dir = `shots/frames-${name}`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const n = Math.round(+secs * +fps);
const step = 1000 / +fps;
for (let i = 0; i < n; i++) {
  if (process.env.HOVER) {
    const k = i / n;
    await p.mouse.move(W * (0.3 + 0.4 * k), H * (0.66 + 0.06 * Math.sin(k * 9)));
  }
  await p.evaluate((ms) => window.__vclock.step(ms), step);
  await frame();
  await p.screenshot({ path: `${dir}/${String(i).padStart(3, "0")}.png` });
}
await b.close();
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", fps, "-i", `${dir}/%03d.png`, "-vf", "scale=720:-2", "-pix_fmt", "yuv420p", "-crf", "20", `shots/${name}.mp4`]);
console.log("ok", `shots/${name}.mp4`, n, "frames");
