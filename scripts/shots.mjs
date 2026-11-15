// Take real screenshots of the built site with a headless browser.
//   npm run build && npx vite preview --port 4173 &  then  node scripts/shots.mjs [name...]
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:4173/";
const only = process.argv.slice(2);
const exe = ["/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => fs.existsSync(p));

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? exe,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

async function shoot(name, { hash = "", w = 1440, h = 900, dpr = 1, wait = 6000, act } = {}) {
  if (only.length && !only.includes(name)) return;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && console.log(`[${name}]`, m.text().slice(0, 400)));
  page.on("pageerror", (e) => console.log(`[${name}] pageerror`, e.message));
  await page.goto(BASE + hash);
  await page.waitForFunction(() => window.__art?.status().every((s) => s.live || !s.running), null, { timeout: 120000 });
  await page.waitForTimeout(wait);
  if (act) await act(page);
  await page.screenshot({ path: `shots/${name}.png` });
  console.log("saved", name, JSON.stringify(await page.evaluate(() => window.__art.status())));
  await page.close();
}

const swirl = (sel) => async (page) => {
  const box = await page.locator(sel).boundingBox();
  for (let i = 0; i < 40; i++) {
    const a = i / 40;
    await page.mouse.move(box.x + box.width * (0.35 + 0.3 * a), box.y + box.height * (0.45 + 0.12 * Math.sin(a * 6)));
    await page.waitForTimeout(30);
  }
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.58);
  await page.waitForTimeout(900);
};

await shoot("overview", { wait: 7000 });
await shoot("sunset-v5", { hash: "#sunset-sea", wait: 8000 });
await shoot("sunset-edges", { w: 1000, h: 1000, wait: 8000 });
await shoot("sunset-ripples", { hash: "#sunset-sea", wait: 5000, act: swirl('[data-slug="sunset-sea"] .piece-surface') });
await shoot("mobile", { w: 390, h: 844, dpr: 2, wait: 7000 });
await browser.close();
