import { Painter, blob, brushStroke, cloud, lerp, mixRGB, mulberry32, smooth, type RGB } from "../../lib/brush";
import { HORIZON, SUN_X } from "./shaders";

/**
 * Paints the sunset once, at load, onto an opaque white canvas (W x H px):
 * sky glazes and clouds, then the sea in perspective rows of brush strokes over a warm
 * underlay that shows through the gaps. Also returns a glint layer: irregular flecks
 * along the sun path (R = per-fleck id for twinkling, A = coverage).
 */

const P = {
  // sky
  rose: [232, 170, 200] as RGB,
  mauve: [196, 150, 200] as RGB,
  peach: [255, 214, 180] as RGB,
  apricot: [255, 188, 140] as RGB,
  orange: [252, 150, 100] as RGB,
  coral: [246, 120, 110] as RGB,
  scarlet: [236, 86, 92] as RGB,
  magenta: [200, 92, 140] as RGB,
  plum: [150, 96, 160] as RGB,
  // sea
  pink: [246, 180, 200] as RGB,
  salmon: [250, 160, 150] as RGB,
  lilac: [200, 170, 225] as RGB,
  purple: [150, 112, 190] as RGB,
  violet: [120, 104, 196] as RGB,
  indigo: [86, 80, 170] as RGB,
  ultra: [86, 112, 206] as RGB,
  cobalt: [70, 128, 196] as RGB,
  teal: [64, 132, 192] as RGB,
};

export interface SunsetPaint {
  base: HTMLCanvasElement;
  glints: HTMLCanvasElement;
}

export function paintSunset(W: number, H: number, seed = 7): SunsetPaint {
  const rng = mulberry32(seed);
  const r = (a = 0, b = 1) => a + (b - a) * rng();
  const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)];
  const pt = new Painter(W, H, rng);
  const u = W / 600; // px per piece unit
  const yH = HORIZON * H;
  const sunX = SUN_X * W;
  const L = 22 * u, R = W - 22 * u; // where the brush mostly stops at the sides
  const TOP = 20 * u, BOT = H - 22 * u;

  // ---------------- sky ----------------
  // one graded wash laid quickly with a wide brush: fairly clean sides, a dragged top edge
  {
    const N = 90;
    const shp = new Path2D();
    const wav = (k: number, x: number) => Math.sin(x * 0.013 + k) * 2.5 * u + Math.sin(x * 0.051 + k * 3) * 1.2 * u;
    shp.moveTo(L + 6 * u, TOP + 12 * u);
    for (let i = 0; i <= N; i++) {
      const x = L + 6 * u + ((R - L - 12 * u) * i) / N;
      shp.lineTo(x, TOP + 10 * u + wav(1, x) + Math.max(0, Math.sin(x * 0.02)) * 6 * u);
    }
    for (let i = 0; i <= N; i++) {
      const y = TOP + 10 * u + ((yH + 6 * u - TOP - 10 * u) * i) / N;
      shp.lineTo(R - 2 * u + wav(4, y) - (i < 3 ? 6 * u : 0), y);
    }
    for (let i = N; i >= 0; i--) {
      const y = TOP + 10 * u + ((yH + 6 * u - TOP - 10 * u) * i) / N;
      shp.lineTo(L + 2 * u + wav(7, y) + (i < 3 ? 6 * u : 0), y);
    }
    shp.closePath();
    const grad = pt.g.createLinearGradient(0, TOP, 0, yH);
    grad.addColorStop(0, "rgb(236,184,206)");
    grad.addColorStop(0.3, "rgb(250,196,190)");
    grad.addColorStop(0.55, "rgb(254,200,160)");
    grad.addColorStop(0.8, "rgb(252,170,120)");
    grad.addColorStop(1, "rgb(248,140,110)");
    const g = pt.g;
    g.save();
    g.globalCompositeOperation = "multiply";
    g.globalAlpha = 0.85;
    g.fillStyle = grad;
    g.fill(shp);
    g.clip(shp);
    g.globalAlpha = 0.12;
    g.lineWidth = 3 * u;
    g.strokeStyle = "rgb(236,150,140)";
    g.stroke(shp);
    g.restore();
  }
  // horizontal glaze streaks, each with a hard lower edge; most stop short of the sides
  const skyCol = (f: number): RGB =>
    f < 0.3 ? mixRGB(P.rose, P.mauve, 0.4) : f < 0.55 ? mixRGB(P.rose, P.apricot, (f - 0.3) * 4) : f < 0.8 ? mixRGB(P.apricot, P.orange, (f - 0.55) * 4) : mixRGB(P.orange, P.coral, (f - 0.8) * 5);
  for (let i = 0; i < 26; i++) {
    const f = Math.pow(rng(), 0.8);
    const y = TOP + 20 * u + f * (yH - TOP - 26 * u);
    const len = r(120, 480) * u;
    const fromLeft = rng() < 0.5;
    const past = rng() < 0.18 ? r(6, 22) * u : 0;
    const x0 = fromLeft ? L + r(2, 30) * u - past : R - r(2, 30) * u - len + past;
    const th = r(8, 26) * u;
    pt.wash(brushStroke({ x0, x1: Math.min(R + past, x0 + len), y, th, crest: r(0, 0.6), sag: r(-4, 4) * u, pressure: 0.5, jitter: 0.6 * u, taperIn: r(0.02, 0.1), taperOut: r(0.2, 0.5) }, rng), {
      color: skyCol(f + r(-0.06, 0.06)),
      alpha: r(0.25, 0.45),
      rim: r(0.3, 0.6),
      rimW: 1.2 * u,
      pool: 0.45,
      soft: rng() < 0.3 ? 2 * u : 0,
    });
  }
  // wet-in-wet warmth and blooms, soft
  for (let i = 0; i < 9; i++) {
    const y = r(yH * 0.25, yH * 0.95);
    const bw = r(60, 160) * u;
    pt.wash(blob(r(L + bw, R - bw), y, bw, r(10, 26) * u, rng, 0.25), { color: pick([P.orange, P.coral, P.apricot, P.rose]), alpha: r(0.15, 0.3), soft: r(6, 14) * u });
  }
  // a warm glow round the sun
  pt.wash(blob(sunX, yH - 30 * u, 120 * u, 60 * u, rng, 0.1), { color: [255, 205, 150], alpha: 0.35, soft: 30 * u });

  // layered horizontal streaks across the lower sky
  for (let i = 0; i < 16; i++) {
    const y = r(yH * 0.42, yH * 0.97);
    const len = r(90, 330) * u;
    const fromLeft = rng() < 0.5;
    const x0 = fromLeft ? L + r(-6, 30) * u : R - r(-6, 30) * u - len;
    const c = pick([P.orange, P.coral, P.coral, P.scarlet, P.apricot, P.magenta]);
    const shp = brushStroke({ x0, x1: x0 + len, y, th: r(3, 10) * u, crest: r(0, 0.5), jitter: 0.5 * u, pressure: 0.5 }, rng);
    pt.wash(shp, { color: c, alpha: r(0.25, 0.5), rim: 0.6, rimW: 1.1 * u, soft: rng() < 0.25 ? 2 * u : 0 });
  }

  // clouds: magenta / plum, hard edged with darker rims, coral bleeding into the undersides
  const clouds: { cx: number; by: number; w: number; h: number; c: RGB; under: RGB; a: number; flat?: number; puffs?: number }[] = [
    { cx: 290, by: 60, w: 320, h: 40, c: P.plum, under: P.magenta, a: 0.55, puffs: 11 },
    { cx: 480, by: 36, w: 200, h: 24, c: P.mauve, under: P.rose, a: 0.5, puffs: 8 },
    { cx: 210, by: 218, w: 300, h: 62, c: P.magenta, under: P.scarlet, a: 0.62, puffs: 13, flat: 0.22 },
    { cx: 370, by: 236, w: 150, h: 30, c: P.magenta, under: P.coral, a: 0.5, puffs: 8 },
    { cx: 500, by: 330, w: 190, h: 22, c: P.scarlet, under: P.magenta, a: 0.55, puffs: 10, flat: 0.3 },
    { cx: 140, by: 392, w: 220, h: 16, c: P.plum, under: P.magenta, a: 0.5, puffs: 11, flat: 0.4 },
    { cx: 485, by: 404, w: 190, h: 18, c: P.scarlet, under: P.magenta, a: 0.5, puffs: 10, flat: 0.4 },
  ];
  for (const c of clouds) {
    const shp = cloud(c.cx * u, c.by * u, c.w * u, c.h * u, rng, { puffs: c.puffs, flat: c.flat });
    pt.wash(shp, { color: c.c, alpha: c.a, rim: 0.7, rimW: 1.5 * u, gran: 0.25, pool: -0.35, bleed: { color: c.under, alpha: 0.7, side: "bottom", extent: 0.55 } });
    // a second, smaller glaze inside: shadowed folds where the wash went back in wet
    const inner = cloud((c.cx + r(-0.15, 0.15) * c.w) * u, (c.by - c.h * 0.05) * u, c.w * r(0.35, 0.6) * u, c.h * 0.6 * u, rng, { puffs: 4 });
    pt.wash(inner, { color: c.c, alpha: c.a * 0.45, rim: 0.5, rimW: 1.2 * u, soft: rng() < 0.4 ? 3 * u : 0 });
    // ragged horizontal tails dragged off the base
    for (let k = 0, n = 1 + Math.floor(r(0, 3)); k < n; k++) {
      const right = rng() < 0.5;
      const len = c.w * r(0.25, 0.6) * u;
      const xs = (c.cx + (right ? 1 : -1) * c.w * r(0.25, 0.45)) * u;
      const y = (c.by + r(-0.1, 0.25) * c.h) * u;
      const x0 = right ? xs : xs - len;
      pt.wash(brushStroke({ x0: right ? x0 : x0 + len, x1: right ? x0 + len : x0, y, th: c.h * r(0.12, 0.3) * u, crest: r(0.2, 0.8), jitter: 0.6 * u, pressure: 0.6 }, rng), {
        color: rng() < 0.5 ? c.c : c.under,
        alpha: c.a * r(0.6, 0.9),
        rim: 0.6,
        rimW: 1.2 * u,
      });
      if (rng() < 0.3) pt.dryFlick(right ? x0 + len - 4 * u : x0 + 4 * u, y, right ? 1 : -1, r(10, 30) * u, c.h * 0.2 * u, c.c, 0.45);
    }
    // the odd lifted highlight on top of a puff
    if (c.h > 30) pt.lift(blob((c.cx + r(-0.2, 0.2) * c.w) * u, (c.by - c.h * 0.7) * u, r(10, 24) * u, r(3, 6) * u, rng, 0.3), 0.45, 2 * u);
  }

  // the sun: bare paper, a crisp but hand-cut edge
  pt.lift(blob(sunX, yH - 30 * u, 26 * u, 26 * u, rng, 0.025, 0.4), 1);

  // ---------------- sea ----------------
  // the sea's ground: pale pink / lilac rows, warm near the horizon and down the sun path
  for (let y = yH + 2 * u; y < BOT; ) {
    const s0 = (y - yH) / (BOT - yH);
    const th = (6 + 40 * Math.pow(s0, 1.2)) * u;
    const c = mixRGB(mixRGB(P.salmon, P.pink, smooth(0, 0.3, s0)), [226, 178, 222], smooth(0.4, 1, s0));
    pt.wash(brushStroke({ x0: L + r(8, 20) * u, x1: R - r(8, 20) * u, y, th, crest: 0.2, taperIn: 0.01, taperOut: 0.03, pressure: 0.2, jitter: 0.5 * u }, rng), {
      color: c,
      alpha: r(0.4, 0.55),
      soft: 1.5 * u,
    });
    y += th * 0.75;
  }
  const depthAt = (y: number) => Math.max(0, (y - yH) / (BOT - yH));
  const colW = (s: number) => (14 + 120 * Math.pow(s, 1.1)) * u; // half-width of the sun path
  // coral / salmon underlay strokes
  for (let y = yH + 3 * u; y < BOT; ) {
    const s = depthAt(y);
    const th = (2 + 22 * Math.pow(s, 1.25)) * u;
    let x = L + r(-4, 40) * u;
    while (x < R) {
      const len = r(40, 260) * u * (0.6 + s * 0.6);
      const near = Math.exp(-Math.pow((x + len / 2 - sunX) / (colW(s) * 2.2), 2));
      if (rng() < 0.35 + near * 0.5) {
        const c = near > 0.4 ? pick([P.salmon, P.coral, P.apricot]) : pick([P.salmon, P.pink, P.coral]);
        pt.wash(brushStroke({ x0: x, x1: Math.min(x + len, R + r(-8, 12) * u), y, th: th * r(0.5, 1.1), crest: r(0.1, 0.6), jitter: 0.5 * u }, rng), {
          color: c,
          alpha: r(0.4, 0.7) * (0.8 + near * 0.3),
          rim: 0.5,
          rimW: 1 * u,
        });
      }
      x += len + r(10, 120) * u;
    }
    y += th * r(1.1, 2.2) + 1.5 * u;
  }

  // the horizon: a crisp dark purple line, broken here and there
  for (let x = L - 2 * u; x < R; ) {
    const len = r(120, 420) * u;
    pt.wash(brushStroke({ x0: x, x1: Math.min(x + len, R + 4 * u), y: yH + 1.4 * u, th: 2.2 * u, crest: 0, sag: 0, taperIn: 0.01, taperOut: 0.05, jitter: 0.3 * u, pressure: 0.2 }, rng), {
      color: P.violet,
      alpha: 0.75,
      rim: 0.6,
      rimW: 0.8 * u,
    });
    x += len - r(0, 8) * u;
  }

  // wave strokes, row by row in perspective; cool and dense toward the viewer
  const coolAt = (s: number): RGB[] =>
    s < 0.18
      ? [P.purple, P.lilac, P.purple, P.violet, [178, 120, 180]]
      : s < 0.5
        ? [P.purple, P.violet, P.violet, P.indigo, P.lilac, P.ultra]
        : s < 0.75 ? [P.violet, P.indigo, P.ultra, P.ultra, P.cobalt, P.purple, P.violet] : [P.ultra, P.cobalt, P.indigo, P.violet, P.ultra, P.teal];
  let row = 0;
  for (let y = yH + 4.5 * u; y < BOT - 6 * u; row++) {
    const s = depthAt(y);
    const th = (1.8 + 30 * Math.pow(s, 1.2)) * u * r(0.8, 1.3);
    let x = L + r(-10, 50) * u;
    if (rng() < 0.15) x = L - r(4, 14) * u; // some run past the edge
    while (x < R - 10 * u) {
      const len = Math.max(th * 7, (rng() < 0.7 ? r(180, 620) : r(50, 180)) * u * (s < 0.1 ? 1.4 : 1));
      let x1 = x + len;
      const atEdge = x1 > R;
      if (atEdge) x1 = R + (rng() < 0.2 ? r(4, 16) : r(-12, 4)) * u;
      const mid = (x + x1) / 2;
      const inPath = x1 - x < colW(s) * 4 && Math.abs(mid - sunX) < colW(s) * r(0.6, 1.4);
      // skip some strokes in the sun path: it stays light, warm and broken
      if (inPath && rng() < 0.55) {
        x = x1 + r(4, 40) * u;
        continue;
      }
      const c = pick(coolAt(s));
      const heavy = c === P.ultra || c === P.indigo || c === P.cobalt || c === P.teal;
      const shp = brushStroke(
        {
          x0: x,
          x1,
          y: y + r(-0.2, 0.2) * th,
          th,
          crest: r(0.2, 0.9),
          pressure: r(0.2, 0.6),
          jitter: r(0.3, 0.9) * u,
          taperIn: r(0.01, 0.04),
          taperOut: atEdge ? 0.03 : rng() < 0.7 ? r(0.03, 0.1) : r(0.15, 0.35),
        },
        rng
      );
      const bleedIt = rng() < 0.22;
      pt.wash(shp, {
        color: c,
        alpha: r(0.42, 0.72) * (inPath ? 0.6 : 1) * lerp(0.85, 1, s),
        rim: r(0.4, 0.9),
        rimW: r(0.8, 1.6) * u,
        gran: heavy ? r(0.25, 0.5) * smooth(0.2, 0.7, s) : r(0, 0.15),
        pool: r(0.1, 0.5),
        
        bleed: bleedIt ? { color: pick([P.coral, P.salmon, P.teal, P.magenta]), alpha: 0.5, side: rng() < 0.5 ? "left" : "right", extent: r(0.2, 0.5) } : undefined,
      });
      // a dry-brush flick off the end, now and then
      if (rng() < 0.08 && s > 0.15) pt.dryFlick(x1 - 4 * u, y, 1, r(20, 60) * u, th, c, 0.5);
      if (atEdge) break;
      x = x1 + (rng() < 0.55 ? r(-th * 2.5, th * 0.3) : r(6, 60) * u);
    }
    y += th * (s > 0.55 ? r(0.5, 0.85) : r(0.6, 1.05)) + (rng() < 0.25 ? r(0.5, 3) * u : 0);
  }
  // a few deep accents with heavy granulation in the foreground
  for (let i = 0; i < 18; i++) {
    const y = r(yH + (BOT - yH) * 0.45, BOT - 6 * u);
    const s = depthAt(y);
    const x0 = r(L - 6 * u, R - 300 * u);
    pt.wash(brushStroke({ x0, x1: x0 + r(140, 380) * u, y, th: (3 + 7 * s) * u, crest: r(0.3, 0.9), jitter: 0.6 * u, taperIn: 0.03, taperOut: r(0.1, 0.4) }, rng), {
      color: pick([P.indigo, P.ultra, P.cobalt]),
      alpha: r(0.35, 0.6),
      rim: 0.8,
      rimW: 1.2 * u,
      gran: 0.7,
      pool: 0.4,
    });
  }

  // warm bars the painter left for the reflected sky: reserved paper, then a coral glaze
  for (let i = 0; i < 34; i++) {
    const s = Math.pow(rng(), 0.8);
    const y = yH + 14 * u + s * (BOT - yH - 40 * u);
    const nearPath = rng() < 0.35;
    const len = r(20, 130) * u * (0.5 + s);
    const x0 = nearPath ? sunX + (rng() - 0.5) * colW(s) * 2.4 - len / 2 : r(L + 10 * u, R - 10 * u - len);
    const th = (1.5 + 9 * Math.pow(s, 1.1)) * u * r(0.6, 1.2);
    const shp = brushStroke({ x0, x1: x0 + len, y, th, crest: r(0.1, 0.7), jitter: 0.4 * u, taperIn: r(0.03, 0.15), taperOut: r(0.1, 0.4) }, rng);
    pt.lift(shp, 1);
    pt.wash(shp, { color: pick([P.salmon, P.coral, P.apricot, P.salmon, P.pink]), alpha: r(0.45, 0.75), rim: 0.7, rimW: 0.9 * u, pool: 0.3 });
  }
  // the sun path: a warm peach glaze, narrow at the horizon
  {
    const path = new Path2D();
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      path.lineTo(sunX - colW(s) * 0.9, yH + s * (BOT - yH));
    }
    for (let i = N; i >= 0; i--) {
      const s = i / N;
      path.lineTo(sunX + colW(s) * 0.9, yH + s * (BOT - yH));
    }
    path.closePath();
    pt.wash({ path, box: [0, yH, W, BOT - yH] }, { color: [255, 214, 170], alpha: 0.5, soft: 10 * u });
  }

  // ---------------- glints ----------------
  const gl = document.createElement("canvas");
  gl.width = W;
  gl.height = H;
  const gg = gl.getContext("2d")!;
  const nGl = 340;
  for (let i = 0; i < nGl; i++) {
    // more of them close to the horizon, in a narrow, tapering path
    const s = Math.pow(rng(), 1.5);
    const y = yH + 4 * u + s * (BOT - yH - 20 * u);
    const spread = colW(s) * (rng() < 0.05 ? 3 : 0.85);
    const x = sunX + (rng() + rng() + rng() - 1.5) * spread * 0.9;
    const kind = rng();
    const len = (kind < 0.25 ? r(1.2, 3) : kind < 0.8 ? r(4, 16) : r(16, 40)) * u * (0.4 + 1.1 * s);
    const th = Math.max(0.9 * u, (0.7 + 3.6 * s) * u * r(0.5, 1.2));
    const shp =
      kind < 0.25
        ? blob(x, y, len, th * 0.8, rng, 0.3, 0.3)
        : brushStroke({ x0: x - len / 2, x1: x + len / 2, y, th, crest: r(0, 0.8), jitter: 0.25 * u, taperIn: r(0.05, 0.3), taperOut: r(0.2, 0.6) }, rng);
    const id = Math.floor(rng() * 255);
    if (rng() < 0.55) pt.lift(shp, r(0.7, 0.95)); // some are always there: reserved paper
    gg.fillStyle = `rgb(${id},0,0)`;
    gg.fill(shp.path);
  }

  return { base: pt.canvas, glints: gl };
}
